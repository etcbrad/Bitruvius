import type { SkeletonState } from '../types';
import { UniversalSkeleton } from './universalSkeleton';

export class UniversalSkeletonExporter {
  private static findRootJoint(state: SkeletonState): string {
    // Find the joint with no parent (root joint)
    for (const [jointId, joint] of Object.entries(state.joints)) {
      if (!joint.parent) {
        return jointId;
      }
    }
    // Fallback to 'root' if no parentless joint found
    return 'root';
  }

  private static escapeCsv(value: string): string {
    // Escape CSV fields according to RFC 4180
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  static exportToUniversal(
    state: SkeletonState,
    name: string = 'Bitruvius Skeleton'
  ): UniversalSkeleton {
    // Find the root joint (joint with no parent)
    const rootJointId = this.findRootJoint(state);
    
    const skeleton: UniversalSkeleton = {
      name,
      version: '1.0',
      source: 'bitruvius',
      bones: {},
      rootBoneId: rootJointId,
      metadata: {
        unit: 'pixels',
        coordinateSystem: 'y-down',
        created: new Date().toISOString(),
      },
    };

    // Convert Bitruvius joints to universal bones
    Object.entries(state.joints).forEach(([jointId, joint]) => {
      const universalBone = {
        id: jointId,
        name: joint.label || jointId,
        parentId: joint.parent,
        worldX: joint.currentOffset.x,
        worldY: joint.currentOffset.y,
        worldZ: 0,
        localX: joint.baseOffset.x,
        localY: joint.baseOffset.y,
        localZ: 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: joint.rotation || 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        metadata: {
          originalName: joint.label,
          type: (joint.isEndEffector ? 'effector' : 'bone') as 'joint' | 'effector' | 'bone' | undefined,
          side: this.detectSide(jointId),
          region: this.detectRegion(jointId) as 'head' | 'torso' | 'arm' | 'leg' | 'hand' | 'foot' | undefined,
        },
      };

      skeleton.bones[jointId] = universalBone;
    });

    return skeleton;
  }

  static exportToJSON(state: SkeletonState, name?: string): string {
    const universalSkeleton = this.exportToUniversal(state, name);
    return JSON.stringify(universalSkeleton, null, 2);
  }

  static exportToCSV(state: SkeletonState): string {
    const headers = ['bone_id', 'name', 'parent_id', 'x', 'y', 'angle', 'length'];
    const rows = [headers.join(',')];

    Object.entries(state.joints).forEach(([jointId, joint]) => {
      const row = [
        this.escapeCsv(jointId),
        this.escapeCsv(joint.label || jointId),
        this.escapeCsv(joint.parent || ''),
        this.escapeCsv(joint.currentOffset.x.toString()),
        this.escapeCsv(joint.currentOffset.y.toString()),
        this.escapeCsv((joint.rotation || 0).toString()),
      ];
      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  private static detectSide(jointId: string): 'left' | 'right' | 'center' | undefined {
    const id = jointId.toLowerCase();
    if (id.startsWith('l_') || id.includes('left')) return 'left';
    if (id.startsWith('r_') || id.includes('right')) return 'right';
    if (['root', 'navel', 'sternum', 'collar', 'neck_base', 'neck_upper', 'head'].includes(id)) return 'center';
    return undefined;
  }

  private static detectRegion(jointId: string): string | undefined {
    const id = jointId.toLowerCase();
    if (id.includes('head') || id.includes('neck')) return 'head';
    if (id.includes('sternum') || id.includes('collar') || id.includes('navel')) return 'torso';
    if (id.includes('shoulder') || id.includes('bicep') || id.includes('elbow') || id.includes('wrist')) return 'arm';
    if (id.includes('hip') || id.includes('thigh') || id.includes('knee') || id.includes('ankle')) return 'leg';
    if (id.includes('toe') || id.includes('foot')) return 'foot';
    if (id.includes('fingertip') || id.includes('hand')) return 'hand';
    return undefined;
  }
}
