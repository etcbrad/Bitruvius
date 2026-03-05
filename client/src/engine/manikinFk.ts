import type { Joint, Point, SkeletonState } from './types';

const canonicalConnKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

const rotatePoint = (p: Point, c: number, s: number): Point => ({
  x: p.x * c - p.y * s,
  y: p.x * s + p.y * c,
});

export const applyManikinFkRotation = (args: {
  joints: Record<string, Joint>;
  baseJoints: Record<string, Joint>;
  rootRotateJointId: string;
  deltaRad: number;
  connectionOverrides: SkeletonState['connectionOverrides'];
  rotateBaseOffsets?: boolean;
}): Record<string, Joint> => {
  const { joints, rootRotateJointId, deltaRad, connectionOverrides } = args;
  if (!Number.isFinite(deltaRad) || Math.abs(deltaRad) < 1e-12) return joints;

  const rootJoint = joints[rootRotateJointId];
  if (!rootJoint?.parent) return joints;

  const childrenByParent: Record<string, string[]> = {};
  for (const [id, joint] of Object.entries(joints)) {
    if (!joint?.parent) continue;
    (childrenByParent[joint.parent] ??= []).push(id);
  }

  const rotateDeltaById = new Map<string, number>();
  rotateDeltaById.set(rootRotateJointId, deltaRad);
  const q: string[] = [rootRotateJointId];
  while (q.length && rotateDeltaById.size < 2048) {
    const parent = q.shift()!;
    const parentDelta = rotateDeltaById.get(parent) ?? 0;
    const kids = childrenByParent[parent];
    if (!kids) continue;

    for (const child of kids) {
      if (rotateDeltaById.has(child)) continue;
      const key = canonicalConnKey(parent, child);
      const rawFollowDeg = connectionOverrides[key]?.fkFollowDeg;
      const legacyMode = connectionOverrides[key]?.fkMode;

      // Default: off (no inheritance) unless explicitly enabled.
      // Back-compat: old fkMode 'stretch'/'bend' maps to +/-1 degree.
      const followDeg =
        typeof rawFollowDeg === 'number' && Number.isFinite(rawFollowDeg)
          ? rawFollowDeg
          : legacyMode === 'stretch'
            ? 1
            : legacyMode === 'bend'
              ? -1
              : 0;

      if (!Number.isFinite(followDeg) || Math.abs(followDeg) < 1e-9) continue;

      const stepRad = Math.abs(followDeg) * (Math.PI / 180);
      const clamped = Math.max(-stepRad, Math.min(stepRad, parentDelta));
      const childDelta = Math.sign(followDeg) * clamped;
      if (!Number.isFinite(childDelta) || Math.abs(childDelta) < 1e-12) continue;
      rotateDeltaById.set(child, childDelta);
      q.push(child);
    }
  }

  const nextJoints: Record<string, Joint> = { ...joints };
  const rotateBaseOffsets = args.rotateBaseOffsets !== false;
  rotateDeltaById.forEach((dr, id) => {
    const j = joints[id];
    if (!j?.parent) return;
    const c = Math.cos(dr);
    const s = Math.sin(dr);
    const rot = (p: Point) => rotatePoint(p, c, s);
    nextJoints[id] = {
      ...j,
      ...(rotateBaseOffsets ? { baseOffset: rot(j.baseOffset) } : {}),
      currentOffset: rot(j.currentOffset),
      targetOffset: rot(j.targetOffset),
      previewOffset: rot(j.previewOffset),
    };
  });

  return nextJoints;
};
