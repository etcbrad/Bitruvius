import { 
  BoneDefinition, 
  BoneTransform, 
  SkeletonDefinition, 
  ValidationError,
  Vec2,
  degreesToRadians,
  radiansToDegrees
} from '../../../shared/types/skeleton';

export class FKSolver {
  private bones: Map<string, BoneTransform> = new Map();
  private definitions: Map<string, BoneDefinition> = new Map();
  private hierarchy: string[] = [];  // topological sort — root first
  private isDirty: boolean = true;

  constructor(skeleton: SkeletonDefinition) {
    this.hierarchy = this.topoSort(skeleton.bones);
    
    // Initialize bone definitions map
    for (const boneDef of skeleton.bones) {
      this.definitions.set(boneDef.name, boneDef);
    }

    // Initialize bone transforms from rest pose
    for (const boneDef of skeleton.bones) {
      this.bones.set(boneDef.name, this.boneDefToTransform(boneDef));
    }
  }

  // Call once per frame after setting local transforms
  update(): void {
    this.isDirty = false;
    
    for (const boneName of this.hierarchy) {
      const bone = this.bones.get(boneName)!;
      const def = this.definitions.get(boneName)!;
      
      if (!def.parent) {
        // Root bone: world = local
        bone.worldX = bone.localX;
        bone.worldY = bone.localY;
        bone.worldRotation = bone.localRotation;
        bone.worldScaleX = bone.localScaleX;
        bone.worldScaleY = bone.localScaleY;
      } else {
        const parent = this.bones.get(def.parent)!;
        const parentWorldRotRad = degreesToRadians(parent.worldRotation);
        
        // Rotate local offset by parent world rotation
        bone.worldX = parent.worldX
          + bone.localX * Math.cos(parentWorldRotRad) - bone.localY * Math.sin(parentWorldRotRad);
        bone.worldY = parent.worldY
          + bone.localX * Math.sin(parentWorldRotRad) + bone.localY * Math.cos(parentWorldRotRad);
        bone.worldRotation = parent.worldRotation + bone.localRotation;
        bone.worldScaleX = parent.worldScaleX * bone.localScaleX;
        bone.worldScaleY = parent.worldScaleY * bone.localScaleY;
      }
    }
  }

  getBone(name: string): BoneTransform {
    const bone = this.bones.get(name);
    if (!bone) {
      throw new Error(`Bone '${name}' not found in skeleton`);
    }
    return bone;
  }

  setBoneLocal(name: string, partial: Partial<BoneTransform>): void {
    const bone = this.bones.get(name);
    if (!bone) {
      throw new Error(`Bone '${name}' not found in skeleton`);
    }
    Object.assign(bone, partial);
    this.isDirty = true;
  }

  resetToRestPose(): void {
    for (const [name, def] of Array.from(this.definitions.entries())) {
      const bone = this.bones.get(name)!;
      const restTransform = this.boneDefToTransform(def);
      Object.assign(bone, restTransform);
    }
    this.isDirty = true;
  }

  markDirty(): void {
    this.isDirty = true;
  }

  validateForRender(): void {
    if (this.isDirty) {
      throw new Error('FK solver must be updated before rendering. Call update() first.');
    }
  }

  private boneDefToTransform(def: BoneDefinition): BoneTransform {
    return {
      // World-space (will be computed in update)
      worldX: 0,
      worldY: 0,
      worldRotation: 0,
      worldScaleX: 1,
      worldScaleY: 1,
      // Local-space from definition
      localX: def.x,
      localY: def.y,
      localRotation: def.rotation,
      localScaleX: def.scaleX ?? 1,
      localScaleY: def.scaleY ?? 1,
    };
  }

  private topoSort(bones: BoneDefinition[]): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const byName = new Map(Array.from(bones.map(b => [b.name, b])));

    function visit(name: string): void {
      if (visiting.has(name)) {
        throw new Error(`Cycle detected in bone hierarchy: ${name}`);
      }
      if (visited.has(name)) return;
      
      visiting.add(name);
      const bone = byName.get(name);
      if (bone?.parent) {
        visit(bone.parent);
      }
      visiting.delete(name);
      visited.add(name);
      order.push(name);
    }

    for (const bone of bones) {
      if (!visited.has(bone.name)) {
        visit(bone.name);
      }
    }

    return order;
  }

  // Utility methods for validation
  validateSkeleton(): ValidationError[] {
    const errors: ValidationError[] = [];
    const boneNames = new Set(this.definitions.keys());

    // Check for cycles (already done in topoSort)
    try {
      this.topoSort(Array.from(this.definitions.values()));
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : 'Cycle detected in bone hierarchy',
        severity: 'error'
      });
    }

    // Check IK constraints
    for (const [name, def] of Array.from(this.definitions.entries())) {
      if (def.parent && !boneNames.has(def.parent)) {
        errors.push({
          bone: name,
          field: 'parent',
          message: `Parent bone '${def.parent}' not found`,
          severity: 'error'
        });
      }
    }

    return errors;
  }

  // Get world position of a bone
  getBoneWorldPosition(name: string): Vec2 {
    const bone = this.getBone(name);
    return { x: bone.worldX, y: bone.worldY };
  }

  // Get all bones in hierarchy order
  getAllBones(): Map<string, BoneTransform> {
    return new Map(this.bones);
  }

  // Get bone definition
  getBoneDefinition(name: string): BoneDefinition {
    const def = this.definitions.get(name);
    if (!def) {
      throw new Error(`Bone definition '${name}' not found`);
    }
    return def;
  }
}

// Export BoneTransform type for use in other modules
export type { BoneTransform };
