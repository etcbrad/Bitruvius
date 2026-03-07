import type { SkeletonState, Joint } from './types';
import { INITIAL_JOINTS } from './model';
import { getWorldPosition } from './kinematics';

/**
 * Toggle joint deactivation - deactivated joints remain perfectly straight
 */
export const toggleJointDeactivation = (state: SkeletonState, jointId: string): SkeletonState => {
  const newDeactivated = new Set(state.deactivatedJoints);
  
  if (newDeactivated.has(jointId)) {
    newDeactivated.delete(jointId);
  } else {
    newDeactivated.add(jointId);
  }

  return {
    ...state,
    deactivatedJoints: newDeactivated,
  };
};

/**
 * Apply deactivation constraints - keep deactivated joints perfectly straight
 */
export const applyDeactivationConstraints = (state: SkeletonState): SkeletonState => {
  const nextJoints = { ...state.joints };
  const deactivatedJoints = state.deactivatedJoints;

  for (const jointId of Array.from(deactivatedJoints)) {
    const joint = nextJoints[jointId];
    if (!joint || !joint.parent) continue;

    // For completely rigid joints, maintain their initial relative transformation
    // but don't allow any manipulation - they just get dragged by parent movement
    const initialJoint = INITIAL_JOINTS[jointId];
    const initialParent = INITIAL_JOINTS[joint.parent];
    
    if (!initialJoint || !initialParent) continue;

    // Use the initial relative offset and rotation from the INITIAL_JOINTS
    // This makes the joint completely rigid - it maintains initial pose
    nextJoints[jointId] = {
      ...joint,
      currentOffset: initialJoint.currentOffset,
      targetOffset: initialJoint.currentOffset,
      previewOffset: initialJoint.currentOffset,
      rotation: initialJoint.rotation,
    };
  }

  return {
    ...state,
    joints: nextJoints,
  };
};

/**
 * Check if a joint is deactivated
 */
export const isJointDeactivated = (state: SkeletonState, jointId: string): boolean => {
  return state.deactivatedJoints.has(jointId);
};

/**
 * Get all deactivated joints
 */
export const getDeactivatedJoints = (state: SkeletonState): string[] => {
  return Array.from(state.deactivatedJoints);
};
