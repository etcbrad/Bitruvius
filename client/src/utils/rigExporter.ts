import type { SkeletonState, Joint, Point } from '../engine/types';

export interface RigExportSchema {
  version: string;
  metadata: {
    name: string;
    description?: string;
    author?: string;
    createdAt: string;
    bitruviusVersion: string;
  };
  skeleton: {
    joints: Record<string, JointExport>;
    connections: ConnectionExport[];
    physics: PhysicsExport;
  };
  assets: {
    masks: MaskExport[];
    cutouts: CutoutExport[];
  };
  performance: {
    targetFps: number;
    averageFps?: number;
    optimizationLevel: 'low' | 'medium' | 'high';
  };
}

export interface JointExport {
  id: string;
  parent?: string;
  mirrorId?: string;
  position: Point;
  isEndEffector: boolean;
  physics: {
    stiffness: number;
    damping: number;
    mass: number;
  };
  constraints?: {
    minAngle?: number;
    maxAngle?: number;
    stiffness?: number;
  };
}

export interface ConnectionExport {
  from: string;
  to: string;
  type: 'bone' | 'constraint' | 'mask';
  physics: {
    restLength: number;
    stiffness: number;
    damping: number;
  };
}

export interface PhysicsExport {
  mode: 'cardboard' | 'realistic' | 'rubberhose';
  rigidity: number;
  snappiness: number;
  ikSensitivity: number;
  gravity: Point;
  globalDamping: number;
}

export interface MaskExport {
  id: string;
  name: string;
  jointId: string;
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
  blendMode: string;
  opacity: number;
  physics: {
    stiffness: number;
    damping: number;
  };
}

export interface CutoutExport {
  id: string;
  name: string;
  type: 'torso' | 'limb' | 'head' | 'accessory';
  jointBindings: string[];
  transform: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
}

export class RigExporter {
  static exportRig(
    state: SkeletonState,
    metadata: Partial<RigExportSchema['metadata']> = {}
  ): RigExportSchema {
    // Convert joints to export format
    const joints: Record<string, JointExport> = {};
    
    Object.entries(state.joints).forEach(([id, joint]) => {
      joints[id] = {
        id,
        parent: joint.parent || undefined,
        mirrorId: joint.mirrorId || undefined,
        position: joint.previewOffset,
        isEndEffector: joint.isEndEffector || false,
        physics: {
          stiffness: state.physicsRigidity,
          damping: 1 - state.snappiness,
          mass: 1.0 // Default mass
        }
      };
    });

    // Convert connections
    const connections: ConnectionExport[] = [];
    // This would need to be populated based on your connection system
    // For now, we'll create basic bone connections
    Object.entries(joints).forEach(([id, joint]) => {
      if (joint.parent) {
        connections.push({
          from: joint.parent,
          to: id,
          type: 'bone',
          physics: {
            restLength: Math.hypot(joint.position.x, joint.position.y),
            stiffness: state.physicsRigidity,
            damping: 1 - state.snappiness
          }
        });
      }
    });

    // Convert masks
    const masks: MaskExport[] = [];
    Object.entries(state.scene.jointMasks || {}).forEach(([id, mask]) => {
      masks.push({
        id,
        name: id,
        jointId: id,
        transform: {
          x: mask.offsetX || 0,
          y: mask.offsetY || 0,
          scaleX: mask.scale || 1,
          scaleY: mask.scale || 1,
          rotation: mask.rotation || 0,
        },
        blendMode: mask.blendMode || 'normal',
        opacity: mask.opacity ?? 1,
        physics: {
          stiffness: state.physicsRigidity,
          damping: 1 - state.snappiness,
        },
      });
    });

    // Convert cutouts
    const cutouts: CutoutExport[] = [];
    Object.entries(state.cutoutSlots || {}).forEach(([id, slot]) => {
      cutouts.push({
        id,
        name: slot.name || id,
        type: 'torso', // Default type
        jointBindings: [slot.attachment?.toJointId || slot.attachment?.fromJointId || 'root'],
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
      });
    });

    return {
      version: '1.0.0',
      metadata: {
        name: metadata.name || 'Bitruvius Rig',
        description: metadata.description,
        author: metadata.author,
        createdAt: new Date().toISOString(),
        bitruviusVersion: '2.0.0'
      },
      skeleton: {
        joints,
        connections,
        physics: {
          mode: state.rigidity,
          rigidity: state.physicsRigidity,
          snappiness: state.snappiness,
          ikSensitivity: state.ikSensitivity,
          gravity: { x: 0, y: 9.81 }, // Default gravity
          globalDamping: 0.1
        }
      },
      assets: {
        masks,
        cutouts
      },
      performance: {
        targetFps: 60,
        optimizationLevel: 'medium'
      }
    };
  }

  static downloadRig(rig: RigExportSchema, filename?: string): void {
    const jsonString = JSON.stringify(rig, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `${rig.metadata.name.replace(/\s+/g, '_')}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  static async loadRig(file: File): Promise<RigExportSchema> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          resolve(json as RigExportSchema);
        } catch (error) {
          reject(new Error('Invalid rig file format'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  static validateRig(rig: any): rig is RigExportSchema {
    return (
      rig &&
      typeof rig === 'object' &&
      typeof rig.version === 'string' &&
      rig.metadata &&
      typeof rig.metadata.name === 'string' &&
      rig.skeleton &&
      rig.skeleton.joints &&
      typeof rig.skeleton.joints === 'object' &&
      rig.skeleton.physics &&
      typeof rig.skeleton.physics.mode === 'string'
    );
  }
}
