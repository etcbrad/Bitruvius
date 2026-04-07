import type { SheetSegment } from '../engine/types';

export type SheetParserOptions = {
  threshold?: number;
  minSegmentArea?: number;
  padding?: number;
  featherRadius?: number;
  edgeTolerance?: number;
  /**
   * Applies sepia/age normalization for early 20th century printed sheets.
   * Uses grayscale/white balance, Otsu-style thresholding, and gutter suppression.
   */
  penInkCleanup?: boolean;
};

type SheetParserResult = {
  src: string;
  width: number;
  height: number;
  segments: SheetSegment[];
};

const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

const getId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `segment-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const thresholdLuminance = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b);

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[idx];
};

export const computeOtsuThreshold = (data: Uint8ClampedArray) => {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(thresholdLuminance(data[i], data[i + 1], data[i + 2]));
    hist[lum] += 1;
  }
  const total = data.length / 4;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 127;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
};

const applyPenInkCleanup = (imageData: ImageData) => {
  const data = imageData.data;
  const lums: number[] = [];
  // De-sepia + grayscale and collect luminance
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // Suppress sepia bias: bleed red into green/blue
    const neutral = (r * 0.6 + g * 0.25 + b * 0.15);
    r = neutral;
    g = neutral * 0.98;
    b = neutral * 1.02;
    const lum = thresholdLuminance(r, g, b);
    lums.push(lum);
    data[i] = data[i + 1] = data[i + 2] = clampByte(lum);
  }

  const low = percentile(lums, 0.05);
  const high = percentile(lums, 0.9) || 255;
  const scale = high - low <= 1 ? 1 : 255 / (high - low);

  // White balance stretch + light gutter suppression at edges
  const { width, height } = imageData;
  for (let y = 0; y < height; y++) {
    let darkCount = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = data[idx];
      if (lum < 180) darkCount++;
      const stretched = clampByte((lum - low) * scale);
      data[idx] = data[idx + 1] = data[idx + 2] = stretched;
    }
    // Remove rows that are almost entirely paper (e.g., text gutters at page edges)
    if (darkCount < width * 0.015 && (y < height * 0.08 || y > height * 0.92)) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        data[idx + 3] = 0;
      }
    }
  }

  return imageData;
};

// Enhanced edge detection using Sobel operator
const detectEdges = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold: number
): Uint8Array => {
  const edges = new Uint8Array(width * height);
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let pixelX = 0;
      let pixelY = 0;

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const idx = ((y + j) * width + (x + i)) * 4;
          const gray = thresholdLuminance(data[idx], data[idx + 1], data[idx + 2]);
          const kernelIdx = (j + 1) * 3 + (i + 1);
          pixelX += gray * sobelX[kernelIdx];
          pixelY += gray * sobelY[kernelIdx];
        }
      }

      const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
      edges[y * width + x] = magnitude > threshold ? 255 : 0;
    }
  }

  return edges;
};

// Adaptive threshold based on local mean
const computeAdaptiveThreshold = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  regionSize: number = 15
): number[] => {
  const thresholds = new Array(width * height);
  const halfRegion = Math.floor(regionSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let dy = -halfRegion; dy <= halfRegion; dy++) {
        for (let dx = -halfRegion; dx <= halfRegion; dx++) {
          const nx = Math.max(0, Math.min(width - 1, x + dx));
          const ny = Math.max(0, Math.min(height - 1, y + dy));
          const idx = (ny * width + nx) * 4;
          sum += thresholdLuminance(data[idx], data[idx + 1], data[idx + 2]);
          count++;
        }
      }

      thresholds[y * width + x] = (sum / count) * 0.85; // 85% of local mean
    }
  }

  return thresholds;
};

// Enhanced edge detection combining multiple methods
const enhanceEdgeDetection = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  baseThreshold: number
): { edgeMap: Uint8Array; adaptiveThresholds: number[] } => {
  // Apply Gaussian blur for noise reduction
  const blurred = applyGaussianBlur(data, width, height);
  
  // Detect edges using Sobel operator
  const edgeMap = detectEdges(blurred, width, height, baseThreshold * 0.5);
  
  // Compute adaptive thresholds
  const adaptiveThresholds = computeAdaptiveThreshold(data, width, height);
  
  return { edgeMap, adaptiveThresholds };
};

// Simple Gaussian blur for noise reduction
const applyGaussianBlur = (
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray => {
  const blurred = new Uint8ClampedArray(data.length);
  const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum = 16;

  // Copy original border pixels to preserve them
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        const idx = (y * width + x) * 4;
        blurred[idx] = data[idx];
        blurred[idx + 1] = data[idx + 1];
        blurred[idx + 2] = data[idx + 2];
        blurred[idx + 3] = data[idx + 3];
      }
    }
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0, g = 0, b = 0, a = 0;

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const idx = ((y + j) * width + (x + i)) * 4;
          const kernelIdx = (j + 1) * 3 + (i + 1);
          const weight = kernel[kernelIdx];
          r += data[idx] * weight;
          g += data[idx + 1] * weight;
          b += data[idx + 2] * weight;
          a += data[idx + 3] * weight;
        }
      }

      const destIdx = (y * width + x) * 4;
      blurred[destIdx] = r / kernelSum;
      blurred[destIdx + 1] = g / kernelSum;
      blurred[destIdx + 2] = b / kernelSum;
      blurred[destIdx + 3] = a / kernelSum;
    }
  }

  return blurred;
};

const hasNeighborBelowThreshold = (
  px: number,
  py: number,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  edgeMap: Uint8Array,
  adaptiveThresholds: number[],
  baseThreshold: number,
) => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      const offset = nIdx * 4;
      const nLum = thresholdLuminance(data[offset], data[offset + 1], data[offset + 2]);
      const adaptiveThreshold = adaptiveThresholds[nIdx];
      const effectiveThreshold = Math.min(baseThreshold, adaptiveThreshold);
      
      // Consider both luminance and edge information
      const isEdge = edgeMap[nIdx] > 128;
      const isBelowThreshold = nLum <= effectiveThreshold;
      
      return isBelowThreshold && !isEdge;
    }
  }
  return false;
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file for sheet parsing.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Sheet image could not be loaded.'));
    image.crossOrigin = 'anonymous';
    image.src = src;
  });

const fetchDataUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.status}`);
  const blob = await response.blob();
  return fileToDataUrl(new File([blob], url.split('/').pop() ?? 'sheet.png', { type: blob.type }));
};

const createCanvasContext = (width: number, height: number) => {
  if (typeof document === 'undefined') throw new Error('Canvas is unavailable.');
  const canvas = document.createElement('canvas');
  canvas.width = clamp(width, 1, 4096);
  canvas.height = clamp(height, 1, 4096);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas not available.');
  return { canvas, ctx };
};

const buildSegmentThumbnail = (
  pixels: number[],
  bounds: { x: number; y: number; width: number; height: number },
  data: Uint8ClampedArray,
  width: number,
  height: number,
  padding: number,
  featherRadius: number,
) => {
  const paddedX = bounds.x;
  const paddedY = bounds.y;
  const segWidth = bounds.width;
  const segHeight = bounds.height;
  const { canvas, ctx } = createCanvasContext(segWidth + padding * 2, segHeight + padding * 2);
  const imageData = ctx.createImageData(canvas.width, canvas.height);
  const clampedFeather = Math.max(0, Math.min(Math.floor(featherRadius), 10));
  const featherMap = clampedFeather > 0 ? computeFeatherDistances(pixels, width, height, clampedFeather) : null;
  for (let i = 0; i < pixels.length; i += 1) {
    const idx = pixels[i];
    const px = idx % width;
    const py = Math.floor(idx / width);
    const relX = px - paddedX + padding;
    const relY = py - paddedY + padding;
    const dest = (relY * canvas.width + relX) * 4;
    const src = idx * 4;
    imageData.data[dest] = data[src];
    imageData.data[dest + 1] = data[src + 1];
    imageData.data[dest + 2] = data[src + 2];
    let alpha = data[src + 3];
    if (featherMap) {
      const distance = featherMap[idx];
      if (distance <= clampedFeather) {
        const fade = 1 - distance / (clampedFeather + 1);
        alpha = Math.max(64, Math.round(255 - fade * 120));
      }
    }
    imageData.data[dest + 3] = alpha;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

const computeFeatherDistances = (
  pixels: number[],
  width: number,
  height: number,
  radius: number,
) => {
  const maxRadius = Math.max(0, radius);
  const pixelSet = new Uint8Array(width * height);
  const distances = new Uint8Array(width * height).fill(maxRadius + 1);
  const queue: number[] = [];

  for (const idx of pixels) {
    pixelSet[idx] = 1;
  }

  for (const idx of pixels) {
    const px = idx % width;
    const py = Math.floor(idx / width);
    let touchesBoundary = false;
    for (let dy = -1; dy <= 1 && !touchesBoundary; dy += 1) {
      for (let dx = -1; dx <= 1 && !touchesBoundary; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
          touchesBoundary = true;
          continue;
        }
        const neighborIdx = ny * width + nx;
        if (!pixelSet[neighborIdx]) touchesBoundary = true;
      }
    }
    if (touchesBoundary) {
      distances[idx] = 0;
      queue.push(idx);
    }
  }

  while (queue.length > 0) {
    const idx = queue.shift()!;
    const dist = distances[idx];
    if (dist >= maxRadius) continue;
    const px = idx % width;
    const py = Math.floor(idx / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = px + dx;
        const ny = py + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighborIdx = ny * width + nx;
        if (!pixelSet[neighborIdx]) continue;
        const nextDistance = dist + 1;
        if (nextDistance >= distances[neighborIdx] || nextDistance > maxRadius) continue;
        distances[neighborIdx] = nextDistance;
        queue.push(neighborIdx);
      }
    }
  }

  return distances;
};

const floodFill = (
  x: number,
  y: number,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  visited: Uint8Array,
  edgeMap: Uint8Array,
  adaptiveThresholds: number[],
  options: Required<SheetParserOptions>,
) => {
  const stack = [y * width + x];
  const segmentPixels: number[] = [];
  let minX = x;
  let minY = y;
  let maxX = x;
  let maxY = y;
  const baseThreshold = options.threshold;

  while (stack.length) {
    const idx = stack.pop();
    if (idx === undefined) break;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const px = idx % width;
    const py = Math.floor(idx / width);
    const offset = idx * 4;
    const alpha = data[offset + 3];
    if (alpha <= 16) continue;
    const lum = thresholdLuminance(data[offset], data[offset + 1], data[offset + 2]);
    
    // Use adaptive threshold for better edge detection
    const adaptiveThreshold = adaptiveThresholds[idx];
    const effectiveThreshold = Math.min(baseThreshold, adaptiveThreshold);
    const altThreshold = effectiveThreshold + Math.max(0, options.edgeTolerance);
    
    // Skip if pixel is too bright or is a strong edge
    const isEdge = edgeMap[idx] > 128;
    if (lum > altThreshold || isEdge) continue;
    
    // Enhanced connectivity check
    if (lum > effectiveThreshold && !hasNeighborBelowThreshold(px, py, width, height, data, edgeMap, adaptiveThresholds, effectiveThreshold)) continue;
    
    segmentPixels.push(idx);
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;

    const neighbors = [];
    
    // Left neighbor (skip if at row start)
    if (idx % width !== 0) {
      neighbors.push(idx - 1);
    }
    
    // Right neighbor (skip if at row end)
    if (idx % width !== width - 1) {
      neighbors.push(idx + 1);
    }
    
    // Top and bottom neighbors (always check)
    neighbors.push(idx - width);
    neighbors.push(idx + width);
    
    for (const neighbor of neighbors) {
      const nx = neighbor % width;
      const ny = Math.floor(neighbor / width);
      if (neighbor < 0 || neighbor >= width * height) continue;
      if (visited[neighbor]) continue;
      stack.push(neighbor);
    }
  }

  return { pixels: segmentPixels, bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
};

const extractSegments = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  options: Required<SheetParserOptions>,
) => {
  const visited = new Uint8Array(width * height);
  const segments: SheetSegment[] = [];

  // Enhance edge detection first
  const { edgeMap, adaptiveThresholds } = enhanceEdgeDetection(data, width, height, options.threshold);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (visited[idx]) continue;
      const offset = idx * 4;
      const alpha = data[offset + 3];
      if (alpha <= 16) continue;
      const lum = thresholdLuminance(data[offset], data[offset + 1], data[offset + 2]);
      
      // Use adaptive threshold for initial check
      const adaptiveThreshold = adaptiveThresholds[idx];
      const effectiveThreshold = Math.min(options.threshold, adaptiveThreshold);
      if (lum > effectiveThreshold) continue;

      const { pixels, bounds } = floodFill(x, y, width, height, data, visited, edgeMap, adaptiveThresholds, options);
      if (pixels.length < options.minSegmentArea) continue;
      const thumbnail = buildSegmentThumbnail(
        pixels,
        bounds,
        data,
        width,
        height,
        options.padding,
        options.featherRadius,
      );
      segments.push({
        id: getId(),
        bounds,
        area: pixels.length,
        thumbnail,
        originalCoordinates: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      });
    }
  }

  return segments;
};

const normalizeOptions = (opts?: SheetParserOptions): Required<SheetParserOptions> => ({
  threshold: opts?.threshold ?? 160,
  minSegmentArea: opts?.minSegmentArea ?? 320,
  padding: opts?.padding ?? 3,
  featherRadius: opts?.featherRadius ?? 2,
  edgeTolerance: opts?.edgeTolerance ?? 20,
  penInkCleanup: opts?.penInkCleanup ?? false,
});

const segmentFromImage = (image: HTMLImageElement, options: Required<SheetParserOptions>): SheetParserResult => {
  const { canvas, ctx } = createCanvasContext(image.naturalWidth, image.naturalHeight);
  
  // Check if scaling is needed
  const needsScaling = image.naturalWidth > canvas.width || image.naturalHeight > canvas.height;
  if (needsScaling) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.drawImage(image, 0, 0);
  }
  
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (options.penInkCleanup) {
    imageData = applyPenInkCleanup(imageData);
  }

  const workingOptions = { ...options } as Required<SheetParserOptions>;
  if (options.penInkCleanup) {
    const auto = computeOtsuThreshold(imageData.data);
    workingOptions.threshold = clamp(auto, 90, 210);
  }

  const segments = extractSegments(ctx, canvas.width, canvas.height, imageData.data, workingOptions);
  return {
    src: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    segments,
  };
};

// Expose cleanup helper for tests
export const runPenInkCleanup = (imageData: ImageData) => applyPenInkCleanup(imageData);

export const segmentSheetFromDataUrl = async (src: string, options?: SheetParserOptions) => {
  const image = await loadImage(src);
  const normalized = normalizeOptions(options);
  return segmentFromImage(image, normalized);
};

export const segmentSheetFromFile = async (file: File, options?: SheetParserOptions) => {
  const src = await fileToDataUrl(file);
  const result = await segmentSheetFromDataUrl(src, options);
  return { ...result, name: file.name } as SheetParserResult & { name: string };
};

export const segmentSheetFromUrl = async (url: string, options?: SheetParserOptions) => {
  const dataUrl = await fetchDataUrl(url);
  return segmentSheetFromDataUrl(dataUrl, options);
};
