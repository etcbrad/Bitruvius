import { clamp, lerp } from '../utils';
import { unwrapAngleRad, vectorLength } from './kinematics';
import type { EnginePoseSnapshot, Joint, Point, TimelineClip, TimelineEasingId } from './types';

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const safePoint = (value: unknown, fallback: Point): Point => {
  if (!value || typeof value !== 'object') return { ...fallback };
  const v = value as { x?: unknown; y?: unknown };
  const x = isFiniteNumber(v.x) ? v.x : fallback.x;
  const y = isFiniteNumber(v.y) ? v.y : fallback.y;
  return { x, y };
};

export const applyEasing = (easing: TimelineEasingId, tRaw: number): number => {
  const t = clamp(tRaw, 0, 1);
  if (easing === 'easeInOut') {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  return t;
};

export const capturePoseSnapshot = (
  joints: Record<string, Joint>,
  mode: 'current' | 'target' | 'preview' = 'preview',
): EnginePoseSnapshot => {
  const snapshot: Record<string, Point> = {};
  for (const id of Object.keys(joints)) {
    const joint = joints[id];
    const offset =
      mode === 'preview'
        ? (joint.previewOffset ?? joint.targetOffset)
        : mode === 'target'
          ? joint.targetOffset
          : joint.currentOffset;
    snapshot[id] = safePoint(offset, joint.baseOffset);
  }
  return { joints: snapshot };
};

export const applyPoseSnapshotToJoints = (
  joints: Record<string, Joint>,
  pose: EnginePoseSnapshot,
): Record<string, Joint> => {
  const next: Record<string, Joint> = {};
  for (const id of Object.keys(joints)) {
    const joint = joints[id];
    const offset = pose.joints[id] ? safePoint(pose.joints[id], joint.baseOffset) : joint.previewOffset;
    next[id] = {
      ...joint,
      previewOffset: offset,
      targetOffset: offset,
      currentOffset: offset,
    };
  }
  return next;
};

export const interpolatePoseSnapshots = (
  a: EnginePoseSnapshot,
  b: EnginePoseSnapshot,
  tRaw: number,
  baseJoints: Record<string, Joint>,
  options: { stretchEnabled?: boolean } = {},
): EnginePoseSnapshot => {
  const t = clamp(tRaw, 0, 1);
  const out: Record<string, Point> = {};
  const stretchEnabled = Boolean(options.stretchEnabled);

  for (const id of Object.keys(baseJoints)) {
    const joint = baseJoints[id];
    const oa = a.joints[id] ?? joint.baseOffset;
    const ob = b.joints[id] ?? joint.baseOffset;

    if (!joint.parent) {
      out[id] = { x: lerp(oa.x, ob.x, t), y: lerp(oa.y, ob.y, t) };
      continue;
    }

    const aLen = vectorLength(oa);
    const bLen = vectorLength(ob);
    const baseLen = vectorLength(joint.baseOffset);
    const len = stretchEnabled ? lerp(aLen, bLen, t) : baseLen || lerp(aLen, bLen, t);

    if (!len) {
      out[id] = { x: 0, y: 0 };
      continue;
    }

    const aA = Math.atan2(oa.y, oa.x);
    const bA = Math.atan2(ob.y, ob.x);
    const bUnwrapped = unwrapAngleRad(aA, bA);
    const angle = lerp(aA, bUnwrapped, t);
    out[id] = { x: Math.cos(angle) * len, y: Math.sin(angle) * len };
  }

  return { joints: out };
};

export const sampleClipPose = (
  clip: TimelineClip,
  frameRaw: number,
  baseJoints: Record<string, Joint>,
  options: { stretchEnabled?: boolean } = {},
): EnginePoseSnapshot | null => {
  const keyframes = clip.keyframes;
  if (!Array.isArray(keyframes) || keyframes.length === 0) return null;

  const frameCount = Math.max(1, Math.floor(clip.frameCount));
  const frame = clamp(Math.floor(frameRaw), 0, frameCount - 1);

  // Keyframes are expected to be sorted by frame ascending.
  let prev = keyframes[0];
  let next = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length; i += 1) {
    const k = keyframes[i];
    if (k.frame <= frame) prev = k;
    if (k.frame >= frame) {
      next = k;
      break;
    }
  }

  if (prev.frame === next.frame) return prev.pose;
  if (frame <= prev.frame) return prev.pose;
  if (frame >= next.frame) return next.pose;

  const tRaw = (frame - prev.frame) / Math.max(1, next.frame - prev.frame);
  const t = applyEasing(clip.easing, tRaw);
  return interpolatePoseSnapshots(prev.pose, next.pose, t, baseJoints, options);
};

