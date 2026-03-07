import type { Point, Joint, SkeletonState } from './types';
import { getWorldPosition } from './kinematics';
import { INITIAL_JOINTS } from './model';

const isFinitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

export interface BalancedNeckConfig {
  enabled: boolean;
  clavicleInfluence: number; // 0-1, how much clavicles influence neck position
  torsoInfluence: number; // 0-1, how much torso influences neck position  
  followStrength: number; // 0-1, how strongly neck follows the midpoint
  smoothingFactor: number; // 0-1, smoothing for transitions
  rotationInheritance: {
    enabled: boolean;
    torsoInfluence: number; // 0-1, how much torso rotation affects neck
    lagFactor: number; // 0-1, how much neck lags behind torso rotation (0 = instant, 1 = heavy lag)
  };
}

export const DEFAULT_BALANCED_NECK_CONFIG: BalancedNeckConfig = {
  enabled: true,
  clavicleInfluence: 0.7,
  torsoInfluence: 0.3,
  followStrength: 0.8,
  smoothingFactor: 0.15,
  rotationInheritance: {
    enabled: true,
    torsoInfluence: 0.5,
    lagFactor: 0.3,
  },
};

export const FLOATING_PIVOT_CONFIG: BalancedNeckConfig = {
  enabled: true,
  clavicleInfluence: 1.0, // Full clavicle influence for pure midpoint
  torsoInfluence: 0.0, // No torso influence
  followStrength: 1.0, // Strong follow for locked behavior
  smoothingFactor: 0.0, // No smoothing for immediate response
  rotationInheritance: {
    enabled: false, // Disable rotation inheritance for 360° freedom
    torsoInfluence: 0.0,
    lagFactor: 0.0,
  },
};

/**
 * Compute the balanced neck base position as a midpoint between clavicles
 * with torso influence for natural "rolling" behavior
 */
export const computeBalancedNeckPosition = (
  joints: Record<string, Joint>,
  config: BalancedNeckConfig = DEFAULT_BALANCED_NECK_CONFIG
): Point | null => {
  if (!config.enabled) return null;

  try {
    // Validate required joints exist
    const requiredJoints = ['l_clavicle', 'r_clavicle', 'collar', 'sternum'];
    for (const jointId of requiredJoints) {
      if (!joints[jointId]) {
        console.warn(`Missing required joint for balanced neck calculation: ${jointId}`);
        return null;
      }
    }

    // Get world positions of clavicles and collar
    const lClavicleWorld = getWorldPosition('l_clavicle', joints, INITIAL_JOINTS, 'preview');
    const rClavicleWorld = getWorldPosition('r_clavicle', joints, INITIAL_JOINTS, 'preview');
    const collarWorld = getWorldPosition('collar', joints, INITIAL_JOINTS, 'preview');
    const sternumWorld = getWorldPosition('sternum', joints, INITIAL_JOINTS, 'preview');

    if (!lClavicleWorld || !rClavicleWorld || !collarWorld || !sternumWorld) {
      console.warn('Failed to get world positions for balanced neck calculation');
      return null;
    }

    // Validate world positions are finite
    if (!isFinitePoint(lClavicleWorld) || !isFinitePoint(rClavicleWorld) || 
        !isFinitePoint(collarWorld) || !isFinitePoint(sternumWorld)) {
      console.warn('Non-finite world positions detected in balanced neck calculation');
      return null;
    }

    // Calculate midpoint between clavicles
    const clavicleMidpoint = {
      x: (lClavicleWorld.x + rClavicleWorld.x) / 2,
      y: (lClavicleWorld.y + rClavicleWorld.y) / 2,
    };

    // Calculate torso influence point (sternum -> collar direction)
    const torsoDirection = {
      x: collarWorld.x - sternumWorld.x,
      y: collarWorld.y - sternumWorld.y,
    };
    const torsoLength = Math.hypot(torsoDirection.x, torsoDirection.y);
    
    if (torsoLength < 1e-6) {
      console.warn('Torso length too small for balanced neck calculation');
      return null;
    }
    
    const normalizedTorsoDirection = {
      x: torsoDirection.x / torsoLength,
      y: torsoDirection.y / torsoLength,
    };

    // Validate normalized direction
    if (!isFinitePoint(normalizedTorsoDirection)) {
      console.warn('Invalid normalized torso direction in balanced neck calculation');
      return null;
    }

    // Get default neck length from initial joints with validation
    const neckBaseInitial = getWorldPosition('neck_base', INITIAL_JOINTS, INITIAL_JOINTS);
    const collarInitial = getWorldPosition('collar', INITIAL_JOINTS, INITIAL_JOINTS);
    
    if (!neckBaseInitial || !collarInitial) {
      console.warn('Failed to get initial joint positions for balanced neck calculation');
      return null;
    }

    if (!isFinitePoint(neckBaseInitial) || !isFinitePoint(collarInitial)) {
      console.warn('Non-finite initial positions detected in balanced neck calculation');
      return null;
    }
    
    const defaultNeckLength = Math.hypot(
      neckBaseInitial.x - collarInitial.x,
      neckBaseInitial.y - collarInitial.y
    );

    if (defaultNeckLength < 1e-6) {
      console.warn('Default neck length too small for balanced neck calculation');
      return null;
    }

    // Calculate the target neck position
    const clavicleInfluencePoint = {
      x: clavicleMidpoint.x + normalizedTorsoDirection.x * defaultNeckLength * 0.5,
      y: clavicleMidpoint.y + normalizedTorsoDirection.y * defaultNeckLength * 0.5,
    };

    const torsoInfluencePoint = {
      x: collarWorld.x + normalizedTorsoDirection.x * defaultNeckLength,
      y: collarWorld.y + normalizedTorsoDirection.y * defaultNeckLength,
    };

    // Validate influence points
    if (!isFinitePoint(clavicleInfluencePoint) || !isFinitePoint(torsoInfluencePoint)) {
      console.warn('Invalid influence points in balanced neck calculation');
      return null;
    }

    // Blend between clavicle midpoint and torso direction
    const targetPosition = {
      x: clavicleInfluencePoint.x * config.clavicleInfluence + 
         torsoInfluencePoint.x * config.torsoInfluence,
      y: clavicleInfluencePoint.y * config.clavicleInfluence + 
         torsoInfluencePoint.y * config.torsoInfluence,
    };

    // Validate target position
    if (!isFinitePoint(targetPosition)) {
      console.warn('Invalid target position in balanced neck calculation');
      return null;
    }

    // Apply follow strength (how strongly to move toward target)
    const currentNeckWorld = getWorldPosition('neck_base', joints, INITIAL_JOINTS, 'preview');
    if (!currentNeckWorld) {
      console.warn('Failed to get current neck world position');
      return targetPosition; // Return target as fallback
    }

    if (!isFinitePoint(currentNeckWorld)) {
      console.warn('Non-finite current neck world position detected');
      return targetPosition; // Return target as fallback
    }

    const finalPosition = {
      x: currentNeckWorld.x + (targetPosition.x - currentNeckWorld.x) * config.followStrength,
      y: currentNeckWorld.y + (targetPosition.y - currentNeckWorld.y) * config.followStrength,
    };

    // Final validation
    if (!isFinitePoint(finalPosition)) {
      console.warn('Invalid final position in balanced neck calculation');
      return targetPosition; // Return target as fallback
    }

    return finalPosition;

  } catch (error) {
    console.warn('Failed to compute balanced neck position:', error);
    return null;
  }
};

/**
 * Compute balanced neck rotation with torso inheritance for natural rolling behavior
 */
export const computeBalancedNeckRotation = (
  joints: Record<string, Joint>,
  config: BalancedNeckConfig = DEFAULT_BALANCED_NECK_CONFIG
): number | null => {
  if (!config.enabled || !config.rotationInheritance.enabled) return null;

  try {
    // Get torso rotation angle (sternum -> collar direction)
    const sternumWorld = getWorldPosition('sternum', joints, INITIAL_JOINTS, 'preview');
    const collarWorld = getWorldPosition('collar', joints, INITIAL_JOINTS, 'preview');
    
    if (!sternumWorld || !collarWorld) return null;

    // Calculate torso angle
    const torsoDx = collarWorld.x - sternumWorld.x;
    const torsoDy = collarWorld.y - sternumWorld.y;
    const torsoAngle = Math.atan2(torsoDy, torsoDx);

    // Get current neck rotation
    const neckJoint = joints.neck_base;
    const currentNeckRotation = neckJoint?.rotation ?? 0;

    // Apply lag factor for smooth following
    const targetNeckRotation = torsoAngle * config.rotationInheritance.torsoInfluence;
    const finalRotation = currentNeckRotation + (targetNeckRotation - currentNeckRotation) * (1 - config.rotationInheritance.lagFactor);

    return finalRotation;

  } catch (error) {
    console.warn('Failed to compute balanced neck rotation:', error);
    return null;
  }
};

/**
 * Apply balanced neck constraint to the skeleton state
 */
export const applyBalancedNeckConstraint = (
  joints: Record<string, Joint>,
  config: BalancedNeckConfig = DEFAULT_BALANCED_NECK_CONFIG
): Record<string, Joint> => {
  const balancedPosition = computeBalancedNeckPosition(joints, config);
  const balancedRotation = computeBalancedNeckRotation(joints, config);
  
  if (!balancedPosition && !balancedRotation) {
    return joints;
  }

  // Update the neck base joint's preview offset and rotation
  const updatedJoints = { ...joints };
  const neckBaseJoint = updatedJoints.neck_base;
  
  if (neckBaseJoint) {
    const updates: Partial<Joint> = {};

    // Update position if balanced position is available
    if (balancedPosition) {
      const collarWorld = getWorldPosition('collar', joints, INITIAL_JOINTS, 'preview');
      if (collarWorld) {
        const targetLocalOffset = {
          x: (balancedPosition.x - collarWorld.x),
          y: (balancedPosition.y - collarWorld.y),
        };
        updates.previewOffset = targetLocalOffset;
      }
    }

    // Update rotation if balanced rotation is available
    if (balancedRotation !== null) {
      updates.rotation = balancedRotation;
    }

    updatedJoints.neck_base = {
      ...neckBaseJoint,
      ...updates,
    };
  }

  return updatedJoints;
};
