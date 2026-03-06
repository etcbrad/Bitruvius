export type Mode = 'harvest' | 'rig' | 'pose' | 'cut' | 'merge';

export type AnatomicalRole =
  | 'Cranium'
  | 'Mandible'
  | 'Cervical'
  | 'Thoracic'
  | 'Lumbar'
  | 'Pelvis'
  | 'Sacrum'
  | 'Humerus_L'
  | 'Humerus_R'
  | 'Radius_L'
  | 'Radius_R'
  | 'Carpal_L'
  | 'Carpal_R'
  | 'Femur_L'
  | 'Femur_R'
  | 'Tibia_L'
  | 'Tibia_R'
  | 'Tarsal_L'
  | 'Tarsal_R'
  | 'Caudal_Seg'
  | 'Dorsal_Ext'
  | 'Aileron'
  | 'Prop_Weapon'
  | 'Prop_Misc'
  | 'Custom';

export interface Pivot {
  x: number;
  y: number;
  isAuto: boolean;
}

export interface Part {
  id: number;
  name: string;
  role: AnatomicalRole;
  bbox: [number, number, number, number]; // x, y, width, height (sheet px)
  pivot: Pivot; // sheet px
  rotation: number; // deg
  parent: number | null;
}

export interface RiggingState {
  mode: Mode;
  img: HTMLImageElement | null;
  parts: Part[];
  selectedId: number | null;
  scale: number;
  offset: { x: number; y: number };
  draggingPivotPartId: number | null;
  draggingPartId: number | null;
  cutLine: { x1: number; y1: number; x2: number; y2: number } | null;
  mergeSelection: number[];
  lastMessage: string | null;
}

