import { fromAngleDeg, toAngleDeg, vectorLength } from './kinematics';
import type { EnginePoseSnapshot, Point, ProcgenMode, ProcgenOptions, TimelineKeyframe } from './types';
import { generateProceduralBitruviusPose } from './bitruvian/proceduralBitruvius';
import type { IdleSettings, PhysicsControls, WalkingEngineGait } from './bitruvian/types';
import { createRng, type Rng } from './rng';
import { createBitruviusRuntimeState, resetBitruviusRuntimeState, type BitruviusRuntimeState } from './bitruvian/proceduralBitruvius';
import { clamp } from '../utils';

export type ProceduralMode = 'idle' | 'walk' | 'procedural-bitruvius';

const rotateOffset = (v: Point, deltaDeg: number): Point => {
  const len = vectorLength(v);
  if (!len) return v;
  const a = toAngleDeg(v);
  return fromAngleDeg(a + deltaDeg, len);
};

const clonePose = (pose: EnginePoseSnapshot): EnginePoseSnapshot => ({
  joints: Object.fromEntries(Object.entries(pose.joints).map(([k, v]) => [k, { x: v.x, y: v.y }])),
});

export const generateProceduralPose = (args: {
  mode: ProceduralMode;
  neutral: EnginePoseSnapshot;
  frame: number;
  fps: number;
  cycleFrames: number;
  strength: number;
}): EnginePoseSnapshot => {
  const { mode, neutral, frame, fps, cycleFrames, strength } = args;

  if (mode === 'procedural-bitruvius') {
    return generateProceduralBitruviusPose({
      neutral,
      frame,
      fps,
      cycleFrames,
      strength,
      mode: 'walk', // Default to walk for Bitruvius
      timeMs: Date.now(),
    });
  }

  const out = clonePose(neutral);

  const safeCycle = Math.max(2, Math.floor(cycleFrames));
  const phase = ((frame % safeCycle) / safeCycle) * Math.PI * 2;
  const s = Math.sin(phase);
  const c = Math.cos(phase);

  if (mode === 'idle') {
    const breathe = Math.sin((frame / Math.max(1, fps)) * Math.PI * 2 * 0.25) * 0.15 * strength;
    if (out.joints.navel) out.joints.navel = { x: out.joints.navel.x, y: out.joints.navel.y + breathe };
    if (out.joints.sternum) out.joints.sternum = rotateOffset(out.joints.sternum, s * 2.5 * strength);
    if (out.joints.collar) out.joints.collar = rotateOffset(out.joints.collar, -s * 2.0 * strength);
    if (out.joints.neck_base) out.joints.neck_base = rotateOffset(out.joints.neck_base, s * 1.5 * strength);
    if (out.joints.head) out.joints.head = rotateOffset(out.joints.head, -s * 1.0 * strength);
    if (out.joints.l_shoulder) out.joints.l_shoulder = rotateOffset(out.joints.l_shoulder, s * 1.5 * strength);
    if (out.joints.r_shoulder) out.joints.r_shoulder = rotateOffset(out.joints.r_shoulder, -s * 1.5 * strength);
    return out;
  }

  // Walk cycle: simple swing + bounce, designed to look decent with FK and constraints.
  const bounce = Math.max(0, Math.sin(phase * 2)) * 0.25 * strength;
  if (out.joints.navel) out.joints.navel = { x: out.joints.navel.x + c * 0.1 * strength, y: out.joints.navel.y - bounce };

  const legSwingDeg = 28 * strength;
  const ankleSwingDeg = 18 * strength;
  const armSwingDeg = 22 * strength;

  const l = phase;
  const r = phase + Math.PI;

  if (out.joints.l_knee) out.joints.l_knee = rotateOffset(out.joints.l_knee, Math.sin(l) * legSwingDeg);
  if (out.joints.r_knee) out.joints.r_knee = rotateOffset(out.joints.r_knee, Math.sin(r) * legSwingDeg);

  if (out.joints.l_ankle) out.joints.l_ankle = rotateOffset(out.joints.l_ankle, Math.sin(l) * ankleSwingDeg - Math.max(0, Math.sin(l)) * 10 * strength);
  if (out.joints.r_ankle) out.joints.r_ankle = rotateOffset(out.joints.r_ankle, Math.sin(r) * ankleSwingDeg - Math.max(0, Math.sin(r)) * 10 * strength);

  if (out.joints.l_elbow) out.joints.l_elbow = rotateOffset(out.joints.l_elbow, -Math.sin(l) * armSwingDeg);
  if (out.joints.r_elbow) out.joints.r_elbow = rotateOffset(out.joints.r_elbow, -Math.sin(r) * armSwingDeg);

  if (out.joints.l_wrist) out.joints.l_wrist = rotateOffset(out.joints.l_wrist, -Math.sin(l) * (armSwingDeg * 0.6));
  if (out.joints.r_wrist) out.joints.r_wrist = rotateOffset(out.joints.r_wrist, -Math.sin(r) * (armSwingDeg * 0.6));

  if (out.joints.sternum) out.joints.sternum = rotateOffset(out.joints.sternum, -Math.sin(phase) * 2.0 * strength);
  if (out.joints.head) out.joints.head = rotateOffset(out.joints.head, Math.sin(phase) * 1.5 * strength);

  return out;
};

export type ProcgenRuntime = {
  seed: number;
  tSec: number;
  frame: number;
  rng: Rng;
  bitruvius: BitruviusRuntimeState;
};

export const createProcgenRuntime = (seed: number): ProcgenRuntime => ({
  seed,
  tSec: 0,
  frame: 0,
  rng: createRng(seed >>> 0),
  bitruvius: createBitruviusRuntimeState(),
});

export const resetProcgenRuntime = (runtime: ProcgenRuntime, seed?: number) => {
  runtime.seed = seed ?? runtime.seed;
  runtime.tSec = 0;
  runtime.frame = 0;
  runtime.rng = createRng((runtime.seed >>> 0) || 0);
  resetBitruviusRuntimeState(runtime.bitruvius);
};

export const stepProcgenPose = (args: {
  runtime: ProcgenRuntime;
  mode: ProcgenMode;
  neutral: EnginePoseSnapshot;
  dtSec: number;
  cycleFrames: number;
  strength: number;
  gait: WalkingEngineGait;
  gaitEnabled?: Partial<Record<keyof WalkingEngineGait, boolean>>;
  physics: PhysicsControls;
  idle: IdleSettings;
  options: ProcgenOptions;
}): EnginePoseSnapshot => {
  const { runtime, mode, neutral, dtSec, strength, gait, gaitEnabled, physics, idle, options, cycleFrames } = args;
  const fps = 60;
  const safeCycleFrames = clamp(Math.floor(cycleFrames || 0), 2, 600);
  runtime.tSec += Math.max(0, dtSec);
  const nextFrame = Math.floor(runtime.tSec * fps);
  runtime.frame = nextFrame % safeCycleFrames;
  const timeMs = Math.floor(runtime.tSec * 1000);

  const gaitOverrides: Partial<WalkingEngineGait> = {};
  (Object.keys(gait) as Array<keyof WalkingEngineGait>).forEach((k) => {
    if (gaitEnabled && gaitEnabled[k] === false) return;
    gaitOverrides[k] = gait[k];
  });

  const runBoostedGait = (() => {
    if (mode !== 'run_in_place') return gaitOverrides;
    const boosted: Partial<WalkingEngineGait> = { ...gaitOverrides };
    const mul = <K extends keyof WalkingEngineGait>(k: K, factor: number, min: number, max: number) => {
      const v = boosted[k];
      if (typeof v !== 'number') return;
      boosted[k] = clamp(v * factor, min, max);
    };
    const add = <K extends keyof WalkingEngineGait>(k: K, delta: number, min: number, max: number) => {
      const v = boosted[k];
      if (typeof v !== 'number') return;
      boosted[k] = clamp(v + delta, min, max);
    };

    mul('stride', 1.35, 0, 2);
    mul('intensity', 1.6, 0, 2);
    add('gravity', 0.08, 0, 1);
    add('hover_height', 0.15, 0, 1);
    mul('arm_swing', 1.2, 0, 2);
    add('kick_up_force', 0.4, 0, 1);
    add('lean', 0.2, -1, 1);
    mul('elbow_bend', 1.15, 0, 1.5);

    return boosted;
  })();

  return generateProceduralBitruviusPose({
    neutral,
    frame: runtime.frame,
    fps,
    cycleFrames: safeCycleFrames,
    strength,
    mode: mode === 'idle' ? 'idle' : 'walk',
    gait: runBoostedGait,
    physics,
    idle,
    options,
    runtimeState: runtime.bitruvius,
    rng: runtime.rng,
    timeMs,
  });
};

export const bakeProcgenLoop = (args: {
  neutral: EnginePoseSnapshot;
  fps: number;
  frameCount: number;
  strength: number;
  seed: number;
  mode: ProcgenMode;
  gait: WalkingEngineGait;
  gaitEnabled?: Partial<Record<keyof WalkingEngineGait, boolean>>;
  physics: PhysicsControls;
  idle: IdleSettings;
  options: ProcgenOptions;
  keyframeStep: number;
}): TimelineKeyframe[] => {
  const { neutral, fps, frameCount, strength, seed, mode, gait, gaitEnabled, physics, idle, options, keyframeStep } = args;
  const runtime = createProcgenRuntime(seed);
  resetBitruviusRuntimeState(runtime.bitruvius);
  const step = Math.max(1, Math.floor(keyframeStep));
  const safeFrameCount = Math.max(2, Math.floor(frameCount));
  const gaitOverrides: Partial<WalkingEngineGait> = {};
  (Object.keys(gait) as Array<keyof WalkingEngineGait>).forEach((k) => {
    if (gaitEnabled && gaitEnabled[k] === false) return;
    gaitOverrides[k] = gait[k];
  });
  const resolvedGait =
    mode === 'run_in_place'
      ? (() => {
          const boosted: Partial<WalkingEngineGait> = { ...gaitOverrides };
          const mul = <K extends keyof WalkingEngineGait>(k: K, factor: number, min: number, max: number) => {
            const v = boosted[k];
            if (typeof v !== 'number') return;
            boosted[k] = clamp(v * factor, min, max);
          };
          const add = <K extends keyof WalkingEngineGait>(k: K, delta: number, min: number, max: number) => {
            const v = boosted[k];
            if (typeof v !== 'number') return;
            boosted[k] = clamp(v + delta, min, max);
          };

          mul('stride', 1.35, 0, 2);
          mul('intensity', 1.6, 0, 2);
          add('gravity', 0.08, 0, 1);
          add('hover_height', 0.15, 0, 1);
          mul('arm_swing', 1.2, 0, 2);
          add('kick_up_force', 0.4, 0, 1);
          add('lean', 0.2, -1, 1);
          mul('elbow_bend', 1.15, 0, 1.5);

          return boosted;
        })()
      : gaitOverrides;

  const keyframes: TimelineKeyframe[] = [];
  for (let f = 0; f < safeFrameCount; f += step) {
    runtime.frame = f;
    keyframes.push({
      frame: f,
      pose: generateProceduralBitruviusPose({
        neutral,
        frame: f,
        fps,
        cycleFrames: safeFrameCount,
        strength,
        mode: mode === 'idle' ? 'idle' : 'walk',
        gait: resolvedGait,
        physics,
        idle,
        options,
        runtimeState: runtime.bitruvius,
        rng: runtime.rng,
        timeMs: Math.floor((f / Math.max(1, fps)) * 1000),
      }),
    });
  }

  // Force a loop closure keyframe at the end frame.
  if (keyframes.length > 0 && keyframes[keyframes.length - 1]!.frame !== safeFrameCount - 1) {
    keyframes.push({ frame: safeFrameCount - 1, pose: clonePose(keyframes[0]!.pose) });
  }

  return keyframes;
};
