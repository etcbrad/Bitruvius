import type { SkeletonState } from './types';
import { INITIAL_JOINTS } from './model';

export const applyArmLengthAdjustment = (state: SkeletonState, scaleFactor: number = 0.75): SkeletonState => {
  const nextJoints = { ...state.joints };
  const armChains = {
    left: ['collar', 'l_shoulder', 'l_elbow', 'l_wrist', 'l_fingertip'],
    right: ['collar', 'r_shoulder', 'r_elbow', 'r_wrist', 'r_fingertip'],
  };

  for (const chain of Object.values(armChains)) {
    for (let i = 1; i < chain.length; i++) {
      const jointId = chain[i];
      const original = INITIAL_JOINTS[jointId];
      const current = nextJoints[jointId];
      if (!original || !current) continue;
      const scaledBaseOffset = {
        x: original.baseOffset.x * scaleFactor,
        y: original.baseOffset.y * scaleFactor,
      };
      nextJoints[jointId] = {
        ...current,
        baseOffset: scaledBaseOffset,
        currentOffset: scaledBaseOffset,
        targetOffset: scaledBaseOffset,
        previewOffset: scaledBaseOffset,
      };
    }
  }

  return { ...state, joints: nextJoints };
};

export const validateArmSymmetry = (
  state: SkeletonState,
  tolerance: number = 0.01,
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const joints = state.joints;

  const mirrorPairs: Array<[string, string]> = [
    ['l_shoulder', 'r_shoulder'],
    ['l_elbow', 'r_elbow'],
    ['l_wrist', 'r_wrist'],
    ['l_fingertip', 'r_fingertip'],
  ];

  for (const [leftId, rightId] of mirrorPairs) {
    const leftJoint = joints[leftId];
    const rightJoint = joints[rightId];
    if (!leftJoint || !rightJoint) continue;

    const expectedRightX = -leftJoint.baseOffset.x;
    const xDiff = Math.abs(rightJoint.baseOffset.x - expectedRightX);
    if (xDiff > tolerance) {
      errors.push(
        `${leftId}/${rightId} X symmetry mismatch: expected ${expectedRightX.toFixed(3)}, got ${rightJoint.baseOffset.x.toFixed(3)}`,
      );
    }

    const yDiff = Math.abs(rightJoint.baseOffset.y - leftJoint.baseOffset.y);
    if (yDiff > tolerance) {
      errors.push(
        `${leftId}/${rightId} Y symmetry mismatch: expected ${leftJoint.baseOffset.y.toFixed(3)}, got ${rightJoint.baseOffset.y.toFixed(3)}`,
      );
    }
  }

  return { isValid: errors.length === 0, errors };
};

export const getArmSegmentLengths = (state: SkeletonState): Record<string, number> => {
  const lengths: Record<string, number> = {};
  const joints = state.joints;

  const segments = [
    { name: 'l_clavicle', from: 'collar', to: 'l_shoulder' },
    { name: 'l_humerus', from: 'l_shoulder', to: 'l_elbow' },
    { name: 'l_radius', from: 'l_elbow', to: 'l_wrist' },
    { name: 'l_hand', from: 'l_wrist', to: 'l_fingertip' },
    { name: 'r_clavicle', from: 'collar', to: 'r_shoulder' },
    { name: 'r_humerus', from: 'r_shoulder', to: 'r_elbow' },
    { name: 'r_radius', from: 'r_elbow', to: 'r_wrist' },
    { name: 'r_hand', from: 'r_wrist', to: 'r_fingertip' },
  ];

  for (const segment of segments) {
    const fromJoint = joints[segment.from];
    const toJoint = joints[segment.to];
    if (!fromJoint || !toJoint) continue;
    const dx = toJoint.baseOffset.x - fromJoint.baseOffset.x;
    const dy = toJoint.baseOffset.y - fromJoint.baseOffset.y;
    lengths[segment.name] = Math.sqrt(dx * dx + dy * dy);
  }

  return lengths;
};

export const toggleMirroringWithSymmetry = (state: SkeletonState): SkeletonState => {
  const newMirroring = !state.mirroring;
  if (!newMirroring) return { ...state, mirroring: false };

  const nextJoints = { ...state.joints };
  const leftArmJoints = ['l_shoulder', 'l_elbow', 'l_wrist', 'l_fingertip'];
  const rightArmJoints = ['r_shoulder', 'r_elbow', 'r_wrist', 'r_fingertip'];

  for (let i = 0; i < leftArmJoints.length; i++) {
    const leftId = leftArmJoints[i];
    const rightId = rightArmJoints[i];
    const leftJoint = nextJoints[leftId];
    const rightJoint = nextJoints[rightId];
    if (!leftJoint || !rightJoint) continue;

    nextJoints[rightId] = {
      ...rightJoint,
      baseOffset: { x: -leftJoint.baseOffset.x, y: leftJoint.baseOffset.y },
      currentOffset: { x: -leftJoint.currentOffset.x, y: leftJoint.currentOffset.y },
      targetOffset: { x: -leftJoint.targetOffset.x, y: leftJoint.targetOffset.y },
      previewOffset: { x: -leftJoint.previewOffset.x, y: leftJoint.previewOffset.y },
    };
  }

  return { ...state, mirroring: true, joints: nextJoints };
};

