import type { SkeletonState } from '../types';
import { UniversalSkeleton } from './universalSkeleton';

export class UniversalSkeletonExporter {
  static exportToUniversal(
    state: SkeletonState,
    name: string = 'Bitruvius Skeleton'
  ): UniversalSkeleton {
    const skeleton: UniversalSkeleton = {
      name,
      version: '1.0',
      source: 'bitruvius',
      bones: {},
      rootBoneId: 'root',
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
        jointId,
        joint.label || jointId,
        joint.parent || '',
        joint.currentOffset.x.toString(),
        joint.currentOffset.y.toString(),
        (joint.rotation || 0).toString(),
        '0', // length - would need to be calculated
      ];
      rows.push(row.join(','));
    });

    return rows.join('\n');
  }

  private static detectSide(jointId: string): 'left' | 'right' | 'center' | undefined {
    const id = jointId.toLowerCase();
    if (id.startsWith('l_') || id.includes('left')) return 'left';
    if (id.startsWith('r_') || id.includes('right')) return 'right';
    if (['root', 'navel', 'sternum', 'collar', 'neck_base', 'neck_upper', 'head'].includes(jointId)) return 'center';
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
