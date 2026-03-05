import type { Joint, Point } from './types';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const safeNumber = (value: unknown, fallback = 0) => (isFiniteNumber(value) ? value : fallback);

const safePoint = (value: unknown, fallback: Point): Point => {
  if (!value || typeof value !== 'object') return { ...fallback };
  const v = value as { x?: unknown; y?: unknown };
  return { x: safeNumber(v.x, fallback.x), y: safeNumber(v.y, fallback.y) };
};

export const unwrapAngleRad = (prevA: number, nextA: number) => {
  if (!isFiniteNumber(prevA)) return isFiniteNumber(nextA) ? nextA : 0;
  if (!isFiniteNumber(nextA)) return prevA;
  let diff = nextA - prevA;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return prevA + diff;
};

export const getWorldPosition = (
  id: string,
  joints: Record<string, Joint>,
  fallbackJoints: Record<string, Joint>,
  mode: 'current' | 'target' | 'preview' = 'current',
): Point => {
  let x = 0;
  let y = 0;
  let currentId: string | null = id;
  const visited = new Set<string>();

  while (currentId && visited.size < 64) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const joint: Joint | undefined = joints[currentId] ?? fallbackJoints[currentId];
    if (!joint) break;

    const live = joints[currentId];
    const base = fallbackJoints[currentId];
    const rawOffset =
      mode === 'preview'
        ? (live?.previewOffset ?? live?.targetOffset)
        : mode === 'target'
          ? live?.targetOffset
          : live?.currentOffset;
    const fallbackOffset =
      mode === 'preview'
        ? (base?.previewOffset ?? base?.targetOffset ?? joint.previewOffset ?? joint.targetOffset ?? joint.baseOffset ?? { x: 0, y: 0 })
        : mode === 'target'
          ? (base?.targetOffset ?? joint.targetOffset ?? joint.baseOffset ?? { x: 0, y: 0 })
          : (base?.currentOffset ?? joint.currentOffset ?? joint.baseOffset ?? { x: 0, y: 0 });
    const offset = safePoint(rawOffset, fallbackOffset);

    x += offset.x;
    y += offset.y;

    const parentId: string | null = joint.parent;
    if (!parentId) break;
    if (!joints[parentId] && !fallbackJoints[parentId]) break;
    currentId = parentId;
  }

  return { x, y };
};

export const getWorldPositionFromOffsets = (
  id: string,
  offsets: Record<string, Point>,
  baseJoints: Record<string, Joint>,
): Point => {
  let x = 0;
  let y = 0;
  let currentId: string | null = id;
  const visited = new Set<string>();

  while (currentId && visited.size < 64) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const joint: Joint | undefined = baseJoints[currentId];
    if (!joint) break;

    const offset = offsets[currentId] ?? joint.baseOffset;
    const safe = safePoint(offset, joint.baseOffset);

    x += safe.x;
    y += safe.y;

    const parentId: string | null = joint.parent;
    if (!parentId || !baseJoints[parentId]) break;
    currentId = parentId;
  }

  return { x, y };
};

export const vectorLength = (v: Point): number => Math.hypot(v.x, v.y);

export const toAngleDeg = (v: Point): number => (Math.atan2(v.y, v.x) * 180) / Math.PI;

export const fromAngleDeg = (angleDeg: number, length: number): Point => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(rad) * length,
    y: Math.sin(rad) * length,
  };
};

export const rotatePointRad = (p: Point, rad: number): Point => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

export const rotateJointOffsets = (joint: Joint, deltaRad: number): Joint => {
  if (!Number.isFinite(deltaRad) || Math.abs(deltaRad) < 1e-12) return joint;
  return {
    ...joint,
    baseOffset: rotatePointRad(joint.baseOffset, deltaRad),
    currentOffset: rotatePointRad(joint.currentOffset, deltaRad),
    targetOffset: rotatePointRad(joint.targetOffset, deltaRad),
    previewOffset: rotatePointRad(joint.previewOffset, deltaRad),
  };
};
