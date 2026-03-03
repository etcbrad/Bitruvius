import { strict as assert } from 'node:assert';

import { applyDragToState } from '../../client/src/engine/interaction';
import { makeDefaultState } from '../../client/src/engine/settings';
import { INITIAL_JOINTS } from '../../client/src/engine/model';
import { getWorldPosition, vectorLength } from '../../client/src/engine/kinematics';

const epsEq = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

export const runRigidityTests = () => {
  const base = makeDefaultState();

  // Pick a non-root joint with a parent.
  const jointId =
    Object.keys(INITIAL_JOINTS).find((id) => {
      if (id === 'root') return false;
      const j = INITIAL_JOINTS[id];
      if (!j?.parent) return false;
      const len = vectorLength(j.baseOffset);
      return Number.isFinite(len) && len > 1e-6;
    }) ?? 'l_wrist';

  const state = {
    ...base,
    controlMode: 'Cardboard' as const,
    // Even if global stretch is on, Cardboard FK should preserve base bone lengths.
    stretchEnabled: true,
  };

  const joint = state.joints[jointId];
  assert.ok(joint?.parent, `expected ${jointId} to have a parent`);

  const baseLen = vectorLength(joint.baseOffset);
  assert.ok(Number.isFinite(baseLen) && baseLen > 1e-9, `expected finite base length for ${jointId}`);

  const parentWorld = getWorldPosition(joint.parent!, state.joints, INITIAL_JOINTS, 'preview');

  // Drag far away to try to stretch the segment.
  const targetWorld = { x: parentWorld.x + baseLen * 5, y: parentWorld.y + baseLen * 3 };
  const next = applyDragToState(state, jointId, targetWorld);

  const nextLen = vectorLength(next.joints[jointId].previewOffset);
  assert.ok(
    epsEq(nextLen, baseLen, 1e-4),
    `Cardboard FK should preserve base length for ${jointId} (expected ${baseLen}, got ${nextLen})`,
  );
};
