import type { Joint } from './types';
import { getWorldPosition, unwrapAngleRad } from './kinematics';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const DEFAULT_CLAVICLE_CONSTRAINT_DEG = 22.5;
export const DEFAULT_CLAVICLE_CONSTRAINT_RAD = (DEFAULT_CLAVICLE_CONSTRAINT_DEG * Math.PI) / 180;

const isFinitePoint = (p: { x: number; y: number } | null | undefined): p is { x: number; y: number } => {
  if (!p) return false;
  return Number.isFinite(p.x) && Number.isFinite(p.y);
};

export const clampClavicleTargetAngleRad = (args: {
  jointId: string;
  currentAngleRad: number;
  desiredAngleRad: number;
  joints: Record<string, Joint>;
  baseJoints: Record<string, Joint>;
  limitRad?: number;
  mode?: 'current' | 'target' | 'preview';
}): number => {
  const { jointId, currentAngleRad, desiredAngleRad, joints, baseJoints } = args;
  if (jointId !== 'l_clavicle' && jointId !== 'r_clavicle') return desiredAngleRad;

  const limitRad = Number.isFinite(args.limitRad) ? Math.max(0, args.limitRad!) : DEFAULT_CLAVICLE_CONSTRAINT_RAD;
  if (!Number.isFinite(limitRad) || limitRad <= 1e-9) return currentAngleRad;

  const mode = args.mode ?? 'preview';

  const sternumWorld = getWorldPosition('sternum', joints, baseJoints, mode);
  const collarWorld = getWorldPosition('collar', joints, baseJoints, mode);

  // Fallback: if core joints are missing, treat "horizontal" as world +X.
  const spineAngle = (() => {
    if (!isFinitePoint(sternumWorld) || !isFinitePoint(collarWorld)) return 0;
    const dx = collarWorld.x - sternumWorld.x;
    const dy = collarWorld.y - sternumWorld.y;
    const d = Math.hypot(dx, dy);
    if (!Number.isFinite(d) || d <= 1e-9) return 0;
    return Math.atan2(dy, dx);
  })();

  // "Horizontal" at the clavicles is defined as perpendicular to the sternum→collar axis.
  const horizontalRight = spineAngle + Math.PI / 2;
  const baseline = jointId === 'l_clavicle' ? horizontalRight + Math.PI : horizontalRight;

  // Clamp desired angle to be within ±limit of baseline, and keep continuity relative to current.
  const desiredUnwrapped = unwrapAngleRad(baseline, desiredAngleRad);
  const rel = desiredUnwrapped - baseline;
  const clampedRel = clamp(rel, -limitRad, limitRad);
  const clampedAbs = baseline + clampedRel;
  return unwrapAngleRad(currentAngleRad, clampedAbs);
};
