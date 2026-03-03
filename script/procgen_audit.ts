import { bakeProcgenLoop, createProcgenRuntime, stepProcgenPose } from '../client/src/engine/procedural';
import { INITIAL_JOINTS } from '../client/src/engine/model';
import { DEFAULT_PROCEDURAL_BITRUVIAN_GAIT, DEFAULT_PROCEDURAL_BITRUVIAN_IDLE, DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS } from '../client/src/engine/bitruvian/types';
import type { EnginePoseSnapshot, ProcgenOptions } from '../client/src/engine/types';

const makeNeutralPose = (): EnginePoseSnapshot => ({
  joints: Object.fromEntries(Object.entries(INITIAL_JOINTS).map(([id, j]) => [id, { ...j.previewOffset }])),
});

const stableClone = (v: any): any => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(stableClone);
  const out: Record<string, any> = {};
  for (const k of Object.keys(v).sort()) out[k] = stableClone(v[k]);
  return out;
};

const stableStringify = (v: unknown) => JSON.stringify(stableClone(v));

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

const neutral = makeNeutralPose();
const options: ProcgenOptions = {
  inPlace: true,
  groundingEnabled: true,
  pauseWhileDragging: false,
  groundPlaneY: 13,
  groundPlaneVisible: true,
};

// 1) Bake determinism
const a = bakeProcgenLoop({
  neutral,
  fps: 60,
  frameCount: 120,
  strength: 0.75,
  seed: 1234,
  mode: 'walk_in_place',
  gait: { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT },
  gaitEnabled: {},
  physics: { ...DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS },
  idle: { ...DEFAULT_PROCEDURAL_BITRUVIAN_IDLE },
  options,
  keyframeStep: 4,
});

const b = bakeProcgenLoop({
  neutral,
  fps: 60,
  frameCount: 120,
  strength: 0.75,
  seed: 1234,
  mode: 'walk_in_place',
  gait: { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT },
  gaitEnabled: {},
  physics: { ...DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS },
  idle: { ...DEFAULT_PROCEDURAL_BITRUVIAN_IDLE },
  options,
  keyframeStep: 4,
});

assert(stableStringify(a) === stableStringify(b), 'bakeProcgenLoop must be deterministic for a given seed');

// 2) Runtime stepping determinism
const r1 = createProcgenRuntime(999);
const r2 = createProcgenRuntime(999);
for (let i = 0; i < 240; i++) {
  const p1 = stepProcgenPose({
    runtime: r1,
    mode: 'walk_in_place',
    neutral,
    dtSec: 1 / 60,
    cycleFrames: 120,
    strength: 0.6,
    gait: { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT },
    gaitEnabled: {},
    physics: { ...DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS },
    idle: { ...DEFAULT_PROCEDURAL_BITRUVIAN_IDLE },
    options,
  });
  const p2 = stepProcgenPose({
    runtime: r2,
    mode: 'walk_in_place',
    neutral,
    dtSec: 1 / 60,
    cycleFrames: 120,
    strength: 0.6,
    gait: { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT },
    gaitEnabled: {},
    physics: { ...DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS },
    idle: { ...DEFAULT_PROCEDURAL_BITRUVIAN_IDLE },
    options,
  });
  assert(stableStringify(p1) === stableStringify(p2), `stepProcgenPose must be deterministic (frame ${i})`);
}

console.log('procgen audit: OK');
