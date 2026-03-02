export type ViewModeId = 'default' | '8-bitruvius' | '16-bitruvius' | '32-bitruvius' | 'noir' | 'skeletal' | 'lotte' | '3D' | '2D' | 'nosferatu';

export interface ViewModeOption {
  id: ViewModeId;
  label: string;
}

export const viewModes: ViewModeOption[] = [
  { id: 'default', label: 'Default' },
  { id: '8-bitruvius', label: '8-Bitruvius' },
  { id: '16-bitruvius', label: '16-Bitruvius' },
  { id: '32-bitruvius', label: '32-Bitruvius' },
  { id: 'noir', label: 'Noir' },
  { id: 'skeletal', label: 'Skeletal' },
  { id: 'lotte', label: 'Lotte' },
  { id: '3D', label: '3D Physics (Pure FK)' },
  { id: '2D', label: '2D Physics' },
  { id: 'nosferatu', label: 'Nosferatu' },
];
