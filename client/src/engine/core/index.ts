// Core engine exports for different build configurations
export { SharedCore, type CoreEngine } from './sharedCore';
export { FKEngine } from './fkEngine';
export { IKEngine } from './ikEngine';
export { HybridEngine } from './hybridEngine';
export { CONNECTIONS, INITIAL_JOINTS } from './sharedCore';

// Build type detection
export type BuildType = 'fk' | 'ik' | 'hybrid';

export function getBuildType(): BuildType {
  // This will be replaced by build configuration
  return (import.meta.env?.BUILD_TYPE as BuildType) || 'hybrid';
}

// Factory function for creating the appropriate engine
export async function createEngine(buildType?: BuildType) {
  const type = buildType || getBuildType();
  
  switch (type) {
    case 'fk':
      const { FKEngine } = await import('./fkEngine');
      return new FKEngine();
    case 'ik':
      const { IKEngine } = await import('./ikEngine');
      return new IKEngine();
    case 'hybrid':
    default:
      const { HybridEngine } = await import('./hybridEngine');
      return new HybridEngine(); // Clean hybrid without IK/physics
  }
}
