import { UniversalSkeletonFactory } from './universalSkeleton';
import type { UniversalBone, UniversalSkeleton } from './universalSkeleton';

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
          skewX: 0,
          skewY: 0,
          scaleX: bone.scaleX || 1,
          scaleY: bone.scaleY || 1,
          scaleZ: 1,
          length: bone.length,
        } satisfies UniversalBone;
        
        if (!bone.parent) {
          if (!skeleton.rootBoneIds.includes(bone.id)) skeleton.rootBoneIds.push(bone.id);
        }
      });
    }
    
    return skeleton;
  }

  // Parse CSV format (bone_id, name, parent_id, x, y, angle, length)
  static parseCSV(csvData: string): UniversalSkeleton {
    const skeleton = UniversalSkeletonFactory.createEmpty('CSV Import');
    skeleton.source = 'csv';
    
    const lines = csvData.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      throw new Error('CSV data is empty');
    }
    
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      // Simple CSV parser that handles quoted fields
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      const bone: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index] || '';
        if (header === 'x' || header === 'y' || header === 'angle' || header === 'length') {
          bone[header] = parseFloat(value) || 0;
        } else {
          bone[header] = value;
        }
      });
      
      if (!bone.bone_id && !bone.id) {
        throw new Error(`Row ${i} missing required bone_id or id field`);
      }
      
      const id = bone.bone_id || bone.id;
      const parentId = bone.parent_id || bone.parent || null;
      skeleton.bones[id] = {
        id,
        name: bone.name || id,
        parentId,
        worldX: bone.x || 0,
        worldY: bone.y || 0,
        localX: bone.x || 0,
        localY: bone.y || 0,
        rotationX: 0,
        rotationY: 0,
        rotationZ: bone.angle || 0,
        skewX: 0,
        skewY: 0,
        scaleX: bone.scaleX ?? 1,
        scaleY: bone.scaleY ?? 1,
        scaleZ: 1,
        length: bone.length,
      } satisfies UniversalBone;
        
      if (!parentId) {
        if (!skeleton.rootBoneIds.includes(id)) skeleton.rootBoneIds.push(id);
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
          skewX: 0,
          skewY: 0,
          scaleX: bone.scaleX || 1,
          scaleY: bone.scaleY || 1,
          scaleZ: 1,
          length: bone.length,
        } satisfies UniversalBone;
        
        if (!bone.parent) {
          if (!skeleton.rootBoneIds.includes(bone.name)) skeleton.rootBoneIds.push(bone.name);
        }
      });
    }
    
    return skeleton;
  }
}
