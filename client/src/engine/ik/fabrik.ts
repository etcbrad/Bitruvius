import { getWorldPosition, vectorLength } from '../kinematics';
import type { Joint, Point } from '../types';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const scalePoint = (v: Point, s: number): Point => ({ x: v.x * s, y: v.y * s });

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

const normalize = (v: Point): Point => {
  const d = Math.hypot(v.x, v.y);
  if (d <= 1e-9) return { x: 0, y: 0 };
  return { x: v.x / d, y: v.y / d };
};

const isFinitePoint = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

export type FabrikChainSolveOptions = {
  tolerance?: number;
  maxIterations?: number;
};

/**
 * Returns the local offsets (relative to each joint's parent) that best satisfy:
 * - fixed root position
 * - fixed segment lengths (using baseOffset unless stretchEnabled)
 * - end effector reaching `target` (if reachable)
 *
 * This solver is intentionally hierarchy-agnostic: `chainIds` is assumed to be ordered
 * root→...→effector (each successive id is the child of the previous).
 */
export const solveFabrikChainOffsets = (
  chainIds: readonly string[],
  joints: Record<string, Joint>,
  baseJoints: Record<string, Joint>,
  target: Point,
  stretchEnabled: boolean,
  options: FabrikChainSolveOptions = {},
): Record<string, Point> | null => {
  if (chainIds.length < 2) return null;
  if (!isFinitePoint(target)) return null;

  const positions: Point[] = chainIds.map((id) => getWorldPosition(id, joints, baseJoints, 'preview'));
  if (positions.some((p) => !isFinitePoint(p))) return null;

  const lengths: number[] = [];
  for (let i = 1; i < chainIds.length; i++) {
    const id = chainIds[i];
    const joint = joints[id] ?? baseJoints[id];
    if (!joint) {
      lengths.push(0);
      continue;
    }
    const len = stretchEnabled ? vectorLength(joint.previewOffset) : vectorLength(joint.baseOffset);
    lengths.push(Number.isFinite(len) ? Math.max(0, len) : 0);
  }

  const root = positions[0];
  const totalLen = lengths.reduce((acc, v) => acc + v, 0);
  const toTarget = dist(root, target);
  if (!Number.isFinite(totalLen) || totalLen <= 1e-9) return null;

  // Unreachable: fully extend toward target.
  if (toTarget >= totalLen) {
    for (let i = 0; i < chainIds.length - 1; i++) {
      const r = dist(target, positions[i]);
      if (r <= 1e-9) continue;
      const lambda = lengths[i] / r;
      // p(i+1) = (1-l)*p(i) + l*target
      positions[i + 1] = add(scalePoint(positions[i], 1 - lambda), scalePoint(target, lambda));
    }
  } else {
    const tol = Math.max(0, options.tolerance ?? 1e-4);
    const maxIter = Math.max(1, Math.floor(options.maxIterations ?? 12));
    const baseRoot = { ...root };

    for (let iter = 0; iter < maxIter; iter++) {
      // Forward reaching
      positions[positions.length - 1] = { ...target };
      for (let i = positions.length - 2; i >= 0; i--) {
        const dir = sub(positions[i], positions[i + 1]);
        const u = normalize(dir);
        positions[i] = add(positions[i + 1], scalePoint(u, lengths[i]));
      }

      // Backward reaching
      positions[0] = { ...baseRoot };
      for (let i = 1; i < positions.length; i++) {
        const dir = sub(positions[i], positions[i - 1]);
        const u = normalize(dir);
        positions[i] = add(positions[i - 1], scalePoint(u, lengths[i - 1]));
      }

      if (dist(positions[positions.length - 1], target) <= tol) break;
    }
  }

  // Convert to local offsets for each joint (root stays fixed).
  const nextOffsets: Record<string, Point> = {};
  for (let i = 1; i < chainIds.length; i++) {
    const id = chainIds[i];
    nextOffsets[id] = sub(positions[i], positions[i - 1]);
  }
  return nextOffsets;
};

