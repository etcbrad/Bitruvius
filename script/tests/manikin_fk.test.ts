import { strict as assert } from 'node:assert';

import { canonicalConnKey } from '../../client/src/app/connectionKey';
import { applyManikinFkRotation } from '../../client/src/engine/manikinFk';
import { makeDefaultState } from '../../client/src/engine/settings';
import { INITIAL_JOINTS } from '../../client/src/engine/model';
import type { Point, SkeletonState } from '../../client/src/engine/types';

const epsEq = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const epsPointEq = (a: Point, b: Point, eps = 1e-6) => epsEq(a.x, b.x, eps) && epsEq(a.y, b.y, eps);

const rotPoint = (p: Point, rad: number): Point => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export const runManikinFkTests = () => {
  // 1) Follow propagation (signed degrees)
  {
    const overrides: SkeletonState['connectionOverrides'] = {
      // allow full delta by setting a large per-step follow degree
      [canonicalConnKey('l_elbow', 'l_wrist')]: { fkFollowDeg: 180 },
      [canonicalConnKey('l_wrist', 'l_fingertip')]: { fkFollowDeg: 180 },
    };
    const delta = Math.PI / 2;
    const next = applyManikinFkRotation({
      joints: INITIAL_JOINTS,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: 'l_elbow',
      deltaRad: delta,
      connectionOverrides: overrides,
    });

    assert.ok(
      epsPointEq(next.l_elbow.previewOffset, rotPoint(INITIAL_JOINTS.l_elbow.previewOffset, delta), 1e-6),
      'expected l_elbow previewOffset to rotate with stretch',
    );
    assert.ok(
      epsPointEq(next.l_wrist.previewOffset, rotPoint(INITIAL_JOINTS.l_wrist.previewOffset, delta), 1e-6),
      'expected l_wrist previewOffset to rotate with stretch',
    );
    assert.ok(
      epsPointEq(next.l_fingertip.previewOffset, rotPoint(INITIAL_JOINTS.l_fingertip.previewOffset, delta), 1e-6),
      'expected l_fingertip previewOffset to rotate with stretch',
    );
  }

  // 2) Default off stops propagation
  {
    const overrides: SkeletonState['connectionOverrides'] = {};
    const delta = Math.PI / 2;
    const next = applyManikinFkRotation({
      joints: INITIAL_JOINTS,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: 'l_elbow',
      deltaRad: delta,
      connectionOverrides: overrides,
    });

    assert.ok(
      epsPointEq(next.l_elbow.previewOffset, rotPoint(INITIAL_JOINTS.l_elbow.previewOffset, delta), 1e-6),
      'expected l_elbow previewOffset to rotate',
    );
    assert.ok(
      epsPointEq(next.l_wrist.previewOffset, INITIAL_JOINTS.l_wrist.previewOffset, 1e-12),
      'expected l_wrist previewOffset unchanged when follow is off',
    );
  }

  // 3) Off blocks deeper follow
  {
    const overrides: SkeletonState['connectionOverrides'] = {
      [canonicalConnKey('l_wrist', 'l_fingertip')]: { fkFollowDeg: 180 },
    };
    const delta = Math.PI / 2;
    const next = applyManikinFkRotation({
      joints: INITIAL_JOINTS,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: 'l_elbow',
      deltaRad: delta,
      connectionOverrides: overrides,
    });

    assert.ok(
      epsPointEq(next.l_fingertip.previewOffset, INITIAL_JOINTS.l_fingertip.previewOffset, 1e-12),
      'expected l_fingertip previewOffset unchanged when ancestor edge is bend',
    );
  }

  // 4) Default: off (no per-connection follow)
  {
    const base = makeDefaultState();
    const keys = [
      canonicalConnKey('l_knee', 'l_ankle'),
      canonicalConnKey('l_ankle', 'l_toe'),
      canonicalConnKey('r_knee', 'r_ankle'),
      canonicalConnKey('r_ankle', 'r_toe'),
    ];
    for (const key of keys) {
      assert.equal(base.connectionOverrides[key]?.fkFollowDeg, undefined, `expected default fkFollowDeg unset for ${key}`);
    }
  }
};
