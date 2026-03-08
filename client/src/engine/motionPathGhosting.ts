/**
 * @file motionPathGhosting.ts
 * Visual feedback system for Reiniger physics - shows motion paths and gestures
 */

export interface MotionPathPoint {
  x: number;
  y: number;
  angle: number;
  timestamp: number;
  opacity: number;
}

export interface GhostTrail {
  jointId: string;
  points: MotionPathPoint[];
  maxPoints: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  color: string;
}

export class MotionPathGhosting {
  private trails: Map<string, GhostTrail> = new Map();
  private animationFrame: number | null = null;
  private isRunning = false;
  private renderCallback: ((trails: GhostTrail[]) => void) | null = null;

  constructor(renderCallback?: (trails: GhostTrail[]) => void) {
    this.renderCallback = renderCallback || null;
  }

  /**
   * Add a motion point to a joint's trail
   */
  addMotionPoint(jointId: string, x: number, y: number, angle: number): void {
    let trail = this.trails.get(jointId);
    
    if (!trail) {
      trail = {
        jointId,
        points: [],
        maxPoints: 20,        // Keep last 20 points for smooth trail
        fadeInDuration: 100,  // 100ms fade in
        fadeOutDuration: 1000, // 1s fade out
        color: this.getJointColor(jointId),
      };
      this.trails.set(jointId, trail);
    }

    // Add new point
    const point: MotionPathPoint = {
      x,
      y,
      angle,
      timestamp: Date.now(),
      opacity: 0, // Start transparent, will fade in
    };

    trail.points.push(point);

    // Remove old points if we exceed maxPoints
    if (trail.points.length > trail.maxPoints) {
      trail.points.shift();
    }

    // Start animation if not running
    if (!this.isRunning) {
      this.start();
    }
  }

  /**
   * Clear all motion trails
   */
  clearTrails(): void {
    this.trails.clear();
    this.stop();
  }

  /**
   * Clear trail for specific joint
   */
  clearJointTrail(jointId: string): void {
    this.trails.delete(jointId);
  }

  /**
   * Start the animation loop
   */
  private start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    const animate = () => {
      if (!this.isRunning) return;
      
      const now = Date.now();
      let hasActivePoints = false;

      // Update all trail points
      this.trails.forEach(trail => {
        trail.points.forEach(point => {
          const age = now - point.timestamp;
          
          if (age < trail.fadeInDuration) {
            // Fade in phase
            point.opacity = age / trail.fadeInDuration;
            hasActivePoints = true;
          } else if (age < trail.fadeInDuration + trail.fadeOutDuration) {
            // Fade out phase
            const fadeOutAge = age - trail.fadeInDuration;
            point.opacity = 1 - (fadeOutAge / trail.fadeOutDuration);
            hasActivePoints = true;
          } else {
            // Fully faded
            point.opacity = 0;
          }
        });

        // Remove fully faded points from the beginning
        while (trail.points.length > 0 && trail.points[0].opacity === 0) {
          trail.points.shift();
        }
      });

      // Continue animation if there are active points
      const activeTrails = Array.from(this.trails.values()).filter(trail => trail.points.length > 0);
      if (activeTrails.length === 0) {
        this.stop();
        return;
      }
      
      if (this.renderCallback) {
        this.renderCallback(activeTrails);
      }

      // Continue animation if there are active points
      if (hasActivePoints) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.isRunning = false;
      }
    };
    
    animate();
  }

  /**
   * Stop the animation loop
   */
  private stop(): void {
    this.isRunning = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Get color for joint based on type/region
   */
  private getJointColor(jointId: string): string {
    // Color coding for different joint types
    const colorMap: Record<string, string> = {
      // Head and neck - purple
      'head': '#a855f7',
      'neck_base': '#9333ea',
      
      // Shoulders - blue
      'l_clavicle': '#3b82f6',
      'r_clavicle': '#2563eb',
      
      // Arms - cyan
      'l_upper_arm': '#06b6d4',
      'l_forearm': '#0891b2',
      'l_wrist': '#0e7490',
      'r_upper_arm': '#06b6d4',
      'r_forearm': '#0891b2',
      'r_wrist': '#0e7490',
      
      // Torso - green
      'collar': '#10b981',
      'torso': '#059669',
      'waist': '#047857',
      
      // Legs - orange
      'l_hip': '#f97316',
      'l_knee': '#ea580c',
      'l_ankle': '#c2410c',
      'r_hip': '#f97316',
      'r_knee': '#ea580c',
      'r_ankle': '#c2410c',
      
      // Default - gray
    };

    return colorMap[jointId] || '#6b7280';
  }

  /**
   * Get all current trails for rendering
   */
  getAllTrails(): GhostTrail[] {
    return Array.from(this.trails.values()).filter(trail => trail.points.length > 0);
  }

  /**
   * Destroy the ghosting system
   */
  destroy(): void {
    this.stop();
    this.trails.clear();
    this.renderCallback = null;
  }
}
