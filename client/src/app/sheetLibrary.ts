export type DefaultSheet = {
  id: string;
  name: string;
  description: string;
  src: string;
  tags?: string[];
};

export const DEFAULT_SHEETS: DefaultSheet[] = [
  {
    id: 'modellabeled',
    name: 'Model Labeled Cutout Set',
    description: 'Labeled spauldron-style parts suitable for testing cutout parsing.',
    src: '/sheets/modellabeled.svg',
    tags: ['default', 'labeled'],
  },
];

type SampleSheetBuilder = {
  id: string;
  name: string;
  description: string;
  build: () => string;
};

const createCanvas = (width: number, height: number) => {
  if (typeof document === 'undefined') {
    throw new Error('Sheets require a DOM canvas.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  return { canvas, ctx };
};

const drawCapsule = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  color = '#050505',
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  const radius = height / 2;
  const bodyWidth = Math.max(width - height, 0);
  ctx.moveTo(-bodyWidth / 2, -radius);
  ctx.lineTo(bodyWidth / 2, -radius);
  ctx.arc(bodyWidth / 2, 0, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-bodyWidth / 2, radius);
  ctx.arc(-bodyWidth / 2, 0, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
};

const drawEllipse = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rotation = 0,
  color = '#050505',
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
};

const buildTendonField = () => {
  const { canvas, ctx } = createCanvas(1024, 768);
  ctx.fillStyle = '#fdfdf9';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < 14; i += 1) {
    const baseX = 120 + (i % 7) * 130;
    const baseY = 90 + Math.floor(i / 7) * 260;
    drawCapsule(ctx, baseX, baseY + Math.random() * 40, 260, 34, (i % 2 ? 1 : -1) * 0.35);
    ctx.beginPath();
    ctx.lineWidth = 4 + (i % 3);
    ctx.strokeStyle = '#0e8c6f';
    ctx.moveTo(baseX - 120, baseY - 6);
    ctx.bezierCurveTo(baseX - 60, baseY + 40, baseX + 60, baseY - 40, baseX + 120, baseY + 6);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
};

const buildCapsuleChunks = () => {
  const { canvas, ctx } = createCanvas(900, 700);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 12; i += 1) {
    const width = 220 - (i % 3) * 24;
    const height = 60 + (i % 2) * 20;
    const x = 80 + (i % 4) * 200;
    const y = 80 + Math.floor(i / 4) * 200;
    drawCapsule(ctx, x, y, width, height, ((i % 2 ? 1 : -1) * 0.25) + // eslint-disable-line no-mixed-operators
      (Math.random() - 0.5) * 0.1);
    drawEllipse(ctx, x, y + 10, 30, 30, 0, '#101010');
  }
  return canvas.toDataURL('image/png');
};

const buildMaskScatter = () => {
  const { canvas, ctx } = createCanvas(960, 820);
  ctx.fillStyle = '#fbfbfb';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = 160 + col * 240;
      const y = 120 + row * 240;
      ctx.fillStyle = '#040404';
      ctx.beginPath();
      ctx.moveTo(x - 60, y - 70);
      ctx.quadraticCurveTo(x + 40, y - 90, x + 60, y - 10);
      ctx.quadraticCurveTo(x + 70, y + 70, x - 40, y + 80);
      ctx.quadraticCurveTo(x - 90, y + 30, x - 70, y - 20);
      ctx.closePath();
      ctx.fill();
      drawCapsule(ctx, x, y, 150, 90, (row - 1) * 0.15 + (Math.random() - 0.5) * 0.05);
    }
  }
  return canvas.toDataURL('image/png');
};

export const SAMPLE_SHEET_BUILDERS: SampleSheetBuilder[] = [
  {
    id: 'tendon-field',
    name: 'Tendon Field',
    description: 'Cable-like tendons and stretchy limbs to simulate rubbery lines.',
    build: buildTendonField,
  },
  {
    id: 'capsule-chunks',
    name: 'Capsule Chunks',
    description: 'Grouped capsule shapes with stamped ovals.',
    build: buildCapsuleChunks,
  },
  {
    id: 'mask-scatter',
    name: 'Mask Scatter',
    description: 'Hybrid silhouettes spread across the page for parsing.',
    build: buildMaskScatter,
  },
];
