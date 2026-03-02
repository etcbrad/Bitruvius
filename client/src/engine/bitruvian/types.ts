import { Vector2D } from '../types';

export interface WalkingEngineGait {
  stride: number;
  intensity: number;
  gravity: number;
  hover_height: number;
  hip_sway: number;
  waist_twist: number;
  torso_swivel: number;
  arm_swing: number;
  arm_spread: number;
  elbow_bend: number;
  elbowFlexibility: number;
  foot_roll: number;
  kick_up_force: number;
  head_spin: number;
  lean: number;
}

export interface WalkingEngineProportions {
  l_upper_leg?: { h: number };
  l_lower_leg?: { h: number };
  l_foot?: { h: number };
  r_upper_leg?: { h: number };
  r_lower_leg?: { h: number };
  r_foot?: { h: number };
  l_upper_arm?: { h: number };
  l_lower_arm?: { h: number };
  l_hand?: { h: number };
  r_upper_arm?: { h: number };
  r_lower_arm?: { h: number };
  r_hand?: { h: number };
  torso?: { h: number };
  waist?: { h: number };
  collar?: { h: number };
  head?: { h: number };
}

export interface PhysicsControls {
  jointElasticity: number;
  stabilization: number;
}

export interface IdleSettings {
  transitionSpeed: number;
  breathing: number;
  weightShift: number;
  posture: number;
  tension: number;
  gazeSway: number;
  fidgetFrequency: number;
  idlePinnedFeet: 'left' | 'right' | 'both' | 'none';
}

export interface WalkingEnginePose {
  x_offset?: number;
  y_offset?: number;
  bodyRotation?: number;
  waist?: number;
  torso?: number;
  collar?: number;
  collarYOffset?: number;
  neck?: number;
  head?: number;
  l_shoulder?: number;
  l_elbow?: number;
  l_hand?: number;
  l_wrist?: number;
  r_shoulder?: number;
  r_elbow?: number;
  r_hand?: number;
  r_wrist?: number;
  l_hip?: number;
  l_knee?: number;
  l_foot?: number;
  l_toe?: number;
  r_hip?: number;
  r_knee?: number;
  r_foot?: number;
  r_toe?: number;
  l_thigh?: number;
  r_thigh?: number;
}

export interface GroundingResults {
  adjustedPose: Partial<WalkingEnginePose>;
  tensions: Record<string, number>;
}

export const BITRUVIAN_CONSTANTS = {
  ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT: {
    LEG_UPPER: 0.24,
    LEG_LOWER: 0.24,
    FOOT: 0.12,
    ARM_UPPER: 0.19,
    ARM_LOWER: 0.19,
    HAND: 0.12,
    TORSO: 0.30,
    WAIST: 0.08,
    COLLAR: 0.06,
    HEAD: 0.24,
  },
  GROUNDING_PHYSICS: {
    FLOOR_Y_OFFSET_GLOBAL_H_UNIT: 0.0,
    GROUNDING_SPRING_FACTOR: 0.8,
    GROUNDING_X_STABILITY_FACTOR: 0.3,
    STABILITY_SPRING_BASE_SPREAD_H_UNIT: 0.15,
    STABILITY_SPRING_CROUCH_SPREAD_H_UNIT: 0.25,
    FOOT_LIFT_THRESHOLD_H_UNIT: 0.05,
    COG_X_SIDE_OFFSET_H_UNIT: 0.05,
    VERTICALITY_TENSION_THRESHOLD: 0.8,
    VERTICALITY_STRAIGHTEN_FACTOR: 0.3,
    GRAVITY_OVERLOAD_KNEE_BEND_THRESHOLD: 120,
    GRAVITY_OVERLOAD_CENTERING_FACTOR: 0.4,
  },
  IDLE_PHYSICS: {
    MAX_SPEED_DAMPENING_FACTOR: 2.0,
    BREATH_SPEED_BASE: 0.15,
    BREATH_SPEED_FACTOR: 0.25,
    TORSO_BREATH_AMPLITUDE: 1.5,
    COLLAR_BREATH_AMPLITUDE: 1.0,
    SWAY_SPEED_BASE: 0.08,
    SWAY_SPEED_FACTOR: 0.15,
  },
  GAIT_PHYSICS: {
    HIP_SWAY_BASE_MAG_MOD: 25,
    BODY_LEAN_MULTIPLIER: 35,
    BODY_LEAN_OSCILLATION_AMPLITUDE: 8,
    WAIST_SWAY_RATIO: 0.3,
    WAIST_TWIST_BASE: 60,
    WAIST_TWIST_ARM_SWING_BONUS: 20,
    TORSO_COUNTER_TWIST_BASE: 0.3,
    TORSO_COUNTER_TWIST_SWIVEL_RANGE: 0.7,
    COLLAR_LEAN_COMPENSATION: 0.7,
    COLLAR_SWAY_COMPENSATION: 0.6,
    NECK_LEAN_COMPENSATION: 0.2,
    ARM_SWING_BASE: 20,
    ARM_SWING_STRIDE_FACTOR: 45,
    ARM_SWING_INTENSITY_BASE: 0.5,
    ARM_SWING_INTENSITY_FACTOR: 0.5,
    ARM_SPREAD_ANGLE: 40,
    ELBOW_LAG_RADIANS: 0.4,
    ELBOW_WALK_BASE: 25,
    ELBOW_RUN_BASE: 90,
    ELBOW_SNEAK_BASE: 115,
    WRIST_DRAG_FACTOR: 35,
    WRIST_FLICK_INTENSITY: 50,
    HIP_BASE_MULTIPLIER: 10,
    HIP_STRIDE_FACTOR: 45,
    HIP_INTENSITY_BASE: 0.8,
    HIP_INTENSITY_FACTOR: 0.4,
    STANCE_KNEE_GRAVITY_FACTOR: 55,
    SWING_KNEE_BASE_FACTOR: 30,
    SWING_KNEE_HOVER_RATIO: 0.75,
    IK_KNEE_GRAVITY_BONUS: 8,
    STANCE_HEEL_STRIKE_ANGLE: 15,
    STANCE_TOE_STRIKE_ANGLE: 7.5,
    STANCE_TOE_OFF_ANGLE: -75,
    SWING_FOOT_DORSIFLEXION: -20,
    SWING_FOOT_GRAVITY_FACTOR: 0.5,
    FOOT_DRAG_MAX_ANGLE: -45,
    TOE_BREAK_THRESHOLD_FACTOR: -30,
    TOE_BEND_MAX_ANGLE: 45,
    TOE_KICK_BONUS: 40,
    HOVER_HEIGHT_MULTIPLIER: 80,
    HOVER_AIR_FACTOR_BASE: 1.2,
    KICK_UP_KNEE_AMPLITUDE: 60,
    KICK_UP_FOOT_AMPLITUDE: 40,
    VERTICALITY_BOB_AMPLITUDE: 25,
    VERTICALITY_GRAVITY_DAMPENING: 0.7,
  },
} as const;

export const DEFAULT_PROCEDURAL_BITRUVIAN_GAIT: WalkingEngineGait = {
  stride: 0.6,
  intensity: 0.5,
  gravity: 0.7,
  hover_height: 0.3,
  hip_sway: 0.5,
  waist_twist: 0.4,
  torso_swivel: 0.3,
  arm_swing: 0.6,
  arm_spread: 0.2,
  elbow_bend: 0.5,
  elbowFlexibility: 0.7,
  foot_roll: 0.4,
  kick_up_force: 0.2,
  head_spin: 0.3,
  lean: 0.2,
};

export const DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS: PhysicsControls = {
  jointElasticity: 0.3,
  stabilization: 0.4,
};

export const DEFAULT_PROCEDURAL_BITRUVIAN_IDLE: IdleSettings = {
  transitionSpeed: 0.5,
  breathing: 0.6,
  weightShift: 0.4,
  posture: 0.0,
  tension: 0.1,
  gazeSway: 0.3,
  fidgetFrequency: 0.2,
  idlePinnedFeet: 'both',
};

export const DEFAULT_PROCEDURAL_BITRUVIAN_PROPORTIONS: WalkingEngineProportions = {
  l_upper_leg: { h: 1.0 },
  l_lower_leg: { h: 1.0 },
  l_foot: { h: 1.0 },
  r_upper_leg: { h: 1.0 },
  r_lower_leg: { h: 1.0 },
  r_foot: { h: 1.0 },
  l_upper_arm: { h: 1.0 },
  l_lower_arm: { h: 1.0 },
  l_hand: { h: 1.0 },
  r_upper_arm: { h: 1.0 },
  r_lower_arm: { h: 1.0 },
  r_hand: { h: 1.0 },
  torso: { h: 1.0 },
  waist: { h: 1.0 },
  collar: { h: 1.0 },
  head: { h: 1.0 },
};
