import type { Bone, Skeleton } from '@shared/skeleton';

export function computeWorldTransforms(skeleton: Skeleton): Skeleton {
  const root = skeleton.bones[skeleton.rootBoneId];
  if (!root) return skeleton;

  const childrenByParentId = new Map<string, string[]>();
  for (const bone of Object.values(skeleton.bones)) {
    if (!bone.parentId) continue;
    const list = childrenByParentId.get(bone.parentId) ?? [];
    list.push(bone.id);
    childrenByParentId.set(bone.parentId, list);
  }

  const nextBones: Record<string, Bone> = { ...skeleton.bones };

  const setBone = (boneId: string, updates: Pick<Bone, 'worldX' | 'worldY' | 'worldAngle'>) => {
    const prev = nextBones[boneId];
    if (!prev) return;
    nextBones[boneId] = { ...prev, ...updates };
  };

  setBone(root.id, { worldX: 0, worldY: 0, worldAngle: root.localAngle });

  const stack: string[] = [root.id];
  while (stack.length) {
    const boneId = stack.pop()!;
    const bone = nextBones[boneId];
    if (!bone) continue;

    const worldAngle = bone.worldAngle ?? bone.localAngle;
    const worldX = bone.worldX ?? 0;
    const worldY = bone.worldY ?? 0;

    const childIds = childrenByParentId.get(boneId) ?? [];
    for (let i = childIds.length - 1; i >= 0; i--) {
      const childId = childIds[i]!;
      const child = nextBones[childId];
      if (!child) continue;

      const childWorldX = worldX + Math.cos(worldAngle) * bone.length;
      const childWorldY = worldY + Math.sin(worldAngle) * bone.length;
      const childWorldAngle = worldAngle + child.localAngle;
      setBone(childId, { worldX: childWorldX, worldY: childWorldY, worldAngle: childWorldAngle });

      stack.push(childId);
    }
  }

  return { ...skeleton, bones: nextBones };
}

