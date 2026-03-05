import type { SkeletonState } from './types';
import { INITIAL_JOINTS } from './model';
import { getWorldPosition } from './kinematics';

export const applyArmLengthAdjustment = (state: SkeletonState, scaleFactor: number = 0.75): SkeletonState => {
  const nextJoints = { ...state.joints };
  const armChains = {
    left: ['collar', 'l_clavicle', 'l_bicep', 'l_elbow', 'l_wrist', 'l_fingertip'],
    right: ['collar', 'r_clavicle', 'r_bicep', 'r_elbow', 'r_wrist', 'r_fingertip'],
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
    ['l_clavicle', 'r_clavicle'],
    ['l_bicep', 'r_bicep'],
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

  const segments = [
    // Left arm segments
    { name: 'l_clavicle_inner', from: 'collar', to: 'l_clavicle' },
    { name: 'l_clavicle_outer', from: 'l_clavicle', to: 'l_bicep' },
    { name: 'l_humerus', from: 'l_bicep', to: 'l_elbow' },
    { name: 'l_radius', from: 'l_elbow', to: 'l_wrist' },
    { name: 'l_hand', from: 'l_wrist', to: 'l_fingertip' },
    // Right arm segments
    { name: 'r_clavicle_inner', from: 'collar', to: 'r_clavicle' },
    { name: 'r_clavicle_outer', from: 'r_clavicle', to: 'r_bicep' },
    { name: 'r_humerus', from: 'r_bicep', to: 'r_elbow' },
    { name: 'r_radius', from: 'r_elbow', to: 'r_wrist' },
    { name: 'r_hand', from: 'r_wrist', to: 'r_fingertip' },
  ];

  for (const segment of segments) {
    if (!(segment.from in state.joints) && !(segment.from in INITIAL_JOINTS)) continue;
    if (!(segment.to in state.joints) && !(segment.to in INITIAL_JOINTS)) continue;
    const a = getWorldPosition(segment.from, state.joints, INITIAL_JOINTS, 'preview');
    const b = getWorldPosition(segment.to, state.joints, INITIAL_JOINTS, 'preview');
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    lengths[segment.name] = Math.hypot(dx, dy);
  }

  return lengths;
};

export const toggleMirroringWithSymmetry = (state: SkeletonState): SkeletonState => {
  const newMirroring = !state.mirroring;
  if (!newMirroring) return { ...state, mirroring: false };

  const nextJoints = { ...state.joints };
  const leftArmJoints = ['l_clavicle', 'l_bicep', 'l_elbow', 'l_wrist', 'l_fingertip'];
  const rightArmJoints = ['r_clavicle', 'r_bicep', 'r_elbow', 'r_wrist', 'r_fingertip'];

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
