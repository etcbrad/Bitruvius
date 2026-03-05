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

    const parentJoint = nextJoints[joint.parent];
    if (!parentJoint) continue;

    // Get the initial straight direction from INITIAL_JOINTS
    const initialPos = getWorldPosition(jointId, INITIAL_JOINTS, INITIAL_JOINTS);
    const initialParentPos = getWorldPosition(joint.parent, INITIAL_JOINTS, INITIAL_JOINTS);
    
    // Get current parent position
    const currentParentPos = getWorldPosition(joint.parent, state.joints, INITIAL_JOINTS);
    
    // Calculate the straight direction vector
    const initialDirection = {
      x: initialPos.x - initialParentPos.x,
      y: initialPos.y - initialParentPos.y,
    };
    
    // Normalize the direction
    const length = Math.sqrt(initialDirection.x * initialDirection.x + initialDirection.y * initialDirection.y);
    if (length === 0) continue;
    
    const normalizedDirection = {
      x: initialDirection.x / length,
      y: initialDirection.y / length,
    };
    
    // Calculate the expected position (parent position + direction * original length)
    const expectedPos = {
      x: currentParentPos.x + normalizedDirection.x * length,
      y: currentParentPos.y + normalizedDirection.y * length,
    };
    
    // Calculate the offset needed to maintain straight line
    const currentPos = getWorldPosition(jointId, state.joints, INITIAL_JOINTS);
    const currentParentPosForOffset = getWorldPosition(joint.parent, state.joints, INITIAL_JOINTS);
    
    const requiredOffset = {
      x: expectedPos.x - currentParentPosForOffset.x,
      y: expectedPos.y - currentParentPosForOffset.y,
    };
    
    // Update the joint to maintain straight line
    nextJoints[jointId] = {
      ...joint,
      currentOffset: requiredOffset,
      targetOffset: requiredOffset,
      previewOffset: requiredOffset,
      rotation: 0, // Keep rotation at 0 for straight joints
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
