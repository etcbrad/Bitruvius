import { downloadBlob } from './download';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type SvgExportOptions = {
  width: number;
  height: number;
  filename?: string;
  backgroundColor?: string;
};

const DEFAULT_STYLE = `
:root {
  --bg: #121212;
  --ink: #e0e0e0;
  --line: #333333;
  --accent: #ffffff;
  --ghost: rgba(255, 255, 255, 0.2);
}
`.trim();

export const serializeStandaloneSvg = (
  svg: SVGSVGElement,
  options: SvgExportOptions
): string => {
  const { width, height, backgroundColor } = options;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const styleEl = document.createElementNS(SVG_NS, 'style');
  styleEl.textContent = DEFAULT_STYLE;

  if (clone.firstChild) {
    clone.insertBefore(styleEl, clone.firstChild);
  } else {
    clone.appendChild(styleEl);
  }

  if (backgroundColor) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', backgroundColor);
    clone.insertBefore(rect, styleEl.nextSibling);
  }

  return new XMLSerializer().serializeToString(clone);
};

export const downloadSvg = (svg: SVGSVGElement, options: SvgExportOptions): void => {
  const svgText = serializeStandaloneSvg(svg, options);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = options.filename ?? `bitruvius-export-${timestamp}.svg`;
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  downloadBlob(blob, filename);
};

