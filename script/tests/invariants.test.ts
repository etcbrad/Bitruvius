import { strict as assert } from 'node:assert';

import { applyBalanceDragToState, applyDragToState } from '../../client/src/engine/interaction';
import { makeDefaultState } from '../../client/src/engine/settings';
import { INITIAL_JOINTS } from '../../client/src/engine/model';
import { getWorldPosition } from '../../client/src/engine/kinematics';

const isFinitePoint = (p: { x: number; y: number }) => Number.isFinite(p.x) && Number.isFinite(p.y);

export const runInvariantTests = () => {
  const base = makeDefaultState();

  // Guard rails: drag should no-op for invalid targets (prevents NaN cascades).
  {
    const bad = applyDragToState(base, 'navel', { x: Number.NaN, y: 0 });
    assert.equal(bad, base, 'applyDragToState should return prev for NaN target');
  }

  // "No NaN" sanity: a few balance drags with pinned feet should keep all offsets finite.
  {
    const pinnedWorld = {
      l_ankle: getWorldPosition('l_ankle', base.joints, INITIAL_JOINTS, 'preview'),
      r_ankle: getWorldPosition('r_ankle', base.joints, INITIAL_JOINTS, 'preview'),
    };
    assert.ok(isFinitePoint(pinnedWorld.l_ankle) && isFinitePoint(pinnedWorld.r_ankle), 'expected finite ankle pins');

    let state = {
      ...base,
      controlMode: 'IK' as const,
      activeRoots: ['l_ankle', 'r_ankle'],
    };

    for (let i = 0; i < 12; i += 1) {
      const headWorld = getWorldPosition('head', state.joints, INITIAL_JOINTS, 'preview');
      const target = { x: headWorld.x + 0.12, y: headWorld.y + 0.06 };
      state = applyBalanceDragToState(state, 'head', target, pinnedWorld);
    }

    for (const [id, joint] of Object.entries(state.joints)) {
      assert.ok(isFinitePoint(joint.previewOffset), `expected finite previewOffset for ${id}`);
      assert.ok(isFinitePoint(joint.targetOffset), `expected finite targetOffset for ${id}`);
      assert.ok(isFinitePoint(joint.currentOffset), `expected finite currentOffset for ${id}`);
    }
  }
};

