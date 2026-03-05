import { UniversalSkeleton, ImportResult } from './universalSkeleton';

export class SkeletonValidator {
  static validateUniversalSkeleton(skeleton: UniversalSkeleton): ImportResult {
    const result: ImportResult = {
      success: true,
      joints: {},
      mappings: [],
      warnings: [],
      errors: [],
      metadata: {
        sourceFormat: skeleton.source,
        bonesImported: 0,
        bonesMapped: 0,
        bonesUnmapped: 0,
      },
    };

    // Check required fields
    if (!skeleton.name) {
      result.errors.push('Skeleton name is required');
      result.success = false;
    }

    if (!skeleton.bones || Object.keys(skeleton.bones).length === 0) {
      result.errors.push('Skeleton must have at least one bone');
      result.success = false;
      return result;
    }

    // Validate root bone
    if (!skeleton.rootBoneId) {
      result.warnings.push('No root bone specified, auto-detecting...');
      skeleton.rootBoneId = this.findRootBone(skeleton);
    }

    if (!skeleton.bones[skeleton.rootBoneId]) {
      result.errors.push(`Root bone '${skeleton.rootBoneId}' not found`);
      result.success = false;
    }

    // Validate bone hierarchy
    const visited = new Set<string>();
    const cycles = this.detectCycles(skeleton.bones, skeleton.rootBoneId);
    
    if (cycles.length > 0) {
      result.errors.push(`Cycles detected: ${cycles.join(', ')}`);
      result.success = false;
    }

    // Validate parent references
    Object.entries(skeleton.bones).forEach(([boneId, bone]) => {
      if (bone.parentId && !skeleton.bones[bone.parentId]) {
        result.warnings.push(`Bone '${boneId}' references non-existent parent '${bone.parentId}'`);
      }
    });

    // Validate coordinate data
    Object.entries(skeleton.bones).forEach(([boneId, bone]) => {
      if (isNaN(bone.worldX) || isNaN(bone.worldY)) {
        result.warnings.push(`Bone '${boneId}' has invalid coordinates`);
      }

      if (bone.scaleX <= 0 || bone.scaleY <= 0) {
        result.warnings.push(`Bone '${boneId}' has invalid scale values`);
      }
    });

    return result;
  }

  private static findRootBone(skeleton: UniversalSkeleton): string {
    // Find bone with no parent
    for (const [boneId, bone] of Object.entries(skeleton.bones)) {
      if (!bone.parentId) {
        return boneId;
      }
    }
    
    // Fallback: return first bone
    return Object.keys(skeleton.bones)[0];
  }

  private static detectCycles(
    bones: Record<string, any>,
    startBone: string
  ): string[] {
    const cycles: string[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (boneId: string, path: string[]): boolean => {
      if (recursionStack.has(boneId)) {
        cycles.push(path.slice(path.indexOf(boneId)).join(' -> '));
        return true;
      }

      if (visited.has(boneId)) {
        return false;
      }

      visited.add(boneId);
      recursionStack.add(boneId);

      const bone = bones[boneId];
      if (bone && bone.parentId) {
        if (dfs(bone.parentId, [...path, boneId])) {
          return true;
        }
      }

      recursionStack.delete(boneId);
      return false;
    };

    dfs(startBone, []);
    return cycles;
  }
}
