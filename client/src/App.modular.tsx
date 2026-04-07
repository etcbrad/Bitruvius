// Modular App component that adapts to build type
import React, { useEffect, useState, Suspense } from 'react';
import { createEngine, getBuildType, type BuildType } from './engine/core';
import type { CoreEngine } from './engine/core';

// Lazy load components based on build type
const FKInterface = React.lazy(() => import('./components/FKInterface'));
const IKInterface = React.lazy(() => import('./components/IKInterface'));
const HybridInterface = React.lazy(() => import('./components/HybridInterface'));

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen bg-gray-900">
    <div className="text-white text-lg">Loading Bitruvius...</div>
  </div>
);

export default function ModularApp() {
  const [engine, setEngine] = useState<CoreEngine | null>(null);
  const [buildType, setBuildType] = useState<BuildType>('hybrid');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeEngine = async () => {
      try {
        const detectedBuildType = getBuildType();
        setBuildType(detectedBuildType);
        
        const engineInstance = await createEngine(detectedBuildType);
        setEngine(engineInstance);
        
        console.log(`🔧 Initialized ${detectedBuildType.toUpperCase()} engine`);
      } catch (error) {
        console.error('Failed to initialize engine:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeEngine();
  }, []);

  if (loading) {
    return <LoadingFallback />;
  }

  if (!engine) {
    return (
      <div className="flex items-center justify-center h-screen bg-red-900">
        <div className="text-white text-lg">Failed to initialize engine</div>
      </div>
    );
  }

  // Render appropriate interface based on build type
  const renderInterface = () => {
    switch (buildType) {
      case 'fk':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <FKInterface engine={engine} />
          </Suspense>
        );
      case 'ik':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <IKInterface engine={engine} />
          </Suspense>
        );
      case 'hybrid':
      default:
        return (
          <Suspense fallback={<LoadingFallback />}>
            <HybridInterface engine={engine} />
          </Suspense>
        );
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-900">
      {/* Build type indicator for development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-4 left-4 z-50 bg-black/50 text-white px-3 py-1 rounded text-sm">
          Build: {buildType.toUpperCase()}
        </div>
      )}
      
      {renderInterface()}
    </div>
  );
}
