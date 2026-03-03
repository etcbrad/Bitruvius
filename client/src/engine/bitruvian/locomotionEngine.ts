import { 
  WalkingEngineGait, 
  WalkingEnginePose, 
  WalkingEngineProportions, 
  PhysicsControls,
  BITRUVIAN_CONSTANTS,
} from './types';
import { 
  lerp, 
  clamp,
  rotateVecInternal,
} from './kinematics';

export interface LocomotionState {
  smoothedWaistTwist: number;
  smoothedTorsoLean: number;
  smoothedWaistSway: number;
  smoothedBodySwayX: number;
  smoothedBobbing: number;
  smoothedLKnee: number;
  smoothedRKnee: number;
  smoothedLElbow: number;
  smoothedRElbow: number;
  smoothedLWrist: number;
  smoothedRWrist: number;
  smoothedBodyRotation: number;
  prevYOffset: number;
}

export const INITIAL_LOCOMOTION_STATE: LocomotionState = {
  smoothedWaistTwist: 0,
  smoothedTorsoLean: 0,
  smoothedWaistSway: 0,
  smoothedBodySwayX: 0,
  smoothedBobbing: 0,
  smoothedLKnee: 0,
  smoothedRKnee: 0,
  smoothedLElbow: 0,
  smoothedRElbow: 0,
  smoothedLWrist: 0,
  smoothedRWrist: 0,
  smoothedBodyRotation: 0,
  prevYOffset: 0,
};

export const calculateFootTipGlobalPosition = (
    angles: { hip: number; knee: number; foot: number; toe: number },
    props: WalkingEngineProportions,
    baseUnitH: number,
    isRight: boolean,
    includeFootLen: boolean = true,
) => {
    const thighKey = isRight ? 'r_upper_leg' : 'l_upper_leg';
    const calfKey = isRight ? 'r_lower_leg' : 'l_lower_leg';
    const footKey = isRight ? 'r_foot' : 'l_foot';

    const thighLen = (props[thighKey]?.h ?? 1) * BITRUVIAN_CONSTANTS.ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER * baseUnitH;
    const calfLen = (props[calfKey]?.h ?? 1) * BITRUVIAN_CONSTANTS.ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER * baseUnitH;
    const footLen = (props[footKey]?.h ?? 1) * BITRUVIAN_CONSTANTS.ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.FOOT * baseUnitH;
    
    const kneePos = rotateVecInternal({x: 0, y: thighLen}, angles.hip);
    const ankleRel = rotateVecInternal({x: 0, y: calfLen}, angles.hip + angles.knee);
    const anklePos = { x: kneePos.x + ankleRel.x, y: kneePos.y + ankleRel.y };
    if (!includeFootLen) return anklePos;

    const tipRel = rotateVecInternal({x: 0, y: footLen}, angles.hip + angles.knee + angles.foot);
    const tipPos = { x: anklePos.x + tipRel.x, y: anklePos.y + tipRel.y };
    return tipPos;
};

const calculateLegAngles = (s: number, g: WalkingEngineGait, phase: number, wf: number) => {
  const hipMult = (BITRUVIAN_CONSTANTS.GAIT_PHYSICS.HIP_BASE_MULTIPLIER * 0.7 + (g.stride * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.HIP_STRIDE_FACTOR)) * 
                  (BITRUVIAN_CONSTANTS.GAIT_PHYSICS.HIP_INTENSITY_BASE + g.intensity * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.HIP_INTENSITY_FACTOR);
  let hip = s * hipMult;
  let knee = 5; 
  let foot = -90;
  let toe = 0;
  
  const stanceThreshold = -Math.max(0, (g.intensity - 1.0) * 0.4);
  const normalizedPhase = ((phase % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);

  if (s < stanceThreshold) {
    const stanceProgress = normalizedPhase > Math.PI ? (normalizedPhase - Math.PI) / Math.PI : 0;
    knee = g.gravity * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.STANCE_KNEE_GRAVITY_FACTOR * (1 - Math.sin(stanceProgress * Math.PI)) * wf;
    knee = clamp(knee, 2, 160);
    
    if (stanceProgress < 0.15) { 
      const t = stanceProgress / 0.15; 
      foot += lerp(BITRUVIAN_CONSTANTS.GAIT_PHYSICS.STANCE_HEEL_STRIKE_ANGLE, 0, t); 
      toe = lerp(BITRUVIAN_CONSTANTS.GAIT_PHYSICS.STANCE_TOE_STRIKE_ANGLE, 0, t); 
    } 
    else if (stanceProgress > 0.6) { 
      const t = (stanceProgress - 0.6) / 0.4; 
      foot += lerp(0, BITRUVIAN_CONSTANTS.GAIT_PHYSICS.STANCE_TOE_OFF_ANGLE, t) * (g.foot_roll + g.kick_up_force * 0.1); 
    }
  } else {
    const swingArc = Math.sin(s * Math.PI); 
    const airFactor = BITRUVIAN_CONSTANTS.GAIT_PHYSICS.HOVER_AIR_FACTOR_BASE - g.gravity;
    const hLift = g.hover_height * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.HOVER_HEIGHT_MULTIPLIER * swingArc * airFactor;
    hip -= hLift;
    knee = ((g.stride + g.intensity) * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.SWING_KNEE_BASE_FACTOR * airFactor) + hLift * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.SWING_KNEE_HOVER_RATIO;
    knee = clamp(knee, 10, 140);
  }
  return { hip, knee, foot, toe };
};

export const updateLocomotionPhysics = (
  p: number, 
  state: LocomotionState, 
  gait: WalkingEngineGait, 
  physics: PhysicsControls, 
  props: WalkingEngineProportions, 
  baseUnitH: number, 
  weightFactor: number = 1.0, 
  gaitEnabled?: Record<string, boolean>
): Partial<WalkingEnginePose> => {
  const g = (k: keyof WalkingEngineGait) => (gaitEnabled && gaitEnabled[k] === false) ? 0 : gait[k];

  const stab = physics.stabilization;
  const alpha = 1.0 - stab;
  const sVal = Math.sin(p);
  const cStride = Math.sin(p + Math.PI);

  // Enhanced body dynamics with more sophisticated smoothing
  state.smoothedTorsoLean = lerp(state.smoothedTorsoLean, (g('lean') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.BODY_LEAN_MULTIPLIER) + (sVal * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.BODY_LEAN_OSCILLATION_AMPLITUDE * g('intensity')), alpha);
  const swayMag = BITRUVIAN_CONSTANTS.GAIT_PHYSICS.HIP_SWAY_BASE_MAG_MOD * g('hip_sway') * g('intensity');
  state.smoothedBodySwayX = lerp(state.smoothedBodySwayX, sVal * swayMag, alpha);
  state.smoothedWaistSway = lerp(state.smoothedWaistSway, -sVal * swayMag * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.WAIST_SWAY_RATIO, alpha);
  state.smoothedWaistTwist = lerp(state.smoothedWaistTwist, cStride * (BITRUVIAN_CONSTANTS.GAIT_PHYSICS.WAIST_TWIST_BASE + g('arm_swing') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.WAIST_TWIST_ARM_SWING_BONUS) * g('waist_twist') * g('intensity'), alpha);
  
  // Enhanced arm swing with more natural dynamics
  const swingMag = (BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ARM_SWING_BASE + (g('stride') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ARM_SWING_STRIDE_FACTOR)) * (BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ARM_SWING_INTENSITY_BASE + g('intensity') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ARM_SWING_INTENSITY_FACTOR) * g('arm_swing');
  
  // More sophisticated elbow dynamics
  const baseFlexion = lerp(BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ELBOW_WALK_BASE, BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ELBOW_RUN_BASE, clamp((g('intensity') - 0.4) * 1.5, 0, 1)) * g('elbow_bend');
  const lagL = p + Math.PI - BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ELBOW_LAG_RADIANS;
  const lagR = p - BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ELBOW_LAG_RADIANS;
  
  const getElbow = (lag: number) => {
    const sinLag = Math.sin(lag);
    const flex = Math.max(0, sinLag) * (40 + g('intensity') * 30);
    const ext = Math.min(0, sinLag) * (15 + g('intensity') * 15);
    // Anatomical Bias: Elbows flex ANTERIORLY (negative rotation in this coordinate frame)
    return clamp(-(baseFlexion + (flex + ext) * g('elbowFlexibility')), -155, 5);
  };

  state.smoothedLElbow = lerp(state.smoothedLElbow, getElbow(lagL), alpha);
  state.smoothedRElbow = lerp(state.smoothedRElbow, getElbow(lagR), alpha);

  // Enhanced wrist dynamics with drag and flick
  const getWrist = (phase: number, elbowPhase: number) => {
    const dragFactor = BITRUVIAN_CONSTANTS.GAIT_PHYSICS.WRIST_DRAG_FACTOR * g('arm_swing');
    const flickIntensity = BITRUVIAN_CONSTANTS.GAIT_PHYSICS.WRIST_FLICK_INTENSITY * g('intensity') * 0.01;
    const drag = Math.cos(phase) * dragFactor;
    const flick = Math.sin(elbowPhase) * flickIntensity;
    return drag + flick;
  };

  state.smoothedLWrist = lerp(state.smoothedLWrist, getWrist(p + Math.PI, lagL), alpha);
  state.smoothedRWrist = lerp(state.smoothedRWrist, getWrist(p, lagR), alpha);

  // Enhanced body rotation with verticality bobbing
  const bobAmount = BITRUVIAN_CONSTANTS.GAIT_PHYSICS.VERTICALITY_BOB_AMPLITUDE * g('intensity') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.VERTICALITY_GRAVITY_DAMPENING;
  state.smoothedBodyRotation = lerp(state.smoothedBodyRotation, sVal * bobAmount * g('hip_sway'), alpha);

  const lLeg = calculateLegAngles(sVal, gait, p, weightFactor);
  const rLeg = calculateLegAngles(cStride, gait, p + Math.PI, weightFactor);

  // Enhanced torso and upper body dynamics
  const tTwist = -state.smoothedWaistTwist * (BITRUVIAN_CONSTANTS.GAIT_PHYSICS.TORSO_COUNTER_TWIST_BASE + g('torso_swivel') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.TORSO_COUNTER_TWIST_SWIVEL_RANGE);
  const finalTorso = state.smoothedTorsoLean + tTwist + state.smoothedWaistSway;
  const finalCollar = (state.smoothedTorsoLean * -BITRUVIAN_CONSTANTS.GAIT_PHYSICS.COLLAR_LEAN_COMPENSATION) + (state.smoothedWaistSway * -BITRUVIAN_CONSTANTS.GAIT_PHYSICS.COLLAR_SWAY_COMPENSATION) + (tTwist * -0.5);
  const finalNeck = state.smoothedTorsoLean * -BITRUVIAN_CONSTANTS.GAIT_PHYSICS.NECK_LEAN_COMPENSATION + g('head_spin');

  return {
    x_offset: state.smoothedBodySwayX,
    y_offset: 0,
    bodyRotation: state.smoothedBodyRotation,
    waist: state.smoothedWaistTwist,
    torso: finalTorso,
    collar: finalCollar,
    collarYOffset: 0, // Add collar Y offset for enhanced dynamics
    neck: finalNeck,
    l_shoulder: cStride * swingMag - g('arm_spread') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ARM_SPREAD_ANGLE,
    r_shoulder: sVal * swingMag + g('arm_spread') * BITRUVIAN_CONSTANTS.GAIT_PHYSICS.ARM_SPREAD_ANGLE,
    l_elbow: state.smoothedLElbow,
    r_elbow: state.smoothedRElbow,
    l_hand: state.smoothedLWrist,
    r_hand: state.smoothedRWrist,
    l_wrist: state.smoothedLWrist * 0.5, // Add wrist joint
    r_wrist: state.smoothedRWrist * 0.5, // Add wrist joint
    l_hip: lLeg.hip, 
    l_knee: lLeg.knee, 
    l_foot: lLeg.foot, 
    l_toe: lLeg.toe,
    r_hip: rLeg.hip, 
    r_knee: rLeg.knee, 
    r_foot: rLeg.foot, 
    r_toe: rLeg.toe,
    l_thigh: lLeg.hip * 0.3, // Add thigh rotation
    r_thigh: rLeg.hip * 0.3, // Add thigh rotation
  };
};
