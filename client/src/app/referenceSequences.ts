import JSZip from 'jszip';

import { clamp } from '../utils';
import type { ReferenceSequenceData } from './referenceMedia';

const naturalCompare = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

const createFrameFingerprinter = (size = 16): ((source: CanvasImageSource) => number | null) => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true } as any);
  if (!ctx) return () => null;

  ctx.imageSmoothingEnabled = true;

  return (source: CanvasImageSource) => {
    try {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(source, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let hash = 0x811c9dc5;
      for (let i = 0; i < data.length; i += 1) {
        hash ^= data[i]!;
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash >>> 0;
    } catch {
      return null;
    }
  };
};

export const disposeReferenceSequenceData = (seq: ReferenceSequenceData) => {
  for (const frame of seq.frames) {
    try {
      if (frame && typeof frame.close === 'function') frame.close();
    } catch {
      // ignore
    }
  }
};

export const loadGifReferenceSequence = async (
  file: File,
  fps: number,
  opts: { onWarning?: (message: string) => void; maxFrames?: number } = {},
): Promise<ReferenceSequenceData> => {
  const id = `gif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ImageDecoderCtor = (globalThis as any).ImageDecoder as any;
  if (!ImageDecoderCtor) {
    throw new Error('Animated GIF decoding requires ImageDecoder (Chromium).');
  }

  const data = await file.arrayBuffer();
  const decoder = new ImageDecoderCtor({ data, type: file.type || 'image/gif' });
  if (decoder.tracks?.ready) await decoder.tracks.ready;

  const frameCountRaw = decoder.tracks?.selectedTrack?.frameCount ?? 1;
  const frameCount = clamp(Math.floor(frameCountRaw), 1, 5000);
  const maxFrames = clamp(Math.floor(opts.maxFrames ?? frameCount), 1, frameCount);
  const truncatedCount = Math.max(0, frameCount - maxFrames);
  if (truncatedCount > 0) {
    opts.onWarning?.(`GIF has ${frameCount} frames; only loading first ${maxFrames}.`);
  }
  const frames: any[] = [];
  const fingerprint = createFrameFingerprinter(16);
  let lastHash: number | null = null;
  let dedupedCount = 0;

  for (let i = 0; i < maxFrames; i += 1) {
    const result = await decoder.decode({ frameIndex: i });
    const image = result?.image;
    if (!image) continue;
    const hash = fingerprint(image as any);
    if (hash !== null && lastHash !== null && hash === lastHash) {
      dedupedCount += 1;
      try {
        if (typeof (image as any).close === 'function') (image as any).close();
      } catch {
        // ignore
      }
      continue;
    }
    lastHash = hash;
    frames.push(image);
  }

  const first = frames[0];
  const width = Number(first?.displayWidth || first?.codedWidth || first?.width || 0) || 0;
  const height = Number(first?.displayHeight || first?.codedHeight || first?.height || 0) || 0;

  return {
    id,
    kind: 'gif',
    frames,
    width,
    height,
    fps: clamp(Math.floor(fps), 1, 60),
    meta: { sourceFrameCount: frameCount, maxFrames, truncatedCount, dedupedCount },
  };
};

export const loadZipReferenceSequence = async (
  file: File,
  fps: number,
  opts: { onWarning?: (message: string) => void; maxFrames?: number } = {},
): Promise<ReferenceSequenceData> => {
  const id = `zip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const zip = await JSZip.loadAsync(file);

  const files = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name)
    .filter((name) => {
      const lower = name.toLowerCase();
      return (
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif')
        );
    })
    .sort(naturalCompare);

  if (files.length === 0) throw new Error('ZIP contains no supported images (.png/.jpg/.webp/.gif).');

  const maxFrames = clamp(Math.floor(opts.maxFrames ?? 10_000), 1, 50_000);
  const truncatedCount = Math.max(0, files.length - maxFrames);
  if (files.length > maxFrames) {
    opts.onWarning?.(`ZIP has ${files.length} frames; only loading first ${maxFrames}.`);
  }

  const selected = files.slice(0, maxFrames);
  const frames: any[] = [];
  const fingerprint = createFrameFingerprinter(16);
  let lastHash: number | null = null;
  let dedupedCount = 0;
  let width = 0;
  let height = 0;

  for (let i = 0; i < selected.length; i += 1) {
    const name = selected[i]!;
    const entry = zip.file(name);
    if (!entry) continue;
    const blob = await entry.async('blob');
    const bitmap = await createImageBitmap(blob);
    const hash = fingerprint(bitmap);
    if (hash !== null && lastHash !== null && hash === lastHash) {
      dedupedCount += 1;
      try {
        bitmap.close();
      } catch {
        // ignore
      }
      continue;
    }
    lastHash = hash;
    if (!width || !height) {
      width = bitmap.width || 0;
      height = bitmap.height || 0;
    }
    frames.push(bitmap);
  }

  return {
    id,
    kind: 'zip',
    frames,
    width,
    height,
    fps: clamp(Math.floor(fps), 1, 60),
    meta: { sourceFrameCount: files.length, maxFrames, truncatedCount, dedupedCount },
  };
};

export const loadReferenceSequenceFromFile = async (
  file: File,
  fps: number,
  opts: { onWarning?: (message: string) => void; maxFrames?: number } = {},
): Promise<ReferenceSequenceData> => {
  const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
  const isZip =
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed' ||
    file.name.toLowerCase().endsWith('.zip');
  if (isGif) return loadGifReferenceSequence(file, fps, opts);
  if (isZip) return loadZipReferenceSequence(file, fps, opts);
  throw new Error('Unsupported sequence type (expected .gif or .zip).');
};
