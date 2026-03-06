import { getWorldPosition } from './kinematics';
import type { Joint, Point } from './types';

const isFinitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

export const computeNeckBaseCenteredWorld = (
  joints: Record<string, Joint>,
  baseJoints: Record<string, Joint>,
): Point | null => {
  if (!joints.l_clavicle || !joints.r_clavicle) return null;
  const l = getWorldPosition('l_clavicle', joints, baseJoints, 'preview');
  const r = getWorldPosition('r_clavicle', joints, baseJoints, 'preview');
  if (!isFinitePoint(l) || !isFinitePoint(r)) return null;
  return { x: (l.x + r.x) * 0.5, y: (l.y + r.y) * 0.5 };
};

export const applyNeckBaseCenteredOffsets = (
  joints: Record<string, Joint>,
  baseJoints: Record<string, Joint>,
): Record<string, Joint> => {
  const neckBase = joints.neck_base;
  if (!neckBase) return joints;
  const parentId = neckBase.parent;
  if (!parentId) return joints;

  const centeredWorld = computeNeckBaseCenteredWorld(joints, baseJoints);
  if (!centeredWorld) return joints;

  const parentWorld = getWorldPosition(parentId, joints, baseJoints, 'preview');
  if (!isFinitePoint(parentWorld)) return joints;

  const off = { x: centeredWorld.x - parentWorld.x, y: centeredWorld.y - parentWorld.y };
  if (!Number.isFinite(off.x) || !Number.isFinite(off.y)) return joints;

  const next = { ...joints };
  next.neck_base = { ...neckBase, previewOffset: off, targetOffset: off, currentOffset: off };
  return next;
};

