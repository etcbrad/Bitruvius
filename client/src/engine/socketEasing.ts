import type { Point, Joint, SkeletonState } from './types';

/**
 * Socket easing system - creates gradual magnetic force effect for arm sliding
 * Like a calm magnetic force that smoothly transitions arm positions
 */

// Linear interpolation
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Ease-in-out cubic function for smooth magnetic feel
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export interface SocketEasingConfig {
  enabled: boolean;
  strength: number; // 0-1, how strong the magnetic pull is
  radius: number; // distance within which magnetic force applies
  easeInTime: number; // seconds for ease-in animation
}

export interface SocketEasingState {
  isActive: boolean;
  startTime: number;
  startPosition: Point;
  targetPosition: Point;
  currentDuration: number;
}

// Global socket easing state per connection
const socketEasingStates = new Map<string, SocketEasingState>();

/**
 * Calculate magnetic force between socket and target position
 * Uses inverse square law for realistic magnetic behavior
 */
export const calculateMagneticForce = (
  socketPos: Point,
  targetPos: Point,
  strength: number,
  radius: number
): Point => {
  const dx = targetPos.x - socketPos.x;
  const dy = targetPos.y - socketPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance < 0.001) return { x: 0, y: 0 }; // Already at target
  
  // Apply magnetic force only within radius
  if (distance > radius) return { x: 0, y: 0 };
  
  // Inverse square law with falloff
  const forceMagnitude = strength * Math.pow(1 - (distance / radius), 2);
  
  // Normalize and apply force
  return {
    x: (dx / distance) * forceMagnitude,
    y: (dy / distance) * forceMagnitude
  };
};

/**
 * Apply socket easing to joint position
 * Creates smooth magnetic force effect for arm sliding
 */
export const applySocketEasing = (
  jointId: string,
  currentPos: Point,
  socketPos: Point,
  config: SocketEasingConfig,
  currentTime: number
): Point => {
  if (!config.enabled) return currentPos;
  
  const stateKey = jointId;
  let state = socketEasingStates.get(stateKey);
  
  // Calculate distance to socket
  const dx = socketPos.x - currentPos.x;
  const dy = socketPos.y - currentPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Check if within magnetic radius
  if (distance > config.radius) {
    // Outside radius, stop easing
    if (state?.isActive) {
      state.isActive = false;
      socketEasingStates.set(stateKey, state);
    }
    return currentPos;
  }
  
  // Initialize or update easing state
  if (!state?.isActive) {
    state = {
      isActive: true,
      startTime: currentTime,
      startPosition: { ...currentPos },
      targetPosition: { ...socketPos },
      currentDuration: 0
    };
    socketEasingStates.set(stateKey, state);
  }
  
  // Update target position (socket might have moved)
  state.targetPosition = { ...socketPos };
  
  // Calculate elapsed time
  const elapsed = currentTime - state.startTime;
  const progress = Math.min(elapsed / config.easeInTime, 1);
  
  // Apply ease-in-out cubic for smooth magnetic feel
  const easedProgress = easeInOutCubic(progress);
  
  // Apply magnetic force with easing
  const magneticForce = calculateMagneticForce(
    currentPos,
    socketPos,
    config.strength,
    config.radius
  );
  
  // Interpolate between start and target with magnetic influence
  const easedPosition = {
    x: lerp(state.startPosition.x, state.targetPosition.x, easedProgress),
    y: lerp(state.startPosition.y, state.targetPosition.y, easedProgress)
  };
  
  // Blend magnetic force with eased position
  const finalPosition = {
    x: easedPosition.x + magneticForce.x * (1 - easedProgress),
    y: easedPosition.y + magneticForce.y * (1 - easedProgress)
  };
  
  state.currentDuration = elapsed;
  socketEasingStates.set(stateKey, state);
  
  return finalPosition;
};

/**
 * Update socket easing for all joints
 * Should be called each frame to update magnetic forces
 */
export const updateSocketEasing = (
  joints: Record<string, Joint>,
  connectionOverrides: SkeletonState['connectionOverrides'],
  currentTime: number
): Record<string, Joint> => {
  const updatedJoints = { ...joints };
  
  for (const [key, config] of Object.entries(connectionOverrides)) {
    if (!config.socketEasing?.enabled) continue;
    
    // Parse connection key to get from/to joints
    const [fromId, toId] = key.split(':');
    const fromJoint = joints[fromId];
    const toJoint = joints[toId];
    
    if (!fromJoint || !toJoint) continue;
    
    // Get world positions
    const socketWorldPos = getWorldPosition(fromId, joints, joints, 'previewOffset');
    const currentWorldPos = getWorldPosition(toId, joints, joints, 'previewOffset');
    
    // Apply socket easing
    const easedWorldPos = applySocketEasing(
      toId,
      currentWorldPos,
      socketWorldPos,
      config.socketEasing,
      currentTime
    );
    
    // Convert back to local offset
    const parentWorldPos = fromJoint.parent 
      ? getWorldPosition(fromJoint.parent, joints, joints, 'previewOffset')
      : { x: 0, y: 0 };
    
    updatedJoints[toId] = {
      ...toJoint,
      previewOffset: {
        x: easedWorldPos.x - parentWorldPos.x,
        y: easedWorldPos.y - parentWorldPos.y
      }
    };
  }
  
  return updatedJoints;
};

/**
 * Reset socket easing state (useful when jumping to new poses)
 */
export const resetSocketEasing = (): void => {
  socketEasingStates.clear();
};

/**
 * Get socket easing state for debugging
 */
export const getSocketEasingState = (): Map<string, SocketEasingState> => {
  return new Map(socketEasingStates);
};

// Helper function to get world position (simplified version)
const getWorldPosition = (
  jointId: string,
  joints: Record<string, Joint>,
  baseJoints: Record<string, Joint>,
  offsetKey: 'currentOffset' | 'targetOffset' | 'previewOffset' = 'currentOffset'
): Point => {
  const joint = joints[jointId];
  if (!joint) return { x: 0, y: 0 };
  
  const offset = joint[offsetKey];
  if (!offset) return { x: 0, y: 0 };
  
  let pos = { ...offset };
  let currentId = joint.parent;
  
  while (currentId) {
    const parentJoint = joints[currentId];
    if (!parentJoint) break;
    
    const parentOffset = parentJoint[offsetKey];
    if (!parentOffset) break;
    
    pos = {
      x: pos.x + parentOffset.x,
      y: pos.y + parentOffset.y
    };
    currentId = parentJoint.parent;
  }
  
  return pos;
};
