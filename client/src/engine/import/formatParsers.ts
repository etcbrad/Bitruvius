import { UniversalSkeleton, UniversalSkeletonFactory } from './universalSkeleton';

/**
 * Format-specific parsers for converting external skeletal data to UniversalSkeleton
 */

export class FormatParsers {
  // Parse Graphite.art JSON export
  static parseGraphiteArt(jsonData: any): UniversalSkeleton {
    const skeleton = UniversalSkeletonFactory.createEmpty('Graphite.art Import');
    skeleton.source = 'graphite.art';
    
    if (jsonData.bones) {
      jsonData.bones.forEach((bone: any) => {
        skeleton.bones[bone.id] = {
          id: bone.id,
          name: bone.name || bone.id,
          parentId: bone.parent || null,
          worldX: bone.x || 0,
          worldY: bone.y || 0,
          localX: bone.x || 0,
          localY: bone.y || 0,
          rotationX: 0,
          rotationY: 0,
          rotationZ: bone.angle || 0,
          scaleX: bone.scaleX || 1,
          scaleY: bone.scaleY || 1,
          scaleZ: 1,
          length: bone.length,
        };
        
        if (!bone.parent) skeleton.rootBoneId = bone.id;
      });
    }
    
    return skeleton;
  }

  // Parse CSV format (bone_id, name, parent_id, x, y, angle, length)
  static parseCSV(csvData: string): UniversalSkeleton {
    const skeleton = UniversalSkeletonFactory.createEmpty('CSV Import');
    skeleton.source = 'csv';
    
    const lines = csvData.trim().split('\n');
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const bone: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index];
        if (header === 'x' || header === 'y' || header === 'angle' || header === 'length') {
          bone[header] = parseFloat(value) || 0;
        } else {
          bone[header] = value;
        }
      });
      
      skeleton.bones[bone.bone_id || bone.id] = {
        id: bone.bone_id || bone.id,
        name: bone.name || bone.bone_id || bone.id,
        parentId: bone.parent_id || bone.parent || null,
        worldX: bone.x || 0,
        worldY: bone.y || 0,
        localX: bone.x || 0,
        localY: bone.y || 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: bone.angle || 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        length: bone.length,
      };
      
      if (!bone.parent_id && !bone.parent) {
        skeleton.rootBoneId = bone.bone_id || bone.id;
      }
    }
    
    return skeleton;
  }

  // Parse Spine JSON format
  static parseSpine(jsonData: any): UniversalSkeleton {
    const skeleton = UniversalSkeletonFactory.createEmpty('Spine Import');
    skeleton.source = 'spine';
    
    if (jsonData.skeleton && jsonData.bones) {
      jsonData.bones.forEach((bone: any) => {
        skeleton.bones[bone.name] = {
          id: bone.name,
          name: bone.name,
          parentId: bone.parent || null,
          worldX: bone.x || 0,
          worldY: bone.y || 0,
          localX: bone.x || 0,
          localY: bone.y || 0,
          rotationX: 0,
          rotationY: 0,
          rotationZ: bone.rotation || 0,
          scaleX: bone.scaleX || 1,
          scaleY: bone.scaleY || 1,
          scaleZ: 1,
          length: bone.length,
        };
        
        if (!bone.parent) skeleton.rootBoneId = bone.name;
      });
    }
    
    return skeleton;
  }
}
