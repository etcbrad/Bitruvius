import { UniversalSkeletonConverter, UniversalSkeletonFactory } from './universalSkeleton';
import { FormatParsers } from './formatParsers';
import type { SkeletonState } from '../types';
import type { ImportResult, UniversalSkeleton } from './universalSkeleton';

export class SkeletonImporter {
  static async importFromFile(file: File): Promise<ImportResult> {
    const content = await file.text();
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    let universalSkeleton: UniversalSkeleton;
    
    try {
      const jsonData = JSON.parse(content);
      
      // Auto-detect format
      if (jsonData.armature) {
        universalSkeleton = FormatParsers.parseSpine(jsonData);
      } else if (jsonData.bones && Array.isArray(jsonData.bones)) {
        universalSkeleton = FormatParsers.parseGraphiteArt(jsonData);
      } else {
        universalSkeleton = UniversalSkeletonFactory.fromJSON(jsonData);
      }
    } catch {
      // Try CSV format
      if (extension === 'csv') {
        universalSkeleton = FormatParsers.parseCSV(content);
      } else {
        throw new Error('Unsupported file format');
      }
    }
    
    return UniversalSkeletonConverter.convert(universalSkeleton);
  }
  
  static async importFromClipboard(): Promise<ImportResult> {
    try {
      const content = await navigator.clipboard.readText();
      const jsonData = JSON.parse(content);
      const universalSkeleton = UniversalSkeletonFactory.fromJSON(jsonData);
      return UniversalSkeletonConverter.convert(universalSkeleton);
    } catch (error) {
      return {
        success: false,
        joints: {},
        mappings: [],
        metadata: { sourceFormat: 'clipboard', bonesImported: 0, bonesMapped: 0, bonesUnmapped: 0 },
        warnings: [],
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
      };
    }
  }
  
  static applyToState(result: ImportResult, currentState: SkeletonState): SkeletonState {
    if (!result.success) {
      throw new Error('Import failed: ' + result.errors.join(', '));
    }
    
    return {
      ...currentState,
      joints: {
        ...currentState.joints,
        ...result.joints,
      },
    };
  }
}
