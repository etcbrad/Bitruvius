import React, { useEffect, useRef } from 'react';

import { clamp } from '../utils';

export type ReferenceVideoMeta = { duration: number; width: number; height: number };
export type ReferenceSequenceKind = 'gif' | 'zip';
export type ReferenceSequenceData = {
  id: string;
  kind: ReferenceSequenceKind;
  frames: any[];
  width: number;
  height: number;
  fps: number;
  meta?: {
    sourceFrameCount: number;
    maxFrames: number;
    truncatedCount: number;
    dedupedCount: number;
  };
};

export const fitModeToObjectFit = (fitMode: string): React.CSSProperties['objectFit'] => {
  if (fitMode === 'cover') return 'cover';
  if (fitMode === 'fill') return 'fill';
  if (fitMode === 'none') return 'none';
  return 'contain';
};

const drawWithFitMode = (
  ctx: CanvasRenderingContext2D,
  source: any,
  destW: number,
  destH: number,
  fitMode: string,
) => {
  const sw =
    Number(
      source?.videoWidth ||
        source?.naturalWidth ||
        source?.displayWidth ||
        source?.codedWidth ||
        source?.width ||
        0,
    ) || 0;
  const sh =
    Number(
      source?.videoHeight ||
        source?.naturalHeight ||
        source?.displayHeight ||
        source?.codedHeight ||
        source?.height ||
        0,
    ) || 0;
  if (!sw || !sh || !destW || !destH) return;

  ctx.clearRect(0, 0, destW, destH);

  if (fitMode === 'fill') {
    ctx.drawImage(source, 0, 0, destW, destH);
    return;
  }

  if (fitMode === 'none') {
    ctx.drawImage(source, 0, 0, sw, sh);
    return;
  }

  const scale =
    fitMode === 'cover' ? Math.max(destW / sw, destH / sh) : Math.min(destW / sw, destH / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (destW - dw) / 2;
  const dy = (destH - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
};

const setVideoTimeSafe = (video: HTMLVideoElement, desiredTime: number) => {
  if (!Number.isFinite(desiredTime)) return;
  const duration = Number.isFinite(video.duration) ? video.duration : null;
  const safeTime =
    duration !== null ? clamp(desiredTime, 0, Math.max(0, duration - 0.001)) : Math.max(0, desiredTime);
  try {
    if (Math.abs((video.currentTime || 0) - safeTime) > 1 / 240) {
      video.currentTime = safeTime;
    }
  } catch {
    // Seeking can fail if metadata isn't loaded yet; ignore and retry on next effect/event.
  }
};

export const SyncedReferenceVideo = React.forwardRef<
  HTMLVideoElement,
  {
    src: string;
    desiredTime: number;
    playing: boolean;
    playbackRate: number;
    objectFit: React.CSSProperties['objectFit'];
    onMeta?: (meta: ReferenceVideoMeta) => void;
  }
>(({ src, desiredTime, playing, playbackRate, objectFit, onMeta }, ref) => {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const lastDesiredRef = useRef<number>(Number.NaN);

  React.useImperativeHandle(ref, () => innerRef.current as HTMLVideoElement);

  useEffect(() => {
    const video = innerRef.current;
    if (!video) return;
    video.playbackRate = Number.isFinite(playbackRate) ? playbackRate : 1;
  }, [playbackRate]);

  useEffect(() => {
    const video = innerRef.current;
    if (!video) return;

    if (!playing) {
      video.pause();
      setVideoTimeSafe(video, desiredTime);
      lastDesiredRef.current = desiredTime;
      return;
    }

    // When entering play, align start time then allow natural playback.
    const drift = Math.abs((video.currentTime || 0) - desiredTime);
    const jumped =
      !Number.isFinite(lastDesiredRef.current) || Math.abs(lastDesiredRef.current - desiredTime) > 0.25;
    if (jumped || drift > 0.15) setVideoTimeSafe(video, desiredTime);
    lastDesiredRef.current = desiredTime;

    const p = video.play();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => {
        // Autoplay policies / decode hiccups; ignore.
      });
    }
  }, [desiredTime, playing]);

  return (
    <video
      ref={innerRef}
      src={src}
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        onMeta?.({
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        });
        setVideoTimeSafe(video, desiredTime);
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
      }}
    />
  );
});

export const SyncedReferenceSequenceCanvas = ({
  sequence,
  desiredTime,
  playing,
  fitMode,
}: {
  sequence: ReferenceSequenceData | null;
  desiredTime: number;
  playing: boolean;
  fitMode: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!sequence || !sequence.frames.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const frameCount = sequence.frames.length;
    const fps = Math.max(1, Math.floor(sequence.fps || 24));
    const t = Math.max(0, desiredTime);
    const rawIndex = Math.floor(t * fps);
    const frameIndex =
      sequence.kind === 'gif'
        ? ((rawIndex % frameCount) + frameCount) % frameCount
        : clamp(rawIndex, 0, frameCount - 1);
    const frame = sequence.frames[frameIndex];
    if (!frame) return;

    drawWithFitMode(ctx, frame, canvas.width, canvas.height, fitMode);

    if (playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // Trigger a re-draw during play so changes in desiredTime are reflected smoothly.
        // The actual desiredTime is driven by React state; this is a cheap fallback.
        drawWithFitMode(ctx, frame, canvas.width, canvas.height, fitMode);
      });
    }
  }, [desiredTime, fitMode, playing, sequence]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};
