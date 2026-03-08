/**
 * @file reinigerPhysicsConfig.ts
 * Configuration and integration for Reiniger Physics Engine
 */

import type { SkeletonState } from './types';
import { ReinigerEngine, ReinigerJointConfig, DEFAULT_JOINT_CONFIGS } from './reinigerPhysics';

export interface ReinigerGlobalConfig {
  enabled: boolean;
  gravity: { x: number; y: number };           // Zero gravity for weightless feel
  globalDamping: number;                       // Air resistance (0.7 to 0.95)
  globalStiffness: number;                     // Default snap strength
  snapToGrid: boolean;                         // Force 15° increments
  gridIncrement: number;                       // Degrees for snap-to-grid
  layerZSpacing: number;                       // Z-depth spacing for layers
}

export const DEFAULT_REINIGER_CONFIG: ReinigerGlobalConfig = {
  enabled: true,
  gravity: { x: 0, y: 0 },                     // Zero gravity
  globalDamping: 0.9,                          // High damping for feathery feel
  globalStiffness: 0.15,                        // Moderate snap strength
  snapToGrid: false,
  gridIncrement: 15,                           // Classical 15° increments
  layerZSpacing: 10,                           // 10 units per layer
};

/**
 * Reiniger Physics Manager - Integrates with existing Bitruvius physics
 */
export class ReinigerPhysicsManager {
  private engine: ReinigerEngine;
  private config: ReinigerGlobalConfig;
  private jointStates: Map<string, any> = new Map();

  constructor(
    private onStateUpdate: (jointId: string, angle: number) => void,
    initialConfig: Partial<ReinigerGlobalConfig> = {}
  ) {
    this.config = { ...DEFAULT_REINIGER_CONFIG, ...initialConfig };
    
    this.engine = new ReinigerEngine((jointId, state) => {
      this.jointStates.set(jointId, state);
      this.onStateUpdate(jointId, state.angle);
    });
  }

  /**
   * Initialize joints from current skeleton state
   */
  initializeJoints(state: SkeletonState): void {
    // Clear existing joints
    this.engine.destroy();
    this.jointStates.clear();

    // Add all current joints with appropriate configurations
    Object.entries(state.joints).forEach(([jointId, joint]) => {
      const config = DEFAULT_JOINT_CONFIGS[jointId] || {};
      
      // Apply global config overrides
      const jointConfig: Partial<ReinigerJointConfig> = {
        stiffness: this.config.globalStiffness,
        damping: this.config.globalDamping,
        ...config,
      };

      this.engine.addJoint(jointId, joint, jointConfig);
    });

    // Start physics if enabled
    if (this.config.enabled) {
      this.engine.start();
    }
  }

  /**
   * Apply gesture to joint with snap-to-grid if enabled
   */
  applyGesture(jointId: string, targetAngle: number): void {
    if (!this.config.enabled) return;

    // Apply snap-to-grid if enabled
    let finalAngle = targetAngle;
    if (this.config.snapToGrid) {
      finalAngle = Math.round(targetAngle / this.config.gridIncrement) * this.config.gridIncrement;
    }

    this.engine.applyGesture(jointId, finalAngle);
  }

  /**
   * Update global configuration
   */
  updateGlobalConfig(config: Partial<ReinigerGlobalConfig>): void {
    this.config = { ...this.config, ...config };

    // Update engine configuration
    this.engine.updateGlobalConfig({
      stiffness: this.config.globalStiffness,
      damping: this.config.globalDamping,
    });

    // Toggle engine based on enabled state
    if (this.config.enabled) {
      this.engine.start();
    } else {
      this.engine.stop();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ReinigerGlobalConfig {
    return { ...this.config };
  }

  /**
   * Get joint state for rendering
   */
  getJointState(jointId: string): any {
    return this.jointStates.get(jointId);
  }

  /**
   * Get all joint states
   */
  getAllJointStates(): Record<string, any> {
    const states: Record<string, any> = {};
    this.jointStates.forEach((state, jointId) => {
      states[jointId] = state;
    });
    return states;
  }

  /**
   * Calculate Z-depth for layer sorting
   */
  calculateLayerZDepth(layerIndex: number): number {
    return layerIndex * this.config.layerZSpacing;
  }

  /**
   * Apply physics to cutout slots for layer management
   */
  updateCutoutSlotLayers(slots: Record<string, any>, layerOrder: string[]): void {
    layerOrder.forEach((slotId, index) => {
      if (slots[slotId]) {
        slots[slotId].zIndex = this.calculateLayerZDepth(index);
      }
    });
  }

  /**
   * Destroy the physics manager
   */
  destroy(): void {
    this.engine.destroy();
    this.jointStates.clear();
  }
}

/**
 * Utility functions for Reiniger physics
 */
export const ReinigerUtils = {
  /**
   * Convert angle to snap-to-grid value
   */
  snapAngleToGrid(angle: number, increment: number): number {
    return Math.round(angle / increment) * increment;
  },

  /**
   * Calculate power-4 out easing for gestures
   */
  power4Out: (t: number): number => {
    return 1 - Math.pow(1 - t, 4);
  },

  /**
   * Calculate "paper flutter" micro-oscillation
   */
  calculateFlutter: (baseValue: number, intensity: number = 0.5): number => {
    return baseValue + (Math.random() - 0.5) * intensity;
  },

  /**
   * Check if joint should settle (static friction)
   */
  shouldSettle: (velocity: number, displacement: number, velocityThreshold: number = 0.01, displacementThreshold: number = 0.001): boolean => {
    return Math.abs(velocity) < velocityThreshold && Math.abs(displacement) < displacementThreshold;
  },

  /**
   * Apply high-impulse force for gesture input
   */
  calculateImpulse: (displacement: number, impulseMultiplier: number = 0.5): number => {
    return displacement * impulseMultiplier;
  },
};
