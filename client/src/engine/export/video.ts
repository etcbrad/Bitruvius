import type { Connection, EnginePoseSnapshot, Joint, SceneState, TimelineState } from '../types';
import { createTimeline2dRenderer } from './timeline2d';

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
  activeRoots: string[];
  stretchEnabled: boolean;
  fallbackPose?: EnginePoseSnapshot;
};

const pickMimeType = (): string | undefined => {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
};

export const exportAsWebm = async (args: VideoExportArgs): Promise<void> => {
  const { canvas, fps, frameCount, renderFrame } = await createTimeline2dRenderer(args);

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
        await renderFrame(frame);
        track.requestFrame?.();
        await new Promise((r) => setTimeout(r, Math.round(1000 / fps)));
      }
      mediaRecorder.stop();
    })().catch(reject);
  });
};

