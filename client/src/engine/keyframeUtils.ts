import type { TimelineKeyframe } from './types';

/**
 * Handles moving a keyframe from one frame to another with proper reordering
 * and bumping logic when sliding before the first frame.
 */
export const moveKeyframe = (
  keyframes: TimelineKeyframe[],
  fromFrame: number,
  toFrame: number,
  frameCount: number
): TimelineKeyframe[] => {
  // Clamp the target frame to valid range
  const clampedToFrame = Math.max(0, Math.min(frameCount - 1, toFrame));
  
  // Find the keyframe to move
  const keyframeIndex = keyframes.findIndex(k => k.frame === fromFrame);
  if (keyframeIndex === -1) return keyframes;
  
  const keyframeToMove = keyframes[keyframeIndex];
  
  // If target frame is the same, no change needed
  if (clampedToFrame === fromFrame) return keyframes;
  
  // Create a new array without the keyframe being moved
  const otherKeyframes = keyframes.filter(k => k.frame !== fromFrame);
  
  // Check if there's already a keyframe at the target frame
  const existingKeyframeIndex = otherKeyframes.findIndex(k => k.frame === clampedToFrame);
  
  if (existingKeyframeIndex === -1) {
    // No keyframe at target frame, just move it
    const movedKeyframe = { ...keyframeToMove, frame: clampedToFrame };
    const newKeyframes = [...otherKeyframes, movedKeyframe];
    return newKeyframes.sort((a, b) => a.frame - b.frame);
  }
  
  // There's already a keyframe at the target frame, need to bump
  const existingKeyframe = otherKeyframes[existingKeyframeIndex];
  
  if (clampedToFrame < fromFrame) {
    // Moving left - bump existing keyframes to the right
    const keyframesToBump = otherKeyframes.filter(k => k.frame >= clampedToFrame && k.frame < fromFrame);
    
    // Shift all bumped keyframes one frame to the right
    const bumpedKeyframes = keyframesToBump.map(k => ({ ...k, frame: k.frame + 1 }));
    
    // Create new array: keep keyframes before bump range, add moved keyframe, add bumped keyframes, keep rest
    const beforeBump = otherKeyframes.filter(k => k.frame < clampedToFrame);
    const afterBump = otherKeyframes.filter(k => k.frame > fromFrame);
    
    const newKeyframes = [
      ...beforeBump,
      { ...keyframeToMove, frame: clampedToFrame },
      ...bumpedKeyframes,
      ...afterBump
    ];
    
    return newKeyframes.sort((a, b) => a.frame - b.frame);
    
  } else {
    // Moving right - bump existing keyframes to the left
    const keyframesToBump = otherKeyframes.filter(k => k.frame > fromFrame && k.frame <= clampedToFrame);
    
    // Shift all bumped keyframes one frame to the left
    const bumpedKeyframes = keyframesToBump.map(k => ({ ...k, frame: k.frame - 1 }));
    
    // Create new array: keep keyframes before, add bumped keyframes, add moved keyframe, keep rest
    const beforeBump = otherKeyframes.filter(k => k.frame <= fromFrame);
    const afterBump = otherKeyframes.filter(k => k.frame > clampedToFrame);
    
    const newKeyframes = [
      ...beforeBump,
      ...bumpedKeyframes,
      { ...keyframeToMove, frame: clampedToFrame },
      ...afterBump
    ];
    
    return newKeyframes.sort((a, b) => a.frame - b.frame);
  }
};

/**
 * Finds the next available frame for a keyframe
 */
export const findNextAvailableFrame = (
  keyframes: TimelineKeyframe[],
  preferredFrame: number,
  frameCount: number,
  direction: 'forward' | 'backward' = 'forward'
): number => {
  const occupiedFrames = new Set(keyframes.map(k => k.frame));
  
  if (direction === 'forward') {
    for (let frame = preferredFrame; frame < frameCount; frame++) {
      if (!occupiedFrames.has(frame)) return frame;
    }
  } else {
    for (let frame = preferredFrame; frame >= 0; frame--) {
      if (!occupiedFrames.has(frame)) return frame;
    }
  }
  
  // If no available frame found, return the preferred frame (will need to bump)
  return preferredFrame;
};
