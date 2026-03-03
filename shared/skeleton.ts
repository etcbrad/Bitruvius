export type Vec2 = { x: number; y: number };

export interface BoneConstraint {
  minAngle: number; // radians, local space
  maxAngle: number;
  stiffness: number; // 0–1
}

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  localAngle: number;
  length: number;
  worldX?: number;
  worldY?: number;
  worldAngle?: number;
  spriteId: string | null;
  pivotOffset: Vec2;
  spriteScale: Vec2; // NEVER derived from bone length
  zOrder: number;
  constraint: BoneConstraint;
}

export interface Skeleton {
  id: string;
  bones: Record<string, Bone>;
  rootBoneId: string;
  ikTargets: IKTarget[];
}

export interface IKTarget {
  id: string;
  chainEndBoneId: string;
  chainLength: number;
  targetX: number;
  targetY: number;
  enabled: boolean;
}

