import { downloadBlob } from './download';
import { serializeStandaloneSvg, type SvgExportOptions } from './svg';

export type PngExportOptions = Omit<SvgExportOptions, 'filename'> & {
  filename?: string;
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });

export const downloadPngFromSvg = async (
  svg: SVGSVGElement,
  options: PngExportOptions,
): Promise<void> => {
  const svgText = serializeStandaloneSvg(svg, options);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = options.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))), 'image/png');
    });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = options.filename ?? `bitruvius-export-${timestamp}.png`;
    downloadBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

