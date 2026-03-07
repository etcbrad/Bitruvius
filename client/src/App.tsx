import React, { useState } from 'react';
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartridgeLoader } from './components/CartridgeLoader';
import type { SkeletonState } from './engine/types';
import { performanceMonitor } from './utils/performance';

// Simplified App component that delegates to CartridgeLoader
export default function App() {
  const [currentState, setCurrentState] = useState<SkeletonState | null>(null);

  const handleStateChange = (state: SkeletonState) => {
    const operationId = performanceMonitor.startOperation('app_state_update');
    try {
      setCurrentState(state);
      performanceMonitor.endOperation(operationId);
    } catch (error) {
      performanceMonitor.endOperation(operationId);
      console.error('Failed to update app state:', error);
    }
  };

  return (
    <TooltipProvider>
      <div className="app w-full h-full bg-black text-white overflow-hidden">
        <CartridgeLoader onStateChange={handleStateChange} />
        
        {/* Performance monitoring debug info (development only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="fixed bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg p-2 text-xs font-mono text-green-400 opacity-75 hover:opacity-100 transition-opacity">
            <div>Performance Monitor Active</div>
            <div>Current Mode: {currentState?.controlMode || 'Loading...'}</div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
