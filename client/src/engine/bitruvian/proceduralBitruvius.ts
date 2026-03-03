import { EnginePoseSnapshot, Point } from '../types';
import { 
  WalkingEnginePose, 
  WalkingEngineGait, 
  WalkingEngineProportions, 
  PhysicsControls,
  IdleSettings,
  BITRUVIAN_CONSTANTS,
  DEFAULT_PROCEDURAL_BITRUVIAN_GAIT,
  DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS,
  DEFAULT_PROCEDURAL_BITRUVIAN_IDLE,
  DEFAULT_PROCEDURAL_BITRUVIAN_PROPORTIONS,
} from './types';
import { updateLocomotionPhysics, INITIAL_LOCOMOTION_STATE, LocomotionState } from './locomotionEngine';
import { createIdleRuntimeState, IdleRuntimeState, updateIdlePhysics } from './idleEngine';
import { applyFootGrounding } from './groundingEngine';
import { clamp, lerp, rotateVecInternal } from './kinematics';
import type { ProcgenOptions } from '../types';
import type { Rng } from '../rng';
import { createRng } from '../rng';
import { getWorldPositionFromOffsets } from '../kinematics';
import { INITIAL_JOINTS } from '../model';

export type BitruviusRuntimeState = {
  locomotion: LocomotionState;
  idle: IdleRuntimeState;
};

export const createBitruviusRuntimeState = (): BitruviusRuntimeState => ({
  locomotion: { ...INITIAL_LOCOMOTION_STATE },
  idle: createIdleRuntimeState(),
});

export const resetBitruviusRuntimeState = (state: BitruviusRuntimeState) => {
  state.locomotion = { ...INITIAL_LOCOMOTION_STATE };
  state.idle = createIdleRuntimeState();
};

const bitruviusPoseToEnginePose = (bitruviusPose: Partial<WalkingEnginePose>, basePose: EnginePoseSnapshot): EnginePoseSnapshot => {
  const result: EnginePoseSnapshot = {
    joints: { ...basePose.joints }
  };

  // Map Bitruvian pose to engine joint positions with proper rotation application
  const jointMap: Record<string, string> = {
    torso: 'sternum',
    waist: 'navel', 
    collar: 'collar',
    neck: 'neck_base',
    head: 'head',
    l_shoulder: 'l_shoulder',
    l_elbow: 'l_elbow',
    l_hand: 'l_wrist',
    r_shoulder: 'r_shoulder',
    r_elbow: 'r_elbow',
    r_hand: 'r_wrist',
    l_hip: 'l_hip',
    l_knee: 'l_knee',
    l_foot: 'l_ankle',
    l_toe: 'l_toe',
    r_hip: 'r_hip',
    r_knee: 'r_knee',
    r_foot: 'r_ankle',
    r_toe: 'r_toe',
    l_thigh: 'l_thigh',
    r_thigh: 'r_thigh',
  };

  // EnginePoseSnapshot stores *local offsets* (not world positions). Apply pose angles by rotating
  // each joint's offset vector, preserving its length.
  Object.entries(jointMap).forEach(([bitruviusKey, engineKey]) => {
    const angleDeg = bitruviusPose[bitruviusKey as keyof WalkingEnginePose];
    const baseOffset = basePose.joints[engineKey];
    if (typeof angleDeg !== 'number' || !baseOffset) return;
    result.joints[engineKey] = rotateVecInternal(baseOffset, angleDeg);
  });

  // Apply body translation to the skeleton root (`root`). Applying it to child roots (hips)
  // double-counts and causes sudden "sinking"/drift.
  if (typeof bitruviusPose.x_offset === 'number' || typeof bitruviusPose.y_offset === 'number') {
    const base = result.joints.root ?? { x: 0, y: 0 };
    result.joints.root = {
      x: base.x + (bitruviusPose.x_offset ?? 0),
      y: base.y + (bitruviusPose.y_offset ?? 0),
    };
  }

  // Apply a global body rotation around the root so the gait/IK `bodyRotation` and the rig's
  // hierarchical offsets share the same angle basis.
  if (typeof bitruviusPose.bodyRotation === 'number' && Number.isFinite(bitruviusPose.bodyRotation) && Math.abs(bitruviusPose.bodyRotation) > 1e-6) {
    const a = bitruviusPose.bodyRotation;
    for (const [id, off] of Object.entries(result.joints)) {
      if (id === 'root' || !off) continue;
      result.joints[id] = rotateVecInternal(off, a);
    }
  }

  return result;
};

const inferBaseUnitHFromNeutral = (neutral: EnginePoseSnapshot): number => {
  const lenOf = (id: string): number | null => {
    const v = neutral.joints[id];
    if (!v) return null;
    const l = Math.hypot(v.x, v.y);
    return Number.isFinite(l) && l > 1e-6 ? l : null;
  };

  const thighSamples = [lenOf('l_knee'), lenOf('r_knee')].filter((v): v is number => typeof v === 'number');
  const calfSamples = [lenOf('l_ankle'), lenOf('r_ankle')].filter((v): v is number => typeof v === 'number');

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const thighLen = avg(thighSamples);
  const calfLen = avg(calfSamples);

  const denom =
    BITRUVIAN_CONSTANTS.ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_UPPER +
    BITRUVIAN_CONSTANTS.ANATOMY_RAW_RELATIVE_TO_BASE_HEAD_UNIT.LEG_LOWER;
  const total = (thighLen ?? 0) + (calfLen ?? 0);
  const est = denom > 1e-6 && total > 1e-6 ? total / denom : 25;
  return clamp(est, 4, 200);
};

export const generateProceduralBitruviusPose = (args: {
  neutral: EnginePoseSnapshot;
  frame: number;
  fps: number;
  cycleFrames: number;
  strength: number;
  mode: 'walk' | 'idle';
  timeMs?: number;
  gait?: Partial<WalkingEngineGait>;
  physics?: Partial<PhysicsControls>;
  idle?: Partial<IdleSettings>;
  proportions?: Partial<WalkingEngineProportions>;
  options?: ProcgenOptions;
  runtimeState?: BitruviusRuntimeState;
  rng?: Rng;
}): EnginePoseSnapshot => {
  const {
    neutral,
    frame,
    fps,
    cycleFrames,
    strength,
    mode,
    timeMs,
    gait = {},
    physics = {},
    idle = {},
    proportions = {},
    options,
    runtimeState,
    rng,
  } = args;
  
  // Early return if strength is 0 - return neutral pose unchanged
  if (strength === 0) {
    return neutral;
  }
  
  const deltaTimeMs = Math.max(0, (1000 / Math.max(1, fps)) | 0);
  const safeTimeMs = timeMs ?? frame * deltaTimeMs;
  const effectiveRng = rng ?? createRng(((safeTimeMs | 0) ^ 0x9e3779b9) >>> 0);
  const state = runtimeState ?? createBitruviusRuntimeState();

  const safeCycle = Math.max(2, Math.floor(cycleFrames));
  const phase = ((frame % safeCycle) / safeCycle) * Math.PI * 2;
  
  const baseUnitH = inferBaseUnitHFromNeutral(neutral);
  
  const mergedGait: WalkingEngineGait = { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT, ...gait };
  const mergedPhysics: PhysicsControls = { ...DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS, ...physics };
  const mergedIdle: IdleSettings = { ...DEFAULT_PROCEDURAL_BITRUVIAN_IDLE, ...idle };
  const mergedProportions: WalkingEngineProportions = { ...DEFAULT_PROCEDURAL_BITRUVIAN_PROPORTIONS, ...proportions };
  const mergedOptions: ProcgenOptions = {
    inPlace: true,
    groundingEnabled: true,
    pauseWhileDragging: false,
    groundPlaneY: 13,
    groundPlaneVisible: true,
    ...(options ?? {}),
  };

  let pose: Partial<WalkingEnginePose> = {};

  if (mode === 'walk') {
    const locomotionPose = updateLocomotionPhysics(
      phase,
      state.locomotion,
      mergedGait,
      mergedPhysics,
      mergedProportions,
      baseUnitH,
      1.0
    );
    
    if (mergedOptions.groundingEnabled) {
      const neutralHipL = getWorldPositionFromOffsets('l_hip', neutral.joints, INITIAL_JOINTS);
      const neutralHipR = getWorldPositionFromOffsets('r_hip', neutral.joints, INITIAL_JOINTS);
      const neutralHipCenter = {
        x: (neutralHipL.x + neutralHipR.x) * 0.5,
        y: (neutralHipL.y + neutralHipR.y) * 0.5,
      };
      const floorYGlobal = clamp((mergedOptions.groundPlaneY ?? 0) - neutralHipCenter.y, -500, 500);

      const s = Math.sin(phase);
      const transition = 0.15;
      const activePins =
        s < -transition ? ['lAnkle'] : s > transition ? ['rAnkle'] : ['lAnkle', 'rAnkle'];

      const groundingResults = applyFootGrounding(
        locomotionPose,
        mergedProportions,
        baseUnitH,
        mergedPhysics,
        activePins,
        mergedIdle,
        'center',
        1.0, // Full locomotion weight
        deltaTimeMs,
        floorYGlobal,
      );
      pose = groundingResults.adjustedPose;
    } else {
      pose = locomotionPose;
    }
  } else {
    const idlePose = updateIdlePhysics(
      safeTimeMs,
      deltaTimeMs,
      mergedIdle,
      0.0, // No locomotion weight for pure idle
      state.idle,
      effectiveRng,
    );
    
    pose = idlePose;
  }

  // Apply strength scaling
  Object.keys(pose).forEach(key => {
    const value = pose[key as keyof WalkingEnginePose];
    if (typeof value === 'number') {
      (pose as any)[key] = value * strength;
    }
  });

  // Keep vertical grounding (y_offset) for walk mode; suppress lateral sliding by default.
  if (mode === 'walk') {
    if (mergedOptions.inPlace) {
      if (typeof pose.x_offset === 'number') pose.x_offset = 0;
      if (typeof pose.y_offset === 'number') pose.y_offset = 0;
    }
  } else {
    delete pose.x_offset;
    delete pose.y_offset;
  }

  return bitruviusPoseToEnginePose(pose, neutral);
};
