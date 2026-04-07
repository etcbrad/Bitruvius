// Hybrid engine without IK and physics - pure FK with modular foundation
import { SharedCore } from './sharedCore';
import type { Joint, SkeletonState } from '../types';

export class HybridEngine extends SharedCore {
  
  constructor() {
    super();
  }

  // FK-specific methods - direct joint manipulation only
  setJointRotation(jointId: string, rotation: number): void {
    this.setJoint(jointId, { rotation });
  }

  setJointPosition(jointId: string, x: number, y: number): void {
    this.setJoint(jointId, { 
      currentOffset: { x, y },
      targetOffset: { x, y },
      previewOffset: { x, y }
    });
  }

  // Apply FK pose directly
  applyFKPose(pose: SkeletonState): void {
    this.applyPose(pose);
  }

  // Export current FK state
  exportFKState(): Partial<SkeletonState> {
    return this.exportPose();
  }

  // Simple update loop for FK-only
  updateFrame(): void {
    this.update();
  }

  // Reset to initial pose
  resetToInitialPose(): void {
    this.reset();
  }

  // Hybrid-specific methods for future expansion
  // These are placeholders for when IK/physics are added back
  addIKConstraint(): void {
    console.log('IK constraints disabled in this build');
  }

  removeIKConstraint(): boolean {
    console.log('IK constraints disabled in this build');
    return false;
  }

  enablePhysicsForJoint(): void {
    console.log('Physics disabled in this build');
  }

  disablePhysicsForJoint(): void {
    console.log('Physics disabled in this build');
  }
}
