import { strict as assert } from 'node:assert';

import { solveFabrikChainOffsets } from '../../client/src/engine/ik/fabrik';
import type { Joint, Point } from '../../client/src/engine/types';

const joint = (id: string, parent: string | null, offset: Point): Joint => ({
  id,
  label: id,
  parent,
  baseOffset: { ...offset },
  currentOffset: { ...offset },
  targetOffset: { ...offset },
  previewOffset: { ...offset },
});

const len = (v: Point) => Math.hypot(v.x, v.y);

export const runFabrikTests = () => {
  const baseJoints: Record<string, Joint> = {
    root: joint('root', null, { x: 0, y: 0 }),
    a: joint('a', 'root', { x: 1, y: 0 }),
    b: joint('b', 'a', { x: 1, y: 0 }),
  };

  const joints: Record<string, Joint> = Object.fromEntries(
    Object.entries(baseJoints).map(([id, j]) => [id, { ...j }]),
  );

  // Reachable: end effector should land at target (within tolerance), with segment lengths preserved.
  {
    const target = { x: 1, y: 1 };
    const offsets = solveFabrikChainOffsets(['root', 'a', 'b'], joints, baseJoints, target, false);
    assert.ok(offsets, 'expected offsets');

    const end = { x: offsets!.a.x + offsets!.b.x, y: offsets!.a.y + offsets!.b.y };
    const err = Math.hypot(end.x - target.x, end.y - target.y);
    assert.ok(err <= 1e-2, `expected end effector near ${JSON.stringify(target)}, got ${JSON.stringify(end)}`);

    assert.ok(Math.abs(len(offsets!.a) - 1) <= 1e-3, 'expected segment a length ≈ 1');
    assert.ok(Math.abs(len(offsets!.b) - 1) <= 1e-3, 'expected segment b length ≈ 1');
  }

  // Unreachable: should fully extend in the direction of the target.
  {
    const target = { x: 0, y: 3 };
    const offsets = solveFabrikChainOffsets(['root', 'a', 'b'], joints, baseJoints, target, false);
    assert.ok(offsets, 'expected offsets');

    const end = { x: offsets!.a.x + offsets!.b.x, y: offsets!.a.y + offsets!.b.y };
    assert.ok(
      Math.abs(end.x) <= 1e-6 && Math.abs(end.y - 2) <= 1e-6,
      `expected end effector to clamp at (0,2), got ${JSON.stringify(end)}`,
    );
  }

  // Non-finite targets should fail fast.
  {
    const offsets = solveFabrikChainOffsets(['root', 'a', 'b'], joints, baseJoints, { x: NaN, y: 0 }, false);
    assert.equal(offsets, null);
  }
};

