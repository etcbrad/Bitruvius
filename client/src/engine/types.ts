import type { LookModeId } from './lookModes';
import type { BalancedNeckConfig } from './balancedNeck';

export type RigidityPreset = 'cardboard' | 'realistic' | 'rubberhose';

export enum PartName {
  Torso = 'torso',
  Waist = 'waist',
  Collar = 'collar',
  NeckBase = 'neck_base',
  RShoulder = 'r_clavicle',
  RElbow = 'r_elbow',
  RWrist = 'r_wrist',
  LShoulder = 'l_clavicle',
  LElbow = 'l_elbow',
  LWrist = 'l_wrist',
  RThigh = 'r_hip',
  RSkin = 'r_knee',
  RAnkle = 'r_ankle',
  LThigh = 'l_hip',
  LSkin = 'l_knee',
  LAnkle = 'l_ankle',
}

export const PART_NAMES: PartName[] = Object.values(PartName);

export const partNameToPoseKey: { [key in PartName]: string } = {
  [PartName.Torso]: 'torso',
  [PartName.Waist]: 'waist',
  [PartName.Collar]: 'collar',
  [PartName.NeckBase]: 'neck_base',
  [PartName.RShoulder]: 'r_clavicle',
  [PartName.RElbow]: 'r_elbow',
  [PartName.RWrist]: 'r_wrist',
  [PartName.LShoulder]: 'l_clavicle',
  [PartName.LElbow]: 'l_elbow',
  [PartName.LWrist]: 'l_wrist',
  [PartName.RThigh]: 'r_hip',
  [PartName.RSkin]: 'r_knee',
  [PartName.RAnkle]: 'r_ankle',
  [PartName.LThigh]: 'l_hip',
  [PartName.LSkin]: 'l_knee',
  [PartName.LAnkle]: 'l_ankle',
};

export const PARENT_MAP: { [key in PartName]?: PartName } = {
  [PartName.Torso]: PartName.Waist,
  [PartName.Collar]: PartName.Torso,
  [PartName.NeckBase]: PartName.Collar,
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

export type MaskBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export type BoneStretchMode = 'rigid' | 'elastic' | 'stretch';
export type ManikinFkMode = 'stretch' | 'bend';

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
  // Appearance / filters (neutral defaults yield no effect)
  blendMode: MaskBlendMode;
  blurPx: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hueRotate: number;
  grayscale: number;
  sepia: number;
  invert: number;
  /**
   * Pixelation block size in px-like units (0 = off).
   * Live SVG uses pixelated sampling; exports may apply true pixelation.
   */
  pixelate: number;
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
  /**
   * Optional world-space origin override for the slot.
   * When set (and the joint exists), rendering uses this joint's world position
   * as the anchor/pivot instead of the attachment midpoint.
   *
   * Used for simplified torso/waist splits that share a seam (e.g. navel).
   */
  originJointId?: string | null;
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

export type SheetSegment = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  area: number;
  thumbnail: string;
  originalCoordinates?: { x: number; y: number }; // Original position in source image
};

export type SheetPalette = {
  sheetId: string | null;
  name: string;
  dims: { width: number; height: number } | null;
  segments: SheetSegment[];
  selectedSegmentId: string | null;
  targetSlotId: string | null;
  previewSrc?: string | null;
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
  blendMode: MaskBase['blendMode'];
  blurPx: MaskBase['blurPx'];
  brightness: MaskBase['brightness'];
  contrast: MaskBase['contrast'];
  saturation: MaskBase['saturation'];
  hueRotate: MaskBase['hueRotate'];
  grayscale: MaskBase['grayscale'];
  sepia: MaskBase['sepia'];
  invert: MaskBase['invert'];
  pixelate: MaskBase['pixelate'];
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
  blendMode: MaskBase['blendMode'];
  blurPx: MaskBase['blurPx'];
  brightness: MaskBase['brightness'];
  contrast: MaskBase['contrast'];
  saturation: MaskBase['saturation'];
  hueRotate: MaskBase['hueRotate'];
  grayscale: MaskBase['grayscale'];
  sepia: MaskBase['sepia'];
  invert: MaskBase['invert'];
  pixelate: MaskBase['pixelate'];
  /**
   * Optional relationship joints used to drive placement/orientation/length.
   * When empty, the head mask uses `head` as its relationship.
   *
   * Semantics match `JointMask.relatedJoints`:
   * - 1st entry (driver) acts like a custom "base" joint for direction/length.
   * - remaining entries affect anchor placement via centroid.
   */
  relatedJoints: string[];
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
  mediaType: 'image' | 'video' | 'sequence';
  videoStart: number;
  videoRate: number;
  /**
   * Optional in-editor only reference to an image sequence (GIF decode or ZIP frames).
   * The frame data itself is stored outside the engine state (e.g. in React memory).
   */
  sequence?: null | {
    id: string;
    kind: 'gif' | 'zip';
    frameCount: number;
    fps: number;
  };
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
  /**
   * Intertitles can optionally draw a full-canvas background image.
   * Stored as a data URL (or remote URL) for portability.
   */
  bgSrc?: string | null;
  bgOpacity?: number;
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

export type ProcgenMode = 'walk_in_place' | 'run_in_place' | 'idle';

export type ProcgenBakeSettings = { cycleFrames: number; keyframeStep: number };

export type ProcgenOptions = {
  inPlace: boolean;
  groundingEnabled: boolean;
  pauseWhileDragging: boolean;
  groundPlaneY: number;
  groundPlaneVisible: boolean;
};

export type ProcgenState = {
  enabled: boolean;
  mode: ProcgenMode;
  strength: number;
  seed: number;
  neutralPose: EnginePoseSnapshot | null;
  bake: ProcgenBakeSettings;
  options: ProcgenOptions;
  gait: import('./bitruvian/types').WalkingEngineGait;
  gaitEnabled: Partial<Record<keyof import('./bitruvian/types').WalkingEngineGait, boolean>>;
  physics: import('./bitruvian/types').PhysicsControls;
  idle: import('./bitruvian/types').IdleSettings;
};

export type SceneState = {
  background: ReferenceLayer;
  foreground: ReferenceLayer;
  headMask: HeadMask;
  jointMasks: Record<string, JointMask>;
  textOverlays: TextOverlay[];
};

export type BoneStyle = {
  /**
   * 0..1 blend across a violet→magenta palette.
   */
  hueT: number;
  /**
   * -1..1 mix toward black (<0) or white (>0).
   */
  lightness: number;
};

export type ArmViewMode = '2D' | '3D' | 'hybrid';

export type RigModel = 'slenderbit' | 'humanoid';

export type ModelDefinition = {
  id: RigModel;
  name: string;
  description?: string;
  joints: Record<string, Joint>;
};

export type SkeletonState = {
  joints: Record<string, Joint>;
  mirroring: boolean;
  bendEnabled: boolean;
  stretchEnabled: boolean;
  leadEnabled: boolean;
  clavicleConstraintEnabled: boolean;
  hardStop: boolean;
  shapeshiftingEnabled: boolean;
  torsoDiamond: {
    enabled: boolean;
    dynamic: boolean;
    restEdges?: Record<string, number>;
  };
  /**
   * Build-time proportion control for the abdomen link:
   * scales the sternum↔navel separation while keeping the upper torso (sternum→collar chain) visually stable.
   * 1.0 = baseline.
   */
  torsoNavelScale: number;
  physicsRigidity: number; // 0..1 macro slider (0=rigid)
  // Default: FK-first with a single planted foot for stability.
  activeRoots: string[];
  deactivatedJoints: Set<string>;
  groundRootTarget: Point;
  footPlungerEnabled: boolean;
  showJoints: boolean;
  jointsOverMasks: boolean;
  lookMode: LookModeId;
  armViewMode: ArmViewMode;
  controlMode: ControlMode;
  rigidity: RigidityPreset;
  snappiness: number; // 0..1
  ikSensitivity: number; // 0..1 - 0 = very fluid/clay-like, 1 = instant response
  viewScale: number;
  viewOffset: Point;
  procgen: ProcgenState;
  timeline: TimelineState;
  scene: SceneState;
  assets: Record<string, CutoutAsset>;
  cutoutSlots: Record<string, CutoutSlot>;
  sheetPalette: SheetPalette;
  cutoutRig: {
    /**
     * Whether the waist cutout should be linked to the torso cutout's transform.
     * When true, moving the torso also moves the waist cutout.
     */
    linkWaistToTorso: boolean;
    /**
     * Whether joints should be linked to mask pieces for rigid behavior.
     * When true, mask pieces stay rigid and joints follow their transform.
     */
    linkJointsToMasks: boolean;
  };
  views: ViewPreset[];
  activeViewId: string;
  boneStyle: BoneStyle;
  // Model system
  activeModel: RigModel;
  boneBuilder?: {
    overlayDismissed: boolean;
    activeStep: 'Head' | 'Shoulders' | 'Arms' | 'Torso' | 'Pelvis' | 'Leg' | 'Foot' | 'Extras';
    plateReadyByStep: Partial<Record<'Head' | 'Shoulders' | 'Arms' | 'Torso' | 'Pelvis' | 'Leg' | 'Foot' | 'Extras', boolean>>;
    plates: Array<{
      id: string;
      jointIds: string[];
      step: 'Head' | 'Shoulders' | 'Arms' | 'Torso' | 'Pelvis' | 'Leg' | 'Foot' | 'Extras';
      hardness?: number;
      mirroredFrom?: string | null;
      origin?: 'shared' | 'separate';
    }>;
    penChainJointId: string | null;
    snapRadiusPx: number;
    headLenPx: number;
    specialPoints?: Record<
      string,
      {
        x: number;
        y: number;
        kind: 'joint' | 'dash';
      }
    >;
    settings: {
      stance: 'single' | 'dual';
      species: 'humanoid' | 'quadruped' | 'winged' | 'serpentine' | 'custom';
      height: number;
      torsoRatio: number;
    };
  };
  hipLock: {
    enabled: boolean;
    extendCompressEnabled: boolean;
    restLen?: number;
    minScale: number; // relative to base hip width
    maxScale: number; // relative to base hip width
    fkEnabled: boolean;
    fkLengthScale: number; // relative to base hip width
    walkModeEnabled: boolean;
    walkAmount: number; // joint-space units
    pelvisBiasEnabled: boolean;
    pelvisBiasSide: 'above' | 'below';
    pelvisBiasAmount: number; // joint-space units
  };
  collarLock: {
    enabled: boolean;
    extendCompressEnabled: boolean;
    restLen?: number;
    minScale: number; // relative to base collar width
    maxScale: number; // relative to base collar width
  };
  balancedNeck: BalancedNeckConfig;
  /**
   * Per-bone overrides keyed by canonical connection key `${min(a,b)}:${max(a,b)}`.
   * Used for editor controls and physics behavior; avoids mutating module-level CONNECTIONS.
   */
  connectionOverrides: Record<
    string,
    {
      stretchMode?: BoneStretchMode;
      shape?: string;
      shapeScale?: number;
      fkMode?: ManikinFkMode;
      fkFollowDeg?: number;
      /**
       * Socket easing for arm sliding - creates gradual magnetic force effect
       */
      socketEasing?: {
        enabled: boolean;
        strength: number; // 0-1, how strong the magnetic pull is
        radius: number; // distance within which magnetic force applies
        easeInTime: number; // seconds for ease-in animation
      };
      /**
       * Render-only: if set, draw this connection from `from` to `mergeToJointId` instead of `to`.
       * Does not affect physics or hierarchy.
       */
      mergeToJointId?: string;
      /**
       * Render-only: hide this connection (useful when another connection is merged over it).
       */
      hidden?: boolean;
    }
  >;
  // Cutout editor system
  cutoutEditor: CutoutEditorState;
  // Cutout sheet library
  cutoutSheets: Record<string, CutoutSheet>;
};
export type Pose = {
  root: Vector2D;
  bodyRotation: number;
  torso: number;
  waist: number;
  collar: number;
  neck_base: number;
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

// Defines the min/max rotation limits for each joint (in degrees).
export type JointLimits = {
  [key: string]: { min: number; max: number };
};

// Cutout System Types
export type AnchorPoint = {
  id: string;
  localPosition: Vector2D;
  connectedTo: string | null; // ID of connected anchor
  jointMapping: string | null; // Maps to skeleton joint ID
  type: 'parent' | 'child' | 'free';
  visible: boolean;
};

export type CutoutNode = {
  id: string;
  name: string;
  assetId: string;
  transform: {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    flipX: boolean;
  };
  anchors: AnchorPoint[];
  parent: string | null; // Parent cutout node ID
  children: string[]; // Child cutout node IDs
  visible: boolean;
  opacity: number;
  zIndex: number;
  locked: boolean;
};

export type CutoutEditorMode = 'layout' | 'pose' | 'animation';

export type CutoutEditorState = {
  mode: CutoutEditorMode;
  nodes: Record<string, CutoutNode>;
  selectedNodeId: string | null;
  selectedAnchorId: string | null;
  showAnchors: boolean;
  showConnections: boolean;
  snapToAnchors: boolean;
  gridSize: number;
  viewTransform: {
    x: number;
    y: number;
    scale: number;
  };
};

export type CutoutSheet = {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  pieces: CutoutPiece[];
  processedAt: number;
};

export type CutoutPiece = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  area: number;
  thumbnail: string;
  suggestedJoints: string[]; // Suggested skeleton joints for this piece
  autoAnchors: Vector2D[]; // Automatically detected anchor points
};
