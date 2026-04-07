#!/usr/bin/env tsx

// Modular build script for FK, IK, and Hybrid versions
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const BUILD_DIR = 'dist';

console.log('🔨 Building Bitruvius Modular Versions...\n');

// Clean previous builds
if (existsSync(BUILD_DIR)) {
  rmSync(BUILD_DIR, { recursive: true });
  console.log('🧹 Cleaned previous builds');
}

// Create build directories
mkdirSync(join(BUILD_DIR, 'fk'), { recursive: true });
mkdirSync(join(BUILD_DIR, 'ik'), { recursive: true });
mkdirSync(join(BUILD_DIR, 'hybrid'), { recursive: true });

// Build configurations
const builds = [
  {
    name: 'FK-Only',
    config: 'vite.config.fk.ts',
    output: 'dist/fk',
    description: 'Pure Forward Kinematics - lightweight, no IK or physics'
  },
  {
    name: 'IK-Only', 
    config: 'vite.config.ik.ts',
    output: 'dist/ik',
    description: 'Full IK and Physics capabilities with FK foundation'
  },
  {
    name: 'Hybrid',
    config: 'vite.config.hybrid.ts', 
    output: 'dist/hybrid',
    description: 'Complete feature set - FK + IK + Physics'
  }
];

// Build each version
for (const build of builds) {
  console.log(`\n📦 Building ${build.name}...`);
  console.log(`   ${build.description}`);
  
  try {
    execSync(`npx vite build --config ${build.config}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log(`✅ ${build.name} built successfully -> ${build.output}`);
  } catch (error) {
    console.error(`❌ ${build.name} build failed:`, error);
    process.exit(1);
  }
}

// Create deployment manifests
for (const build of builds) {
  const manifest = {
    name: build.name,
    version: '1.0.0',
    buildType: build.name.toLowerCase().replace('-', ''),
    description: build.description,
    buildDate: new Date().toISOString(),
    outputPath: build.output,
    features: getBuildFeatures(build.name)
  };
  
  const manifestPath = join(build.output, 'manifest.json');
  require('fs').writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`📄 Created manifest: ${manifestPath}`);
}

function getBuildFeatures(buildName: string): string[] {
  switch (buildName) {
    case 'FK-Only':
      return ['forward-kinematics', 'joint-manipulation', 'pose-export', 'animation'];
    case 'IK-Only':
      return ['forward-kinematics', 'inverse-kinematics', 'physics-simulation', 'constraints', 'pose-export', 'animation'];
    case 'Hybrid':
      return ['forward-kinematics', 'inverse-kinematics', 'physics-simulation', 'constraints', 'procedural-animation', 'pose-export', 'animation', 'advanced-features'];
    default:
      return [];
  }
}

console.log('\n🎉 All builds completed successfully!');
console.log('\n📁 Build outputs:');
builds.forEach(build => {
  console.log(`   ${build.name}: ${build.output}`);
});

console.log('\n🚀 To run a specific build:');
console.log('   FK-Only:    npx vite preview --config vite.config.fk.ts');
console.log('   IK-Only:    npx vite preview --config vite.config.ik.ts');
console.log('   Hybrid:     npx vite preview --config vite.config.hybrid.ts');
