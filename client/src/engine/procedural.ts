import { fromAngleDeg, toAngleDeg, vectorLength } from './kinematics';
import type { EnginePoseSnapshot, Point } from './types';
import { generateProceduralBitruviusPose } from './bitruvian/proceduralBitruvius';

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
      time: Date.now(),
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

