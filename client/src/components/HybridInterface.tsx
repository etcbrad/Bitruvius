// Hybrid interface with all features and mode switching
import React, { useState } from 'react';
import type { CoreEngine } from '../engine/core';

interface HybridInterfaceProps {
  engine: CoreEngine;
}

export default function HybridInterface({ engine }: HybridInterfaceProps) {
  const [activeMode, setActiveMode] = useState<'fk' | 'ik' | 'physics'>('fk');

  return (
    <div className="h-full w-full flex">
      {/* Main canvas area */}
      <div className="flex-1 relative">
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <div className="text-white text-center">
            <h2 className="text-2xl font-bold mb-4">Hybrid Mode</h2>
            <p className="text-gray-300 mb-2">Complete Feature Set</p>
            <p className="text-gray-400 text-sm">FK + IK + Physics + Advanced Features</p>
            
            {/* Mode Switcher */}
            <div className="mt-6 flex justify-center space-x-2">
              <button
                onClick={() => setActiveMode('fk')}
                className={`px-4 py-2 rounded text-sm ${
                  activeMode === 'fk' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                FK
              </button>
              <button
                onClick={() => setActiveMode('ik')}
                className={`px-4 py-2 rounded text-sm ${
                  activeMode === 'ik' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                IK
              </button>
              <button
                onClick={() => setActiveMode('physics')}
                className={`px-4 py-2 rounded text-sm ${
                  activeMode === 'physics' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                Physics
              </button>
            </div>
            
            {/* Placeholder for canvas */}
            <div className="mt-8 w-64 h-64 bg-gray-700 rounded-lg flex items-center justify-center">
              <span className="text-gray-400">Canvas Area - {activeMode.toUpperCase()} Mode</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hybrid Controls Panel */}
      <div className="w-80 bg-gray-900 border-l border-gray-700 p-4">
        <h3 className="text-white font-semibold mb-4">Hybrid Controls</h3>
        
        {/* Mode-specific controls */}
        <div className="space-y-4">
          {activeMode === 'fk' && (
            <div className="bg-gray-800 p-3 rounded">
              <h4 className="text-white text-sm font-medium mb-2">FK Controls</h4>
              <div className="text-gray-400 text-xs">Direct joint manipulation</div>
            </div>
          )}
          
          {activeMode === 'ik' && (
            <div className="bg-gray-800 p-3 rounded">
              <h4 className="text-white text-sm font-medium mb-2">IK Controls</h4>
              <div className="text-gray-400 text-xs">IK targets and constraints</div>
            </div>
          )}
          
          {activeMode === 'physics' && (
            <div className="bg-gray-800 p-3 rounded">
              <h4 className="text-white text-sm font-medium mb-2">Physics Controls</h4>
              <div className="text-gray-400 text-xs">Physics simulation parameters</div>
            </div>
          )}
          
          {/* Advanced Features */}
          <div className="bg-gray-800 p-3 rounded">
            <h4 className="text-white text-sm font-medium mb-2">Advanced Features</h4>
            <div className="space-y-2">
              <div className="text-gray-400 text-xs">Procedural Animation</div>
              <div className="text-gray-400 text-xs">Motion Capture</div>
              <div className="text-gray-400 text-xs">Export Tools</div>
            </div>
          </div>
          
          <div className="bg-gray-800 p-3 rounded">
            <h4 className="text-white text-sm font-medium mb-2">Pose Management</h4>
            <button 
              onClick={() => engine.reset()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm"
            >
              Reset Pose
            </button>
            <div className="text-gray-400 text-xs mt-2">Full export/import controls</div>
          </div>
        </div>
        
        {/* Build Info */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="text-gray-400 text-xs">
            <div>Build: Hybrid</div>
            <div>Features: Complete Set</div>
            <div>Size: Full Application</div>
          </div>
        </div>
      </div>
    </div>
  );
}
