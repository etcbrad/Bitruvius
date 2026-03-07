import { 
  SkeletonDefinition, 
  PhysicsBoneConfig, 
  GlobalPhysicsConfig,
  Vec2,
  LocomotionRole
} from '../../../shared/types/skeleton';
import { FKSolver } from './fk';
import { IKSolver } from './ik';
import { PhysicsEngine } from './physics';

export interface PipelineConfig {
  enablePhysics?: boolean;
  enableIK?: boolean;
  enableLocomotion?: boolean;
  physicsConfig?: GlobalPhysicsConfig;
  gravity?: Vec2;
}

export class SkeletonPipeline {
  private fk: FKSolver;
  private ik: IKSolver;
  private physics: PhysicsEngine;
  private config: PipelineConfig;
  private isInitialized: boolean = false;

  constructor(
    skeleton: SkeletonDefinition,
    config: PipelineConfig = {}
  ) {
    this.config = {
      enablePhysics: true,
      enableIK: true,
      enableLocomotion: true,
      ...config
    };

    // Initialize FK solver
    this.fk = new FKSolver(skeleton);

    // Initialize IK solver
    const boneDefs = new Map(skeleton.bones.map(b => [b.name, b]));
    this.ik = new IKSolver(
      this.fk,
      skeleton.ik || [],
      boneDefs
    );

    // Initialize physics engine
    const physicsConfigs = new Map<string, PhysicsBoneConfig>();
    for (const bone of skeleton.bones) {
      if (bone.physics) {
        physicsConfigs.set(bone.name, bone.physics);
      }
    }

    this.physics = new PhysicsEngine(
      this.fk,
      physicsConfigs,
      this.config.physicsConfig
    );

    this.isInitialized = true;
  }

  // Main update pipeline - orchestrates the transition from rigid FK to fluid IK
  update(dt: number, locomotionPhase?: number, locomotionSpeed = 1.0): void {
    if (!this.isInitialized) {
      throw new Error('Pipeline not initialized');
    }

    // Step 1: Locomotion Engine (sets local transforms on FK bones)
    if (this.config.enableLocomotion && locomotionPhase !== undefined) {
      this.applyLocomotion(locomotionPhase, locomotionSpeed);
    }

    // Step 2: Physics Engine (modifies localRotation of physics-tagged bones)
    if (this.config.enablePhysics) {
      this.physics.update(dt, this.config.gravity);
    }

    // Step 3: First FK Pass (propagates locomotion + physics changes)
    this.fk.update();

    // Step 4: IK Solver (solves IK constraints, writes back localRotation)
    if (this.config.enableIK) {
      this.ik.applyAll();
    }

    // Step 5: Second FK Pass (re-propagates IK-corrected rotations)
    this.fk.update();

    // Step 6: Validate for rendering
    this.fk.validateForRender();
  }

  // Apply locomotion based on roles (simplified for now)
  private applyLocomotion(phase: number, speed: number): void {
    // This would connect to the existing locomotion engine
    // For now, provide basic walk cycle as example
    
    // Hip sway
    const hipBone = this.getBoneByRole("hip");
    if (hipBone) {
      this.fk.setBoneLocal(hipBone, {
        localY: Math.sin(phase * 2) * 4 * speed
      });
    }

    // Arm swing
    const lThighBone = this.getBoneByRole("l_thigh");
    const rThighBone = this.getBoneByRole("r_thigh");
    
    if (lThighBone) {
      this.fk.setBoneLocal(lThighBone, {
        localRotation: Math.sin(phase) * 30 * speed
      });
    }
    
    if (rThighBone) {
      this.fk.setBoneLocal(rThighBone, {
        localRotation: Math.sin(phase + Math.PI) * 30 * speed
      });
    }

    // Spine bounce
    const spineBone = this.getBoneByRole("spine");
    if (spineBone) {
      this.fk.setBoneLocal(spineBone, {
        localY: Math.abs(Math.sin(phase * 4)) * 2 * speed
      });
    }
  }

  // Get bone by locomotion role
  private getBoneByRole(role: LocomotionRole): string | null {
    // This would use the skeleton's locomotionMap
    // For now, provide hardcoded mapping for bitruvian skeleton
    const roleMap: Record<LocomotionRole, string> = {
      "root": "root",
      "hip": "navel", 
      "spine": "sternum",
      "chest": "collar",
      "neck": "neck_base",
      "head": "head",
      "l_upper_arm": "l_bicep",
      "l_forearm": "l_elbow", 
      "l_hand": "l_wrist",
      "l_thigh": "l_thigh",
      "l_shin": "l_knee",
      "l_foot": "l_ankle",
      "r_upper_arm": "r_bicep",
      "r_forearm": "r_elbow",
      "r_hand": "r_wrist", 
      "r_thigh": "r_thigh",
      "r_shin": "r_knee",
      "r_foot": "r_ankle"
    };

    return roleMap[role] || null;
  }

  // Public API methods

  // Get FK solver
  getFK(): FKSolver {
    return this.fk;
  }

  // Get IK solver
  getIK(): IKSolver {
    return this.ik;
  }

  // Get physics engine
  getPhysics(): PhysicsEngine {
    return this.physics;
  }

  // Reset to rest pose
  reset(): void {
    this.fk.resetToRestPose();
    this.physics.reset();
    this.fk.update(); // Update FK after reset
  }

  // Teleport all bones (useful for scene changes)
  teleport(): void {
    this.physics.teleportAll();
    this.fk.update();
  }

  // Set IK constraint mix at runtime
  setIKMix(constraintName: string, mix: number): boolean {
    return this.ik.setConstraintMix(constraintName, mix);
  }

  // Add/remove IK constraints at runtime
  addIKConstraint(constraint: any): void {
    this.ik.addConstraint(constraint);
  }

  removeIKConstraint(name: string): boolean {
    return this.ik.removeConstraint(name);
  }

  // Enable/disable physics for specific bones
  setPhysicsEnabled(boneName: string, enabled: boolean): void {
    this.physics.setBoneEnabled(boneName, enabled);
  }

  // Set physics parameters at runtime
  setPhysicsConfig(boneName: string, config: Partial<PhysicsBoneConfig>): void {
    this.physics.setBoneConfig(boneName, config);
  }

  // Get world positions for rendering
  getBoneWorldPosition(name: string): Vec2 {
    return this.fk.getBoneWorldPosition(name);
  }

  // Get all bone transforms for rendering
  getAllBones(): Map<string, any> {
    return this.fk.getAllBones();
  }

  // Validate pipeline state
  validate(): string[] {
    const errors: string[] = [];

    // Validate FK
    const fkErrors = this.fk.validateSkeleton();
    for (const error of fkErrors) {
      errors.push(`FK: ${error.message} (${error.bone || 'unknown'})`);
    }

    // Validate physics
    if (this.config.enablePhysics) {
      const physicsStates = this.physics.getAllStates();
      if (physicsStates.size === 0) {
        errors.push('Physics enabled but no physics bones found');
      }
    }

    return errors;
  }

  // Get performance metrics
  getMetrics(): {
    totalBones: number;
    physicsBones: number;
    ikConstraints: number;
    isStable: boolean;
  } {
    const allBones = this.fk.getAllBones();
    const physicsStates = this.physics.getAllStates();
    const ikConstraints = this.ik.getConstraints();

    return {
      totalBones: allBones.size,
      physicsBones: physicsStates.size,
      ikConstraints: ikConstraints.length,
      isStable: this.physics.isStable()
    };
  }

  // Update pipeline configuration
  updateConfig(config: Partial<PipelineConfig>): void {
    Object.assign(this.config, config);
    
    if (config.physicsConfig) {
      this.physics.setGlobalConfig(config.physicsConfig);
    }
  }

  // Get current configuration
  getConfig(): PipelineConfig {
    return { ...this.config };
  }
}
