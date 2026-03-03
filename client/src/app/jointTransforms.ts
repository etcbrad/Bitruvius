import type { Joint, Point } from '../engine/types';
import { getWorldPosition } from '../engine/kinematics';

export const collectSubtreeJointIds = (
  rootId: string,
  joints: Record<string, Joint>,
  options?: { maxNodes?: number },
): { nodes: string[]; truncated: boolean } => {
  const maxNodes = Math.max(1, Math.floor(options?.maxNodes ?? 1024));
  if (!rootId || !joints[rootId]) return { nodes: [], truncated: false };

  const childrenByParent: Record<string, string[]> = {};
  for (const [id, j] of Object.entries(joints)) {
    if (!j?.parent) continue;
    (childrenByParent[j.parent] ??= []).push(id);
  }

  const out: string[] = [];
  const q: string[] = [rootId];
  const seen = new Set<string>();
  while (q.length && out.length < maxNodes) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!joints[id]) continue;
    out.push(id);
    const kids = childrenByParent[id];
    if (kids) q.push(...kids);
  }
  return { nodes: out, truncated: out.length >= maxNodes };
};

export const applyRigidTransformToJointSubset = (args: {
  joints: Record<string, Joint>;
  baseJoints: Record<string, Joint>;
  subsetIds: string[];
  pivotWorld: Point;
  rotateRad: number;
  translateWorld: Point;
}): Record<string, Joint> => {
  const { joints, baseJoints, subsetIds, pivotWorld, rotateRad, translateWorld } = args;
  if (!subsetIds.length) return joints;

  const c = Math.cos(rotateRad);
  const s = Math.sin(rotateRad);

  const world: Record<string, Point> = {};
  for (const id of Object.keys(joints)) {
    world[id] = getWorldPosition(id, joints, baseJoints, 'preview');
  }

  const subset = new Set(subsetIds);
  const transformedWorld: Record<string, Point> = {};
  for (const id of subsetIds) {
    const p = world[id];
    if (!p) continue;
    const rx = (p.x - pivotWorld.x) * c - (p.y - pivotWorld.y) * s;
    const ry = (p.x - pivotWorld.x) * s + (p.y - pivotWorld.y) * c;
    transformedWorld[id] = { x: pivotWorld.x + rx + translateWorld.x, y: pivotWorld.y + ry + translateWorld.y };
  }

  const nextJoints: Record<string, Joint> = { ...joints };
  for (const id of subsetIds) {
    const j = nextJoints[id] ?? baseJoints[id];
    const p = transformedWorld[id];
    if (!j || !p) continue;

    if (!j.parent) {
      const off = { x: p.x, y: p.y };
      nextJoints[id] = { ...j, previewOffset: off, targetOffset: off, currentOffset: off };
      continue;
    }

    const parentWorld = subset.has(j.parent) ? transformedWorld[j.parent] : world[j.parent];
    if (!parentWorld) continue;
    const off = { x: p.x - parentWorld.x, y: p.y - parentWorld.y };
    nextJoints[id] = { ...j, previewOffset: off, targetOffset: off, currentOffset: off };
  }

  return nextJoints;
};
