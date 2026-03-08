/**
 * @file reinigerPhysics.ts
 * Implementation of Damped Spring Kinematics for Rigid Cutouts
 * Based on Lotte Reiniger's silhouette animation principles
 */

import type { Joint, SkeletonState } from './types';

export interface ReinigerJointConfig {
  stiffness: number;     // "k" - Snap strength (0.1 to 0.5)
  damping: number;       // "c" - Feathery resistance (0.7 to 0.95)
  staticFriction: number; // Threshold to stop micro-jitters (0.001 to 0.01)
  shouldSettle?: (velocity: number, displacement: number, velocityThreshold?: number, displacementThreshold?: number) => boolean; // Custom settle logic
  minAngle?: number;     // Hard stop limit (degrees)
  maxAngle?: number;     // Hard stop limit (degrees)
}

export interface ReinigerJointState {
  angle: number;         // Current angle
  velocity: number;     // Angular velocity
  targetAngle: number;  // Target angle to snap to
  config: ReinigerJointConfig;
  lastUpdate: number;   // Timestamp for delta time calculation
}

export class ReinigerJoint {
  private state: ReinigerJointState;
  private readonly baseJoint: Joint;

  constructor(baseJoint: Joint, config: Partial<ReinigerJointConfig> = {}) {
    this.baseJoint = baseJoint;
    this.state = {
      angle: baseJoint.rotation || 0,
      velocity: 0,
      targetAngle: baseJoint.rotation || 0,
      config: {
        stiffness: 0.15,      // Default snap strength
        damping: 0.85,        // Default feathery resistance
        staticFriction: 0.001, // Default micro-jitter threshold
        minAngle: -180,        // Full rotation range by default
        maxAngle: 180,
        ...config
      },
      lastUpdate: Date.now()
    };
  }

  /**
   * Apply a gesture "flick" to the joint
   * This creates the immediate gesture-first feel
   */
  performGesture(newAngle: number): void {
    // Apply power-4 out easing to the angle for natural settle
    const normalizedAngle = (newAngle % 360 + 360) % 360; // Normalize to 0-360
    const easedProgress = this.power4Out(normalizedAngle / 360); // Apply easing to 0-1 range
    const easedAngle = easedProgress * 360; // Convert back to angle
    
    // Set target with immediate response
    this.state.targetAngle = this.clampAngle(easedAngle);
    
    // Add initial impulse for "flick" feeling
    const displacement = this.state.targetAngle - this.state.angle;
    this.state.velocity = displacement * 0.5; // High initial impulse
  }

  /**
   * Update the joint physics using damped spring equation
   * τ = -kθ - cω
   */
  update(): void {
    const now = Date.now();
    const deltaTime = Math.min((now - this.state.lastUpdate) / 1000, 0.1); // Cap at 100ms
    this.state.lastUpdate = now;

    // Calculate angular displacement from target
    const displacement = this.state.targetAngle - this.state.angle;
    
    // Apply spring force (Snap to target) - τ = -kθ
    const springForce = displacement * this.state.config.stiffness;
    
    // Apply damping (Air resistance/Paper feel) - τ = -cω
    this.state.velocity += springForce;
    this.state.velocity *= Math.pow(this.state.config.damping, deltaTime);
    
    // Update angle based on velocity
    this.state.angle += this.state.velocity * deltaTime * 60; // Normalize to 60fps
    
    // Apply hard stop limits
    this.state.angle = this.clampAngle(this.state.angle);
    
    // Static friction - Stop micro-jitters
    if (this.state.config.shouldSettle?.(this.state.velocity, displacement, 0.01, 0.001) ?? false) {
      this.state.velocity = 0;
      this.state.angle = this.state.targetAngle;
    }
    
    // Add "paper flutter" micro-oscillation when settling
    if (Math.abs(this.state.velocity) < 0.01 && Math.abs(displacement) > 0.001) {
      this.state.angle += (Math.random() - 0.5) * 0.5; // < 1° Z-axis flutter
    }
  }

  /**
   * Power-4 out easing function for natural settle
   * Starts nearly instantaneous, slows down significantly at end
   */
  private power4Out(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }

  /**
   * Clamp angle within configured limits
   */
  private clampAngle(angle: number): number {
    const { minAngle = -180, maxAngle = 180 } = this.state.config;
    return Math.max(minAngle, Math.min(maxAngle, angle));
  }

  /**
   * Get current joint state for rendering
   */
  getState(): ReinigerJointState {
    return { ...this.state };
  }

  /**
   * Get base joint reference
   */
  getBaseJoint(): Joint {
    return this.baseJoint;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ReinigerJointConfig>): void {
    this.state.config = { ...this.state.config, ...config };
  }
}

/**
 * Reiniger Physics Engine - Manages all feathery joints
 */
export class ReinigerEngine {
  private joints: Map<string, ReinigerJoint> = new Map();
  private animationFrame: number | null = null;
  private isRunning = false;

  constructor(private onStateUpdate?: (jointId: string, state: ReinigerJointState) => void) {}

  /**
   * Add a joint to the physics system
   */
  addJoint(jointId: string, baseJoint: Joint, config?: Partial<ReinigerJointConfig>): void {
    const reinigerJoint = new ReinigerJoint(baseJoint, config);
    this.joints.set(jointId, reinigerJoint);
  }

  /**
   * Remove a joint from the physics system
   */
  removeJoint(jointId: string): void {
    this.joints.delete(jointId);
  }

  /**
   * Apply gesture to a specific joint
   */
  applyGesture(jointId: string, targetAngle: number): void {
    const joint = this.joints.get(jointId);
    if (joint) {
      joint.performGesture(targetAngle);
      this.start();
    }
  }

  /**
   * Update physics configuration for all joints
   */
  updateGlobalConfig(config: Partial<ReinigerJointConfig>): void {
    this.joints.forEach(joint => joint.updateConfig(config));
  }

  /**
   * Start the physics simulation
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    const animate = () => {
      if (!this.isRunning) return;
      
      this.joints.forEach((joint, jointId) => {
        joint.update();
        this.onStateUpdate?.(jointId, joint.getState());
      });
      
      this.animationFrame = requestAnimationFrame(animate);
    };
    
    animate();
  }

  /**
   * Stop the physics simulation
   */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Get all joint states
   */
  getAllStates(): Record<string, ReinigerJointState> {
    const states: Record<string, ReinigerJointState> = {};
    this.joints.forEach((joint, jointId) => {
      states[jointId] = joint.getState();
    });
    return states;
  }

  /**
   * Destroy the engine and clean up
   */
  destroy(): void {
    this.stop();
    this.joints.clear();
  }
}

/**
 * Default joint configurations for different body parts
 * Based on realistic paper folding constraints
 */
export const DEFAULT_JOINT_CONFIGS: Record<string, Partial<ReinigerJointConfig>> = {
  // Head and neck - limited rotation
  'neck_base': { minAngle: -45, maxAngle: 45, stiffness: 0.2, damping: 0.9 },
  'head': { minAngle: -30, maxAngle: 30, stiffness: 0.15, damping: 0.95 },
  
  // Shoulders - wide range but limited
  'l_clavicle': { minAngle: -90, maxAngle: 45, stiffness: 0.12, damping: 0.85 },
  'r_clavicle': { minAngle: -45, maxAngle: 90, stiffness: 0.12, damping: 0.85 },
  
  // Elbows - one-directional hinge
  'l_elbow': { minAngle: 0, maxAngle: 150, stiffness: 0.18, damping: 0.88 },
  'r_elbow': { minAngle: 0, maxAngle: 150, stiffness: 0.18, damping: 0.88 },
  
  // Wrists - limited rotation
  'l_wrist': { minAngle: -90, maxAngle: 90, stiffness: 0.15, damping: 0.92 },
  'r_wrist': { minAngle: -90, maxAngle: 90, stiffness: 0.15, damping: 0.92 },
  
  // Hips - limited movement
  'l_hip': { minAngle: -45, maxAngle: 120, stiffness: 0.2, damping: 0.9 },
  'r_hip': { minAngle: -120, maxAngle: 45, stiffness: 0.2, damping: 0.9 },
  
  // Knees - one-directional hinge
  'l_knee': { minAngle: 0, maxAngle: 150, stiffness: 0.18, damping: 0.88 },
  'r_knee': { minAngle: 0, maxAngle: 150, stiffness: 0.18, damping: 0.88 },
  
  // Ankles - limited rotation
  'l_ankle': { minAngle: -45, maxAngle: 45, stiffness: 0.15, damping: 0.92 },
  'r_ankle': { minAngle: -45, maxAngle: 45, stiffness: 0.15, damping: 0.92 },
  
  // Torso and waist - stable core
  'waist': { minAngle: -30, maxAngle: 30, stiffness: 0.25, damping: 0.9 },
  'torso': { minAngle: -15, maxAngle: 15, stiffness: 0.3, damping: 0.95 },
};
