import { strict as assert } from 'node:assert';

import { applyWheelDeltaLinear, applyWheelDeltaLog } from '../../client/src/components/wheelMath';

export const runWheelMathTests = () => {
  // linear clamps at bounds
  {
    const next = applyWheelDeltaLinear(10, 360, { min: 0, max: 10, step: 0.1 });
    assert.equal(next, 10);
  }
  {
    const next = applyWheelDeltaLinear(0, -360, { min: 0, max: 10, step: 0.1 });
    assert.equal(next, 0);
  }

  // linear step quantization
  {
    const next = applyWheelDeltaLinear(0, 18, { min: 0, max: 10, step: 1 }); // 18deg => 0.5
    assert.equal(next, 1);
  }

  // log mapping: monotonic and stable around 1.0
  {
    const a = applyWheelDeltaLog(1, 5, { min: 0.1, max: 10, step: 0.001 });
    const b = applyWheelDeltaLog(1, 10, { min: 0.1, max: 10, step: 0.001 });
    assert.ok(a > 1);
    assert.ok(b > a);
  }

  // log clamps at bounds
  {
    const next = applyWheelDeltaLog(10, 360, { min: 0.1, max: 10, step: 0.001 });
    assert.equal(next, 10);
  }
  {
    const next = applyWheelDeltaLog(0.1, -360, { min: 0.1, max: 10, step: 0.001 });
    assert.equal(next, 0.1);
  }
};

