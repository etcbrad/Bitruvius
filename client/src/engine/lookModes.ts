export type LookModeId =
  | 'default'
  | '8-bitruvius'
  | '16-bitruvius'
  | '32-bitruvius'
  | 'noir'
  | 'skeletal'
  | 'lotte'
  | 'nosferatu';

export type LookMode = {
  id: LookModeId;
  label: string;
  description: string;
  pixelSnapPx?: number;
  filters?: {
    grayscale?: boolean;
    contrast?: number;
  };
};

export const LOOK_MODES: LookMode[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Standard rendering with smooth subpixel positioning and full layers.',
  },
  {
    id: '8-bitruvius',
    label: '8-Bitruvius',
    description: 'Aggressive pixel snapping for chunky, low-resolution motion.',
    pixelSnapPx: 4,
  },
  {
    id: '16-bitruvius',
    label: '16-Bitruvius',
    description: 'Moderate pixel snapping for classic console-era crispness.',
    pixelSnapPx: 2,
  },
  {
    id: '32-bitruvius',
    label: '32-Bitruvius',
    description: 'Light pixel snapping to reduce shimmer while keeping detail.',
    pixelSnapPx: 1,
  },
  {
    id: 'noir',
    label: 'Noir',
    description: 'High-contrast monochrome look for reference/tracing and silhouettes.',
    filters: { grayscale: true, contrast: 1.25 },
  },
  {
    id: 'skeletal',
    label: 'Skeletal',
    description: 'Rig-only view: hides masks/cutouts and forces joint/connection visibility.',
  },
  {
    id: 'lotte',
    label: 'Lotte',
    description: 'Flat silhouette-inspired rendering with simplified joint styling.',
  },
  {
    id: 'nosferatu',
    label: 'Nosferatu',
    description: 'White-on-black, high-contrast rendering tuned for spooky readability.',
  },
];

export const LOOK_MODE_ID_SET = new Set<LookModeId>(LOOK_MODES.map((m) => m.id));

