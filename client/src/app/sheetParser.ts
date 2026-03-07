import type { SheetSegment } from '../engine/types';

export type SheetParserOptions = {
  threshold?: number;
  minSegmentArea?: number;
  padding?: number;
  featherRadius?: number;
  edgeTolerance?: number;
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

const hasNeighborBelowThreshold = (
  px: number,
  py: number,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  threshold: number,
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
      if (nLum <= threshold) return true;
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
  options: Required<SheetParserOptions>,
) => {
  const stack = [y * width + x];
  const segmentPixels: number[] = [];
  let minX = x;
  let minY = y;
  let maxX = x;
  let maxY = y;
  const altThreshold = options.threshold + Math.max(0, options.edgeTolerance);

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
    if (lum > altThreshold) continue;
    if (lum > options.threshold && !hasNeighborBelowThreshold(px, py, width, height, data, options.threshold)) continue;
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

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (visited[idx]) continue;
      const offset = idx * 4;
      const alpha = data[offset + 3];
      if (alpha <= 16) continue;
      const lum = thresholdLuminance(data[offset], data[offset + 1], data[offset + 2]);
      if (lum > options.threshold) continue;

      const { pixels, bounds } = floodFill(x, y, width, height, data, visited, options);
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
});

const segmentFromImage = (image: HTMLImageElement, options: Required<SheetParserOptions>): SheetParserResult => {
  const { canvas, ctx } = createCanvasContext(image.naturalWidth, image.naturalHeight);
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const segments = extractSegments(ctx, canvas.width, canvas.height, imageData.data, options);
  return {
    src: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    segments,
  };
};

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
