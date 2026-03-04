import { strict as assert } from 'node:assert';

import { capturePoseSnapshot } from '../../client/src/engine/timeline';
import { makeDefaultState } from '../../client/src/engine/settings';
import { createBitruviusRuntimeState, generateProceduralBitruviusPose } from '../../client/src/engine/bitruvian/proceduralBitruvius';

const epsEq = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

export const runProcgenGroundingTests = () => {
  const base = makeDefaultState();
  const neutral = capturePoseSnapshot(base.joints, 'preview');

  const frame = 0;
  const fps = 60;
  const cycleFrames = 60;
  const strength = 1;

  // Force a large grounding correction so `y_offset` becomes observable in the root joint.
  const options = {
    groundingEnabled: true,
    groundPlaneY: 9999,
  };

  const free = generateProceduralBitruviusPose({
    neutral,
    frame,
    fps,
    cycleFrames,
    strength,
    mode: 'walk',
    options: { ...options, inPlace: false },
    runtimeState: createBitruviusRuntimeState(),
  });

  const fixed = generateProceduralBitruviusPose({
    neutral,
    frame,
    fps,
    cycleFrames,
    strength,
    mode: 'walk',
    options: { ...options, inPlace: true },
    runtimeState: createBitruviusRuntimeState(),
  });

  const neutralRootY = neutral.joints.root?.y ?? 0;
  const freeRootY = free.joints.root?.y ?? 0;
  const fixedRootY = fixed.joints.root?.y ?? 0;

  assert.ok(
    Math.abs(freeRootY - neutralRootY) > 1e-3,
    `expected grounding to change root.y (neutral=${neutralRootY}, got=${freeRootY})`,
  );

  // Regression: `inPlace` should suppress lateral sliding, but not zero out vertical grounding.
  assert.ok(
    epsEq(fixedRootY, freeRootY, 1e-3),
    `expected inPlace to preserve grounded root.y (free=${freeRootY}, fixed=${fixedRootY})`,
  );
};

