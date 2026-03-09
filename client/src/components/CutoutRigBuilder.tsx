import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Scissors, Wand2 } from 'lucide-react';

import type { SheetPalette, SheetSegment, SkeletonState } from '@/engine/types';
import { segmentSheetFromFile } from '@/app/sheetParser';
import { MANIKIN_SLOT_ORDER } from '../constants/manikinSlots';

// Shape detection types
type DetectedShape = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  contour: { x: number; y: number }[];
  area: number;
  centroid: { x: number; y: number };
  imageData?: ImageData;
  isFloating: boolean;
  isLetter: boolean;
  aspectRatio: number;
};

type ShapeDetectionResult = {
  shapes: DetectedShape[];
  backgroundRemoved: boolean;
  confidence: number;
};

// Helper functions for contour-based detection
const applyGaussianBlurToBinary = (binary: Uint8Array, width: number, height: number): Uint8Array => {
  const result = new Uint8Array(binary.length);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;
  
  // Copy original binary values for border pixels to preserve them
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        const idx = y * width + x;
        result[idx] = binary[idx];
      }
    }
  }
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          sum += binary[idx] * kernel[kernelIdx];
        }
      }
      
      result[y * width + x] = sum / kernelSum > 0.5 ? 1 : 0;
    }
  }
  
  return result;
};

const findContours = (binary: Uint8Array, width: number, height: number) => {
  const contours = [];
  const visited = new Uint8Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      if (binary[idx] === 1 && visited[idx] === 0) {
        const contour = traceContour(binary, visited, width, height, x, y);
        if (contour.points.length > 0) {
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
};

const traceContour = (binary: Uint8Array, visited: Uint8Array, width: number, height: number, startX: number, startY: number) => {
  const points: { x: number; y: number }[] = [];
  const stack = [[startX, startY]];
  
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;
    
    if (x < 0 || x >= width || y < 0 || y >= height || binary[idx] === 0 || visited[idx] === 1) {
      continue;
    }
    
    visited[idx] = 1;
    points.push({ x, y });
    
    // Add 8-way neighbors
    const neighbors = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]
    ];
    
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (binary[nIdx] === 1 && visited[nIdx] === 0) {
          stack.push([nx, ny]);
        }
      }
    }
  }
  
  return { points };
};

const calculateContourBounds = (points: { x: number; y: number }[]) => {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
};

const calculateContourArea = (points: { x: number; y: number }[]) => {
  return points.length;
};

const calculateContourCentroid = (points: { x: number; y: number }[]) => {
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  
  return {
    x: sumX / points.length,
    y: sumY / points.length
  };
};

const isContourConnectedToEdges = (bounds: { x: number; y: number; width: number; height: number }, canvasWidth: number, canvasHeight: number): boolean => {
  const edgeThreshold = 5;
  
  return (
    bounds.x <= edgeThreshold ||
    bounds.y <= edgeThreshold ||
    bounds.x + bounds.width >= canvasWidth - edgeThreshold ||
    bounds.y + bounds.height >= canvasHeight - edgeThreshold
  );
};

// Separate connected pieces by breaking thin connections
const separateConnectedPieces = (binary: Uint8Array, width: number, height: number): Uint8Array => {
  const result = new Uint8Array(binary);
  
  // Find and break thin connections (1-2 pixel wide bridges)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      if (binary[idx] === 1) {
        // Check if this pixel is a thin bridge
        const neighbors = [
          binary[idx - 1], // left
          binary[idx + 1], // right
          binary[idx - width], // top
          binary[idx + width], // bottom
        ];
        
        const diagonalNeighbors = [
          binary[idx - width - 1], // top-left
          binary[idx - width + 1], // top-right
          binary[idx + width - 1], // bottom-left
          binary[idx + width + 1], // bottom-right
        ];
        
        // Count connected components in 3x3 neighborhood
        let componentCount = 0;
        const visited = new Set<number>();
        
        // Check each neighbor
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            
            const nIdx = (y + dy) * width + (x + dx);
            if (binary[nIdx] === 1 && !visited.has(nIdx)) {
              // Simple BFS to check connectivity
              const queue = [nIdx];
              visited.add(nIdx);
              componentCount++;
              
              while (queue.length > 0 && componentCount <= 2) {
                const currentIdx = queue.shift()!;
                const cx = currentIdx % width;
                const cy = Math.floor(currentIdx / width);
                
                for (let ndy = -1; ndy <= 1; ndy++) {
                  for (let ndx = -1; ndx <= 1; ndx++) {
                    if (ndx === 0 && ndy === 0) continue;
                    
                    const nx = cx + ndx;
                    const ny = cy + ndy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                      const nnIdx = ny * width + nx;
                      if (binary[nnIdx] === 1 && !visited.has(nnIdx)) {
                        visited.add(nnIdx);
                        queue.push(nnIdx);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        // If this pixel connects 2 or more separate components, remove it
        if (componentCount >= 2) {
          result[idx] = 0;
        }
      }
    }
  }
  
  return result;
};

// Morphological operations to clean up binary image
const morphologicalCleanup = (binary: Uint8Array, width: number, height: number): Uint8Array => {
  const result = new Uint8Array(binary);
  
  // Remove small noise (opening operation)
  const minComponentSize = 50;
  const visited = new Uint8Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 1 && visited[idx] === 0) {
        const component: number[] = [];
        const stack = [idx];
        visited[idx] = 1;
        
        while (stack.length > 0) {
          const currentIdx = stack.pop()!;
          component.push(currentIdx);
          
          const cx = currentIdx % width;
          const cy = Math.floor(currentIdx / width);
          
          // Check 8 neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nIdx = ny * width + nx;
                if (binary[nIdx] === 1 && visited[nIdx] === 0) {
                  visited[nIdx] = 1;
                  stack.push(nIdx);
                }
              }
            }
          }
        }
        
        // Remove small components
        if (component.length < minComponentSize) {
          component.forEach(idx => {
            result[idx] = 0;
          });
        }
      }
    }
  }
  
  return result;
};

// Contour-based shape detection for better piece separation
const detectShapesFromCanvas = (canvas: HTMLCanvasElement, threshold: number = 30): ShapeDetectionResult => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { shapes: [], backgroundRemoved: false, confidence: 0 };

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  
  console.log(`Detecting shapes from canvas: ${width}x${height}, threshold: ${threshold}`);

  // Convert to grayscale and apply adaptive threshold
  const gray = new Uint8Array(width * height);
  const binary = new Uint8Array(width * height);
  
  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4;
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    gray[idx] = brightness;
    binary[idx] = brightness < threshold ? 1 : 0;
  }
  
  // Apply Gaussian blur to reduce noise
  const blurred = applyGaussianBlurToBinary(binary, width, height);
  
  // Find contours using Suzuki-Abe algorithm (simplified)
  const contours = findContours(blurred, width, height);
  
  console.log(`Found ${contours.length} contours`);
  
  // Convert contours to shapes
  const shapes: DetectedShape[] = [];
  
  contours.forEach((contour, index) => {
    if (contour.points.length < 20) return; // Filter tiny contours
    
    const bounds = calculateContourBounds(contour.points);
    const area = calculateContourArea(contour.points);
    
    if (area < 100) return; // Filter small areas
    
    const centroid = calculateContourCentroid(contour.points);
    const aspectRatio = bounds.width / bounds.height;
    const normalizedArea = area / (width * height);
    
    const isFloating = !isContourConnectedToEdges(bounds, width, height);
    const isLetter = detectIfLetter(
      { aspectRatio, bounds, area } as Pick<DetectedShape, 'aspectRatio' | 'bounds' | 'area'>,
      normalizedArea
    );
    
    console.log(`Contour ${index + 1}: area=${area}, bounds=${JSON.stringify(bounds)}, floating=${isFloating}, letter=${isLetter}`);
    
    shapes.push({
      id: `contour_${index}`,
      bounds,
      contour: contour.points,
      area,
      centroid,
      imageData: new ImageData(bounds.width, bounds.height),
      isFloating,
      isLetter,
      aspectRatio,
    });
  });
  
  // Sort shapes: floating images first, then letters at bottom
  shapes.sort((a, b) => {
    if (a.isFloating && !b.isFloating) return -1;
    if (!a.isFloating && b.isFloating) return 1;
    if (a.isLetter && !b.isLetter) return 1;
    if (!a.isLetter && b.isLetter) return -1;
    return b.centroid.y - a.centroid.y;
  });
  
  console.log(`Final shape count: ${shapes.length}`);

  return {
    shapes,
    backgroundRemoved: true,
    confidence: Math.min(1.0, shapes.length / 10)
  };
};

// Helper function to detect if a shape is connected to canvas edges
const isShapeConnectedToEdges = (shape: DetectedShape, canvasWidth: number, canvasHeight: number): boolean => {
  const { bounds } = shape;
  const edgeThreshold = 5; // pixels from edge to consider connected
  
  return (
    bounds.x <= edgeThreshold ||
    bounds.y <= edgeThreshold ||
    bounds.x + bounds.width >= canvasWidth - edgeThreshold ||
    bounds.y + bounds.height >= canvasHeight - edgeThreshold
  );
};

// Helper function to detect if a shape is likely a letter
const detectIfLetter = (shape: Pick<DetectedShape, 'aspectRatio' | 'bounds' | 'area'>, normalizedArea: number): boolean => {
  const { aspectRatio, bounds } = shape;
  
  // Letters typically have:
  // - Aspect ratio between 0.2 and 2.0
  // - Small to medium normalized area (not too large, not too tiny)
  // - Compact shape (not too elongated)
  
  const reasonableAspectRatio = aspectRatio >= 0.2 && aspectRatio <= 2.0;
  const reasonableSize = normalizedArea >= 0.001 && normalizedArea <= 0.05; // 0.1% to 5% of canvas
  const isCompact = Math.max(bounds.width, bounds.height) / Math.min(bounds.width, bounds.height) <= 3;
  
  return reasonableAspectRatio && reasonableSize && isCompact;
};

const createDetectedPiecesCanvas = (shapes: DetectedShape[], originalCanvas: HTMLCanvasElement, backgroundBrightness: number = 248, featherAmount: number = 2): string[] => {
  const pieceCanvases: string[] = [];
  
  console.log(`Creating thumbnails for ${shapes.length} detected shapes`);
  
  shapes.forEach((shape, index) => {
    console.log(`Processing shape ${index + 1}: bounds=${JSON.stringify(shape.bounds)}, area=${shape.area}`);
    
    try {
      // Create a canvas exactly sized to the shape bounds with padding
      const padding = Math.max(20, Math.max(shape.bounds.width, shape.bounds.height) * 0.1);
      const pieceCanvas = document.createElement('canvas');
      const pieceCtx = pieceCanvas.getContext('2d');
      if (!pieceCtx) {
        console.warn(`Failed to get context for shape ${index}`);
        pieceCanvases.push(''); // Add placeholder
        return;
      }
      
      pieceCanvas.width = shape.bounds.width + padding * 2;
      pieceCanvas.height = shape.bounds.height + padding * 2;
      
      // Fill with adjustable near-white background
      const bgColor = `rgb(${backgroundBrightness}, ${backgroundBrightness}, ${backgroundBrightness})`;
      pieceCtx.fillStyle = bgColor;
      pieceCtx.fillRect(0, 0, pieceCanvas.width, pieceCanvas.height);
      
      // Create a temporary canvas to extract just the shape
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        console.warn(`Failed to get temp context for shape ${index}`);
        pieceCanvases.push(''); // Add placeholder
        return;
      }
      
      tempCanvas.width = shape.bounds.width;
      tempCanvas.height = shape.bounds.height;
      
      // Extract only the shape region from the original canvas
      tempCtx.drawImage(
        originalCanvas,
        shape.bounds.x, shape.bounds.y, shape.bounds.width, shape.bounds.height,
        0, 0, shape.bounds.width, shape.bounds.height
      );
      
      // Apply feathering and draw the isolated shape to the main canvas
      pieceCtx.save();
      pieceCtx.shadowBlur = featherAmount;
      pieceCtx.shadowColor = 'rgba(0, 0, 0, 0.1)';
      
      // Center the isolated shape in the thumbnail
      const offsetX = padding;
      const offsetY = padding;
      
      pieceCtx.drawImage(
        tempCanvas,
        0, 0, shape.bounds.width, shape.bounds.height,
        offsetX, offsetY, shape.bounds.width, shape.bounds.height
      );
      pieceCtx.restore();
      
      const dataUrl = pieceCanvas.toDataURL();
      pieceCanvases.push(dataUrl);
      console.log(`Created thumbnail ${index + 1}: canvas size=${pieceCanvas.width}x${pieceCanvas.height}`);
    } catch (error) {
      console.warn(`Error processing shape ${index}:`, error);
      pieceCanvases.push(''); // Add placeholder for failed shape
    }
  });
  
  console.log(`Generated ${pieceCanvases.length} piece thumbnails`);
  return pieceCanvases;
};

const floodFill = (
  binary: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  shapeId: number
): DetectedShape => {
  const stack: [number, number][] = [[startX, startY]];
  const pixels: [number, number][] = [];
  let minX = startX, maxX = startX, minY = startY, maxY = startY;

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;

    if (x < 0 || x >= width || y < 0 || y >= height || 
        binary[idx] === 0 || visited[idx] === 1) {
      continue;
    }

    visited[idx] = 1;
    pixels.push([x, y]);

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    // Add neighbors with 8-way connectivity for better shape detection
    const neighbors = [
      [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1], // 4-way
      [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1] // 4-way diagonal
    ];
    
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (binary[nIdx] === 1 && visited[nIdx] === 0) {
          stack.push([nx, ny]);
        }
      }
    }
  }

  const bounds = {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };

  const area = pixels.length;
  const centroid = {
    x: pixels.reduce((sum, [px]) => sum + px, 0) / area,
    y: pixels.reduce((sum, [, py]) => sum + py, 0) / area
  };

  // Create contour by finding boundary pixels
  const contour = pixels.filter(([x, y]) => {
    const idx = y * width + x;
    const hasEmptyNeighbor = 
      (x > 0 && binary[idx - 1] === 0) ||
      (x < width - 1 && binary[idx + 1] === 0) ||
      (y > 0 && binary[idx - width] === 0) ||
      (y < height - 1 && binary[idx + width] === 0) ||
      (x > 0 && y > 0 && binary[idx - width - 1] === 0) ||
      (x < width - 1 && y > 0 && binary[idx - width + 1] === 0) ||
      (x > 0 && y < height - 1 && binary[idx + width - 1] === 0) ||
      (x < width - 1 && y < height - 1 && binary[idx + width + 1] === 0);
    return hasEmptyNeighbor;
  }).map(([x, y]) => ({ x, y }));

  return {
    id: `shape_${shapeId}`,
    bounds,
    contour,
    area,
    centroid,
    imageData: new ImageData(width, height), // Placeholder
    isFloating: false, // Will be set by detection function
    isLetter: false, // Will be set by detection function
    aspectRatio: 1, // Will be set by detection function
  };
};

const createCanvasFromImage = (img: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(img, 0, 0);
  }
  return canvas;
};

// Scale coordinates from original image to rig canvas
const scaleToRigCanvas = (x: number, y: number, originalWidth: number, originalHeight: number): { x: number; y: number } => {
  const scale = Math.min(RIG_STAGE_SIZE / originalWidth, RIG_STAGE_SIZE / originalHeight) * 0.8;
  const offsetX = (RIG_STAGE_SIZE - (originalWidth * scale)) / 2;
  const offsetY = (RIG_STAGE_SIZE - (originalHeight * scale)) / 2;
  
  return {
    x: x * scale + offsetX,
    y: y * scale + offsetY
  };
};

enum BuilderStep {
  UPLOAD = 'upload',
  ARRANGE = 'arrange',
  RIG = 'rig',
}

type RigJoint = {
  id: string;
  name: string;
  x: number;
  y: number;
};

type RigBone = {
  id: string;
  startJointId: string;
  endJointId: string;
};

type CutoutRigBuilderProps = {
  open: boolean;
  onClose: () => void;
  sheetPalette: SheetPalette;
  updateSheetPalette: (patch: Partial<SheetPalette>) => void;
  assignSegmentToSlot: (segment: SheetSegment, slotId?: string) => void;
  setStateWithHistory: (actionId: string, update: (prev: SkeletonState) => SkeletonState) => void;
  state: SkeletonState;
};

type SegmentDetailPanelProps = {
  segment: SheetSegment | null;
  label: string;
  onLabelChange: (value: string) => void;
  slotOptions: { id: string; label: string }[];
  targetSlotId: string | null;
  onTargetSlotChange: (slotId: string) => void;
  onAssign: (slotId: string | undefined) => void;
};

const SegmentDetailPanel: React.FC<SegmentDetailPanelProps> = ({
  segment,
  label,
  onLabelChange,
  slotOptions,
  targetSlotId,
  onTargetSlotChange,
  onAssign,
}) => {
  if (!segment) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5 text-[10px] text-white/50">
        Select a segment from the library to edit its label or assign it directly to a slot.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
        <span>Piece console</span>
        <span className="text-[9px] text-white/40">#{segment.area}</span>
      </div>
      <div className="h-36 w-full rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center p-2">
        <img src={segment.thumbnail} alt="Selected segment" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-[0.4em] text-white/40">Label</label>
        <input
          type="text"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F27D26]"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-[0.4em] text-white/40">Assign to slot</label>
        <select
          value={targetSlotId ?? ''}
          onChange={(event) => onTargetSlotChange(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#F27D26]"
        >
          <option value="">— pick slot —</option>
          {slotOptions.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.label}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[9px] text-white/40">
        Dimensions: {segment.bounds.width}×{segment.bounds.height} px
      </div>
      <button
        type="button"
        onClick={() => onAssign(targetSlotId || undefined)}
        disabled={!targetSlotId}
        className="w-full rounded-full bg-[#F27D26] px-3 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-black disabled:opacity-40"
      >
        Assign
      </button>
    </div>
  );
};

const RIG_STAGE_SIZE = 360;
const stepOrder = [BuilderStep.UPLOAD, BuilderStep.ARRANGE, BuilderStep.RIG];

export const CutoutRigBuilder: React.FC<CutoutRigBuilderProps> = ({
  open,
  onClose,
  sheetPalette,
  updateSheetPalette,
  assignSegmentToSlot,
  setStateWithHistory,
  state,
}) => {
  const [step, setStep] = useState<BuilderStep>(BuilderStep.UPLOAD);
  const [sheetPreview, setSheetPreview] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string>('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [segmentThreshold, setSegmentThreshold] = useState(160);
  const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null);
  const [rigJoints, setRigJoints] = useState<RigJoint[]>([]);
  const [rigBones, setRigBones] = useState<RigBone[]>([]);
  const [activeJointId, setActiveJointId] = useState<string | null>(null);
  const sheetInputRef = useRef<HTMLInputElement | null>(null);
  const [segmentBrightness, setSegmentBrightness] = useState<Record<string, number>>({});
  const [segmentLabels, setSegmentLabels] = useState<Record<string, string>>({});
  const [segmentFeather, setSegmentFeather] = useState(2);
  const [edgeTolerance, setEdgeTolerance] = useState(20);
  const jointIdCounter = useRef(0);
  
  // Canvas-based detection state
  const [detectionThreshold, setDetectionThreshold] = useState(30);
  const [backgroundBrightness, setBackgroundBrightness] = useState(248); // Near-white default
  const [featherAmount, setFeatherAmount] = useState(2);
  const [minSize, setMinSize] = useState(100);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<ShapeDetectionResult | null>(null);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);
  const [originalImageDimensions, setOriginalImageDimensions] = useState<{ width: number; height: number } | null>(null);
  
  // Mask upload state
  const [maskFiles, setMaskFiles] = useState<File[]>([]);
  const maskInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedSegmentId = sheetPalette.selectedSegmentId;
  const selectedSegment = useMemo(
    () => sheetPalette.segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [sheetPalette.segments, selectedSegmentId],
  );

  const assignedSlots = useMemo(
    () => Object.entries(state.cutoutSlots).filter(([, slot]) => Boolean(slot.assetId)),
    [state.cutoutSlots],
  );

  const resetRig = useCallback(() => {
    setRigJoints([]);
    setRigBones([]);
    setActiveJointId(null);
  }, []);

  const handleSegmentLabelChange = useCallback((segmentId: string, value: string) => {
    setSegmentLabels((prev) => ({ ...prev, [segmentId]: value }));
  }, []);

  useEffect(() => {
    if (!selectedSegment) return;
    setSegmentLabels((prev) => {
      if (prev[selectedSegment.id]) return prev;
      return { ...prev, [selectedSegment.id]: `Piece ${selectedSegment.area}` };
    });
  }, [selectedSegment]);

  const getSegmentBackdropStyle = useCallback(
    (segmentId: string): React.CSSProperties => {
      const brightness = segmentBrightness[segmentId];
      const isDarkSegment = brightness == null || brightness < 140;
      return {
        backgroundColor: isDarkSegment ? 'rgba(255, 255, 255, 0.92)' : 'rgba(6, 6, 6, 0.9)',
        borderColor: isDarkSegment ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)',
        color: isDarkSegment ? '#080808' : '#f5f5f5',
      };
    },
    [segmentBrightness],
  );

  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();
    const imageObjects: HTMLImageElement[] = [];
    const missingSegments = sheetPalette.segments.filter((segment) => !(segment.id in segmentBrightness));
    if (missingSegments.length === 0) return;

    const estimateBrightness = (segment: SheetSegment): Promise<number> =>
      new Promise((resolve) => {
        const img = new Image();
        imageObjects.push(img);
        img.crossOrigin = 'anonymous';
        img.src = segment.thumbnail;
        const sample = () => {
          if (abortController.signal.aborted) {
            resolve(127);
            return;
          }
          const canvas = document.createElement('canvas');
          const size = 32;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(127);
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          let total = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            total += 0.299 * r + 0.587 * g + 0.114 * b;
          }
          resolve(total / (data.length / 4));
        };

        if (img.complete) {
          sample();
        } else {
          img.onload = sample;
          img.onerror = () => resolve(127);
        }
      });

    const hydrateBrightness = async () => {
      const brightnessPromises = missingSegments.map(async (segment) => {
        if (abortController.signal.aborted || !isMounted) return null;
        const brightness = await estimateBrightness(segment);
        if (!isMounted || abortController.signal.aborted) return null;
        return { id: segment.id, brightness };
      });

      const results = await Promise.all(brightnessPromises);
      if (isMounted && !abortController.signal.aborted) {
        const updates = Object.fromEntries(
          results.filter((result): result is { id: string; brightness: number } => result !== null)
            .map(result => [result.id, result.brightness])
        );
        setSegmentBrightness((prev) => ({ ...prev, ...updates }));
      }
    };

    void hydrateBrightness();
    return () => {
      isMounted = false;
      abortController.abort();
      // Clean up Image objects to prevent memory leaks
      imageObjects.forEach(img => {
        img.onload = null;
        img.onerror = null;
        // Revoke object URLs if any
        if (img.src.startsWith('blob:')) {
          URL.revokeObjectURL(img.src);
        }
        img.src = '';
        // Force remove from DOM if attached
        img.remove?.();
      });
      imageObjects.length = 0;
    };
  }, [segmentBrightness, sheetPalette.segments]);

  const handleSheetUpload = useCallback(
    async (file: File) => {
      setSheetError(null);
      setSheetLoading(true);
      try {
        const result = await segmentSheetFromFile(file, {
          threshold: segmentThreshold,
          featherRadius: segmentFeather,
          edgeTolerance,
        });
        setSheetPreview(result.src);
        setSheetName(result.name ?? file.name);
        updateSheetPalette({
          sheetId: result.name ?? file.name,
          name: result.name ?? file.name,
          dims: { width: result.width, height: result.height },
          segments: result.segments,
          selectedSegmentId: null,
          targetSlotId: null,
          previewSrc: result.src,
        });
        setStep(BuilderStep.ARRANGE);
      } catch (err) {
        setSheetError(err instanceof Error ? err.message : 'Failed to parse sheet.');
      } finally {
        setSheetLoading(false);
      }
    },
    [segmentThreshold, segmentFeather, edgeTolerance, updateSheetPalette],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void handleSheetUpload(file);
      event.target.value = '';
    },
    [handleSheetUpload],
  );

  const handleMaskFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;
      
      setMaskFiles(prev => [...prev, ...files]);
      
      // Process each mask file and add as a segment
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          const img = new Image();
          img.onload = () => {
            const segment: SheetSegment = {
              id: `mask_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              thumbnail: dataUrl,
              bounds: { x: 0, y: 0, width: img.width, height: img.height },
              area: img.width * img.height,
            };
            
            updateSheetPalette({ 
              segments: [...sheetPalette.segments, segment]
            });
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
      
      event.target.value = '';
    },
    [updateSheetPalette, sheetPalette.segments],
  );

  const handleCanvasDetection = useCallback(
    async (file: File) => {
      setIsDetecting(true);
      setSheetError(null);
      
      try {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        
        const img = new Image();
        img.onload = () => {
          const canvas = createCanvasFromImage(img);
          const result = detectShapesFromCanvas(canvas, detectionThreshold);
          
          // Store original image dimensions
          setOriginalImageDimensions({ width: img.width, height: img.height });
          setUploadedImage(img);
          
          // Create individual piece canvases with near-white backgrounds
          const pieceDataUrls = createDetectedPiecesCanvas(result.shapes, canvas, backgroundBrightness, featherAmount);
          
          // Convert detected shapes to segments with original coordinates
          const segments: SheetSegment[] = result.shapes.map((shape, index) => ({
            id: `detected_${shape.id}`,
            bounds: shape.bounds,
            area: shape.area,
            thumbnail: pieceDataUrls[index], // Always use the individual piece thumbnail
            originalCoordinates: { x: shape.bounds.x, y: shape.bounds.y }
          }));
          
          updateSheetPalette({
            segments: [...sheetPalette.segments, ...segments],
            name: file.name,
            sheetId: `canvas_${Date.now()}`
          });
          
          setSheetPreview(dataUrl);
          setSheetName(file.name);
          setDetectionResult(result);
          setIsDetecting(false);
        };
        
        img.src = dataUrl;
      } catch (error) {
        setSheetError(error instanceof Error ? error.message : 'Detection failed');
        setIsDetecting(false);
      }
    },
    [updateSheetPalette, sheetPalette.segments, detectionThreshold, backgroundBrightness, featherAmount],
  );

  const handleSegmentClick = useCallback(
    (segment: SheetSegment) => {
      updateSheetPalette({ selectedSegmentId: segment.id });
    },
    [updateSheetPalette],
  );

  const handleSegmentDragStart = useCallback((segmentId: string, event: React.DragEvent<HTMLButtonElement>) => {
    event.dataTransfer?.setData('segment', segmentId);
    setDraggingSegmentId(segmentId);
    event.dataTransfer?.setDragImage(event.currentTarget, 20, 20);
  }, []);

  const handleSegmentDragEnd = useCallback(() => {
    setDraggingSegmentId(null);
  }, []);

  const handleSlotDrop = useCallback(
    (slotId: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const segmentId = event.dataTransfer?.getData('segment');
      if (!segmentId) return;
      const segment = sheetPalette.segments.find((s) => s.id === segmentId);
      if (!segment) return;
      assignSegmentToSlot(segment, slotId);
      updateSheetPalette({ selectedSegmentId: segmentId, targetSlotId: slotId });
    },
    [assignSegmentToSlot, sheetPalette.segments, updateSheetPalette],
  );

  const handleSlotDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleRigStageClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const scaleX = RIG_STAGE_SIZE / rect.width;
      const scaleY = RIG_STAGE_SIZE / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const jointId = `joint-${++jointIdCounter.current}`;
      const nextJoint: RigJoint = {
        id: jointId,
        name: `Joint ${rigJoints.length + 1}`,
        x,
        y,
      };
      setRigJoints((prev) => [...prev, nextJoint]);
      if (activeJointId) {
        setRigBones((prev) => [
          ...prev,
          { id: `bone-${jointId}`, startJointId: activeJointId, endJointId: jointId },
        ]);
      }
      setActiveJointId(jointId);
    },
    [activeJointId, rigJoints.length],
  );

  const buildRigidModel = useCallback(() => {
    setStateWithHistory('cutout_builder:build_rig', (prev) => ({
      ...prev,
      cutoutRig: {
        ...(prev.cutoutRig ?? { linkWaistToTorso: false, linkJointsToMasks: false }),
        linkJointsToMasks: true,
        linkWaistToTorso: true,
      },
      physicsRigidity: 0,
      rigidity: 'cardboard',
    }));
    onClose();
  }, [onClose, setStateWithHistory]);

  const currentIndex = stepOrder.indexOf(step);
  const canGoForward = useMemo(() => {
    if (step === BuilderStep.UPLOAD) return sheetPalette.segments.length > 0;
    if (step === BuilderStep.ARRANGE) return assignedSlots.length > 0;
    if (step === BuilderStep.RIG) return rigBones.length > 0;
    return true;
  }, [assignedSlots.length, rigBones.length, sheetPalette.segments.length, step]);

  const handleNext = useCallback(() => {
    if (step === BuilderStep.RIG) {
      onClose();
      return;
    }
    const next = stepOrder[Math.min(currentIndex + 1, stepOrder.length - 1)];
    setStep(next);
  }, [currentIndex, onClose, step]);

  const handlePrev = useCallback(() => {
    if (currentIndex <= 0) return;
    setStep(stepOrder[currentIndex - 1]);
  }, [currentIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70">
      <div className="relative w-full max-w-[1100px] h-[calc(100vh-48px)] overflow-hidden rounded-2xl border border-white/10 bg-[#040404] shadow-2xl flex flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-[#666]">Cutout Rig Builder</div>
            <div className="text-2xl font-bold">Feed a sheet → assets → rigid bones</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full border border-white/10 text-white/80 hover:text-white hover:border-white/30"
            aria-label="Close cutout builder"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-white/5 px-6 py-3">
          {stepOrder.map((value, idx) => (
            <button
              key={value}
              type="button"
              onClick={() => setStep(value)}
              className={`px-4 py-2 text-[10px] uppercase tracking-[0.3em] rounded-full transition-all focus:outline-none ${
                step === value
                  ? 'bg-white text-black font-bold'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {`${String(idx + 1).padStart(2, '0')} ${value}`}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 overflow-y-auto flex-1">
          {step === BuilderStep.UPLOAD && (
            <div className="flex gap-6 min-h-0 flex-1">
              {/* Main Canvas Area */}
              <div className="flex-1 flex flex-col gap-4">
                {/* Canvas-based Detection Section */}
                <div className="rounded-2xl border border-[#8b5cf6]/30 bg-gradient-to-br from-[#8b5cf6]/5 to-[#6366f1]/5 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white/80">Canvas Detection</h3>
                    <div className="text-[10px] text-white/60 bg-white/10 px-2 py-1 rounded-full">
                      AI-Powered
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <input
                        type="file"
                        ref={sheetInputRef}
                        accept="image/*"
                        className="hidden"
                        data-testid="canvas-detection-input"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCanvasDetection(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => sheetInputRef.current?.click()}
                        disabled={isDetecting}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#8b5cf6] text-white px-6 py-3 text-[10px] font-bold uppercase tracking-[0.4em] disabled:opacity-50 shadow-lg"
                      >
                        <Wand2 size={16} />
                        {isDetecting ? 'Detecting...' : 'Auto-Detect'}
                      </button>
                      
                      {/* Zoom Controls */}
                      <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setCanvasScale(Math.max(0.5, canvasScale - 0.1))}
                          className="text-white/60 hover:text-white"
                        >
                          −
                        </button>
                        <span className="text-[10px] text-white/80 w-12 text-center">
                          {Math.round(canvasScale * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => setCanvasScale(Math.min(2, canvasScale + 0.1))}
                          className="text-white/60 hover:text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    
                    {/* Canvas Preview Area */}
                    <div className="relative bg-white/5 rounded-xl border border-white/10 overflow-hidden" style={{ minHeight: '400px' }}>
                      {sheetPreview ? (
                        <div className="flex items-center justify-center p-4">
                          <img
                            src={sheetPreview}
                            alt="Uploaded image"
                            className="max-w-full max-h-[400px] object-contain rounded-lg shadow-xl"
                            style={{ transform: `scale(${canvasScale})` }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/30">
                          <div className="text-center">
                            <div className="text-2xl mb-2">📸</div>
                            <div className="text-sm">Upload an image to detect pieces</div>
                            <div className="text-xs mt-1">Supports PNG, JPG, and GIF</div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Advanced Controls */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Sensitivity</label>
                        <input
                          type="range"
                          min={10}
                          max={100}
                          value={detectionThreshold}
                          onChange={(e) => setDetectionThreshold(Number(e.target.value))}
                          className="w-full accent-[#8b5cf6]"
                        />
                        <div className="text-[8px] text-white/60 text-center">{detectionThreshold}</div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Background</label>
                        <input
                          type="range"
                          min={200}
                          max={255}
                          value={backgroundBrightness}
                          onChange={(e) => setBackgroundBrightness(Number(e.target.value))}
                          className="w-full accent-[#8b5cf6]"
                        />
                        <div className="text-[8px] text-white/60 text-center">{backgroundBrightness}</div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Feather</label>
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={featherAmount}
                          onChange={(e) => setFeatherAmount(Number(e.target.value))}
                          className="w-full accent-[#8b5cf6]"
                        />
                        <div className="text-[8px] text-white/60 text-center">{featherAmount}px</div>
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Min Size</label>
                        <input
                          type="range"
                          min={10}
                          max={500}
                          value={minSize}
                          onChange={(e) => {
                            setMinSize(Number(e.target.value));
                            // Re-detect with new minimum size
                            if (sheetPreview && uploadedImage) {
                              const canvas = createCanvasFromImage(uploadedImage);
                              const result = detectShapesFromCanvas(canvas, detectionThreshold);
                              console.log('Re-detecting with new parameters');
                            }
                          }}
                          className="w-full accent-[#8b5cf6]"
                        />
                        <div className="text-[8px] text-white/60 text-center">{minSize}px</div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (sheetPreview && uploadedImage) {
                            console.log('Manual re-detection triggered');
                            const canvas = createCanvasFromImage(uploadedImage);
                            const result = detectShapesFromCanvas(canvas, detectionThreshold);
                            setDetectionResult(result);
                            
                            // Update sheet palette with new segments
                            const segments = result.shapes.map((shape, index) => ({
                              id: `detected_${shape.id}`,
                              bounds: shape.bounds,
                              area: shape.area,
                              thumbnail: canvas.toDataURL(),
                            }));
                            updateSheetPalette({
                              segments,
                              name: 'Re-detected shapes',
                              sheetId: `redetect_${Date.now()}`
                            });
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-[#8b5cf6] text-white text-[9px] font-bold uppercase rounded-lg hover:bg-[#8b5cf6]/80 transition-colors"
                      >
                        Re-Detect
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => {
                          // Try inverse detection (detect light shapes on dark background)
                          if (sheetPreview && uploadedImage) {
                            console.log('Inverse detection triggered');
                            const canvas = createCanvasFromImage(uploadedImage);
                            const result = detectShapesFromCanvas(canvas, 255 - detectionThreshold);
                            setDetectionResult(result);
                            
                            // Update sheet palette with new segments
                            const segments = result.shapes.map((shape, index) => ({
                              id: `detected_${shape.id}`,
                              bounds: shape.bounds,
                              area: shape.area,
                              thumbnail: canvas.toDataURL(),
                            }));
                            updateSheetPalette({
                              segments,
                              name: 'Inverse detected shapes',
                              sheetId: `inverse_${Date.now()}`
                            });
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-[#F27D26] text-black text-[9px] font-bold uppercase rounded-lg hover:bg-[#F27D26]/80 transition-colors"
                      >
                        Inverse
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right Side Palette - Persistent */}
              <div className="w-80 flex flex-col gap-4 min-h-0">
                {/* Palette Header */}
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-white/80">Piece Palette</h3>
                    <div className="text-[10px] text-[#8b5cf6] bg-[#8b5cf6]/20 px-2 py-1 rounded-full">
                      {sheetPalette.segments.length} pieces
                    </div>
                  </div>
                  
                  {/* Piece Type Indicators */}
                  <div className="flex gap-2 text-[8px]">
                    <span className="text-white/60">Types:</span>
                    <span className="text-[#8b5cf6]">
                      {sheetPalette.segments.filter(s => s.id.startsWith('detected_')).length} detected
                    </span>
                    <span className="text-[#F27D26]">
                      {sheetPalette.segments.filter(s => s.id.startsWith('mask_')).length} masks
                    </span>
                    <span className="text-white/40">
                      {sheetPalette.segments.filter(s => !s.id.startsWith('detected_') && !s.id.startsWith('mask_')).length} sheets
                    </span>
                  </div>
                </div>
                
                {/* Piece Grid - Scrollable */}
                <div className="flex-1 rounded-2xl border border-white/20 bg-gradient-to-br from-white/5 to-black/20 p-4 overflow-hidden min-h-0">
                  <div className="h-full overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 gap-3">
                      {sheetPalette.segments.map((segment) => {
                        const isSelected = segment.id === selectedSegmentId;
                        const isMaskPiece = segment.id.startsWith('mask_');
                        const isDetectedPiece = segment.id.startsWith('detected_');
                        
                        return (
                          <button
                            key={segment.id}
                            type="button"
                            draggable
                            onDragStart={(event) => handleSegmentDragStart(segment.id, event)}
                            onDragEnd={handleSegmentDragEnd}
                            onClick={() => handleSegmentClick(segment)}
                            className={`group flex flex-col gap-2 rounded-xl border p-2 text-left transition-all relative ${
                              isSelected 
                                ? 'border-white bg-white/20 shadow-lg' 
                                : isMaskPiece
                                  ? 'border-[#F27D26]/50 bg-[#F27D26]/10 hover:border-[#F27D26] hover:bg-[#F27D26]/20'
                                  : isDetectedPiece
                                    ? 'border-[#8b5cf6]/50 bg-[#8b5cf6]/10 hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/20'
                                    : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
                            }`}
                          >
                            {/* Piece Type Indicators */}
                            {isMaskPiece && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#F27D26] rounded-full" />
                            )}
                            {isDetectedPiece && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#8b5cf6] rounded-full" />
                            )}
                            
                            <div className="aspect-square rounded-lg overflow-hidden bg-white/10">
                              <img
                                src={segment.thumbnail}
                                alt=""
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="text-[8px] font-medium text-white/80 truncate">
                              {isMaskPiece ? 'Mask' : isDetectedPiece ? 'Detected' : 'Piece'}
                            </div>
                            <div className="text-[7px] text-white/50">
                              {segment.bounds.width}×{segment.bounds.height}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    
                    {sheetPalette.segments.length === 0 && (
                      <div className="flex items-center justify-center h-full text-white/30">
                        <div className="text-center">
                          <div className="text-2xl mb-2">🎨</div>
                          <div className="text-sm">No pieces yet</div>
                          <div className="text-xs mt-1">Upload an image to detect pieces</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Quick Actions */}
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        sheetPalette.segments.forEach(segment => {
                          setSegmentLabels(prev => ({
                            ...prev,
                            [segment.id]: segmentLabels[segment.id] ?? `Piece ${segment.area}`
                          }));
                        });
                      }}
                      className="w-full px-3 py-2 bg-[#F27D26] text-black text-[9px] font-bold uppercase rounded-lg hover:bg-[#F27D26]/80 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateSheetPalette({ segments: [] });
                        setDetectionResult(null);
                        setSheetPreview(null);
                      }}
                      className="w-full px-3 py-2 bg-red-500/20 text-red-400 text-[9px] font-bold uppercase rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === BuilderStep.ARRANGE && (
            <div className="flex gap-6 min-h-0 flex-1">
              {/* Main Arrange Area */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white/80">Slot Assignment</h3>
                    <div className="text-[10px] text-white/60 bg-white/10 px-2 py-1 rounded-full">
                      Drag pieces to slots
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {MANIKIN_SLOT_ORDER.map((slotId) => {
                      const slot = state.cutoutSlots[slotId];
                      const asset = slot?.assetId ? state.assets[slot.assetId] : null;
                      return (
                        <div
                          key={slotId}
                          onDragOver={handleSlotDragOver}
                          onDrop={handleSlotDrop(slotId)}
                          className="min-h-[100px] relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3"
                        >
                          <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">{slot.name}</div>
                          {asset?.image?.src ? (
                            <img
                              src={asset.image.src}
                              alt={asset.name}
                              className="h-14 w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex-1 rounded-lg border border-dashed border-white/10" />
                          )}
                          <div className="text-[9px] text-white/60">Target joint: {slot.attachment.toJointId}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Right Side Palette - Same as Upload */}
              <div className="w-80 flex flex-col gap-4 min-h-0">
                {/* Palette Header */}
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-white/80">Piece Palette</h3>
                    <div className="text-[10px] text-[#8b5cf6] bg-[#8b5cf6]/20 px-2 py-1 rounded-full">
                      {sheetPalette.segments.length} pieces
                    </div>
                  </div>
                  
                  {/* Piece Type Indicators */}
                  <div className="flex gap-2 text-[8px]">
                    <span className="text-white/60">Types:</span>
                    <span className="text-[#8b5cf6]">
                      {sheetPalette.segments.filter(s => s.id.startsWith('detected_')).length} detected
                    </span>
                    <span className="text-[#F27D26]">
                      {sheetPalette.segments.filter(s => s.id.startsWith('mask_')).length} masks
                    </span>
                    <span className="text-white/40">
                      {sheetPalette.segments.filter(s => !s.id.startsWith('detected_') && !s.id.startsWith('mask_')).length} sheets
                    </span>
                  </div>
                </div>
                
                {/* Piece Grid - Scrollable */}
                <div className="flex-1 rounded-2xl border border-white/20 bg-gradient-to-br from-white/5 to-black/20 p-4 overflow-hidden min-h-0">
                  <div className="h-full overflow-y-auto pr-2">
                    <div className="grid grid-cols-2 gap-3">
                      {sheetPalette.segments.map((segment) => {
                        const isSelected = segment.id === selectedSegmentId;
                        const isMaskPiece = segment.id.startsWith('mask_');
                        const isDetectedPiece = segment.id.startsWith('detected_');
                        
                        return (
                          <button
                            key={segment.id}
                            type="button"
                            draggable
                            onDragStart={(event) => handleSegmentDragStart(segment.id, event)}
                            onDragEnd={handleSegmentDragEnd}
                            onClick={() => handleSegmentClick(segment)}
                            className={`group flex flex-col gap-2 rounded-xl border p-2 text-left transition-all relative ${
                              isSelected 
                                ? 'border-white bg-white/20 shadow-lg' 
                                : isMaskPiece
                                  ? 'border-[#F27D26]/50 bg-[#F27D26]/10 hover:border-[#F27D26] hover:bg-[#F27D26]/20'
                                  : isDetectedPiece
                                    ? 'border-[#8b5cf6]/50 bg-[#8b5cf6]/10 hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/20'
                                    : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
                            }`}
                          >
                            {/* Piece Type Indicators */}
                            {isMaskPiece && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#F27D26] rounded-full" />
                            )}
                            {isDetectedPiece && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#8b5cf6] rounded-full" />
                            )}
                            
                            <div className="aspect-square rounded-lg overflow-hidden bg-white/10">
                              <img
                                src={segment.thumbnail}
                                alt=""
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="text-[8px] font-medium text-white/80 truncate">
                              {isMaskPiece ? 'Mask' : isDetectedPiece ? 'Detected' : 'Piece'}
                            </div>
                            <div className="text-[7px] text-white/50">
                              {segment.bounds.width}×{segment.bounds.height}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Piece Management Controls */}
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        sheetPalette.segments.forEach(segment => {
                          setSegmentLabels(prev => ({
                            ...prev,
                            [segment.id]: segmentLabels[segment.id] ?? `Piece ${segment.area}`
                          }));
                        });
                      }}
                      className="w-full px-3 py-2 bg-[#F27D26] text-black text-[9px] font-bold uppercase rounded-lg hover:bg-[#F27D26]/80 transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const detectedSegments = sheetPalette.segments.filter(s => s.id.startsWith('detected_'));
                        detectedSegments.forEach(segment => {
                          setSegmentLabels(prev => ({
                            ...prev,
                            [segment.id]: `Detected ${segment.area}`
                          }));
                        });
                      }}
                      className="w-full px-3 py-2 bg-[#8b5cf6] text-white text-[9px] font-bold uppercase rounded-lg hover:bg-[#8b5cf6]/80 transition-colors"
                    >
                      Label Detected
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === BuilderStep.RIG && (
            <div className="flex gap-6 min-h-0 flex-1">
              {/* Unified Canvas Area */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-white/80">Unified Rig Canvas</h3>
                    <div className="text-[10px] text-white/60 bg-white/10 px-2 py-1 rounded-full">
                      Drag • Label • Assign • Rig
                    </div>
                  </div>
                  
                  {/* Canvas Controls */}
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={resetRig}
                      className="px-3 py-1 bg-white/10 text-white text-[9px] font-bold uppercase rounded-lg hover:bg-white/20 transition-colors"
                    >
                      Reset Canvas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        // Auto-arrange pieces in a grid
                        const segments = sheetPalette.segments;
                        const cols = Math.ceil(Math.sqrt(segments.length));
                        const spacing = 150;
                        segments.forEach((segment, index) => {
                          const row = Math.floor(index / cols);
                          const col = index % cols;
                          const x = col * spacing + 100;
                          const y = row * spacing + 100;
                          // Update segment position in state
                        });
                      }}
                      className="px-3 py-1 bg-[#8b5cf6] text-white text-[9px] font-bold uppercase rounded-lg hover:bg-[#8b5cf6]/80 transition-colors"
                    >
                      Auto-Arrange
                    </button>
                  </div>
                  
                  {/* Main Canvas */}
                  <div
                    className="relative bg-white/5 rounded-xl border border-white/10 overflow-hidden"
                    style={{ minHeight: '500px' }}
                  >
                    <svg 
                      viewBox={`0 0 ${RIG_STAGE_SIZE} ${RIG_STAGE_SIZE}`} 
                      className="absolute inset-0 h-full w-full"
                      onClick={handleRigStageClick}
                    >
                      {/* Grid */}
                      <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"/>
                        </pattern>
                      </defs>
                      <rect width="100%" height="100%" fill="url(#grid)" />
                      
                      {/* Original uploaded image as background reference */}
                      {uploadedImage && originalImageDimensions && (
                        <g opacity={0.2}>
                          <image
                            href={uploadedImage.src}
                            x={scaleToRigCanvas(0, 0, originalImageDimensions.width, originalImageDimensions.height).x}
                            y={scaleToRigCanvas(0, 0, originalImageDimensions.width, originalImageDimensions.height).y}
                            width={originalImageDimensions.width * Math.min(RIG_STAGE_SIZE / originalImageDimensions.width, RIG_STAGE_SIZE / originalImageDimensions.height) * 0.8}
                            height={originalImageDimensions.height * Math.min(RIG_STAGE_SIZE / originalImageDimensions.width, RIG_STAGE_SIZE / originalImageDimensions.height) * 0.8}
                          />
                        </g>
                      )}
                      
                      {/* Center lines */}
                      <line
                        x1={0}
                        y1={RIG_STAGE_SIZE / 2}
                        x2={RIG_STAGE_SIZE}
                        y2={RIG_STAGE_SIZE / 2}
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth={1}
                      />
                      <line
                        x1={RIG_STAGE_SIZE / 2}
                        y1={0}
                        x2={RIG_STAGE_SIZE / 2}
                        y2={RIG_STAGE_SIZE}
                        stroke="rgba(255,255,255,0.05)"
                        strokeWidth={1}
                      />
                      
                      {/* Skeleton connections */}
                      {rigBones.map((bone) => {
                        const from = rigJoints.find((joint) => joint.id === bone.startJointId);
                        const to = rigJoints.find((joint) => joint.id === bone.endJointId);
                        if (!from || !to) return null;
                        return (
                          <g key={`bone-${bone.id}`}>
                            <line
                              x1={from.x}
                              y1={from.y}
                              x2={to.x}
                              y2={to.y}
                              stroke="rgba(139, 92, 246, 0.5)"
                              strokeWidth={2}
                            />
                            <circle
                              cx={from.x}
                              cy={from.y}
                              r={4}
                              fill="rgba(139, 92, 246, 0.8)"
                              className="cursor-pointer hover:fill-[#8b5cf6]"
                            />
                            <circle
                              cx={to.x}
                              cy={to.y}
                              r={4}
                              fill="rgba(139, 92, 246, 0.8)"
                              className="cursor-pointer hover:fill-[#8b5cf6]"
                            />
                          </g>
                        );
                      })}
                      
                      {/* Draggable cutout pieces */}
                      {sheetPalette.segments.map((segment) => {
                        // Use original coordinates if available, otherwise use default positioning
                        let pieceX, pieceY;
                        
                        if (segment.originalCoordinates && originalImageDimensions) {
                          const scaled = scaleToRigCanvas(
                            segment.originalCoordinates.x + segment.bounds.width / 2,
                            segment.originalCoordinates.y + segment.bounds.height / 2,
                            originalImageDimensions.width,
                            originalImageDimensions.height
                          );
                          pieceX = scaled.x;
                          pieceY = scaled.y;
                        } else {
                          pieceX = (segment.bounds.x || 100) + 50;
                          pieceY = (segment.bounds.y || 100) + 50;
                        }
                        
                        const isSelected = segment.id === selectedSegmentId;
                        
                        return (
                          <g
                            key={`piece-${segment.id}`}
                            transform={`translate(${pieceX}, ${pieceY})`}
                            className="cursor-move"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSegmentClick(segment);
                            }}
                          >
                            {/* Piece background */}
                            <rect
                              x={-segment.bounds.width / 2}
                              y={-segment.bounds.height / 2}
                              width={segment.bounds.width}
                              height={segment.bounds.height}
                              fill={isSelected ? "rgba(139, 92, 246, 0.2)" : "rgba(255, 255, 255, 0.1)"}
                              stroke={isSelected ? "#8b5cf6" : "rgba(255, 255, 255, 0.3)"}
                              strokeWidth={isSelected ? 2 : 1}
                              rx={4}
                            />
                            
                            {/* Piece image */}
                            <image
                              href={segment.thumbnail}
                              x={-segment.bounds.width / 2}
                              y={-segment.bounds.height / 2}
                              width={segment.bounds.width}
                              height={segment.bounds.height}
                              opacity={0.9}
                            />
                            
                            {/* Piece label */}
                            <text
                              x={0}
                              y={segment.bounds.height / 2 + 20}
                              textAnchor="middle"
                              fill="white"
                              fontSize="10"
                              className="pointer-events-none"
                            >
                              {segmentLabels[segment.id] || `Piece ${segment.area}`}
                            </text>
                            
                            {/* Selection indicator */}
                            {isSelected && (
                              <circle
                                cx={segment.bounds.width / 2 - 10}
                                cy={-segment.bounds.height / 2 + 10}
                                r={6}
                                fill="#8b5cf6"
                              />
                            )}
                          </g>
                        );
                      })}
                      
                      {/* Joints */}
                      {rigJoints.map((joint) => (
                        <circle
                          key={joint.id}
                          cx={joint.x}
                          cy={joint.y}
                          r={6}
                          fill={joint.id === activeJointId ? '#F27D26' : '#ffffff'}
                          stroke="#000"
                          strokeWidth={2}
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveJointId(joint.id);
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </svg>
                    
                    {/* Canvas overlay for interactions */}
                    <div className="absolute inset-0 pointer-events-none">
                      {selectedSegmentId && (
                        <div className="absolute top-4 left-4 bg-black/80 text-white text-xs px-3 py-2 rounded-lg">
                          <div>Selected: {segmentLabels[selectedSegmentId] || 'Unnamed'}</div>
                          <div className="text-white/60">Click to assign to skeleton</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Right Side Controls */}
              <div className="w-80 flex flex-col gap-4">
                {/* Piece Palette */}
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-white/80">Pieces</h3>
                    <div className="text-[10px] text-[#8b5cf6] bg-[#8b5cf6]/20 px-2 py-1 rounded-full">
                      {sheetPalette.segments.length} total
                    </div>
                  </div>
                  
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {sheetPalette.segments.map((segment) => {
                      const isSelected = segment.id === selectedSegmentId;
                      const isMaskPiece = segment.id.startsWith('mask_');
                      const isDetectedPiece = segment.id.startsWith('detected_');
                      
                      return (
                        <button
                          key={segment.id}
                          type="button"
                          onClick={() => handleSegmentClick(segment)}
                          className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-all ${
                            isSelected 
                              ? 'bg-[#8b5cf6]/20 border border-[#8b5cf6]/50' 
                              : 'bg-white/5 border border-white/10 hover:bg-white/10'
                          }`}
                        >
                          <div className="w-8 h-8 rounded overflow-hidden bg-white/10">
                            <img
                              src={segment.thumbnail}
                              alt=""
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-white/80 truncate">
                              {segmentLabels[segment.id] || `Piece ${segment.area}`}
                            </div>
                            <div className="text-[10px] text-white/50">
                              {isMaskPiece ? 'Mask' : isDetectedPiece ? 'Detected' : 'Sheet'} • {segment.bounds.width}×{segment.bounds.height}
                            </div>
                          </div>
                          {isMaskPiece && (
                            <div className="w-2 h-2 bg-[#F27D26] rounded-full" />
                          )}
                          {isDetectedPiece && (
                            <div className="w-2 h-2 bg-[#8b5cf6] rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                {/* Label Editor */}
                {selectedSegmentId && (
                  <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                    <h3 className="text-sm font-medium text-white/80 mb-3">Label Editor</h3>
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={segmentLabels[selectedSegmentId] || ''}
                        onChange={(e) => setSegmentLabels(prev => ({
                          ...prev,
                          [selectedSegmentId]: e.target.value
                        }))}
                        placeholder="Enter piece name..."
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:border-[#8b5cf6]"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            // Assign to skeleton
                            if (selectedSegmentId) {
                              const segment = sheetPalette.segments.find(s => s.id === selectedSegmentId);
                              if (segment) {
                                // Create bone from selected segment
                                const newJoint = {
                                  id: `joint-${jointIdCounter.current++}`,
                                  name: segmentLabels[selectedSegmentId] || `Joint ${jointIdCounter.current}`,
                                  x: RIG_STAGE_SIZE / 2,
                                  y: RIG_STAGE_SIZE / 2
                                };
                                setRigJoints(prev => [...prev, newJoint]);
                              }
                            }
                          }}
                          className="flex-1 px-3 py-2 bg-[#8b5cf6] text-white text-[9px] font-bold uppercase rounded-lg hover:bg-[#8b5cf6]/80 transition-colors"
                        >
                          Add Joint
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSegmentLabels(prev => {
                              const updated = { ...prev };
                              delete updated[selectedSegmentId];
                              return updated;
                            });
                          }}
                          className="px-3 py-2 bg-red-500/20 text-red-400 text-[9px] font-bold uppercase rounded-lg hover:bg-red-500/30 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Skeleton Info */}
                <div className="rounded-2xl border border-white/20 bg-gradient-to-br from-white/10 to-white/5 p-4">
                  <h3 className="text-sm font-medium text-white/80 mb-3">Skeleton</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/60">Joints:</span>
                      <span className="text-white/80">{rigJoints.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Bones:</span>
                      <span className="text-white/80">{rigBones.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Assigned:</span>
                      <span className="text-white/80">{assignedSlots.length}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 space-y-2">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">Joints</div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {rigJoints.length === 0 && <div className="text-white/30 text-xs">Click canvas to add joints</div>}
                      {rigJoints.map((joint) => (
                        <div key={joint.id} className={`flex items-center justify-between rounded px-2 py-1 text-xs ${joint.id === activeJointId ? 'bg-white/10' : ''}`}>
                          <span>{joint.name}</span>
                          <span className="text-white/40">{joint.x.toFixed(0)}, {joint.y.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Build Button */}
                <button
                  type="button"
                  onClick={buildRigidModel}
                  className="w-full rounded-2xl bg-[#F27D26] px-4 py-3 text-[11px] font-black uppercase tracking-[0.4em] text-black shadow-[0_0_30px_rgba(242,125,38,0.4)]"
                >
                  Build Rigid Bone Model
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex <= 0}
            className="rounded-full border border-white/20 px-4 py-2 text-[9px] uppercase tracking-[0.3em] text-white/60 disabled:opacity-30"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoForward}
            className="rounded-full bg-white px-6 py-2 text-[9px] font-bold uppercase tracking-[0.3em] text-black disabled:opacity-40"
          >
            {step === BuilderStep.RIG ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
