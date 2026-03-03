export type PhysicsMode = '2D' | '3D';

export type RigidityPreset = 'cardboard' | 'realistic' | 'rubberhose';

export enum PartName {
  Torso = 'torso',
  Waist = 'waist',
  Collar = 'collar',
  Head = 'head',
  RShoulder = 'rShoulder',
  RElbow = 'rElbow',
  RWrist = 'rWrist',
  LShoulder = 'lShoulder',
  LElbow = 'lElbow',
  LWrist = 'lWrist',
  RThigh = 'rThigh',
  RSkin = 'rSkin',
  RAnkle = 'rAnkle',
  LThigh = 'lThigh',
  LSkin = 'lSkin',
  LAnkle = 'lAnkle',
}

export const PART_NAMES: PartName[] = Object.values(PartName);

export const partNameToPoseKey: { [key in PartName]: string } = {
  [PartName.Torso]: 'torso',
  [PartName.Waist]: 'waist',
  [PartName.Collar]: 'collar',
  [PartName.Head]: 'head',
  [PartName.RShoulder]: 'rShoulder',
  [PartName.RElbow]: 'rForearm',
  [PartName.RWrist]: 'rWrist',
  [PartName.LShoulder]: 'lShoulder',
  [PartName.LElbow]: 'lForearm',
  [PartName.LWrist]: 'lWrist',
  [PartName.RThigh]: 'rThigh',
  [PartName.RSkin]: 'rCalf',
  [PartName.RAnkle]: 'rAnkle',
  [PartName.LThigh]: 'lThigh',
  [PartName.LSkin]: 'lCalf',
  [PartName.LAnkle]: 'lAnkle',
};

export const PARENT_MAP: { [key in PartName]?: PartName } = {
  [PartName.Torso]: PartName.Waist,
  [PartName.Collar]: PartName.Torso,
  [PartName.Head]: PartName.Collar,
  [PartName.RShoulder]: PartName.Collar,
  [PartName.LShoulder]: PartName.Collar,
  [PartName.RThigh]: PartName.Waist,
  [PartName.LThigh]: PartName.Waist,
  [PartName.RElbow]: PartName.RShoulder,
  [PartName.LElbow]: PartName.LShoulder,
  [PartName.RWrist]: PartName.RElbow,
  [PartName.LWrist]: PartName.LElbow,
  [PartName.RSkin]: PartName.RThigh,
  [PartName.LSkin]: PartName.LThigh,
  [PartName.RAnkle]: PartName.RSkin,
  [PartName.LAnkle]: PartName.LSkin,
};

export const CHILD_MAP: { [key in PartName]?: PartName[] } = (() => {
  const map: { [key in PartName]?: PartName[] } = {};
  PART_NAMES.forEach(child => {
    const parent = PARENT_MAP[child];
    if (parent) {
      if (!map[parent]) map[parent] = [];
      map[parent]!.push(child);
    }
  });
  return map;
})();

export const LIMB_SEQUENCES: { [key: string]: PartName[] } = {
  rArm: [PartName.RShoulder, PartName.RElbow, PartName.RWrist],
  lArm: [PartName.LShoulder, PartName.LElbow, PartName.LWrist],
  rLeg: [PartName.RThigh, PartName.RSkin, PartName.RAnkle],
  lLeg: [PartName.LThigh, PartName.LSkin, PartName.LAnkle],
};

export type Connection = {
  from: string;
  to: string;
  type: string;
  label?: string;
  shape?: string;
  stretchMode?: 'rigid' | 'elastic' | 'stretch';
};

export type MaskMode = 'cutout' | 'rubberhose' | 'roto';

export type BoneStretchMode = 'rigid' | 'elastic' | 'stretch';

type MaskBase = {
  src: string | null;
  visible: boolean;
  opacity: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
  mode: MaskMode;
  lengthScale: number;
  volumePreserve: boolean;
  // New transform properties
  stretchX: number;
  stretchY: number;
  skewX: number;
  skewY: number;
};

export type CutoutAsset = {
  id: string;
  name: string;
  kind: 'image' | 'shape';
  image?: {
    src: string;
    naturalWidth: number;
    naturalHeight: number;
  };
  shape?: {
    shapeType: 'capsule' | 'rect' | 'circle';
    fill: string;
    stroke?: string;
    strokeWidth?: number;
  };
  tags?: string[];
};

export type CutoutAttachment = {
  type: 'bone';
  fromJointId: string;
  toJointId: string;
};

export type CutoutSlot = {
  id: string;
  name: string;
  attachment: CutoutAttachment;
  assetId: string | null;
  visible: boolean;
  opacity: number;
  zIndex: number;
  mode: MaskMode;
  scale: number;
  lengthScale: number;
  volumePreserve: boolean;
  offsetX: number;
  offsetY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
  tint?: string | null;
};

export type JointMask = {
  src: MaskBase['src'];
  visible: MaskBase['visible'];
  opacity: MaskBase['opacity'];
  scale: MaskBase['scale'];
  offsetX: MaskBase['offsetX'];
  offsetY: MaskBase['offsetY'];
  rotation: MaskBase['rotation'];
  anchorX: MaskBase['anchorX'];
  anchorY: MaskBase['anchorY'];
  mode: MaskBase['mode'];
  lengthScale: MaskBase['lengthScale'];
  volumePreserve: MaskBase['volumePreserve'];
  stretchX: MaskBase['stretchX'];
  stretchY: MaskBase['stretchY'];
  skewX: MaskBase['skewX'];
  skewY: MaskBase['skewY'];
  /**
   * Optional relationship joints used to drive placement/orientation/length.
   * When empty, the mask uses the joint's parent (if any) as its relationship.
   */
  relatedJoints: string[];
};

export type HeadMask = {
  src: MaskBase['src'];
  visible: MaskBase['visible'];
  opacity: MaskBase['opacity'];
  scale: MaskBase['scale'];
  offsetX: MaskBase['offsetX'];
  offsetY: MaskBase['offsetY'];
  rotation: MaskBase['rotation'];
  anchorX: MaskBase['anchorX'];
  anchorY: MaskBase['anchorY'];
  mode: MaskBase['mode'];
  lengthScale: MaskBase['lengthScale'];
  volumePreserve: MaskBase['volumePreserve'];
  stretchX: MaskBase['stretchX'];
  stretchY: MaskBase['stretchY'];
  skewX: MaskBase['skewX'];
  skewY: MaskBase['skewY'];
};

export type ReferenceLayer = {
  src: string | null;
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  fitMode: string;
  mediaType: 'image' | 'video';
  videoStart: number;
  videoRate: number;
};

export type Vector2D = { x: number; y: number; };

export type TextOverlayKind = 'title' | 'intertitle';

export type TextOverlay = {
  id: string;
  kind: TextOverlayKind;
  text: string;
  visible: boolean;
  startFrame: number;
  endFrame: number;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  x?: number;
  y?: number;
  rotation?: number;
};

// Point is an alias for Vector2D for compatibility
export type Point = Vector2D;

export type Joint = {
  id: string;
  label: string;
  parent: string | null;
  baseOffset: Point;
  currentOffset: Point;
  targetOffset: Point;
  previewOffset: Point;
  rotation?: number;
  isEndEffector?: boolean;
  mirrorId?: string;
};

export type EnginePoseSnapshot = { joints: Record<string, Point> };

export type ViewPreset = {
  id: string;
  name: string;
  pose: EnginePoseSnapshot;
  slotOverrides: Record<string, { visible?: boolean; zIndex?: number }>;
  camera?: { viewScale?: number; viewOffset?: Point };
  reference?: { background?: Partial<ReferenceLayer>; foreground?: Partial<ReferenceLayer> };
};

export type TimelineEasingId = 'linear' | 'easeInOut';

export type TimelineKeyframe = {
  frame: number;
  pose: EnginePoseSnapshot;
};

export type TimelineClip = {
  frameCount: number;
  fps: number;
  easing: TimelineEasingId;
  keyframes: TimelineKeyframe[];
};

export type TimelineState = {
  enabled: boolean;
  clip: TimelineClip;
  onionSkin: {
    enabled: boolean;
    past: number;
    future: number;
  };
};

export type SceneState = {
  background: ReferenceLayer;
  foreground: ReferenceLayer;
  headMask: HeadMask;
  jointMasks: Record<string, JointMask>;
  textOverlays: TextOverlay[];
};

export type SkeletonState = {
  joints: Record<string, Joint>;
  mirroring: boolean;
  bendEnabled: boolean;
  stretchEnabled: boolean;
  leadEnabled: boolean;
  hardStop: boolean;
  /**
   * Optional 0..1 macro slider for blending between rigid and fluid presets.
   * Used by `engine/physics-config.ts`.
   */
  physicsRigidity?: number;
  activePins: string[];
  showJoints: boolean;
  jointsOverMasks: boolean;
  viewMode: string;
  controlMode: ControlMode;
  rigidity: RigidityPreset;
  physicsMode: PhysicsMode;
  snappiness: number;
  viewScale: number;
  viewOffset: Point;
  timeline: TimelineState;
  scene: SceneState;
  assets: Record<string, CutoutAsset>;
  cutoutSlots: Record<string, CutoutSlot>;
  views: ViewPreset[];
  activeViewId: string;
  /**
   * Per-bone overrides keyed by canonical connection key `${min(a,b)}:${max(a,b)}`.
   * Used for editor controls and physics behavior; avoids mutating module-level CONNECTIONS.
   */
  connectionOverrides: Record<string, { stretchMode?: BoneStretchMode }>;
};
export type Pose = {
  root: Vector2D;
  bodyRotation: number;
  torso: number;
  waist: number;
  collar: number;
  head: number;
  lShoulder: number;
  lForearm: number;
  lWrist: number;
  rShoulder: number;
  rForearm: number;
  rWrist: number;
  lThigh: number;
  lCalf: number;
  lAnkle: number;
  rThigh: number;
  rCalf: number;
  rAnkle: number;
  offsets?: { [key: string]: Vector2D };
};

export type PartVisibility = { [key in PartName]: boolean };
export type PartSelection = { [key in PartName]: boolean };
export type AnchorName = PartName | 'root' | 'lFootTip' | 'rFootTip'; // Updated AnchorName to include foot tips

// Defines the available kinetic constraint modes for joints.
// Re-introduced 'stretch' and 'curl' as per user request.
export type JointConstraint = 'fk' | 'stretch' | 'curl';

// Defines control modes for skeleton manipulation.
export type ControlMode = 'Cardboard' | 'Rubberband' | 'IK' | 'JointDrag';

// Defines the rendering mode for the Bone component.
// Simplified: 'grayscale' removed as UI is globally monochrome, 'silhouette' now represents solid black fill.
export type RenderMode = 'default' | 'wireframe' | 'silhouette' | 'backlight'; // Added 'backlight'

export type ViewMode = 'zoomed' | 'default' | 'lotte' | 'wide' | 'mobile'; // Added 'mobile'

// Defines the min/max rotation limits for each joint (in degrees).
export type JointLimits = {
  [key: string]: { min: number; max: number };
};
