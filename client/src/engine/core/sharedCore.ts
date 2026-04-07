// Shared core functionality for all builds (FK, IK, Hybrid)
import { INITIAL_JOINTS, CONNECTIONS } from '../model';
import type { Joint, SkeletonState } from '../types';
import { FKSolver, BoneTransform } from '../fk';

export interface CoreEngine {
  fk: FKSolver;
  joints: Record<string, Joint>;
  update(): void;
  reset(): void;
  getJoint(id: string): Joint;
  setJoint(id: string, joint: Partial<Joint>): void;
  getAllJoints(): Record<string, Joint>;
}

export class SharedCore implements CoreEngine {
  public fk: FKSolver;
  public joints: Record<string, Joint>;

  constructor() {
    this.joints = { ...INITIAL_JOINTS };
    
    // Create skeleton definition for FK solver
    const skeletonDef = {
      id: 'bitruvius-core',
      name: 'Bitruvius Core Skeleton',
      version: '1.0.0',
      width: 100,
      height: 200,
      bones: Object.entries(this.joints).map(([id, joint]) => ({
        name: id,
        parent: joint.parent || undefined,
        x: joint.baseOffset.x,
        y: joint.baseOffset.y,
        rotation: joint.rotation || 0,
        scaleX: 1,
        scaleY: 1
      })),
      slots: []
    };
    
    this.fk = new FKSolver(skeletonDef);
    this.update();
  }

  update(): void {
    // Update FK solver with current joint positions
    for (const [id, joint] of Object.entries(this.joints)) {
      try {
        this.fk.setBoneLocal(id, {
          localX: joint.currentOffset.x,
          localY: joint.currentOffset.y,
          localRotation: joint.rotation || 0
        });
      } catch (error) {
        console.warn(`Failed to set joint ${id}:`, error);
      }
    }
    this.fk.update();
  }

  reset(): void {
    this.joints = { ...INITIAL_JOINTS };
    this.fk.resetToRestPose();
    this.update();
  }

  getJoint(id: string): Joint {
    const joint = this.joints[id];
    if (!joint) {
      throw new Error(`Joint '${id}' not found`);
    }
    return joint;
  }

  setJoint(id: string, updates: Partial<Joint>): void {
    const current = this.joints[id];
    if (!current) {
      throw new Error(`Joint '${id}' not found`);
    }
    
    this.joints[id] = { ...current, ...updates };
    this.update();
  }

  getAllJoints(): Record<string, Joint> {
    return { ...this.joints };
  }

  // Get world position of a joint
  getJointWorldPosition(id: string): { x: number; y: number } {
    try {
      const bone = this.fk.getBone(id);
      return { x: bone.worldX, y: bone.worldY };
    } catch (error) {
      // Fallback to joint offset if bone not found in FK
      const joint = this.getJoint(id);
      return joint.currentOffset;
    }
  }

  // Apply pose from skeleton state
  applyPose(pose: SkeletonState): void {
    if (pose.joints) {
      for (const [id, jointPose] of Object.entries(pose.joints)) {
        if (this.joints[id]) {
          this.setJoint(id, {
            currentOffset: jointPose.currentOffset,
            targetOffset: jointPose.targetOffset,
            previewOffset: jointPose.previewOffset,
            rotation: jointPose.rotation
          });
        }
      }
    }
  }

  // Export current pose to skeleton state
  exportPose(): Partial<SkeletonState> {
    return {
      joints: { ...this.joints }
    };
  }
}

// Export connections for use in all builds
export { CONNECTIONS };

// Export initial joints for use in all builds  
export { INITIAL_JOINTS };
