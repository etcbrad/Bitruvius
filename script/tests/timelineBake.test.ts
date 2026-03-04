import { strict as assert } from 'node:assert';

import { bakeRecordingIntoTimeline, type RecordingFrame } from '../../client/src/engine/autoPoseCapture';
import { vectorLength } from '../../client/src/engine/kinematics';
import { INITIAL_JOINTS } from '../../client/src/engine/model';
import { makeDefaultState } from '../../client/src/engine/settings';
import type { EnginePoseSnapshot } from '../../client/src/engine/types';

export const runTimelineBakeTests = () => {
  const base = makeDefaultState();

  const jointId =
    Object.keys(INITIAL_JOINTS).find((id) => {
      if (id === 'root') return false;
      const j = INITIAL_JOINTS[id];
      if (!j?.parent) return false;
      const len = vectorLength(j.baseOffset);
      return Number.isFinite(len) && len > 1e-6;
    }) ?? 'l_wrist';
  const baseJoint = INITIAL_JOINTS[jointId]!;
  assert.ok(baseJoint.parent, `expected ${jointId} to have a parent`);

  const baseLen = vectorLength(baseJoint.baseOffset);
  assert.ok(Number.isFinite(baseLen) && baseLen > 1e-6, `expected finite base length for ${jointId}`);

  const basePose: EnginePoseSnapshot = {
    joints: Object.fromEntries(Object.keys(INITIAL_JOINTS).map((id) => [id, { ...INITIAL_JOINTS[id]!.previewOffset }])),
  };

  const poseA: EnginePoseSnapshot = { joints: { ...basePose.joints, [jointId]: { x: baseLen, y: 0 } } };
  const poseB: EnginePoseSnapshot = { joints: { ...basePose.joints, [jointId]: { x: 0, y: baseLen } } };

  const state = {
    ...base,
    stretchEnabled: false,
    timeline: {
      ...base.timeline,
      enabled: true,
      clip: {
        ...base.timeline.clip,
        frameCount: 11,
        fps: 24,
        easing: 'linear' as const,
        keyframes: [
          { frame: 0, pose: poseA },
          { frame: 10, pose: poseB },
        ],
      },
    },
  };

  // Mutate the in-state baseOffset length for this joint to ensure baking uses canonical base joints
  // (not the live `state.joints`, which are mutable and may drift).
  const mutated = {
    ...state,
    joints: {
      ...state.joints,
      [jointId]: {
        ...state.joints[jointId],
        baseOffset: { x: state.joints[jointId].baseOffset.x * 2, y: state.joints[jointId].baseOffset.y * 2 },
      },
    },
  };

  const frames: RecordingFrame[] = [{ frame: 5, pose: basePose }];
  const movedJointIds = new Set<string>([jointId]);

  const baked = bakeRecordingIntoTimeline(mutated, frames, movedJointIds, basePose, 0);
  const k5 = baked.nextState.timeline.clip.keyframes.find((k) => k.frame === 5);
  assert.ok(k5, 'expected baked keyframe at frame 5');

  const bakedOffset = k5.pose.joints[jointId];
  assert.ok(bakedOffset, `expected baked pose to include ${jointId}`);

  const bakedLen = Math.hypot(bakedOffset.x, bakedOffset.y);
  assert.ok(
    Math.abs(bakedLen - baseLen) <= 1e-3,
    `expected baked pose length to match INITIAL_JOINTS base length (expected ${baseLen}, got ${bakedLen})`,
  );
};

