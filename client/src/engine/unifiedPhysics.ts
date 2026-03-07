import type { SkeletonState, ControlMode, RigidityPreset } from './types';

export type UnifiedPhysicsMode = 'rigid' | 'balanced' | 'fluid' | 'fk';

export type PhysicsProfile = {
  mode: UnifiedPhysicsMode;
  controlMode: ControlMode;
  rigidity: RigidityPreset;
  physicsRigidity: number;
  bendEnabled: boolean;
  stretchEnabled: boolean;
  hardStop: boolean;
  footPlungerEnabled: boolean;
  activeRoots: string[];
  snappiness: number;
  description: string;
};

export const PHYSICS_PROFILES: Record<UnifiedPhysicsMode, PhysicsProfile> = {
  rigid: {
    mode: 'rigid',
    controlMode: 'Cardboard',
    rigidity: 'cardboard',
    physicsRigidity: 0,
    bendEnabled: false,
    stretchEnabled: false,
    hardStop: true,
    footPlungerEnabled: false,
    activeRoots: [],
    snappiness: 1.0,
    description: 'Precise FK control with rigid joints'
  },
  balanced: {
    mode: 'balanced',
    controlMode: 'IK',
    rigidity: 'realistic',
    physicsRigidity: 0.4,
    bendEnabled: true,
    stretchEnabled: false,
    hardStop: false,
    footPlungerEnabled: false,
    activeRoots: ['l_ankle', 'r_ankle'],
    snappiness: 0.7,
    description: 'Balanced IK with realistic constraints'
  },
  fluid: {
    mode: 'fluid',
    controlMode: 'IK',
    rigidity: 'rubberhose',
    physicsRigidity: 1.0,
    bendEnabled: true,
    stretchEnabled: true,
    hardStop: false,
    footPlungerEnabled: false,
    activeRoots: ['l_ankle', 'r_ankle'],
    snappiness: 0.3,
    description: 'Fluid, stretchy IK with rubber hose physics'
  },
  fk: {
    mode: 'fk',
    controlMode: 'Cardboard',
    rigidity: 'cardboard',
    physicsRigidity: 0,
    bendEnabled: false,
    stretchEnabled: false,
    hardStop: true,
    footPlungerEnabled: false,
    activeRoots: [],
    snappiness: 1.0,
    description: 'Pure forward kinematics control'
  }
};

export type TransitionConfig = {
  durationMs: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  preservePose: boolean;
};

export const MODE_TRANSITIONS: Record<string, TransitionConfig> = {
  'rigid->balanced': { durationMs: 800, easing: 'ease-in-out', preservePose: true },
  'balanced->fluid': { durationMs: 600, easing: 'ease-out', preservePose: true },
  'fluid->balanced': { durationMs: 400, easing: 'ease-in', preservePose: true },
  'balanced->rigid': { durationMs: 600, easing: 'ease-out', preservePose: true },
  'fk->rigid': { durationMs: 300, easing: 'ease-out', preservePose: false },
  'rigid->fk': { durationMs: 200, easing: 'linear', preservePose: false },
  'any->fk': { durationMs: 200, easing: 'linear', preservePose: false },
  'fk->any': { durationMs: 300, easing: 'ease-out', preservePose: false }
};

export const getOptimalMode = (state: SkeletonState): UnifiedPhysicsMode => {
  // Auto-detect optimal mode based on current state and user intent
  if (state.controlMode === 'Cardboard' && !state.stretchEnabled && !state.bendEnabled) {
    return 'rigid';
  }
  
  if (state.controlMode === 'IK' && state.stretchEnabled) {
    return 'fluid';
  }
  
  if (state.controlMode === 'IK' && state.activeRoots.length > 0) {
    return 'balanced';
  }
  
  // Default to balanced for IK scenarios
  if (state.controlMode === 'IK') {
    return 'balanced';
  }
  
  // Default to rigid for FK scenarios
  return 'rigid';
};

export const applyPhysicsProfile = (state: SkeletonState, mode: UnifiedPhysicsMode): SkeletonState => {
  const profile = PHYSICS_PROFILES[mode];
  
  return {
    ...state,
    controlMode: profile.controlMode,
    rigidity: profile.rigidity,
    physicsRigidity: profile.physicsRigidity,
    bendEnabled: profile.bendEnabled,
    stretchEnabled: profile.stretchEnabled,
    hardStop: profile.hardStop,
    footPlungerEnabled: profile.footPlungerEnabled,
    activeRoots: profile.activeRoots.filter(id => id in state.joints),
    snappiness: profile.snappiness
  };
};

export const getTransitionConfig = (fromMode: UnifiedPhysicsMode, toMode: UnifiedPhysicsMode): TransitionConfig => {
  const key = `${fromMode}->${toMode}`;
  return MODE_TRANSITIONS[key] || MODE_TRANSITIONS['any->fk'] || { durationMs: 400, easing: 'ease-in-out', preservePose: true };
};

export const shouldAutoSwitch = (currentState: SkeletonState, userAction: string): UnifiedPhysicsMode | null => {
  const currentMode = getOptimalMode(currentState);
  
  switch (userAction) {
    case 'start_ik_drag':
      if (currentMode === 'rigid') return 'balanced';
      if (currentMode === 'fk') return 'rigid';
      break;
      
    case 'enable_stretch':
      return 'fluid';
      
    case 'plant_feet':
      return 'balanced';
      
    case 'enter_fk_mode':
      return 'fk';
      
    case 'exit_fk_mode':
      return 'rigid';
      
    case 'precision_pose':
      return 'rigid';
      
    case 'fluid_animation':
      return 'fluid';
  }
  
  return null;
};

export const createSmoothTransition = (
  fromState: SkeletonState,
  toMode: UnifiedPhysicsMode,
  timestamp: number
): {
  targetState: SkeletonState;
  transitionConfig: TransitionConfig;
  transitionId: string;
} => {
  const fromMode = getOptimalMode(fromState);
  const transitionConfig = getTransitionConfig(fromMode, toMode);
  const targetState = applyPhysicsProfile(fromState, toMode);
  const transitionId = `transition_${timestamp}_${fromMode}->${toMode}`;
  
  return {
    targetState,
    transitionConfig,
    transitionId
  };
};
