import { sampleClipPose } from '../timeline';
import { getWorldPositionFromOffsets } from '../kinematics';
import type { Connection, EnginePoseSnapshot, Joint, SceneState, TimelineState } from '../types';

export type Timeline2dExportOptions = {
  width: number;
  height: number;
  backgroundColor?: string;
  fps?: number;
  scale?: number;
};

export type Timeline2dExportArgs = Timeline2dExportOptions & {
  timeline: TimelineState;
  baseJoints: Record<string, Joint>;
  connections: Connection[];
  scene: SceneState;
  activeRoots: string[];
  stretchEnabled: boolean;
  fallbackPose?: EnginePoseSnapshot;
};

export type Timeline2dRenderer = {
  canvas: HTMLCanvasElement;
  fps: number;
  frameCount: number;
  renderFrame: (frame: number) => Promise<void>;
  dispose: () => void;
};

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(value)));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const loadImage = async (src: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.decoding = 'async';
  return await new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
};

const loadVideo = async (src: string): Promise<HTMLVideoElement> => {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  return await new Promise((resolve, reject) => {
    const onLoaded = () => resolve(video);
    const onError = () => reject(new Error('Failed to load video'));
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.src = src;
  });
};

const seekVideo = async (video: HTMLVideoElement, t: number): Promise<void> => {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const safeTime = duration > 0 ? clamp(t, 0, Math.max(0, duration - 0.001)) : Math.max(0, t);
  const SEEK_TIMEOUT_MS = 5000; // 5 second timeout
  
  return await new Promise((resolve, reject) => {
    let timeoutId: number | null = null;
    
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    
    const onError = () => {
      cleanup();
      reject(new Error('Video seek failed'));
    };
    
    // Set timeout
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Video seek timeout'));
    }, SEEK_TIMEOUT_MS);
    
    // Add event listeners
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    
    // Start seeking
    video.currentTime = safeTime;
  });
};

const drawMaskImage = (args: {
  ctx: CanvasRenderingContext2D;
  img: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  rotationDeg: number;
  opacity: number;
  blendMode?: string | null;
  filter?: string | null;
  pixelate?: number | null;
}) => {
  const { ctx, img, x, y, width, height, anchorX, anchorY, rotationDeg, opacity, blendMode, filter, pixelate } = args;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.globalAlpha = clamp(opacity, 0, 1);
  if (filter) ctx.filter = filter;
  if (blendMode && blendMode !== 'normal') {
    ctx.globalCompositeOperation = blendMode === 'normal' ? 'source-over' : (blendMode as any);
  }
  ctx.translate(x, y);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  const px = Number.isFinite(pixelate) ? Math.max(0, pixelate as number) : 0;
  if (px > 0.0001) {
    const offW = Math.max(1, Math.floor(width / px));
    const offH = Math.max(1, Math.floor(height / px));
    const off = document.createElement('canvas');
    off.width = offW;
    off.height = offH;
    const offCtx = off.getContext('2d');
    if (offCtx) {
      offCtx.imageSmoothingEnabled = true;
      offCtx.clearRect(0, 0, offW, offH);
      offCtx.drawImage(img, 0, 0, offW, offH);
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, -anchorX * width, -anchorY * height, width, height);
      ctx.imageSmoothingEnabled = prevSmooth;
    } else {
      ctx.drawImage(img, -anchorX * width, -anchorY * height, width, height);
    }
  } else {
    ctx.drawImage(img, -anchorX * width, -anchorY * height, width, height);
  }
  ctx.restore();
};

const buildMaskFilter = (mask: any): string | null => {
  const blurPx = Number.isFinite(mask?.blurPx) ? mask.blurPx : 0;
  const brightness = Number.isFinite(mask?.brightness) ? mask.brightness : 1;
  const contrast = Number.isFinite(mask?.contrast) ? mask.contrast : 1;
  const saturation = Number.isFinite(mask?.saturation) ? mask.saturation : 1;
  const hueRotate = Number.isFinite(mask?.hueRotate) ? mask.hueRotate : 0;
  const grayscale = Number.isFinite(mask?.grayscale) ? mask.grayscale : 0;
  const sepia = Number.isFinite(mask?.sepia) ? mask.sepia : 0;
  const invert = Number.isFinite(mask?.invert) ? mask.invert : 0;

  const neutral =
    blurPx === 0 &&
    brightness === 1 &&
    contrast === 1 &&
    saturation === 1 &&
    hueRotate === 0 &&
    grayscale === 0 &&
    sepia === 0 &&
    invert === 0;
  if (neutral) return null;

  return [
    `blur(${clamp(blurPx, 0, 60)}px)`,
    `brightness(${clamp(brightness, 0, 3)})`,
    `contrast(${clamp(contrast, 0, 3)})`,
    `saturate(${clamp(saturation, 0, 5)})`,
    `hue-rotate(${clamp(hueRotate, -360, 360)}deg)`,
    `grayscale(${clamp(grayscale, 0, 1)})`,
    `sepia(${clamp(sepia, 0, 1)})`,
    `invert(${clamp(invert, 0, 1)})`,
  ].join(' ');
};

const drawReferenceLayerMedia = (
  ctx: CanvasRenderingContext2D,
  media: CanvasImageSource,
  mediaW: number,
  mediaH: number,
  layer: SceneState['background'],
  options: { width: number; height: number },
) => {
  const boxX = layer.x;
  const boxY = layer.y;
  const boxW = options.width * layer.scale;
  const boxH = options.height * layer.scale;

  const iw = Math.max(1, mediaW);
  const ih = Math.max(1, mediaH);

  let drawW = boxW;
  let drawH = boxH;
  let drawX = boxX;
  let drawY = boxY;

  if (layer.fitMode === 'contain' || layer.fitMode === 'cover') {
    const s = layer.fitMode === 'contain' ? Math.min(boxW / iw, boxH / ih) : Math.max(boxW / iw, boxH / ih);
    drawW = iw * s;
    drawH = ih * s;
    drawX = boxX + (boxW - drawW) / 2;
    drawY = boxY + (boxH - drawH) / 2;
  }

  ctx.save();

  if (layer.rotation !== 0) {
    const centerX = drawX + drawW / 2;
    const centerY = drawY + drawH / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);
  }

  const safeOpacity = typeof layer.opacity === 'number' && Number.isFinite(layer.opacity) 
    ? clamp(layer.opacity, 0, 1) 
    : 1;
  ctx.globalAlpha = safeOpacity;
  ctx.drawImage(media, drawX, drawY, drawW, drawH);
  ctx.globalAlpha = 1;

  ctx.restore();
};

export const createTimeline2dRenderer = async (args: Timeline2dExportArgs): Promise<Timeline2dRenderer> => {
  const {
    width,
    height,
    backgroundColor = '#0a0a0a',
    fps: fpsRaw,
    scale = 1,
    timeline,
    baseJoints,
    connections,
    scene,
    activeRoots,
    stretchEnabled,
    fallbackPose,
  } = args;

  if (!timeline.enabled) throw new Error('Timeline must be enabled');

  const fps = clampInt(fpsRaw ?? timeline.clip.fps, 1, 60);
  const frameCount = clampInt(timeline.clip.frameCount, 2, 600);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context from canvas');

  const backgroundMedia =
    scene.background.src && scene.background.visible
      ? scene.background.mediaType === 'video'
        ? { kind: 'video' as const, video: await loadVideo(scene.background.src) }
        : { kind: 'image' as const, img: await loadImage(scene.background.src) }
      : null;
  const foregroundMedia =
    scene.foreground.src && scene.foreground.visible
      ? scene.foreground.mediaType === 'video'
        ? { kind: 'video' as const, video: await loadVideo(scene.foreground.src) }
        : { kind: 'image' as const, img: await loadImage(scene.foreground.src) }
      : null;
  const headMaskImg = scene.headMask?.src && scene.headMask.visible ? await loadImage(scene.headMask.src) : null;

  const jointMaskImgs = new Map<string, HTMLImageElement>();
  const loadMaskImg = async (src: string): Promise<HTMLImageElement | null> => {
    if (!src) return null;
    const cached = jointMaskImgs.get(src);
    if (cached) return cached;
    try {
      const img = await loadImage(src);
      jointMaskImgs.set(src, img);
      return img;
    } catch {
      return null;
    }
  };
  for (const mask of Object.values(scene.jointMasks ?? {})) {
    if (!mask?.src || !mask.visible) continue;
    await loadMaskImg(mask.src);
  }

  const lines: Array<{ from: string; to: string; type: Connection['type'] }> = [];
  for (const c of connections) lines.push({ from: c.from, to: c.to, type: c.type });
  for (const id of Object.keys(baseJoints)) {
    const j = baseJoints[id];
    if (!j.parent) continue;
    if (id.includes('nipple')) continue;
    const exists = connections.some((c) => (c.from === j.parent && c.to === id) || (c.from === id && c.to === j.parent));
    if (exists) continue;
    lines.push({ from: j.parent, to: id, type: 'bone' });
  }

  const unitScale = 20 * scale;
  const centerX = (width * scale) / 2;
  const centerY = (height * scale) / 2;

  const drawTextOverlays = (frame: number) => {
    const overlays = Array.isArray(scene.textOverlays) ? scene.textOverlays : [];
    for (const o of overlays) {
      if (!o.visible) continue;
      if (frame < o.startFrame || frame > o.endFrame) continue;

      const text = o.text ?? '';
      if (!text.trim()) continue;

      if (o.kind === 'intertitle') {
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        ctx.fillStyle = o.color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.max(8, (o.fontSize || 48) * scale)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        ctx.restore();
        continue;
      }

      ctx.save();
      ctx.fillStyle = o.color || '#ffffff';
      ctx.textAlign = o.align || 'center';
      ctx.textBaseline = 'top';
      ctx.font = `${Math.max(8, (o.fontSize || 32) * scale)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

      const x =
        typeof o.x === 'number'
          ? o.x * scale
          : o.align === 'left'
            ? 24 * scale
            : o.align === 'right'
              ? canvas.width - 24 * scale
              : canvas.width / 2;
      const y = typeof o.y === 'number' ? o.y * scale : 20 * scale;

      if (o.rotation && o.rotation !== 0) {
        ctx.translate(x, y);
        ctx.rotate((o.rotation * Math.PI) / 180);
        ctx.fillText(text, 0, 0);
      } else {
        ctx.fillText(text, x, y);
      }
      ctx.restore();
    }
  };

  const drawFrame = async (pose: EnginePoseSnapshot, frame: number) => {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (backgroundMedia && scene.background.visible) {
      if (backgroundMedia.kind === 'video') {
        await seekVideo(backgroundMedia.video, scene.background.videoStart + (frame / fps) * scene.background.videoRate);
        drawReferenceLayerMedia(
          ctx,
          backgroundMedia.video,
          backgroundMedia.video.videoWidth || canvas.width,
          backgroundMedia.video.videoHeight || canvas.height,
          scene.background,
          { width: width * scale, height: height * scale },
        );
      } else {
        drawReferenceLayerMedia(
          ctx,
          backgroundMedia.img,
          backgroundMedia.img.naturalWidth,
          backgroundMedia.img.naturalHeight,
          scene.background,
          { width: width * scale, height: height * scale },
        );
      }
    }

    const headPos = getWorldPositionFromOffsets('head', pose.joints, baseJoints);
    const neckBasePos = getWorldPositionFromOffsets('neck_base', pose.joints, baseJoints);
    const headLenPx = Math.max(1, Math.hypot(headPos.x - neckBasePos.x, headPos.y - neckBasePos.y) * unitScale);

    for (const ln of lines) {
      const a = getWorldPositionFromOffsets(ln.from, pose.joints, baseJoints);
      const b = getWorldPositionFromOffsets(ln.to, pose.joints, baseJoints);
      const x1 = a.x * unitScale + centerX;
      const y1 = a.y * unitScale + centerY;
      const x2 = b.x * unitScale + centerX;
      const y2 = b.y * unitScale + centerY;
      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

      ctx.save();
      if (ln.type === 'structural_link') {
        ctx.strokeStyle = 'rgba(224, 224, 224, 0.25)';
        ctx.lineWidth = 1.5 * scale;
      } else if (ln.type === 'soft_limit') {
        ctx.strokeStyle = 'rgba(224, 224, 224, 0.45)';
        ctx.lineWidth = 2 * scale;
        ctx.setLineDash([3 * scale, 3 * scale]);
      } else {
        ctx.strokeStyle = 'rgba(224, 224, 224, 0.9)';
        ctx.lineWidth = 4 * scale;
      }
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    for (const [jointId, mask] of Object.entries(scene.jointMasks ?? {})) {
      if (!mask?.src || !mask.visible) continue;
      const img = jointMaskImgs.get(mask.src);
      if (!img) continue;
      const joint = baseJoints[jointId];
      if (!joint) continue;

      const jp = getWorldPositionFromOffsets(jointId, pose.joints, baseJoints);
      const relatedIds = (mask.relatedJoints || []).filter((id) => id !== jointId && id in baseJoints);
      const driverId = relatedIds[0] ?? null;
      const secondaryIds = relatedIds.slice(1);
      const driverPos = driverId ? getWorldPositionFromOffsets(driverId, pose.joints, baseJoints) : null;
      const secondaryCentroid = (() => {
        if (!secondaryIds.length) return null;
        let sx = 0;
        let sy = 0;
        for (const id of secondaryIds) {
          const p = getWorldPositionFromOffsets(id, pose.joints, baseJoints);
          sx += p.x;
          sy += p.y;
        }
        return { x: sx / secondaryIds.length, y: sy / secondaryIds.length };
      })();

      const waistHipMidpoint = (() => {
        if (jointId !== 'navel') return null;
        if (relatedIds.length !== 2) return null;
        const hasL = relatedIds.includes('l_hip');
        const hasR = relatedIds.includes('r_hip');
        if (!hasL || !hasR) return null;
        const l = getWorldPositionFromOffsets('l_hip', pose.joints, baseJoints);
        const r = getWorldPositionFromOffsets('r_hip', pose.joints, baseJoints);
        return { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
      })();

      const anchorUnits = (() => {
        if (waistHipMidpoint) return waistHipMidpoint;
        if (secondaryCentroid) return { x: (jp.x + secondaryCentroid.x) / 2, y: (jp.y + secondaryCentroid.y) / 2 };
        if (driverPos) return { x: (jp.x + driverPos.x) / 2, y: (jp.y + driverPos.y) / 2 };
        return jp;
      })();

      const anchorWorldBaseX = anchorUnits.x * unitScale + centerX;
      const anchorWorldBaseY = anchorUnits.y * unitScale + centerY;

      const pp = joint.parent ? getWorldPositionFromOffsets(joint.parent, pose.joints, baseJoints) : { x: jp.x, y: jp.y - 1 };

      const dx = jp.x - pp.x;
      const dy = jp.y - pp.y;
      const boneLenPx = Math.max(1, Math.hypot(dx, dy) * unitScale);

      const baseAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const mode = mask.mode || 'cutout';
      const rotationDeg = (mode === 'roto' ? 0 : baseAngle) + (mask.rotation || 0);

      const thicknessPx = headLenPx * Math.max(0.01, mask.scale);
      let widthPx = thicknessPx;
      let heightPx = thicknessPx;
      let anchorWorldX = anchorWorldBaseX;
      let anchorWorldY = anchorWorldBaseY;

      if (mode === 'rubberhose') {
        anchorWorldX = ((jp.x + pp.x) / 2) * unitScale + centerX;
        anchorWorldY = ((jp.y + pp.y) / 2) * unitScale + centerY;
        heightPx = Math.max(1, boneLenPx * Math.max(0.05, mask.lengthScale || 1));
        if (mask.volumePreserve) {
          widthPx = clamp((thicknessPx * thicknessPx) / heightPx, thicknessPx * 0.15, thicknessPx * 4);
        } else {
          widthPx = thicknessPx;
        }
      }

      drawMaskImage({
        ctx,
        img,
        x: anchorWorldX + (mask.offsetX ?? 0) * scale,
        y: anchorWorldY + (mask.offsetY ?? 0) * scale,
        width: widthPx,
        height: heightPx,
        anchorX: mask.anchorX ?? 0.5,
        anchorY: mask.anchorY ?? 0.5,
        rotationDeg,
        opacity: mask.opacity ?? 1,
        blendMode: mask.blendMode ?? 'normal',
        filter: buildMaskFilter(mask),
        pixelate: mask.pixelate ?? 0,
      });
    }

    if (headMaskImg && scene.headMask?.src && scene.headMask.visible) {
      const mask = scene.headMask;
      const basePos = getWorldPositionFromOffsets('neck_base', pose.joints, baseJoints);
      const dx = headPos.x - basePos.x;
      const dy = headPos.y - basePos.y;
      const boneLenPx = Math.max(1, Math.hypot(dx, dy) * unitScale);
      const baseAngle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const mode = mask.mode || 'cutout';
      const rotationDeg = (mode === 'roto' ? 0 : baseAngle) + (mask.rotation || 0);

      const thicknessPx = headLenPx * Math.max(0.01, mask.scale);
      let widthPx = thicknessPx;
      let heightPx = thicknessPx;
      let anchorWorldX = headPos.x * unitScale + centerX;
      let anchorWorldY = headPos.y * unitScale + centerY;
      
      if (mode === 'rubberhose') {
        anchorWorldX = ((headPos.x + basePos.x) / 2) * unitScale + centerX;
        anchorWorldY = ((headPos.y + basePos.y) / 2) * unitScale + centerY;
        heightPx = Math.max(1, boneLenPx * Math.max(0.05, mask.lengthScale || 1));
        if (mask.volumePreserve) {
          widthPx = clamp((thicknessPx * thicknessPx) / heightPx, thicknessPx * 0.15, thicknessPx * 4);
        }
      }

      drawMaskImage({
        ctx,
        img: headMaskImg,
        x: anchorWorldX + (mask.offsetX ?? 0) * scale,
        y: anchorWorldY + (mask.offsetY ?? 0) * scale,
        width: widthPx,
        height: heightPx,
        anchorX: mask.anchorX ?? 0.5,
        anchorY: mask.anchorY ?? 0.5,
        rotationDeg,
        opacity: mask.opacity ?? 1,
        blendMode: mask.blendMode ?? 'normal',
        filter: buildMaskFilter(mask),
        pixelate: mask.pixelate ?? 0,
      });
    }

    for (const id of Object.keys(baseJoints)) {
      const j = baseJoints[id];
      const p = getWorldPositionFromOffsets(id, pose.joints, baseJoints);
      const x = p.x * unitScale + centerX;
      const y = p.y * unitScale + centerY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const isRoot = !j.parent;
      const r = (isRoot ? 6 : 4) * scale;
      const pinned = activeRoots.includes(id);
      ctx.fillStyle = isRoot
        ? 'rgba(255,255,255,1)'
        : pinned
          ? 'rgba(255, 0, 102, 1)'
          : 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (foregroundMedia && scene.foreground.visible) {
      if (foregroundMedia.kind === 'video') {
        await seekVideo(foregroundMedia.video, scene.foreground.videoStart + (frame / fps) * scene.foreground.videoRate);
        drawReferenceLayerMedia(
          ctx,
          foregroundMedia.video,
          foregroundMedia.video.videoWidth || canvas.width,
          foregroundMedia.video.videoHeight || canvas.height,
          scene.foreground,
          { width: width * scale, height: height * scale },
        );
      } else {
        drawReferenceLayerMedia(
          ctx,
          foregroundMedia.img,
          foregroundMedia.img.naturalWidth,
          foregroundMedia.img.naturalHeight,
          scene.foreground,
          { width: width * scale, height: height * scale },
        );
      }
    }

    drawTextOverlays(frame);
  };

  const renderFrame = async (frame: number) => {
    const pose = sampleClipPose(timeline.clip, frame, baseJoints, { stretchEnabled }) ?? fallbackPose ?? null;
    if (!pose) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    await drawFrame(pose, frame);
  };

  const dispose = () => {
    // Pause and stop any video elements
    if (backgroundMedia?.kind === 'video') {
      backgroundMedia.video.pause();
      backgroundMedia.video.src = '';
      backgroundMedia.video.load();
    }
    if (foregroundMedia?.kind === 'video') {
      foregroundMedia.video.pause();
      foregroundMedia.video.src = '';
      foregroundMedia.video.load();
    }

    // Clear image/video references
    if (backgroundMedia?.kind === 'image') {
      backgroundMedia.img.src = '';
    }
    if (foregroundMedia?.kind === 'image') {
      foregroundMedia.img.src = '';
    }
    if (headMaskImg) {
      headMaskImg.src = '';
    }

    // Clear joint mask images
    jointMaskImgs.forEach((img) => {
      img.src = '';
    });
    jointMaskImgs.clear();

    // Remove canvas from DOM if it was appended
    if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  };

  return { canvas, fps, frameCount, renderFrame, dispose };
};
