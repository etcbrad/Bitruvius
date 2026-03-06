import { strict as assert } from 'node:assert';

import { runRigidityTests } from './rigidity.test';
import { runProcgenGroundingTests } from './procgen_grounding.test';
import { runControlSettingsTests } from './controlSettings.test';
import { runFabrikTests } from './fabrik.test';
import { runInvariantTests } from './invariants.test';
import { runModelSimplifyTests } from './modelSimplify.test';
import { runTimelineBakeTests } from './timelineBake.test';
import { runManikinFkTests } from './manikin_fk.test';
import { runWheelMathTests } from './wheel_math.test';

const tests: Array<{ name: string; fn: () => void }> = [
  { name: 'rigidity', fn: runRigidityTests },
  { name: 'procgen_grounding', fn: runProcgenGroundingTests },
  { name: 'controlSettings', fn: runControlSettingsTests },
  { name: 'fabrik', fn: runFabrikTests },
  { name: 'invariants', fn: runInvariantTests },
  { name: 'model_simplify', fn: runModelSimplifyTests },
  { name: 'timeline_bake', fn: runTimelineBakeTests },
  { name: 'manikin_fk', fn: runManikinFkTests },
  { name: 'wheel_math', fn: runWheelMathTests },
];

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    // eslint-disable-next-line no-console
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    // eslint-disable-next-line no-console
    console.error(`not ok - ${t.name}`);
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

assert.equal(failed, 0, `${failed} test(s) failed`);
