import JSZip from 'jszip';
import { downloadBlob } from './download';
import { createTimeline2dRenderer, type Timeline2dExportArgs } from './timeline2d';

const canvasToPngBlob = (canvas: HTMLCanvasElement): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Failed to encode PNG'));
        else resolve(blob);
      },
      'image/png',
      0.92,
    );
  });
};

const padFrame = (frame: number, digits: number) => String(frame).padStart(digits, '0');

export const exportGifFramesZip = async (args: Timeline2dExportArgs): Promise<void> => {
  const { canvas, fps, frameCount, renderFrame } = await createTimeline2dRenderer(args);

  const zip = new JSZip();
  zip.file(
    'README.txt',
    `BITRUVIUS PNG SEQUENCE\n\n- Frames: ${frameCount}\n- FPS: ${fps}\n\nConvert to GIF (example):\nffmpeg -framerate ${fps} -i frame_%04d.png -vf \"scale=trunc(iw/2)*2:trunc(ih/2)*2\" -loop 0 out.gif\n`,
  );

  const digits = Math.max(4, String(Math.max(0, frameCount - 1)).length);

  for (let frame = 0; frame < frameCount; frame += 1) {
    await renderFrame(frame);
    const blob = await canvasToPngBlob(canvas);
    zip.file(`frame_${padFrame(frame, digits)}.png`, blob);
  }

  const out = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  downloadBlob(out, `bitruvius-gif-frames-${timestamp}.zip`);
};

