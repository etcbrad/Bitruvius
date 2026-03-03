import type { Joint, SkeletonState } from './types';
import { INITIAL_JOINTS } from './model';

export type ScalingSegment =
  | 'shoulderSpan'
  | 'brachialIndex'
  | 'antebrachialIndex'
  | 'handScale'
  | 'pelvicWidth'
  | 'femoralLength'
  | 'cruralLength'
  | 'reset';

const setJointOffsets = (joint: Joint, nextBase: Joint['baseOffset']): Joint => ({
  ...joint,
  baseOffset: nextBase,
  currentOffset: nextBase,
  targetOffset: nextBase,
  previewOffset: nextBase,
});

export const applyAtomicScaling = (state: SkeletonState, segment: ScalingSegment, factor: number): SkeletonState => {
  if (segment === 'reset') {
    return { ...state, joints: structuredClone(INITIAL_JOINTS) as SkeletonState['joints'] };
  }

  const joints = { ...state.joints };

  const scaleJoint = (jointId: string, scaleX: number, scaleY: number) => {
    const original = INITIAL_JOINTS[jointId];
    const current = joints[jointId];
    if (!original || !current) return;
    const next = { x: original.baseOffset.x * scaleX, y: original.baseOffset.y * scaleY };
    joints[jointId] = setJointOffsets(current, next);
  };

  switch (segment) {
    case 'shoulderSpan': {
      scaleJoint('l_clavicle', factor, 1);
      scaleJoint('r_clavicle', factor, 1);
      scaleJoint('l_shoulder', factor, 1);
      scaleJoint('r_shoulder', factor, 1);
      break;
    }
    case 'brachialIndex': {
      scaleJoint('l_elbow', factor, factor);
      scaleJoint('r_elbow', factor, factor);
      break;
    }
    case 'antebrachialIndex': {
      scaleJoint('l_wrist', factor, factor);
      scaleJoint('r_wrist', factor, factor);
      break;
    }
    case 'handScale': {
      scaleJoint('l_fingertip', factor, factor);
      scaleJoint('r_fingertip', factor, factor);
      break;
    }
    case 'pelvicWidth': {
      scaleJoint('l_hip', factor, 1);
      scaleJoint('r_hip', factor, 1);
      break;
    }
    case 'femoralLength': {
      scaleJoint('l_knee', factor, factor);
      scaleJoint('r_knee', factor, factor);
      break;
    }
    case 'cruralLength': {
      scaleJoint('l_ankle', factor, factor);
      scaleJoint('r_ankle', factor, factor);
      break;
    }
    default:
      return state;
  }

  return { ...state, joints };
};
