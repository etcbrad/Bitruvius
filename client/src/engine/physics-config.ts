import type { RigidityPreset, SkeletonState } from './types';
import { UnifiedPhysicsMode, PHYSICS_PROFILES, getOptimalMode, applyPhysicsProfile } from './unifiedPhysics';

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
  // Use unified system to determine blend mode
  const optimalMode = getOptimalMode(state);
  const v = state.physicsRigidity ?? 0;
  
  if (optimalMode === 'rigid' || optimalMode === 'fk') return 'lotte';
  if (optimalMode === 'fluid') return 'fluid';
  return 'hybrid';
};

export const applyPhysicsMode = (state: SkeletonState, rigidityValue: number): SkeletonState => {
  // Use unified physics profiles for consistent behavior
  const v = Math.max(0, Math.min(1, rigidityValue));
  
  let targetMode: UnifiedPhysicsMode;
  if (v <= 0.1) targetMode = 'rigid';
  else if (v >= 0.9) targetMode = 'fluid';
  else if (v < 0.5) targetMode = 'rigid';
  else targetMode = 'balanced';
  
  return applyPhysicsProfile(state, targetMode);
};

// Legacy compatibility - these functions now delegate to the unified system
export const getOptimalPhysicsMode = (state: SkeletonState): UnifiedPhysicsMode => {
  return getOptimalMode(state);
};

export const applyUnifiedPhysicsMode = (state: SkeletonState, mode: UnifiedPhysicsMode): SkeletonState => {
  return applyPhysicsProfile(state, mode);
};
