import { strict as assert } from 'node:assert';

import { CONNECTIONS, INITIAL_JOINTS, SLENDERBIT_JOINTS } from '../../client/src/engine/model';

const canonicalConnKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export const runModelSimplifyTests = () => {
  // Joints: nipples removed entirely.
  assert.ok(!('l_nipple' in INITIAL_JOINTS), 'expected INITIAL_JOINTS to not contain l_nipple');
  assert.ok(!('r_nipple' in INITIAL_JOINTS), 'expected INITIAL_JOINTS to not contain r_nipple');
  assert.ok(!('l_nipple' in SLENDERBIT_JOINTS), 'expected SLENDERBIT_JOINTS to not contain l_nipple');
  assert.ok(!('r_nipple' in SLENDERBIT_JOINTS), 'expected SLENDERBIT_JOINTS to not contain r_nipple');

  // Connections: bones-only + no stretching modes.
  for (const c of CONNECTIONS) {
    assert.equal(c.type, 'bone', `expected connection type to be bone for ${c.from}→${c.to}`);
    assert.ok(c.stretchMode !== 'stretch', `expected no stretchMode='stretch' for ${c.from}→${c.to}`);
    assert.ok(c.stretchMode !== 'elastic', `expected no stretchMode='elastic' for ${c.from}→${c.to}`);
  }

  const connKeys = new Set(CONNECTIONS.map((c) => canonicalConnKey(c.from, c.to)));
  const requireConn = (a: string, b: string) => {
    const k = canonicalConnKey(a, b);
    assert.ok(connKeys.has(k), `expected CONNECTIONS to include ${k}`);
  };

  // Spine / head
  requireConn('navel', 'sternum');
  requireConn('sternum', 'collar');
  requireConn('collar', 'neck_base');
  requireConn('neck_base', 'skull');
  requireConn('skull', 'head');

  // Left arm
  requireConn('collar', 'l_clavicle');
  requireConn('l_clavicle', 'l_bicep');
  requireConn('l_bicep', 'l_elbow');
  requireConn('l_elbow', 'l_wrist');
  requireConn('l_wrist', 'l_fingertip');

  // Right arm
  requireConn('collar', 'r_clavicle');
  requireConn('r_clavicle', 'r_bicep');
  requireConn('r_bicep', 'r_elbow');
  requireConn('r_elbow', 'r_wrist');
  requireConn('r_wrist', 'r_fingertip');

  // Left leg
  requireConn('navel', 'l_hip');
  requireConn('l_hip', 'l_knee');
  requireConn('l_knee', 'l_ankle');
  requireConn('l_ankle', 'l_toe');

  // Right leg
  requireConn('navel', 'r_hip');
  requireConn('r_hip', 'r_knee');
  requireConn('r_knee', 'r_ankle');
  requireConn('r_ankle', 'r_toe');
};
