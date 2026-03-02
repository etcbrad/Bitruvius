import { EnginePoseSnapshot, Point } from '../types';
import { 
  WalkingEnginePose, 
  WalkingEngineGait, 
  WalkingEngineProportions, 
  PhysicsControls,
  IdleSettings,
  DEFAULT_PROCEDURAL_BITRUVIAN_GAIT,
  DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS,
  DEFAULT_PROCEDURAL_BITRUVIAN_IDLE,
  DEFAULT_PROCEDURAL_BITRUVIAN_PROPORTIONS,
} from './types';
import { updateLocomotionPhysics, INITIAL_LOCOMOTION_STATE, LocomotionState } from './locomotionEngine';
import { updateIdlePhysics } from './idleEngine';
import { applyFootGrounding } from './groundingEngine';
import { lerp } from './kinematics';

let locomotionState: LocomotionState = { ...INITIAL_LOCOMOTION_STATE };
let lastTime = 0;

export const resetBitruviusState = () => {
  locomotionState = { ...INITIAL_LOCOMOTION_STATE };
  lastTime = 0;
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

  // Apply rotations as angular changes to joint positions
  Object.entries(jointMap).forEach(([bitruviusKey, engineKey]) => {
    const value = bitruviusPose[bitruviusKey as keyof WalkingEnginePose];
    if (value !== undefined && basePose.joints[engineKey]) {
      const baseJoint = basePose.joints[engineKey];
      
      // Find parent joint for proper rotation calculation
      const parentJointId = getParentJoint(engineKey);
      const parentJoint = parentJointId ? basePose.joints[parentJointId] : null;
      
      if (parentJoint) {
        // Calculate rotation relative to parent
        const dx = baseJoint.x - parentJoint.x;
        const dy = baseJoint.y - parentJoint.y;
        const currentLength = Math.sqrt(dx * dx + dy * dy);
        
        if (currentLength > 0) {
          const angleRad = (value * Math.PI) / 180;
          const currentAngle = Math.atan2(dy, dx);
          const newAngle = currentAngle + angleRad;
          
          result.joints[engineKey] = {
            x: parentJoint.x + Math.cos(newAngle) * currentLength,
            y: parentJoint.y + Math.sin(newAngle) * currentLength
          };
        }
      } else {
        // For root-level joints, apply smaller offset
        const angleRad = (value * Math.PI) / 180;
        const offsetMagnitude = 5; // Increased offset for visibility
        result.joints[engineKey] = {
          x: baseJoint.x + Math.sin(angleRad) * offsetMagnitude,
          y: baseJoint.y + (1 - Math.cos(angleRad)) * offsetMagnitude
        };
      }
    }
  });

  // Apply body offset only to root joints (not all joints)
  if (bitruviusPose.x_offset || bitruviusPose.y_offset) {
    const rootJoints = ['navel', 'l_hip', 'r_hip']; // Only apply to body root joints
    rootJoints.forEach(key => {
      if (result.joints[key]) {
        result.joints[key].x += bitruviusPose.x_offset || 0;
        result.joints[key].y += bitruviusPose.y_offset || 0;
      }
    });
  }

  return result;
};

// Helper function to get parent joint
const getParentJoint = (jointId: string): string | null => {
  const parentMap: Record<string, string> = {
    'sternum': 'navel',
    'collar': 'sternum',
    'neck_base': 'collar',
    'head': 'neck_base',
    'l_shoulder': 'collar',
    'l_elbow': 'l_shoulder',
    'l_wrist': 'l_elbow',
    'r_shoulder': 'collar',
    'r_elbow': 'r_shoulder',
    'r_wrist': 'r_elbow',
    'l_hip': 'navel',
    'l_knee': 'l_hip',
    'l_ankle': 'l_knee',
    'l_toe': 'l_ankle',
    'r_hip': 'navel',
    'r_knee': 'r_hip',
    'r_ankle': 'r_knee',
    'r_toe': 'r_ankle',
    'l_thigh': 'l_hip',
    'r_thigh': 'r_hip',
  };
  return parentMap[jointId] || null;
};

export const generateProceduralBitruviusPose = (args: {
  neutral: EnginePoseSnapshot;
  frame: number;
  fps: number;
  cycleFrames: number;
  strength: number;
  mode: 'walk' | 'idle';
  time?: number;
  gait?: Partial<WalkingEngineGait>;
  physics?: Partial<PhysicsControls>;
  idle?: Partial<IdleSettings>;
  proportions?: Partial<WalkingEngineProportions>;
}): EnginePoseSnapshot => {
  const { neutral, frame, fps, cycleFrames, strength, mode, time = Date.now(), gait = {}, physics = {}, idle = {}, proportions = {} } = args;
  
  // Early return if strength is 0 - return neutral pose unchanged
  if (strength === 0) {
    return neutral;
  }
  
  // Don't update lastTime here - it should be managed externally
  const deltaTime = 16; // Assume ~60fps for stable animation

  const safeCycle = Math.max(2, Math.floor(cycleFrames));
  const phase = ((frame % safeCycle) / safeCycle) * Math.PI * 2;
  
  const baseUnitH = 100; // Base unit height in pixels
  
  const mergedGait: WalkingEngineGait = { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT, ...gait };
  const mergedPhysics: PhysicsControls = { ...DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS, ...physics };
  const mergedIdle: IdleSettings = { ...DEFAULT_PROCEDURAL_BITRUVIAN_IDLE, ...idle };
  const mergedProportions: WalkingEngineProportions = { ...DEFAULT_PROCEDURAL_BITRUVIAN_PROPORTIONS, ...proportions };

  let pose: Partial<WalkingEnginePose> = {};

  if (mode === 'walk') {
    const locomotionPose = updateLocomotionPhysics(
      phase,
      locomotionState,
      mergedGait,
      mergedPhysics,
      mergedProportions,
      baseUnitH,
      strength
    );
    
    const groundingResults = applyFootGrounding(
      locomotionPose,
      mergedProportions,
      baseUnitH,
      mergedPhysics,
      ['lAnkle', 'rAnkle'], // Active pins for grounding
      mergedIdle,
      'center',
      1.0, // Full locomotion weight
      deltaTime
    );
    
    pose = groundingResults.adjustedPose;
  } else {
    const idlePose = updateIdlePhysics(
      time,
      deltaTime,
      mergedIdle,
      0.0 // No locomotion weight for pure idle
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

  // Remove any x_offset to prevent sliding
  delete pose.x_offset;
  delete pose.y_offset;

  return bitruviusPoseToEnginePose(pose, neutral);
};
