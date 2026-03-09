import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Wand2, Upload, Settings, Box, Link2, Zap, Layers, Grid3X3 } from 'lucide-react';

import type { SheetPalette, SheetSegment, SkeletonState } from '@/engine/types';
import { getWorldPosition } from '@/engine/kinematics';
import { INITIAL_JOINTS } from '@/engine/model';
import { segmentSheetFromFile } from '@/app/sheetParser';
import { CollapsibleSection } from './CollapsibleSection';

// Types for cutout rigging
type DetectedShape = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  contour: { x: number; y: number }[];
  area: number;
  centroid: { x: number; y: number };
  imageData: ImageData;
};

type ShapeDetectionResult = {
  shapes: DetectedShape[];
  backgroundRemoved: boolean;
  confidence: number;
};

type RigBindingMode = 'JOINT_DRIVES_MASK' | 'MASK_DRIVES_JOINT';

// Reiniger Physics Configuration
interface ReinigerConfig {
  enabled: boolean;
  stiffness: number;
  damping: number;
  snapToGrid: boolean;
  gridIncrement: number;
}

type RightConsoleProps = {
  state: SkeletonState;
  sheetPalette: SheetPalette;
  updateSheetPalette: (patch: Partial<SheetPalette>) => void;
  assignSegmentToSlot: (segment: SheetSegment, slotId?: string) => void;
  setStateWithHistory: (actionId: string, update: (prev: SkeletonState) => SkeletonState) => void;
};

// Auto-crop utility - calculates minimum bounding box of non-transparent pixels
const calculateAutoCrop = (imageData: ImageData): { x: number; y: number; w: number; h: number } => {
  const { data, width, height } = imageData;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let foundPixel = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        foundPixel = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Handle fully transparent case
  if (!foundPixel) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  // Return inclusive dimensions (+1 for width/height to include the pixel)
  return { 
    x: minX, 
    y: minY, 
    w: maxX - minX + 1, 
    h: maxY - minY + 1 
  };
};

// Canvas-based shape detection (ported from CutoutRigBuilder)
const detectShapesFromCanvas = (canvas: HTMLCanvasElement, threshold: number = 30): ShapeDetectionResult => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { shapes: [], backgroundRemoved: false, confidence: 0 };

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Create binary image based on threshold
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    binary[i / 4] = brightness < threshold ? 1 : 0;
  }

  // Find connected components (shapes)
  const shapes: DetectedShape[] = [];
  const visited = new Uint8Array(width * height);
  let shapeId = 0;

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

      // Add neighbors
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
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

    return {
      id: `shape_${shapeId}`,
      bounds,
      contour: [], // Simplified for now
      area,
      centroid
    };
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 1 && visited[idx] === 0) {
        const shape = floodFill(binary, visited, width, height, x, y, shapeId++);
        if (shape.area > 100) { // Filter out tiny noise
          shapes.push(shape);
        }
      }
    }
  }

  return {
    shapes,
    backgroundRemoved: true,
    confidence: Math.min(1.0, shapes.length / 10)
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

export const RightConsole: React.FC<RightConsoleProps> = ({
  state,
  sheetPalette,
  updateSheetPalette,
  assignSegmentToSlot,
  setStateWithHistory,
}) => {
  // Source/Detection state
  const [detectionThreshold, setDetectionThreshold] = useState(30);
  const [backgroundBrightness, setBackgroundBrightness] = useState(248);
  const [featherAmount, setFeatherAmount] = useState(2);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<ShapeDetectionResult | null>(null);
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [sheetPreview, setSheetPreview] = useState<string | null>(null);
  
  // Library/Assembly state
  const [bindingMode, setBindingMode] = useState<RigBindingMode>('JOINT_DRIVES_MASK');
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [targetJointId, setTargetJointId] = useState<string>('');
  const [draggingPieceId, setDraggingPieceId] = useState<string | null>(null);
  
  // Physics state
  const [reinigerConfig, setReinigerConfig] = useState<ReinigerConfig>({
    enabled: true,
    stiffness: 0.15,
    damping: 0.85,
    snapToGrid: false,
    gridIncrement: 15,
  });
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  
  // Refs
  const sheetInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSegment = sheetPalette.segments.find(s => s.id === selectedPieceId) || null;

  // Helper function to convert detection result to segments
  const buildSegmentsFromDetection = (result: ShapeDetectionResult, canvas: HTMLCanvasElement): SheetSegment[] => {
    return result.shapes.map((shape, index) => ({
      id: `detected_${shape.id}`,
      bounds: shape.bounds,
      area: shape.area,
      thumbnail: canvas.toDataURL(), // Simplified - should use cropped piece
    }));
  };

  // Auto-detection handler
  const handleCanvasDetection = useCallback(async (file: File) => {
    setIsDetecting(true);
    
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const parsed = await segmentSheetFromFile(file, {
        threshold: detectionThreshold,
        featherRadius: featherAmount,
      });

      setSheetPreview(dataUrl);
      setDetectionResult({
        shapes: parsed.segments.map((segment) => ({
          id: segment.id,
          bounds: segment.bounds,
          contour: [],
          area: segment.area,
          centroid: {
            x: segment.bounds.x + segment.bounds.width / 2,
            y: segment.bounds.y + segment.bounds.height / 2,
          },
          imageData: new ImageData(1, 1),
        })),
        backgroundRemoved: true,
        confidence: parsed.segments.length > 0 ? 1 : 0,
      });

      updateSheetPalette({
        segments: parsed.segments,
        name: file.name,
        sheetId: `canvas_${Date.now()}`,
        dims: { width: parsed.width, height: parsed.height },
        previewSrc: dataUrl,
        selectedSegmentId: parsed.segments[0]?.id ?? null,
      });
    } catch (error) {
      console.error('Detection failed:', error);
    } finally {
      setIsDetecting(false);
    }
  }, [detectionThreshold, featherAmount, updateSheetPalette]);

  // Drag and drop handlers
  const handlePieceDragStart = useCallback((pieceId: string, event: React.DragEvent<HTMLButtonElement>) => {
    event.dataTransfer?.setData('piece', pieceId);
    setDraggingPieceId(pieceId);
    event.dataTransfer?.setDragImage(event.currentTarget, 20, 20);
  }, []);

  const handlePieceDragEnd = useCallback(() => {
    setDraggingPieceId(null);
  }, []);

  const handleCanvasDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const pieceId = event.dataTransfer?.getData('piece');
    if (!pieceId) return;
    
    const segment = sheetPalette.segments.find(s => s.id === pieceId);
    if (!segment) return;
    
    // Create sprite mask at drop coordinates
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // TODO: Implement SpriteMask creation at coordinates
    console.log('Dropped piece at:', { pieceId, x, y });
  }, [sheetPalette.segments]);

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  // Physics control functions
  const updatePhysicsConfig = useCallback((key: keyof ReinigerConfig, value: any) => {
    const newConfig = { ...reinigerConfig, [key]: value };
    setReinigerConfig(newConfig);
    
    // TODO: Apply physics config to actual physics engine
    console.log('Updated physics config:', newConfig);
  }, [reinigerConfig]);

  const moveLayerUp = useCallback(() => {
    if (!selectedPieceId) return;
    
    const currentIndex = layerOrder.indexOf(selectedPieceId);
    if (currentIndex > 0) {
      const newOrder = [...layerOrder];
      [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
      setLayerOrder(newOrder);
      
      // TODO: Update Z-depth in state
      console.log('Moved layer up:', selectedPieceId, newOrder);
    }
  }, [selectedPieceId, layerOrder]);

  const moveLayerDown = useCallback(() => {
    if (!selectedPieceId) return;
    
    const currentIndex = layerOrder.indexOf(selectedPieceId);
    if (currentIndex < layerOrder.length - 1) {
      const newOrder = [...layerOrder];
      [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
      setLayerOrder(newOrder);
      
      // TODO: Update Z-depth in state
      console.log('Moved layer down:', selectedPieceId, newOrder);
    }
  }, [selectedPieceId, layerOrder]);

  const snapToGrid = useCallback((angle: number) => {
    if (!reinigerConfig.snapToGrid) return angle;
    return Math.round(angle / reinigerConfig.gridIncrement) * reinigerConfig.gridIncrement;
  }, [reinigerConfig.snapToGrid, reinigerConfig.gridIncrement]);

  // Generate hull functionality
  const generateHull = useCallback(() => {
    if (!selectedSegment) return;
    
    // Basic hull generation - create a simplified polygon around the bounds
    const bounds = selectedSegment.bounds;
    const padding = 5; // Add padding around the bounds
    const hullPoints = [
      { x: bounds.x - padding, y: bounds.y - padding }, // Top-left
      { x: bounds.x + bounds.width + padding, y: bounds.y - padding }, // Top-right
      { x: bounds.x + bounds.width + padding, y: bounds.y + bounds.height + padding }, // Bottom-right
      { x: bounds.x - padding, y: bounds.y + bounds.height + padding }, // Bottom-left
    ];
    
    console.log('Generated hull for', selectedSegment.id, ':', hullPoints);
    
    // TODO: Store hull points in segment or state for rendering
    // This could be used for collision detection or physics simulation
  }, [selectedSegment]);

  // Bi-directional drive logic implementation
  const bindPieceToJoint = useCallback(() => {
    if (!selectedSegment || !targetJointId) return;
    
    // Assign the segment to the joint slot
    assignSegmentToSlot(selectedSegment, targetJointId);
    
    // Get the joint from the current state
    const joint = state.joints[targetJointId];
    if (!joint) return;
    
    // Create binding based on mode
    if (bindingMode === 'JOINT_DRIVES_MASK') {
      // Standard FK: Joint drives the mask position
      console.log(`Binding ${selectedSegment.id} to joint ${targetJointId} in JOINT_DRIVES_MASK mode`);
      
      // The mask will follow the joint's world transform
      // This is handled by the rendering system based on the slot assignment
      
    } else if (bindingMode === 'MASK_DRIVES_JOINT') {
      // Inverse kinematics: Mask position drives joint rotation
      console.log(`Binding ${selectedSegment.id} to joint ${targetJointId} in MASK_DRIVES_JOINT mode`);
      
      // Calculate initial angle from mask position to joint parent
      if (joint.parent) {
        const parentJoint = state.joints[joint.parent];
        if (parentJoint) {
          const maskX = selectedSegment.originalCoordinates?.x || selectedSegment.bounds.x;
          const maskY = selectedSegment.originalCoordinates?.y || selectedSegment.bounds.y;
          
          const parentWorldPos = getWorldPosition(joint.parent, state.joints, INITIAL_JOINTS, 'preview');
          const jointWorldPos = getWorldPosition(targetJointId, state.joints, INITIAL_JOINTS, 'preview');
          
          if (parentWorldPos && jointWorldPos) {
            // Calculate target angle
            let targetAngle = Math.atan2(
              maskY - parentWorldPos.y,
              maskX - parentWorldPos.x
            );
            
            // Convert to degrees
            targetAngle = (targetAngle * 180) / Math.PI;
            
            // Apply snap-to-grid if enabled
            targetAngle = snapToGrid(targetAngle);
            
            // Apply gesture with high-impulse force for "flick" feeling
            const currentAngle = (joint.rotation || 0) * (180 / Math.PI);
            const displacement = targetAngle - currentAngle;
            const impulseForce = displacement * 0.5; // High initial impulse
            
            console.log(`Applying gesture: ${currentAngle}° → ${targetAngle}° (impulse: ${impulseForce})`);
            
            // Update joint rotation with gesture
            setStateWithHistory('mask_drives_joint_bind', (prev) => ({
              ...prev,
              joints: {
                ...prev.joints,
                [targetJointId]: {
                  ...prev.joints[targetJointId],
                  rotation: (targetAngle * Math.PI) / 180
                }
              }
            }));
            
            // TODO: Apply to Reiniger physics engine for smooth settling
            if (reinigerConfig.enabled) {
              console.log('Would apply to Reiniger engine with config:', reinigerConfig);
            }
          }
        }
      }
    }
  }, [selectedSegment, targetJointId, bindingMode, assignSegmentToSlot, state.joints, setStateWithHistory, snapToGrid, reinigerConfig.enabled, reinigerConfig]);

  return (
    <div className="flex flex-col min-h-0 bg-[#040404] border-l border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-4 border-b border-white/5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Cutout Rig</div>
        <div className="text-[10px] text-[#444]">Console</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* SOURCE Section */}
        <CollapsibleSection title="SOURCE" storageKey="btv:cutout:section:source" defaultOpen>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="file"
                ref={sheetInputRef}
                accept="image/*"
                className="hidden"
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
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#8b5cf6] text-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.4em] disabled:opacity-50"
              >
                <Wand2 size={14} />
                {isDetecting ? 'Detecting...' : 'Auto-Detect'}
              </button>
            </div>
            
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

            {sheetPreview && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                <img
                  src={sheetPreview}
                  alt="Detection preview"
                  className="w-full h-32 object-contain rounded"
                />
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* LIBRARY Section */}
        <CollapsibleSection title="LIBRARY" storageKey="btv:cutout:section:library" defaultOpen>
          <div className="space-y-3">
            {sheetPalette.segments.length === 0 ? (
              <div className="text-[10px] text-white/40 text-center py-4">
                No pieces loaded. Upload an image to detect pieces.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
                {sheetPalette.segments.map((segment) => {
                  const isSelected = selectedPieceId === segment.id;
                  return (
                    <button
                      key={segment.id}
                      type="button"
                      draggable
                      onDragStart={(e) => handlePieceDragStart(segment.id, e)}
                      onDragEnd={handlePieceDragEnd}
                      onClick={() => setSelectedPieceId(segment.id)}
                      className={`h-16 rounded-lg border transition-colors focus:outline-none cursor-move ${
                        isSelected ? 'border-[#F27D26]' : 'border-white/10 hover:border-white/40'
                      }`}
                    >
                      {segment.thumbnail ? (
                        <img 
                          src={segment.thumbnail} 
                          alt={segment.id} 
                          className="h-full w-full object-contain" 
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-white/20 border border-white/10">
                          <div className="text-xs">No thumbnail</div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* ASSEMBLY Section */}
        <CollapsibleSection title="ASSEMBLY" storageKey="btv:cutout:section:assembly" defaultOpen>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">DRIVE MODE</span>
              <button
                type="button"
                onClick={() => setBindingMode(
                  bindingMode === 'JOINT_DRIVES_MASK' ? 'MASK_DRIVES_JOINT' : 'JOINT_DRIVES_MASK'
                )}
                className="px-3 py-1 rounded-full text-[10px] font-bold border border-white/10 hover:border-white/50 transition"
              >
                {bindingMode === 'JOINT_DRIVES_MASK' ? 'STRICT PARENT' : 'INVERSE'}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Target Joint</label>
              <select
                value={targetJointId}
                onChange={(e) => setTargetJointId(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#F27D26]"
              >
                <option value="">Assign to Bone...</option>
                {/* TODO: Populate with actual joint list */}
                <option value="head">Head</option>
                <option value="torso">Torso</option>
                <option value="l_upper_arm">Left Upper Arm</option>
                <option value="r_upper_arm">Right Upper Arm</option>
              </select>
            </div>

            {selectedSegment && (
              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-white/80">Selected Piece</span>
                    <span className="text-[8px] text-white/60">#{selectedSegment.area}px²</span>
                  </div>
                  <div className="h-20 w-full rounded border border-white/10 bg-white/5 flex items-center justify-center p-1">
                    <img src={selectedSegment.thumbnail} alt="Selected piece" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={generateHull}
                    className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1"
                  >
                    <Box size={12} />
                    Generate Hull
                  </button>
                  <button
                    type="button"
                    onClick={bindPieceToJoint}
                    disabled={!targetJointId || !selectedSegment}
                    className="px-3 py-2 rounded-lg bg-[#F27D26] hover:bg-[#F27D26]/80 text-black text-[10px] font-bold uppercase transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                  >
                    <Link2 size={12} />
                    Bind
                  </button>
                </div>
              </div>
            )}

            {/* Canvas Drop Zone */}
            <div
              className="rounded-lg border-2 border-dashed border-white/20 bg-white/5 p-8 text-center min-h-[120px] flex items-center justify-center"
              onDrop={handleCanvasDrop}
              onDragOver={handleCanvasDragOver}
            >
              <div className="text-[10px] text-white/40">
                <div className="text-2xl mb-2">🎯</div>
                <div>Drag pieces here to place on canvas</div>
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* PHYSICS Section */}
        <CollapsibleSection title="PHYSICS" storageKey="btv:cutout:section:physics" defaultOpen>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">FEATHERY ENGINE</span>
              <button
                type="button"
                onClick={() => updatePhysicsConfig('enabled', !reinigerConfig.enabled)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                  reinigerConfig.enabled 
                    ? 'bg-[#8b5cf6] text-white border-[#8b5cf6]' 
                    : 'bg-[#222] text-white/60 border-white/20'
                }`}
              >
                {reinigerConfig.enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">STIFFNESS</label>
              <input
                type="range"
                min={0.05}
                max={0.5}
                step={0.01}
                value={reinigerConfig.stiffness}
                onChange={(e) => updatePhysicsConfig('stiffness', parseFloat(e.target.value))}
                className="w-full accent-[#8b5cf6]"
                disabled={!reinigerConfig.enabled}
              />
              <div className="text-[8px] text-white/60 text-center">{reinigerConfig.stiffness.toFixed(2)}</div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">AIR FRICTION</label>
              <input
                type="range"
                min={0.7}
                max={0.95}
                step={0.01}
                value={reinigerConfig.damping}
                onChange={(e) => updatePhysicsConfig('damping', parseFloat(e.target.value))}
                className="w-full accent-[#8b5cf6]"
                disabled={!reinigerConfig.enabled}
              />
              <div className="text-[8px] text-white/60 text-center">{reinigerConfig.damping.toFixed(2)}</div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.3em] text-white/60">SNAP-TO-GRID</span>
              <button
                type="button"
                onClick={() => updatePhysicsConfig('snapToGrid', !reinigerConfig.snapToGrid)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                  reinigerConfig.snapToGrid 
                    ? 'bg-white text-black border-white' 
                    : 'bg-[#222] text-white/60 border-white/20'
                }`}
                disabled={!reinigerConfig.enabled}
              >
                {reinigerConfig.snapToGrid ? 'ON' : 'OFF'}
              </button>
            </div>

            {reinigerConfig.snapToGrid && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">GRID INCREMENT</label>
                <select
                  value={reinigerConfig.gridIncrement}
                  onChange={(e) => updatePhysicsConfig('gridIncrement', parseInt(e.target.value))}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#F27D26]"
                  disabled={!reinigerConfig.enabled}
                >
                  <option value={5}>5°</option>
                  <option value={10}>10°</option>
                  <option value={15}>15° (Classical)</option>
                  <option value={30}>30°</option>
                  <option value={45}>45°</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">LAYER STACK</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={moveLayerUp}
                  disabled={!selectedPieceId || !reinigerConfig.enabled}
                  className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <Layers size={12} />
                  UP
                </button>
                <button
                  type="button"
                  onClick={moveLayerDown}
                  disabled={!selectedPieceId || !reinigerConfig.enabled}
                  className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                >
                  <Layers size={12} />
                  DOWN
                </button>
              </div>
              {selectedPieceId && (
                <div className="text-[8px] text-white/60 text-center">
                  Selected: {selectedPieceId.slice(0, 12)}...
                </div>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={12} className="text-[#8b5cf6]" />
                <span className="text-[10px] font-bold text-white/80">Reiniger Engine</span>
              </div>
              <div className="text-[8px] text-white/60 space-y-1">
                <div>• Zero gravity for weightless feel</div>
                <div>• High damping for feathery settle</div>
                <div>• Power-4 easing for gestures</div>
                <div>• Paper flutter micro-oscillations</div>
              </div>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};
