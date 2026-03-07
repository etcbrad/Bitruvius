import {
  PhysicsBoneConfig,
  PhysicsBoneState,
  GlobalPhysicsConfig,
  Vec2,
  degreesToRadians,
  radiansToDegrees
} from '../../../shared/types/skeleton';
import { FKSolver, BoneTransform } from './fk';

export class PhysicsEngine {
  private states: Map<string, PhysicsBoneState> = new Map();
  private boneConfigs: Map<string, PhysicsBoneConfig> = new Map();
  private globalConfig: GlobalPhysicsConfig;

  constructor(
    private fk: FKSolver,
    boneConfigs: Map<string, PhysicsBoneConfig>,
    globalConfig: GlobalPhysicsConfig = {}
  ) {
    this.boneConfigs = boneConfigs;
    this.globalConfig = {
      gravity: { x: 0, y: -980 },
      timeScale: 1.0,
      ...globalConfig
    };

    // Initialize physics states for enabled bones
    for (const [boneName, config] of Array.from(boneConfigs.entries())) {
      if (!config.enabled) continue;
      
      const bone = fk.getBone(boneName);
      this.states.set(boneName, {
        angle: bone.localRotation,
        velocity: 0,
        restAngle: bone.localRotation
      });
    }
  }

  update(dt: number, gravity?: Vec2): void {
    const gravityToUse = gravity || this.globalConfig.gravity || { x: 0, y: -980 };
    const scaledDt = dt * (this.globalConfig.timeScale || 1.0);

    for (const [boneName, state] of Array.from(this.states.entries())) {
      const config = this.boneConfigs.get(boneName);
      if (!config || !config.enabled) continue;

      const bone = this.fk.getBone(boneName);
      
      // Compute parent-space gravity influence
      let parentWorldRot = 0;
      try {
        const parentBone = this.getParentBone(boneName);
        if (parentBone) {
          parentWorldRot = parentBone.worldRotation;
        }
      } catch {
        // Root bone or missing parent - use world space
      }

      const gravityAngle = radiansToDegrees(Math.atan2(gravityToUse.y, gravityToUse.x)) - parentWorldRot;
      const gravityTorque = (gravityAngle - state.restAngle) * (config.gravityScale ?? 1.0);

      // Spring-damper: F = -k*x - b*v
      const displacement = state.angle - state.restAngle;
      const springForce = -config.stiffness * 800 * displacement;
      const damperForce = -config.damping * 40 * state.velocity;
      const totalForce = springForce + damperForce + gravityTorque * (1 - config.stiffness);

      // Symplectic Euler integration for stability
      const mass = config.mass || 1.0;
      state.velocity += (totalForce / mass) * scaledDt;
      state.angle += state.velocity * scaledDt;

      // Clamp to max angle
      if (config.maxAngle !== undefined) {
        const minAngle = state.restAngle - config.maxAngle;
        const maxAngle = state.restAngle + config.maxAngle;
        
        if (state.angle < minAngle) {
          state.angle = minAngle;
          state.velocity = Math.max(0, state.velocity);
        } else if (state.angle > maxAngle) {
          state.angle = maxAngle;
          state.velocity = Math.min(0, state.velocity);
        }
      }

      // Apply fluid damping for non-twitchy motion
      const fluidDamping = this.computeFluidDamping(state.velocity, config);
      state.velocity *= (1 - fluidDamping * scaledDt);

      // Write back to FK
      this.fk.setBoneLocal(boneName, { 
        localRotation: state.angle 
      });
    }
  }

  // Teleport bone to new position without spring artifact
  teleport(boneName: string): void {
    const state = this.states.get(boneName);
    if (state) {
      const bone = this.fk.getBone(boneName);
      state.angle = bone.localRotation;
      state.velocity = 0;
    }
  }

  // Teleport all physics bones (useful for scene changes)
  teleportAll(): void {
    for (const boneName of Array.from(this.states.keys())) {
      this.teleport(boneName);
    }
  }

  // Set physics parameters at runtime
  setBoneConfig(boneName: string, config: Partial<PhysicsBoneConfig>): void {
    const existing = this.boneConfigs.get(boneName);
    if (existing) {
      Object.assign(existing, config);
      
      // Reinitialize state if bone is enabled
      if (config.enabled !== false) {
        const state = this.states.get(boneName);
        if (state) {
          const bone = this.fk.getBone(boneName);
          state.restAngle = bone.localRotation;
          state.angle = bone.localRotation;
          state.velocity = 0;
        }
      }
    }
  }

  setGlobalConfig(config: Partial<GlobalPhysicsConfig>): void {
    Object.assign(this.globalConfig, config);
  }

  // Get physics state for debugging/visualization
  getBoneState(boneName: string): PhysicsBoneState | undefined {
    return this.states.get(boneName);
  }

  getAllStates(): Map<string, PhysicsBoneState> {
    return new Map(this.states);
  }

  // Enable/disable physics for specific bones
  setBoneEnabled(boneName: string, enabled: boolean): void {
    const config = this.boneConfigs.get(boneName);
    if (config) {
      config.enabled = enabled;
      
      if (enabled && !this.states.has(boneName)) {
        // Enable physics for this bone
        const bone = this.fk.getBone(boneName);
        this.states.set(boneName, {
          angle: bone.localRotation,
          velocity: 0,
          restAngle: bone.localRotation
        });
      } else if (!enabled) {
        // Disable physics for this bone
        this.states.delete(boneName);
      }
    }
  }

  // Apply impulse to bone (for interactions)
  applyImpulse(boneName: string, impulse: number): void {
    const state = this.states.get(boneName);
    if (state) {
      state.velocity += impulse;
    }
  }

  // Reset all physics to rest pose
  reset(): void {
    for (const [boneName, state] of Array.from(this.states.entries())) {
      state.angle = state.restAngle;
      state.velocity = 0;
      
      const bone = this.fk.getBone(boneName);
      this.fk.setBoneLocal(boneName, { 
        localRotation: state.restAngle 
      });
    }
  }

  private computeFluidDamping(velocity: number, config: PhysicsBoneConfig): number {
    // Adaptive damping based on velocity for fluid motion
    const baseDamping = config.damping;
    const velocityFactor = Math.abs(velocity) / 100; // Normalize to reasonable range
    
    // Increase damping for high velocities (prevents twitching)
    // Decrease damping for low velocities (allows smooth motion)
    return baseDamping * (1 + velocityFactor * 0.5);
  }

  private getParentBone(boneName: string): BoneTransform | null {
    try {
      const boneDef = this.fk.getBoneDefinition(boneName);
      if (!boneDef?.parent) return null;
      
      return this.fk.getBone(boneDef.parent);
    } catch {
      return null;
    }
  }

  // Get energy of the system (for debugging/optimization)
  getTotalEnergy(): number {
    let totalEnergy = 0;
    
    for (const [boneName, state] of Array.from(this.states.entries())) {
      const config = this.boneConfigs.get(boneName);
      if (!config) continue;
      
      // Kinetic energy: 0.5 * m * v^2
      const kineticEnergy = 0.5 * (config.mass || 1.0) * state.velocity * state.velocity;
      
      // Potential energy: 0.5 * k * x^2
      const displacement = state.angle - state.restAngle;
      const potentialEnergy = 0.5 * config.stiffness * 800 * displacement * displacement;
      
      totalEnergy += kineticEnergy + potentialEnergy;
    }
    
    return totalEnergy;
  }

  // Check if system is stable (low energy and velocity)
  isStable(threshold = 0.1): boolean {
    const energy = this.getTotalEnergy();
    const maxVelocity = Array.from(this.states.values())
      .reduce((max, state) => Math.max(max, Math.abs(state.velocity)), 0);
    
    return energy < threshold && maxVelocity < 1.0;
  }
}
