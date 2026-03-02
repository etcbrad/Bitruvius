import { sampleClipPose } from '../timeline';
import { getWorldPositionFromOffsets } from '../kinematics';
import type { Connection, EnginePoseSnapshot, Joint, SceneState, TimelineState } from '../types';

export interface VideoExportOptions {
  width: number;
  height: number;
  backgroundColor?: string;
  fps?: number;
  scale?: number;
}

export type VideoExportArgs = VideoExportOptions & {
  timeline: TimelineState;
  baseJoints: Record<string, Joint>;
  connections: Connection[];
  scene: SceneState;
  activePins: string[];
  stretchEnabled: boolean;
  fallbackPose?: EnginePoseSnapshot;
};

const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(value)));

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
  return await new Promise((resolve) => {
    const done = () => resolve();
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = safeTime;
  });
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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
}) => {
  const { ctx, img, x, y, width, height, anchorX, anchorY, rotationDeg, opacity } = args;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;
  if (width <= 0 || height <= 0) return;

  ctx.save();
  ctx.globalAlpha = clamp(opacity, 0, 1);
  ctx.translate(x, y);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.drawImage(img, -anchorX * width, -anchorY * height, width, height);
  ctx.restore();
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

  ctx.globalAlpha = layer.opacity;
  ctx.drawImage(media, drawX, drawY, drawW, drawH);
  ctx.globalAlpha = 1;
};

const pickMimeType = (): string | undefined => {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
};

export const exportAsWebm = async (args: VideoExportArgs): Promise<void> => {
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
    activePins,
    stretchEnabled,
    fallbackPose,
  } = args;

  if (!timeline.enabled) throw new Error('Timeline must be enabled to export video');

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
  const headMaskImg =
    scene.headMask?.src && scene.headMask.visible ? await loadImage(scene.headMask.src) : null;
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
  // Preload joint masks to avoid per-frame async.
  for (const mask of Object.values(scene.jointMasks ?? {})) {
    if (!mask?.src || !mask.visible) continue;
    await loadMaskImg(mask.src);
  }

  const stream = canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };

  const mimeType = pickMimeType();
  const mediaRecorder = new MediaRecorder(
    stream,
    mimeType
      ? {
          mimeType,
          videoBitsPerSecond: 5_000_000,
        }
      : {
          videoBitsPerSecond: 5_000_000,
        },
  );

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

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
      const x = o.align === 'left' ? 24 * scale : o.align === 'right' ? canvas.width - 24 * scale : canvas.width / 2;
      const y = 20 * scale;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  };

  const drawFrame = async (pose: EnginePoseSnapshot, frame: number) => {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (backgroundMedia && scene.background.visible) {
      if (backgroundMedia.kind === 'video') {
        await seekVideo(
          backgroundMedia.video,
          scene.background.videoStart + (frame / fps) * scene.background.videoRate,
        );
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

    // Bones
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

    // Joint masks
    for (const [jointId, mask] of Object.entries(scene.jointMasks ?? {})) {
      if (!mask?.src || !mask.visible) continue;
      const img = jointMaskImgs.get(mask.src);
      if (!img) continue;
      const joint = baseJoints[jointId];
      if (!joint) continue;

      const jp = getWorldPositionFromOffsets(jointId, pose.joints, baseJoints);
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
      let anchorWorldX = jp.x * unitScale + centerX;
      let anchorWorldY = jp.y * unitScale + centerY;

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
      });
    }

    // Head mask
    if (headMaskImg && scene.headMask?.src && scene.headMask.visible) {
      const mask = scene.headMask;
      const dx = headPos.x - neckBasePos.x;
      const dy = headPos.y - neckBasePos.y;
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
        anchorWorldX = ((headPos.x + neckBasePos.x) / 2) * unitScale + centerX;
        anchorWorldY = ((headPos.y + neckBasePos.y) / 2) * unitScale + centerY;
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
      });
    }

    // Joints
    for (const id of Object.keys(baseJoints)) {
      const j = baseJoints[id];
      const p = getWorldPositionFromOffsets(id, pose.joints, baseJoints);
      const x = p.x * unitScale + centerX;
      const y = p.y * unitScale + centerY;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const isRoot = !j.parent;
      const r = (isRoot ? 6 : 4) * scale;
      const pinned = activePins.includes(id);
      ctx.fillStyle = isRoot ? 'rgba(255,255,255,1)' : pinned ? 'rgba(255, 0, 102, 1)' : 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (foregroundMedia && scene.foreground.visible) {
      if (foregroundMedia.kind === 'video') {
        await seekVideo(
          foregroundMedia.video,
          scene.foreground.videoStart + (frame / fps) * scene.foreground.videoRate,
        );
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

  await new Promise<void>((resolve, reject) => {
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `bitruvius-animation-${timestamp}.webm`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    };
    mediaRecorder.onerror = () => reject(new Error('MediaRecorder error'));

    mediaRecorder.start(100);

    (async () => {
      for (let frame = 0; frame < frameCount; frame += 1) {
        const pose =
          sampleClipPose(timeline.clip, frame, baseJoints, { stretchEnabled }) ?? fallbackPose ?? null;
        if (pose) await drawFrame(pose, frame);
        track.requestFrame?.();
        await new Promise((r) => setTimeout(r, Math.round(1000 / fps)));
      }
      mediaRecorder.stop();
    })().catch(reject);
  });
};
