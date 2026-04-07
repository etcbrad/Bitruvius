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
  // 1) Follow propagation (signed degrees) - collar as direct socket parent
  {
    const overrides: SkeletonState['connectionOverrides'] = {
      // allow full delta by setting a large per-step follow degree
      [canonicalConnKey('collar', 'bicep_l')]: { fkFollowDeg: 180 },
      [canonicalConnKey('bicep_l', 'forearm_l')]: { fkFollowDeg: 180 },
      [canonicalConnKey('forearm_l', 'hand_l')]: { fkFollowDeg: 180 },
    };
    const delta = Math.PI / 2;
    const next = applyManikinFkRotation({
      joints: INITIAL_JOINTS,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: 'collar',
      deltaRad: delta,
      connectionOverrides: overrides,
    });

    assert.ok(
      epsPointEq(next.collar.previewOffset, rotPoint(INITIAL_JOINTS.collar.previewOffset, delta), 1e-6),
      'expected collar previewOffset to rotate with stretch',
    );
    assert.ok(
      epsPointEq(next.bicep_l.previewOffset, rotPoint(INITIAL_JOINTS.bicep_l.previewOffset, delta), 1e-6),
      'expected bicep_l previewOffset to rotate with stretch',
    );
    assert.ok(
      epsPointEq(next.forearm_l.previewOffset, rotPoint(INITIAL_JOINTS.forearm_l.previewOffset, delta), 1e-6),
      'expected forearm_l previewOffset to rotate with stretch',
    );
    assert.ok(
      epsPointEq(next.hand_l.previewOffset, rotPoint(INITIAL_JOINTS.hand_l.previewOffset, delta), 1e-6),
      'expected hand_l previewOffset to rotate with stretch',
    );
  }

  // 2) Default off stops propagation - collar as direct socket parent
  {
    const overrides: SkeletonState['connectionOverrides'] = {};
    const delta = Math.PI / 2;
    const next = applyManikinFkRotation({
      joints: INITIAL_JOINTS,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: 'collar',
      deltaRad: delta,
      connectionOverrides: overrides,
    });

    assert.ok(
      epsPointEq(next.collar.previewOffset, rotPoint(INITIAL_JOINTS.collar.previewOffset, delta), 1e-6),
      'expected collar previewOffset to rotate',
    );
    assert.ok(
      epsPointEq(next.bicep_l.previewOffset, INITIAL_JOINTS.bicep_l.previewOffset, 1e-12),
      'expected bicep_l previewOffset unchanged when follow is off',
    );
    assert.ok(
      epsPointEq(next.forearm_l.previewOffset, INITIAL_JOINTS.forearm_l.previewOffset, 1e-12),
      'expected forearm_l previewOffset unchanged when follow is off',
    );
    assert.ok(
      epsPointEq(next.hand_l.previewOffset, INITIAL_JOINTS.hand_l.previewOffset, 1e-12),
      'expected hand_l previewOffset unchanged when follow is off',
    );
  }

  // 3) Off blocks deeper follow - rigid collar waist structure
  {
    const overrides: SkeletonState['connectionOverrides'] = {};
    const delta = Math.PI / 2;
    const next = applyManikinFkRotation({
      joints: INITIAL_JOINTS,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: 'waist',
      deltaRad: delta,
      connectionOverrides: overrides,
    });

    assert.ok(
      epsPointEq(next.hand_l.previewOffset, INITIAL_JOINTS.hand_l.previewOffset, 1e-12),
      'expected hand_l previewOffset unchanged when ancestor edge is bend',
    );
  }

  // 4) Default: calibrated FK follow degrees - collar as direct socket parent
  {
    const base = makeDefaultState();
    const rigidConnections = [
      // Rigid spine connections (75 degrees)
      canonicalConnKey('waist', 'torso'),
      canonicalConnKey('torso', 'collar'),
      canonicalConnKey('collar', 'head'),
      
      // Hip connections (60 degrees)
      canonicalConnKey('waist', 'thigh_l'),
      canonicalConnKey('waist', 'thigh_r'),
    ];
    
    const flexibleConnections = [
      // Flexible arm connections (85 degrees) - collar as direct socket parent
      canonicalConnKey('collar', 'bicep_l'),
      canonicalConnKey('bicep_l', 'forearm_l'),
      canonicalConnKey('forearm_l', 'hand_l'),
      canonicalConnKey('collar', 'bicep_r'),
      canonicalConnKey('bicep_r', 'forearm_r'),
      canonicalConnKey('forearm_r', 'hand_r'),
      
      // Flexible leg connections (80 degrees)
      canonicalConnKey('thigh_l', 'shin_l'),
      canonicalConnKey('shin_l', 'foot_l'),
      canonicalConnKey('thigh_r', 'shin_r'),
      canonicalConnKey('shin_r', 'foot_r'),
    ];
    
    // Test rigid connections
    for (const key of rigidConnections) {
      const expectedValue = key.includes('thigh') ? 60 : 75; // Thigh connections are 60°, spine is 75°
      assert.equal(base.connectionOverrides[key]?.fkFollowDeg, expectedValue, `expected default fkFollowDeg=${expectedValue} for ${key}`);
    }
    
    // Test flexible connections
    for (const key of flexibleConnections) {
      const expectedValue = (key.includes('collar') || key.includes('bicep') || key.includes('forearm') || key.includes('hand')) ? 85 : 80; // All arm connections are 85°, leg connections are 80°
      assert.equal(base.connectionOverrides[key]?.fkFollowDeg, expectedValue, `expected default fkFollowDeg=${expectedValue} for ${key}`);
    }
  }
};
