export type ProcessMaskImageOptions = {
  /**
   * Attempt to remove solid white/black backgrounds by flood-filling from the image border.
   * Keeps interior blacks/whites intact as long as they are not connected to the border.
   */
  removeBorderBackground?: boolean;
  /** Crop to non-transparent pixels after background removal. */
  cropToContent?: boolean;
  /** Padding (in px) added around the cropped bounds. */
  cropPaddingPx?: number;
};

export type ProcessMaskImageResult = {
  blob: Blob;
  width: number;
  height: number;
  removedBackground: boolean;
  cropped: boolean;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Enhanced edge detection using Sobel operator for better hard edge detection
const detectHardEdges = (
  data: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number = 30
): Uint8Array => {
  const edges = new Uint8Array(w * h);
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let pixelX = 0;
      let pixelY = 0;

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const idx = ((y + j) * w + (x + i)) * 4;
          const gray = luminance(data[idx], data[idx + 1], data[idx + 2]);
          const kernelIdx = (j + 1) * 3 + (i + 1);
          pixelX += gray * sobelX[kernelIdx];
          pixelY += gray * sobelY[kernelIdx];
        }
      }

      const magnitude = Math.sqrt(pixelX * pixelX + pixelY * pixelY);
      edges[y * w + x] = magnitude > threshold ? 255 : 0;
    }
  }

  return edges;
};

// Laplacian edge detection for sharper edge detection
const detectLaplacianEdges = (
  data: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number = 15
): Uint8Array => {
  const edges = new Uint8Array(w * h);
  const kernel = [0, -1, 0, -1, 4, -1, 0, -1, 0];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;

      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const idx = ((y + j) * w + (x + i)) * 4;
          const gray = luminance(data[idx], data[idx + 1], data[idx + 2]);
          const kernelIdx = (j + 1) * 3 + (i + 1);
          sum += gray * kernel[kernelIdx];
        }
      }

      edges[y * w + x] = Math.abs(sum) > threshold ? 255 : 0;
    }
  }

  return edges;
};

// Combine multiple edge detection methods for better hard edge detection
const enhanceEdgeDetection = (
  data: Uint8ClampedArray,
  w: number,
  h: number
): Uint8Array => {
  const sobelEdges = detectHardEdges(data, w, h, 25);
  const laplacianEdges = detectLaplacianEdges(data, w, h, 20);
  
  // Combine edge maps (OR operation)
  const combinedEdges = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    combinedEdges[i] = Math.max(sobelEdges[i], laplacianEdges[i]);
  }
  
  return combinedEdges;
};

// Morphological operations to clean up edge detection
const morphologicalCleanup = (
  edges: Uint8Array,
  w: number,
  h: number,
  iterations: number = 2
): Uint8Array => {
  const cleaned = new Uint8Array(edges);
  
  for (let iter = 0; iter < iterations; iter++) {
    // Remove isolated pixels
    const temp = new Uint8Array(cleaned);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (cleaned[idx] === 0) continue;
        
        let edgeNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = (y + dy) * w + (x + dx);
            if (cleaned[nIdx] > 0) edgeNeighbors++;
          }
        }
        
        // Remove pixels with too few edge neighbors
        temp[idx] = edgeNeighbors >= 2 ? 255 : 0;
      }
    }
    cleaned.set(temp);
  }
  
  return cleaned;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });

const drawFileToCanvas = async (file: File): Promise<HTMLCanvasElement> => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas not available.');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas;
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to load image.'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1;
    canvas.height = img.naturalHeight || img.height || 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas not available.');
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const computeContentBounds = (data: Uint8ClampedArray, w: number, h: number, alphaMin = 8) => {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = data[(y * w + x) * 4 + 3] ?? 0;
      if (a <= alphaMin) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
};

const shouldRemoveBorderBg = (data: Uint8ClampedArray, w: number, h: number) => {
  const step = clamp(Math.floor(Math.min(w, h) / 64), 1, 24);
  let white = 0;
  let black = 0;
  let total = 0;

  const sample = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const a = data[i + 3] ?? 0;
    if (a < 8) return;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const l = luminance(r, g, b);
    total += 1;
    if (l >= 245) white += 1;
    else if (l <= 10) black += 1;
  };

  for (let x = 0; x < w; x += step) {
    sample(x, 0);
    sample(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    sample(0, y);
    sample(w - 1, y);
  }

  if (total <= 0) return { removeWhite: false, removeBlack: false };

  const wFrac = white / total;
  const bFrac = black / total;

  // Strong signal: mostly-white or mostly-black border.
  if (wFrac >= 0.6) return { removeWhite: true, removeBlack: false };
  if (bFrac >= 0.6) return { removeWhite: false, removeBlack: true };

  // Mixed edges: allow dual removal, but only if both are significant.
  if (wFrac >= 0.35 && bFrac >= 0.35) return { removeWhite: true, removeBlack: true };

  // Weak signal: pick the dominant one if it’s meaningful.
  if (wFrac >= 0.45) return { removeWhite: true, removeBlack: false };
  if (bFrac >= 0.45) return { removeWhite: false, removeBlack: true };

  return { removeWhite: false, removeBlack: false };
};

const floodFillRemove = (data: Uint8ClampedArray, w: number, h: number, bgKind: 'white' | 'black') => {
  const step = clamp(Math.floor(Math.min(w, h) / 64), 1, 24);

  // Estimate background color from border samples.
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;

  const isBgKind = (r: number, g: number, b: number) => {
    const l = luminance(r, g, b);
    return bgKind === 'white' ? l >= 235 : l <= 20;
  };

  const sampleBorder = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const a = data[i + 3] ?? 0;
    if (a < 8) return;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (!isBgKind(r, g, b)) return;
    sumR += r;
    sumG += g;
    sumB += b;
    n += 1;
  };

  for (let x = 0; x < w; x += step) {
    sampleBorder(x, 0);
    sampleBorder(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    sampleBorder(0, y);
    sampleBorder(w - 1, y);
  }

  if (n <= 0) return false;

  const bgR = Math.round(sumR / n);
  const bgG = Math.round(sumG / n);
  const bgB = Math.round(sumB / n);

  // Similarity threshold (max per-channel difference).
  const threshold = bgKind === 'white' ? 42 : 36;

  const isCandidate = (idxPx: number) => {
    const i = idxPx * 4;
    const a = data[i + 3] ?? 0;
    if (a < 8) return true;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const md = Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB));
    return md <= threshold;
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    if (!isCandidate(idx)) return;
    visited[idx] = 1;
    stack.push(idx);
  };

  for (let x = 0; x < w; x += step) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    push(0, y);
    push(w - 1, y);
  }

  while (stack.length) {
    const idx = stack.pop()!;
    const x = idx % w;
    const y = (idx / w) | 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  // Apply alpha ramp for visited pixels.
  let changed = false;
  for (let idx = 0; idx < visited.length; idx += 1) {
    if (!visited[idx]) continue;
    const i = idx * 4;
    const a = data[i + 3] ?? 0;
    if (a <= 0) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const md = Math.max(Math.abs(r - bgR), Math.abs(g - bgG), Math.abs(b - bgB));
    const t = clamp(md / threshold, 0, 1);
    const nextA = Math.round(a * t);
    if (nextA !== a) {
      data[i + 3] = nextA;
      changed = true;
    }
  }

  return changed;
};

export const processMaskImageFile = async (
  file: File,
  opts: ProcessMaskImageOptions = {},
): Promise<ProcessMaskImageResult> => {
  const { removeBorderBackground = true, cropToContent = true, cropPaddingPx = 6 } = opts;

  const baseCanvas = await drawFileToCanvas(file);
  const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
  if (!baseCtx) throw new Error('2D canvas not available.');

  const w = Math.max(1, baseCanvas.width | 0);
  const h = Math.max(1, baseCanvas.height | 0);
  const imageData = baseCtx.getImageData(0, 0, w, h);
  const data = imageData.data;

  let removedBackground = false;
  if (removeBorderBackground) {
    const { removeWhite, removeBlack } = shouldRemoveBorderBg(data, w, h);
    if (removeWhite) removedBackground = floodFillRemove(data, w, h, 'white') || removedBackground;
    if (removeBlack) removedBackground = floodFillRemove(data, w, h, 'black') || removedBackground;
    
    // Apply edge-aware refinement after background removal
    if (removedBackground) {
      // Enhance edges in the processed image
      const postProcessEdges = enhanceEdgeDetection(data, w, h);
      for (let i = 0; i < data.length / 4; i++) {
        const idx = i * 4;
        // Preserve hard edges by adjusting alpha
        if (postProcessEdges[i] > 128 && data[idx + 3] > 0) {
          data[idx + 3] = Math.max(data[idx + 3], 200); // Ensure edges are fully opaque
        }
      }
    }
  }

  if (removedBackground) baseCtx.putImageData(imageData, 0, 0);

  let outCanvas = baseCanvas;
  let cropped = false;

  if (cropToContent) {
    const bounds = computeContentBounds(data, w, h, 8);
    if (bounds) {
      const pad = Math.max(0, Math.floor(cropPaddingPx));
      const x0 = clamp(bounds.minX - pad, 0, w - 1);
      const y0 = clamp(bounds.minY - pad, 0, h - 1);
      const x1 = clamp(bounds.maxX + pad, 0, w - 1);
      const y1 = clamp(bounds.maxY + pad, 0, h - 1);
      const cw = Math.max(1, x1 - x0 + 1);
      const ch = Math.max(1, y1 - y0 + 1);

      if (cw !== w || ch !== h) {
        const c = document.createElement('canvas');
        c.width = cw;
        c.height = ch;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('2D canvas not available.');
        ctx.drawImage(baseCanvas, x0, y0, cw, ch, 0, 0, cw, ch);
        outCanvas = c;
        cropped = true;
      }
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob((b) => {
      if (!b) reject(new Error('Failed to encode PNG.'));
      else resolve(b);
    }, 'image/png');
  });

  return { blob, width: outCanvas.width, height: outCanvas.height, removedBackground, cropped };
};

export const processMaskImageFileToDataUrl = async (
  file: File,
  opts: ProcessMaskImageOptions = {},
): Promise<{ dataUrl: string; width: number; height: number; removedBackground: boolean; cropped: boolean }> => {
  const processed = await processMaskImageFile(file, opts);
  const dataUrl = await blobToDataUrl(processed.blob);
  return { dataUrl, width: processed.width, height: processed.height, removedBackground: processed.removedBackground, cropped: processed.cropped };
};

