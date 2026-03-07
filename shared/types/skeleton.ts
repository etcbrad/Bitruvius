// Universal Skeleton Engine Types
// Compatible with Spine JSON v4, DragonBones, and OpenPose BODY_25

export interface Vec2 {
  x: number;
  y: number;
}

export interface BoneDefinition {
  name: string;
  parent?: string;          // omit = root bone
  x: number;                // rest-pose offset from parent (local)
  y: number;
  rotation: number;         // degrees, local to parent
  scaleX?: number;          // default 1
  scaleY?: number;          // default 1
  length?: number;          // visual length (for debug rendering)
  // Bitruvius extensions:
  physics?: PhysicsBoneConfig;
  locomotionRole?: LocomotionRole;   
  openPoseIndex?: number;            // BODY_25 keypoint index if applicable
}

export interface PhysicsBoneConfig {
  enabled: boolean;
  stiffness: number;   // 0 = completely floppy, 1 = rigid
  damping: number;     // 0 = no damping (oscillates forever), 1 = overdamped
  mass?: number;
  gravityScale?: number;  // multiplier on world gravity
  maxAngle?: number;      // hard rotation limit from rest pose (degrees)
}

export type LocomotionRole =
  | "root"
  | "hip"
  | "spine"
  | "chest"
  | "neck"
  | "head"
  | "l_upper_arm" | "l_forearm" | "l_hand"
  | "r_upper_arm" | "r_forearm" | "r_hand"
  | "l_thigh" | "l_shin" | "l_foot"
  | "r_thigh" | "r_shin" | "r_foot"
  | "tail_root" | "tail_mid" | "tail_tip"  // optional
  | "secondary";  // physics-only bone, not driven by locomotion

export interface SlotDefinition {
  name: string;
  bone: string;
  attachment?: string;    // default attachment name
  color?: string;         // hex RGBA
  blendMode?: "normal" | "additive" | "multiply" | "screen";
  zOrder?: number;        // draw order override
}

export interface IKConstraintDefinition {
  name: string;
  bones: string[];        // [chainRoot, ..., chainTip] — 1 to N bones
  target: string;         // name of target/effector bone
  mix: number;            // 0 = FK, 1 = IK
  bendPositive?: boolean;
  softness?: number;
  method?: "two_bone" | "fabrik" | "ccd";  // default: two_bone for 2, fabrik for >2
  compress?: boolean;      // Compress bones when target is within reach
  stretch?: boolean;       // Stretch bones when target is beyond reach
}

export interface SkinDefinition {
  name: string;
  attachments: Record<string, AttachmentDefinition>;
}

export interface AttachmentDefinition {
  name: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
}

export interface AnimationClip {
  name: string;
  duration: number;       // seconds
  timelines: AnimationTimeline[];
}

export interface AnimationTimeline {
  bone?: string;
  slot?: string;
  drawOrder?: number[];
  keyframes: Keyframe[];
}

export interface Keyframe {
  time: number;          // seconds
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  attachment?: string;
  color?: string;
  drawOrder?: number;
}

export interface SkeletonDefinition {
  id: string;
  name: string;
  version: string;
  width: number;
  height: number;
  originX?: number;       // world-space origin X
  originY?: number;
  bones: BoneDefinition[];
  slots: SlotDefinition[];
  ik?: IKConstraintDefinition[];
  skins?: SkinDefinition[];
  animations?: Record<string, AnimationClip>;
  // Bitruvius extensions:
  locomotionMap?: LocomotionMap;
  physicsConfig?: GlobalPhysicsConfig;
}

export interface LocomotionMap {
  [role: string]: string;  // role -> bone name mapping
}

export interface GlobalPhysicsConfig {
  gravity?: Vec2;
  timeScale?: number;
}

// FK Engine Types
export interface BoneTransform {
  // World-space resolved transforms (output of FK pass)
  worldX: number;
  worldY: number;
  worldRotation: number;   // degrees, accumulated from root
  worldScaleX: number;
  worldScaleY: number;
  // Local-space input (set by animator, physics, or IK)
  localX: number;
  localY: number;
  localRotation: number;
  localScaleX: number;
  localScaleY: number;
}

// Physics Engine Types
export interface PhysicsBoneState {
  angle: number;       // current local rotation (degrees)
  velocity: number;    // angular velocity (degrees/sec)
  restAngle: number;   // rest pose local rotation
}

// Skeleton Loading Types
export type SkeletonFormat = "bitruvius" | "spine_json" | "dragonbones_json";

export interface ValidationError {
  bone?: string;
  field?: string;
  message: string;
  severity: "error" | "warning";
}

// OpenPose BODY_25 Mapping
export const OPENPOSE_BONE_MAP: Record<string, [number, number]> = {
  "spine": [8, 1],           // MidHip -> Neck
  "neck": [1, 0],            // Neck -> Nose
  "r_upper_arm": [2, 3],     // R Shoulder -> R Elbow
  "r_forearm": [3, 4],       // R Elbow -> R Wrist
  "l_upper_arm": [5, 6],     // L Shoulder -> L Elbow
  "l_forearm": [6, 7],       // L Elbow -> L Wrist
  "r_thigh": [9, 10],        // R Hip -> R Knee
  "r_shin": [10, 11],         // R Knee -> R Ankle
  "l_thigh": [12, 13],        // L Hip -> L Knee
  "l_shin": [13, 14],         // L Knee -> L Ankle
};

// Utility Functions
export function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

export function radiansToDegrees(radians: number): number {
  return radians * 180 / Math.PI;
}

export function normalize(v: Vec2): Vec2 {
  const mag = Math.hypot(v.x, v.y);
  return mag === 0 ? { x: 0, y: 0 } : { x: v.x / mag, y: v.y / mag };
}

export function subtract(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v: Vec2, scalar: number): Vec2 {
  return { x: v.x * scalar, y: v.y * scalar };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
