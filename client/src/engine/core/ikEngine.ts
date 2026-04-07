// IK-enabled engine - includes IK solving capabilities
import { SharedCore } from './sharedCore';
import { IKSolver } from '../ik';
import { PhysicsEngine } from '../physics';
import type { Joint, SkeletonState } from '../types';
import type { 
  BoneDefinition, 
  IKConstraintDefinition, 
  PhysicsBoneConfig, 
  GlobalPhysicsConfig 
} from '../../../../shared/types/skeleton';

export class IKEngine extends SharedCore {
  private ikSolver: IKSolver | null = null;
  private physicsEngine: PhysicsEngine | null = null;
  private ikConstraints: IKConstraintDefinition[] = [];
  private physicsConfigs: Map<string, PhysicsBoneConfig> = new Map();

  constructor() {
    super();
    this.initializeIK();
    this.initializePhysics();
  }

  private initializeIK(): void {
    // Create bone definitions for IK solver
    const boneDefinitions = new Map<string, BoneDefinition>();
    for (const [id, joint] of Object.entries(this.joints)) {
      boneDefinitions.set(id, {
        name: id,
        parent: joint.parent || undefined,
        x: joint.baseOffset.x,
        y: joint.baseOffset.y,
        rotation: joint.rotation || 0,
        scaleX: 1,
        scaleY: 1,
        length: this.calculateBoneLength(id)
      });
    }

    // Initialize IK solver with default constraints
    this.ikSolver = new IKSolver(this.fk, this.ikConstraints, boneDefinitions);
  }

  private initializePhysics(): void {
    // Initialize physics with default configuration
    const globalConfig: GlobalPhysicsConfig = {
      gravity: { x: 0, y: -980 },
      timeScale: 1.0
    };

    this.physicsEngine = new PhysicsEngine(this.fk, this.physicsConfigs, globalConfig);
  }

  private calculateBoneLength(jointId: string): number {
    const joint = this.joints[jointId];
    if (!joint) return 1;

    // Calculate distance from parent
    if (joint.parent) {
      const parent = this.joints[joint.parent];
      if (parent) {
        return Math.hypot(
          joint.baseOffset.x - parent.baseOffset.x,
          joint.baseOffset.y - parent.baseOffset.y
        );
      }
    }

    return 1; // Default length
  }

  // IK-specific methods
  addIKConstraint(constraint: IKConstraintDefinition): void {
    if (!this.ikSolver) return;
    
    this.ikConstraints.push(constraint);
    this.ikSolver.addConstraint(constraint);
  }

  removeIKConstraint(name: string): boolean {
    if (!this.ikSolver) return false;
    
    const removed = this.ikSolver.removeConstraint(name);
    if (removed) {
      this.ikConstraints = this.ikConstraints.filter(c => c.name !== name);
    }
    return removed;
  }

  setIKMix(name: string, mix: number): boolean {
    if (!this.ikSolver) return false;
    return this.ikSolver.setConstraintMix(name, mix);
  }

  solveIK(): void {
    if (this.ikSolver) {
      this.ikSolver.applyAll();
    }
  }

  // Physics-specific methods
  enablePhysicsForJoint(jointId: string, config: PhysicsBoneConfig): void {
    if (!this.physicsEngine) return;
    
    this.physicsConfigs.set(jointId, config);
    this.physicsEngine.setBoneConfig(jointId, config);
    this.physicsEngine.setBoneEnabled(jointId, config.enabled);
  }

  disablePhysicsForJoint(jointId: string): void {
    if (!this.physicsEngine) return;
    
    this.physicsEngine.setBoneEnabled(jointId, false);
  }

  updatePhysics(dt: number): void {
    if (this.physicsEngine) {
      this.physicsEngine.update(dt);
    }
  }

  applyPhysicsImpulse(jointId: string, impulse: number): void {
    if (this.physicsEngine) {
      this.physicsEngine.applyImpulse(jointId, impulse);
    }
  }

  resetPhysics(): void {
    if (this.physicsEngine) {
      this.physicsEngine.reset();
    }
  }

  // Enhanced update loop that includes IK and physics
  updateFrame(dt: number = 0.016): void {
    // Update base FK
    this.update();
    
    // Solve IK
    this.solveIK();
    
    // Update physics
    this.updatePhysics(dt);
    
    // Final FK update to apply changes
    this.update();
  }

  // Export full state including IK and physics
  exportFullState(): Partial<SkeletonState> {
    const baseState = this.exportPose();
    
    return {
      ...baseState,
      // Add IK constraints and physics configs if needed
    };
  }

  // Apply full state including IK and physics
  applyFullState(state: SkeletonState): void {
    this.applyPose(state);
    
    // Apply IK constraints and physics configs from state if present
    // This would depend on how you store these in the state
  }
}
