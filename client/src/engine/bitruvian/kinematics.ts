import { Vector2D } from '../types';

export const lerp = (start: number, end: number, t: number): number => start * (1 - t) + end * t;

export const easeInOutQuint = (t: number): number => {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
};

export const easeInQuint = (t: number): number => t * t * t * t * t;

export const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

export const getShortestAngleDiffDeg = (currentDeg: number, startDeg: number): number => {
  let diff = currentDeg - startDeg;

  diff = ((diff % 360) + 360) % 360; 
  
  if (diff > 180) {
    diff -= 360;
  }
  return diff;
};

export const lerpAngleShortestPath = (a: number, b: number, t: number): number => {
  const normalizeAngle0to360 = (angle: number): number => {
    return ((angle % 360) + 360) % 360;
  };

  let startAngle = normalizeAngle0to360(a);
  let endAngle = normalizeAngle0to360(b);

  let delta = endAngle - startAngle;

  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  
  return a + delta * t;
};

const rad = (deg: number): number => deg * Math.PI / 180;
const deg = (rad: number): number => rad * 180 / Math.PI;

export const solve2DJointIK = (
    target: Vector2D, 
    rootPos: Vector2D, 
    len1: number, 
    len2: number,
    rootAngle: number,
): { angle1: number, angle2: number } | null => {
    // Numerical guards: avoid NaNs from degenerate limbs or targets.
    if (!Number.isFinite(len1) || !Number.isFinite(len2) || len1 <= 1e-9 || len2 <= 1e-9) return null;
    const dx = target.x - rootPos.x;
    const dy = target.y - rootPos.y;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);

    // Degenerate: target at the root. Any solution works; choose a stable default.
    if (dist <= 1e-9) {
        return { angle1: -rootAngle, angle2: 0 };
    }

    // Reachability with small epsilon to reduce flip-flopping near the boundary.
    const eps = 1e-6;
    if (dist > len1 + len2 + eps || dist < Math.abs(len1 - len2) - eps) {
        return null;
    }

    const angleToTarget = Math.atan2(dy, dx);
    const denom1 = 2 * dist * len1;
    if (Math.abs(denom1) <= 1e-12) return null;
    const cosAngle1Arg = clamp((distSq + len1 * len1 - len2 * len2) / denom1, -1, 1);
    const angle1_internal = Math.acos(cosAngle1Arg);
    const angle1_global = angleToTarget - angle1_internal;

    const denom2 = 2 * len1 * len2;
    if (Math.abs(denom2) <= 1e-12) return null;
    const cosAngle2Arg = clamp((len1 * len1 + len2 * len2 - distSq) / denom2, -1, 1);
    const angle2_internal = Math.acos(cosAngle2Arg);

    return {
        angle1: deg(angle1_global) - rootAngle,
        angle2: deg(Math.PI - angle2_internal),
    };
};

export const rotateVecInternal = (vec: Vector2D, angleDeg: number): Vector2D => {
  const r = angleDeg * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: vec.x * c - vec.y * s, y: vec.x * s + vec.y * c };
};
