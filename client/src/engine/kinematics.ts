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

    const joint: Joint | undefined = joints[currentId];
    if (!joint) break;

    const base = fallbackJoints[currentId];
    const rawOffset =
      mode === 'preview'
        ? (joint.previewOffset ?? joint.targetOffset)
        : mode === 'target'
          ? joint.targetOffset
          : joint.currentOffset;
    const fallbackOffset =
      mode === 'preview'
        ? (base?.previewOffset ?? base?.targetOffset ?? { x: 0, y: 0 })
        : mode === 'target'
          ? (base?.targetOffset ?? { x: 0, y: 0 })
          : (base?.currentOffset ?? { x: 0, y: 0 });
    const offset = safePoint(rawOffset, fallbackOffset);

    x += offset.x;
    y += offset.y;

    const parentId: string | null = joint.parent;
    if (!parentId || !joints[parentId]) break;
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
