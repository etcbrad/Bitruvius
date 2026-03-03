import JSZip from 'jszip';

import { clamp } from '../utils';
import type { ReferenceSequenceData } from './referenceMedia';

export const disposeReferenceSequenceData = (seq: ReferenceSequenceData) => {
  for (const frame of seq.frames) {
    try {
      if (frame && typeof frame.close === 'function') frame.close();
    } catch {
      // ignore
    }
  }
};

export const loadGifReferenceSequence = async (file: File, fps: number): Promise<ReferenceSequenceData> => {
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
  const frames: any[] = [];

  for (let i = 0; i < frameCount; i += 1) {
    const result = await decoder.decode({ frameIndex: i });
    const image = result?.image;
    if (image) frames.push(image);
  }

  const first = frames[0];
  const width = Number(first?.displayWidth || first?.codedWidth || first?.width || 0) || 0;
  const height = Number(first?.displayHeight || first?.codedHeight || first?.height || 0) || 0;

  return { id, kind: 'gif', frames, width, height, fps: clamp(Math.floor(fps), 1, 60) };
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
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) throw new Error('ZIP contains no supported images (.png/.jpg/.webp/.gif).');

  const maxFrames = clamp(Math.floor(opts.maxFrames ?? 10_000), 1, 50_000);
  if (files.length > maxFrames) {
    opts.onWarning?.(`ZIP has ${files.length} frames; only loading first ${maxFrames}.`);
  }

  const selected = files.slice(0, maxFrames);
  const frames: any[] = [];
  let width = 0;
  let height = 0;

  for (let i = 0; i < selected.length; i += 1) {
    const name = selected[i]!;
    const entry = zip.file(name);
    if (!entry) continue;
    const blob = await entry.async('blob');
    const bitmap = await createImageBitmap(blob);
    if (!width || !height) {
      width = bitmap.width || 0;
      height = bitmap.height || 0;
    }
    frames.push(bitmap);
  }

  return { id, kind: 'zip', frames, width, height, fps: clamp(Math.floor(fps), 1, 60) };
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
  if (isGif) return loadGifReferenceSequence(file, fps);
  if (isZip) return loadZipReferenceSequence(file, fps, opts);
  throw new Error('Unsupported sequence type (expected .gif or .zip).');
};

