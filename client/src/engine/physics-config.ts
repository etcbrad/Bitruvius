import type { RigidityPreset, SkeletonState } from './types';

export type PhysicsBlendMode = 'lotte' | 'hybrid' | 'fluid';

export const createRigidStartPoint = (state: SkeletonState): SkeletonState => {
  const nextJoints = { ...state.joints };
  for (const id of Object.keys(nextJoints)) {
    const j = nextJoints[id];
    nextJoints[id] = {
      ...j,
      currentOffset: { ...j.baseOffset },
      targetOffset: { ...j.baseOffset },
      previewOffset: { ...j.baseOffset },
    };
  }
  return { ...state, joints: nextJoints };
};

export const loadStarterPose = (state: SkeletonState): SkeletonState => {
  return createRigidStartPoint(state);
};

export const getPhysicsBlendMode = (state: SkeletonState): PhysicsBlendMode => {
  const v = state.physicsRigidity ?? 0;
  if (v <= 0.1) return 'lotte';
  if (v >= 0.9) return 'fluid';
  return 'hybrid';
};

export const applyPhysicsMode = (state: SkeletonState, rigidityValue: number): SkeletonState => {
  const v = Math.max(0, Math.min(1, rigidityValue));
  const isFullyRigid = v <= 0.1;
  const isFullyFluid = v >= 0.9;

  let rigidity: RigidityPreset = state.rigidity;
  let bendEnabled = state.bendEnabled;
  let stretchEnabled = state.stretchEnabled;
  let hardStop = state.hardStop;
  let controlMode = state.controlMode;

  if (isFullyRigid) {
    rigidity = 'cardboard';
    bendEnabled = false;
    stretchEnabled = false;
    hardStop = true;
    controlMode = 'Cardboard';
  } else if (isFullyFluid) {
    rigidity = 'rubberhose';
    bendEnabled = true;
    stretchEnabled = true;
    hardStop = false;
    controlMode = 'IK';
  } else {
    if (v < 0.5) {
      rigidity = 'cardboard';
      bendEnabled = v > 0.25;
      stretchEnabled = false;
      hardStop = v < 0.3;
      // preserve user-selected controlMode in the middle band
    } else {
      rigidity = 'realistic';
      bendEnabled = true;
      stretchEnabled = v > 0.7;
      hardStop = false;
    }
  }

  return {
    ...state,
    rigidity,
    bendEnabled,
    stretchEnabled,
    hardStop,
    controlMode,
    physicsRigidity: v,
  };
};

