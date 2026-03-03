import type { Joint, Point } from './types';
import { getWorldPosition } from './kinematics';

const isFinitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

export const computeCogWorld = (
  joints: Record<string, Joint>,
  baseJoints: Record<string, Joint>,
  mode: 'current' | 'target' | 'preview' = 'preview',
): Point => {
  const samples: Array<{ id: string; w: number }> = [
    // Sternum-heavy per product spec: chest is primary balance + weight distribution.
    { id: 'sternum', w: 6 },
    { id: 'collar', w: 2 },
    { id: 'navel', w: 2 },
    { id: 'head', w: 1 },
    { id: 'l_hip', w: 1 },
    { id: 'r_hip', w: 1 },
    { id: 'l_shoulder', w: 1 },
    { id: 'r_shoulder', w: 1 },
  ];

  let sumW = 0;
  let sumX = 0;
  let sumY = 0;

  for (const s of samples) {
    if (!(s.id in joints) && !(s.id in baseJoints)) continue;
    const p = getWorldPosition(s.id, joints, baseJoints, mode);
    if (!isFinitePoint(p)) continue;
    sumW += s.w;
    sumX += p.x * s.w;
    sumY += p.y * s.w;
  }

  if (sumW <= 1e-9) return { x: 0, y: 0 };
  return { x: sumX / sumW, y: sumY / sumW };
};

export const applyGroundRootCorrectionToJoints = (args: {
  joints: Record<string, Joint>;
  baseJoints: Record<string, Joint>;
  activeRoots: string[];
  groundRootTarget: Point;
}): Record<string, Joint> => {
  const { joints, baseJoints, activeRoots, groundRootTarget } = args;
  if (activeRoots.length > 0) return joints;
  const root = joints.root ?? baseJoints.root;
  if (!root) return joints;
  if (!isFinitePoint(groundRootTarget)) return joints;

  const cog = computeCogWorld(joints, baseJoints, 'preview');
  if (!isFinitePoint(cog)) return joints;
  const delta = sub(groundRootTarget, cog);
  if (!isFinitePoint(delta)) return joints;

  const mag = Math.abs(delta.x) + Math.abs(delta.y);
  if (mag < 1e-9) return joints;

  const next: Record<string, Joint> = { ...joints };
  const current = next.root ?? root;
  const nextCurrent = add(current.currentOffset ?? current.baseOffset, delta);
  const nextTarget = add(current.targetOffset ?? current.baseOffset, delta);
  const nextPreview = add(current.previewOffset ?? current.targetOffset ?? current.baseOffset, delta);
  next.root = {
    ...current,
    currentOffset: nextCurrent,
    targetOffset: nextTarget,
    previewOffset: nextPreview,
  };
  return next;
};

