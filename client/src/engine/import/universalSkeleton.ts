import type { Joint } from '../types';

/**
 * Universal Skeletal Import System
 * 
 * This system provides a standardized way to import skeletal data from any external application
 * by converting it to a canonical intermediate representation, then mapping to Bitruvius joints.
 */

// Canonical intermediate representation - the "universal skeleton format"
export interface UniversalBone {
  id: string;
  name: string;
  parentId: string | null;
  
  // Position in world space
  worldX: number;
  worldY: number;
  worldZ?: number; // Optional for 3D data
  
  // Local transform relative to parent
  localX: number;
  localY: number;
  localZ?: number;
  
  // Rotation (in degrees)
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  
  // Skew/shear
  skewX: number;
  skewY: number;
  
  // Scale
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  
  // Bone length (calculated if not provided)
  length?: number;
  
  // Metadata for mapping
  metadata?: {
    originalName?: string;
    side?: 'left' | 'right' | 'center';
    region?: 'head' | 'torso' | 'arm' | 'leg' | 'hand' | 'foot';
    type?: 'bone' | 'joint' | 'effector';
    tags?: string[];
  };
}

export interface UniversalSkeleton {
  name: string;
  version: string;
  source: string; // Source application (e.g., 'graphite.art', 'spine', 'dragonbones')
  
  bones: Record<string, UniversalBone>;
  rootBoneIds: string[]; // Multiple root bones possible
  
  // Optional animation data
  animations?: Array<{
    name: string;
    frames: Array<{
      time: number;
      bones: Record<string, Partial<Pick<UniversalBone, 'worldX' | 'worldY' | 'worldZ' | 'rotationX' | 'rotationY' | 'rotationZ'>>>;
    }>;
  }>;
  
  // Metadata
  metadata?: {
    unit?: string; // 'pixels', 'meters', 'units'
    coordinateSystem?: 'y-up' | 'y-down';
    created?: string;
    author?: string;
    description?: string;
  };
}

// Mapping configuration for converting universal skeleton to Bitruvius joints
export interface BoneMapping {
  universalBoneId: string;
  bitruviusJointId: string;
  transform?: {
    offsetX?: number;
    offsetY?: number;
    scale?: number;
    rotationOffset?: number;
  };
}

export interface ImportResult {
  success: boolean;
  joints: Record<string, Joint>;
  mappings: BoneMapping[];
  warnings: string[];
  errors: string[];
  metadata: {
    sourceFormat: string;
    bonesImported: number;
    bonesMapped: number;
    bonesUnmapped: number;
  };
}

/**
 * Core converter: UniversalSkeleton -> Bitruvius Joints
 */
export class UniversalSkeletonConverter {
  private static readonly DEFAULT_MAPPING: Record<string, string> = {
    // Core spine
    'root': 'root',
    'pelvis': 'navel',
    'hips': 'navel',
    'waist': 'navel',
    'spine': 'sternum',
    'chest': 'sternum',
    'torso': 'sternum',
    'neck': 'neck_base',
    'head': 'nose',
    
    // Left arm
    'left_shoulder': 'l_clavicle',
    'l_shoulder': 'l_clavicle',
    'left_arm': 'l_bicep',
    'l_arm': 'l_bicep',
    'left_elbow': 'l_elbow',
    'l_elbow': 'l_elbow',
    'left_wrist': 'l_wrist',
    'l_wrist': 'l_wrist',
    'left_hand': 'l_wrist',
    'l_hand': 'l_wrist',
    
    // Right arm
    'right_shoulder': 'r_clavicle',
    'r_shoulder': 'r_clavicle',
    'right_arm': 'r_bicep',
    'r_arm': 'r_bicep',
    'right_elbow': 'r_elbow',
    'r_elbow': 'r_elbow',
    'right_wrist': 'r_wrist',
    'r_wrist': 'r_wrist',
    'right_hand': 'r_wrist',
    'r_hand': 'r_wrist',
    
    // Left leg
    'left_hip': 'l_hip',
    'l_hip': 'l_hip',
    'left_thigh': 'l_hip',
    'l_thigh': 'l_hip',
    'left_knee': 'l_knee',
    'l_knee': 'l_knee',
    'left_ankle': 'l_ankle',
    'l_ankle': 'l_ankle',
    'left_foot': 'l_toe',
    'l_foot': 'l_toe',
    
    // Right leg
    'right_hip': 'r_hip',
    'r_hip': 'r_hip',
    'right_thigh': 'r_hip',
    'r_thigh': 'r_hip',
    'right_knee': 'r_knee',
    'r_knee': 'r_knee',
    'right_ankle': 'r_ankle',
    'r_ankle': 'r_ankle',
    'right_foot': 'r_toe',
    'r_foot': 'r_toe',
  };

  static convert(
    universalSkeleton: UniversalSkeleton,
    customMappings?: Record<string, string>
  ): ImportResult {
    const result: ImportResult = {
      success: true,
      joints: {},
      mappings: [],
      warnings: [],
      errors: [],
      metadata: {
        sourceFormat: universalSkeleton.source,
        bonesImported: 0,
        bonesMapped: 0,
        bonesUnmapped: 0,
      },
    };

    try {
      // Merge default mappings with custom mappings
      const allMappings = { ...this.DEFAULT_MAPPING, ...customMappings };
      
      // Convert each universal bone to Bitruvius joint
      const resolvedMapping: Record<string, string> = {};
      
      // First pass: resolve all parent mappings
      Object.entries(universalSkeleton.bones).forEach(([boneId, bone]) => {
        const targetJointId = this.findBestMatch(boneId, bone, allMappings);
        if (targetJointId) {
          resolvedMapping[targetJointId] = targetJointId;
        }
      });
      
      // Second pass: create joints using resolved mappings
      Object.entries(universalSkeleton.bones).forEach(([boneId, bone]) => {
        result.metadata.bonesImported++;
        
        // Find target joint ID using resolved mapping
        const targetJointId = resolvedMapping[boneId] || this.findBestMatch(boneId, bone, allMappings);
        
        if (targetJointId) {
          result.metadata.bonesMapped++;
          
          // Create Bitruvius joint
          const joint: Joint = {
            id: targetJointId,
            label: bone.name || targetJointId,
            parent: this.mapParentId(bone.parentId, resolvedMapping),
            baseOffset: {
              x: bone.localX,
              y: bone.localY,
            },
            currentOffset: {
              x: bone.localX,
              y: bone.localY,
            },
            targetOffset: {
              x: bone.localX,
              y: bone.localY,
            },
            previewOffset: {
              x: bone.localX,
              y: bone.localY,
            },
            rotation: bone.rotationZ || 0,
          };
          
          result.joints[targetJointId] = joint;
          result.mappings.push({
            universalBoneId: boneId,
            bitruviusJointId: targetJointId,
          });
        } else {
          result.metadata.bonesUnmapped++;
          result.warnings.push(`No mapping found for bone: ${boneId} (${bone.name})`);
        }
      });
      
      // Validate hierarchy
      this.validateHierarchy(result.joints, result);
      
    } catch (error) {
      result.success = false;
      result.errors.push(`Conversion failed: ${error}`);
    }
    
    return result;
  }
  
  private static findBestMatch(
    boneId: string,
    bone: UniversalBone,
    mappings: Record<string, string>
  ): string | null {
    // Direct ID match
    if (mappings[boneId]) {
      return mappings[boneId];
    }
    
    // Name match (case insensitive)
    const boneNameLower = (bone.name || boneId).toLowerCase();
    for (const [key, value] of Object.entries(mappings)) {
      if (key.toLowerCase() === boneNameLower) {
        return value;
      }
    }
    
    // Pattern matching for side-specific bones
    if (bone.metadata?.side) {
      const side = bone.metadata.side;
      const baseName = boneNameLower.replace(/^(left|right|l|r)[_-\s]/, '');
      
      for (const [key, value] of Object.entries(mappings)) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes(baseName) && 
            ((side === 'left' && (keyLower.includes('l_') || keyLower.includes('left_'))) ||
             (side === 'right' && (keyLower.includes('r_') || keyLower.includes('right_'))))) {
          return value;
        }
      }
    }
    
    // Region-based matching - only used when no side info or explicitly center
    if (bone.metadata?.region && (!bone.metadata?.side || bone.metadata?.side === 'center')) {
      const region = bone.metadata.region;
      for (const [key, value] of Object.entries(mappings)) {
        if (key.toLowerCase().includes(region.toLowerCase())) {
          return value;
        }
      }
    }
    
    return null;
  }
  
  private static mapParentId(
    parentId: string | null,
    mappings: Record<string, string>,
    resolvedMapping: Record<string, string> = {}
  ): string | null {
    if (!parentId) return null;
    
    // First try direct mappings
    if (mappings[parentId]) {
      resolvedMapping[parentId] = mappings[parentId];
      return mappings[parentId];
    }
    
    // Then try resolved mappings (from findBestMatch)
    for (const [key, value] of Object.entries(mappings)) {
      if (resolvedMapping[value]) {
        resolvedMapping[key] = value;
      }
    }
    
    return resolvedMapping[parentId] || null;
  }
  
  private static isEndEffector(bone: UniversalBone): boolean {
    return bone.metadata?.type === 'effector' || 
           bone.name?.toLowerCase().includes('hand') ||
           bone.name?.toLowerCase().includes('foot') ||
           bone.name?.toLowerCase().includes('nose');
  }
  
  private static findMirrorId(jointId: string): string | undefined {
    const mirrorMap: Record<string, string> = {
      'l_clavicle': 'r_clavicle',
      'r_clavicle': 'l_clavicle',
      'l_bicep': 'r_bicep',
      'r_bicep': 'l_bicep',
      'l_elbow': 'r_elbow',
      'r_elbow': 'l_elbow',
      'l_wrist': 'r_wrist',
      'r_wrist': 'l_wrist',
      'l_hip': 'r_hip',
      'r_hip': 'l_hip',
      'l_knee': 'r_knee',
      'r_knee': 'l_knee',
      'l_ankle': 'r_ankle',
      'r_ankle': 'l_ankle',
      'l_toe': 'r_toe',
      'r_toe': 'l_toe',
    };
    
    return mirrorMap[jointId];
  }
  
  private static validateHierarchy(
    joints: Record<string, Joint>,
    result: ImportResult
  ): void {
    const visited = new Set<string>();
    
    // Check for cycles and missing parents
    const checkBone = (jointId: string, depth: number = 0): void => {
      if (depth > 50) {
        result.errors.push(`Cycle detected in bone hierarchy starting at: ${jointId}`);
        result.success = false;
        return;
      }
      
      if (visited.has(jointId)) return;
      visited.add(jointId);
      
      const joint = joints[jointId];
      if (!joint) return;
      
      if (joint.parent && !joints[joint.parent]) {
        result.warnings.push(`Missing parent bone: ${joint.parent} for bone: ${jointId}`);
      }
      
      if (joint.parent) {
        checkBone(joint.parent, depth + 1);
      }
    };
    
    Object.keys(joints).forEach(jointId => checkBone(jointId));
  }
}

/**
 * Utility functions for creating universal skeletons from different formats
 */
export class UniversalSkeletonFactory {
  static createEmpty(name: string): UniversalSkeleton {
    return {
      name,
      version: '1.0',
      source: 'manual',
      bones: {},
      rootBoneIds: [],
      metadata: {
        unit: 'pixels',
        coordinateSystem: 'y-down',
      },
    };
  }
  
  static fromJSON(jsonData: any): UniversalSkeleton {
    // Validate required fields
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error('Invalid JSON data');
    }
    
    const data = jsonData as any;
    
    // Check for required UniversalSkeleton fields
    const requiredFields = ['version', 'source', 'rootBoneIds', 'name', 'bones'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate field types
    if (typeof data.version !== 'string') {
      throw new Error('Invalid version field type');
    }
    if (typeof data.source !== 'string') {
      throw new Error('Invalid source field type');
    }
    if (!Array.isArray(data.rootBoneIds)) {
      throw new Error('Invalid rootBoneIds field type');
    }
    if (typeof data.name !== 'string') {
      throw new Error('Invalid name field type');
    }
    if (typeof data.bones !== 'object' || data.bones === null) {
      throw new Error('Invalid bones field type');
    }
    
    // Try to parse as universal skeleton format
    if (data.bones && data.name) {
      return data as UniversalSkeleton;
    }
    
    // Try to convert from DragonBones format
    if (data.armature) {
      return this.fromDragonBones(data);
    }
    
    throw new Error('Unsupported JSON format');
  }
  
  private static fromDragonBones(data: any): UniversalSkeleton {
    const skeleton: UniversalSkeleton = {
      name: data.name || 'Imported DragonBones Skeleton',
      version: '1.0',
      source: 'dragonbones',
      bones: {},
      rootBoneIds: [], // Multiple root bones possible
      metadata: {
        unit: 'pixels',
        coordinateSystem: 'y-down',
        created: new Date().toISOString(),
      },
    };
    
    const armature = data.armature[0];
    const bones = armature.bone || [];
      
    bones.forEach((bone: any) => {
      const universalBone: UniversalBone = {
        id: bone.name,
        name: bone.name,
        parentId: bone.parent || null,
        worldX: bone.transform?.x || 0,
        worldY: -(bone.transform?.y || 0), // DragonBones uses Y-up
        worldZ: 0,
        localX: bone.transform?.x || 0,
        localY: -(bone.transform?.y || 0),
        localZ: 0,
        rotationX: bone.transform?.rotation || 0,
        rotationY: 0,
        rotationZ: 0,
        skewX: bone.transform?.skX || 0,
        skewY: bone.transform?.skY || 0,
        scaleX: bone.transform?.scX || 1,
        scaleY: bone.transform?.scY || 1,
        scaleZ: 1,
        length: bone.length || 0,
      };
        
      skeleton.bones[bone.name] = universalBone;
        
      if (!bone.parent) {
        skeleton.rootBoneIds.push(bone.name);
      }
    });
    
    return skeleton;
  }
}
