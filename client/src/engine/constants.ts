

import { PartName, Pose, Vector2D, JointLimits } from './types';

export const SCALE_FACTOR = 3.5; // Doubled from 1.75

export const HEAD_UNIT = 50 * SCALE_FACTOR;

export const ANATOMY = {
  HEAD: 1.0 * HEAD_UNIT,
  HEAD_WIDTH: 0.8 * HEAD_UNIT,
  HEAD_NECK_GAP_OFFSET: 0.1 * HEAD_UNIT,
  COLLAR: 0.4 * HEAD_UNIT, 
  COLLAR_WIDTH: (2 / 3) * HEAD_UNIT, 
  TORSO: 1.2 * HEAD_UNIT,
  TORSO_WIDTH: 0.65 * HEAD_UNIT, 
  WAIST: 1.0 * HEAD_UNIT,
  WAIST_WIDTH: 0.85 * HEAD_UNIT, // Thinned from 1.0 to 0.85 (Torso is 0.65)
  UPPER_ARM: 1.8 * HEAD_UNIT,
  LOWER_ARM: 1.4 * HEAD_UNIT,
  HAND: 0.8 * HEAD_UNIT,
  LEG_UPPER: 2.2 * HEAD_UNIT,
  LEG_LOWER: 1.8 * HEAD_UNIT,
  FOOT: 1.0 * HEAD_UNIT,
  SHOULDER_WIDTH: 1.2 * HEAD_UNIT,
  HIP_WIDTH: 1.0 * HEAD_UNIT,
  ROOT_SIZE: 0.25 * HEAD_UNIT,
  LIMB_WIDTH_ARM: 0.22 * HEAD_UNIT,
  LIMB_WIDTH_FOREARM: 0.18 * HEAD_UNIT,
  LIMB_WIDTH_THIGH: 0.35 * HEAD_UNIT,
  LIMB_WIDTH_CALF: 0.28 * HEAD_UNIT,
  HAND_WIDTH: 0.2 * HEAD_UNIT,
  FOOT_WIDTH: 0.25 * HEAD_UNIT,
  EFFECTOR_WIDTH: 0.15 * HEAD_UNIT,
};

export const RIGGING = {
  L_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER: -ANATOMY.COLLAR_WIDTH / 2.1,
  R_SHOULDER_X_OFFSET_FROM_COLLAR_CENTER: ANATOMY.COLLAR_WIDTH / 2.1,
  /**
   * Lowering the shoulders by one "anchor length" (the height of the collar segment).
   * Since the collar draws upwards from chest to neck, an offset of ANATOMY.COLLAR 
   * from the end (neck) places the shoulders back at the chest/torso junction.
   */
  SHOULDER_Y_OFFSET_FROM_COLLAR_END: ANATOMY.COLLAR,
  COLLAR_OFFSET_Y: ANATOMY.COLLAR * 0.15, // Small offset to balance the collar piece
};

export const FLOOR_HEIGHT = 1000 * SCALE_FACTOR;
export const FLOOR_SINK_BUFFER = 50 * SCALE_FACTOR; // How much below floor for "slow ease" effect
export const GROUND_SINK_REMAINING_PROPORTION = 0.45; // Proportion of the sink depth that remains when in buffer zone

export const GROUND_STRIP_HEIGHT = 20 * SCALE_FACTOR; // Height of the visual ground strip
export const GROUND_STRIP_COLOR = '#252525'; // Slightly lighter very dark grey for the ground strip


export const T_POSE_ROOT_Y = FLOOR_HEIGHT - (ANATOMY.LEG_UPPER + ANATOMY.LEG_LOWER + ANATOMY.FOOT);

type RotationValues = Omit<Pose, 'root' | 'offsets'>;

export const BASE_ROTATIONS: RotationValues = {
  bodyRotation: 0,
  torso: 0,
  waist: 0,
  collar: 0,
  head: 0,
  lShoulder: 0, // Changed from -90 to 0 for horizontal arms
  lForearm: 0,
  lWrist: 0,
  rShoulder: 0, // Changed from 90 to 0 for horizontal arms
  rForearm: 0,
  rWrist: 0,
  lThigh: 0,
  lCalf: 0,
  lAnkle: 0,
  rThigh: 0,
  rCalf: 0,
  rAnkle: 0,
};

export const RESET_POSE: Pose = {
  root: { x: 0, y: T_POSE_ROOT_Y },
  ...BASE_ROTATIONS,
  offsets: {
    [PartName.Collar]: {x: 0, y: RIGGING.COLLAR_OFFSET_Y} // Apply default offset to collar
  },
};

// Define joint rotation limits in degrees
export const JOINT_LIMITS: JointLimits = {
  // Spine (relative to parent)
  [PartName.Waist]: { min: -180, max: 180 }, 
  [PartName.Torso]: { min: -180, max: 180 },
  [PartName.Collar]: { min: -180, max: 180 },
  [PartName.Head]: { min: -180, max: 180 },

  // Right Arm (relative to parent)
  [PartName.RShoulder]: { min: -180, max: 180 }, 
  rForearm: { min: -180, max: 180 },         
  [PartName.RWrist]: { min: -180, max: 180 }, 

  // Left Arm (relative to parent)
  [PartName.LShoulder]: { min: -180, max: 180 }, 
  lForearm: { min: -180, max: 180 },          
  [PartName.LWrist]: { min: -180, max: 180 }, 

  // Right Leg (relative to parent)
  [PartName.RThigh]: { min: -180, max: 180 }, 
  rCalf: { min: -180, max: 180 },           
  [PartName.RAnkle]: { min: -180, max: 180 }, 
  // Left Leg (relative to parent)
  [PartName.LThigh]: { min: -180, max: 180 },
  lCalf: { min: -180, max: 180 },
  [PartName.LAnkle]: { min: -180, max: 180 },
};