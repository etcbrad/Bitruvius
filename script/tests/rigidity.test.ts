import { strict as assert } from 'node:assert';

import { applyDragToState } from '../../client/src/engine/interaction';
import { makeDefaultState } from '../../client/src/engine/settings';
import { INITIAL_JOINTS } from '../../client/src/engine/model';
import { getWorldPosition, vectorLength } from '../../client/src/engine/kinematics';
import { stepPosePhysics } from '../../client/src/engine/physics/posePhysics';
import { baseLength, buildWorldPoseFromJoints } from '../../client/src/engine/physics/xpbd';

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

  // Rigid cardboard hard limit: when a root ancestor is pinned, dragging beyond reach should clamp
  // to the fully-extended position instead of creating "tension flicker" from impossible constraints.
  {
    const anchorId = 'waist'; // Use waist as root in Pyxl puppet structure
    const effectorId = 'hand_l'; // Use hand_l instead of left_hand
    const anchor = INITIAL_JOINTS[anchorId];
    const eff = INITIAL_JOINTS[effectorId];
    assert.ok(anchor && !anchor.parent, `expected ${anchorId} to be a root joint`);
    assert.ok(eff && eff.parent, `expected ${effectorId} to have a parent`);

    let reach = 0;
    let current: string | null = effectorId;
    let depth = 0;
    while (current && current !== anchorId && depth < 64) {
      reach += baseLength(current, INITIAL_JOINTS);
      current = INITIAL_JOINTS[current]?.parent ?? null;
      depth += 1;
    }
    assert.equal(current, anchorId, `expected ${anchorId} to be an ancestor of ${effectorId}`);
    assert.ok(Number.isFinite(reach) && reach > 1e-6, `expected finite reach for ${effectorId}`);

    const anchorWorld = getWorldPosition(anchorId, base.joints, INITIAL_JOINTS, 'preview');
    const farTarget = { x: anchorWorld.x, y: anchorWorld.y + reach * 5 };

    const result = stepPosePhysics({
      joints: base.joints,
      activeRoots: [anchorId],
      rootTargets: { [anchorId]: anchorWorld },
      drag: { id: effectorId, target: farTarget },
      options: {
        dt: 1 / 60,
        iterations: 24,
        damping: 0.12,
        wireCompliance: 0.00025,
        rigidity: 'cardboard',
        hardStop: true,
        autoBend: false,
        stretchEnabled: false,
        bendEnabled: false,
      },
    });

    const w = buildWorldPoseFromJoints(result.joints, INITIAL_JOINTS, 'preview');
    const effWorld = w[effectorId];
    assert.ok(effWorld, `expected world pose to include ${effectorId}`);

    const dx = effWorld.x - anchorWorld.x;
    const dy = effWorld.y - anchorWorld.y;
    const d = Math.hypot(dx, dy);
    assert.ok(
      d <= reach + 1e-2,
      `Rigid cardboard drag should clamp to reach (expected <= ${reach}, got ${d})`,
    );

    // Should land near the fully-extended point along the drag direction.
    const expected = { x: anchorWorld.x, y: anchorWorld.y + reach };
    assert.ok(
      epsEq(effWorld.x, expected.x, 1e-2) && epsEq(effWorld.y, expected.y, 1e-2),
      `Rigid cardboard drag should clamp to fully-extended target (expected ${JSON.stringify(expected)}, got ${JSON.stringify(effWorld)})`,
    );
  }
};
