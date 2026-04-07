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

  // Pyxl Puppet DragonBones-style structure with collar as direct socket parent
  requireConn('waist', 'torso');
  requireConn('torso', 'collar');
  requireConn('collar', 'head');

  // Direct arm connections - collar → bicep → forearm → hand
  // Collar acts as the socket parent for arms
  requireConn('collar', 'bicep_l');
  requireConn('bicep_l', 'forearm_l');
  requireConn('forearm_l', 'hand_l');

  requireConn('collar', 'bicep_r');
  requireConn('bicep_r', 'forearm_r');
  requireConn('forearm_r', 'hand_r');

  // Left leg chain
  requireConn('waist', 'thigh_l');
  requireConn('thigh_l', 'shin_l');
  requireConn('shin_l', 'foot_l');

  // Right leg chain
  requireConn('waist', 'thigh_r');
  requireConn('thigh_r', 'shin_r');
  requireConn('shin_r', 'foot_r');
};
