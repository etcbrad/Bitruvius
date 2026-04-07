// FK-only interface - lightweight without IK/physics controls
import React from 'react';
import type { CoreEngine } from '../engine/core';

interface FKInterfaceProps {
  engine: CoreEngine;
}

export default function FKInterface({ engine }: FKInterfaceProps) {
  return (
    <div className="h-full w-full flex">
      {/* Main canvas area */}
      <div className="flex-1 relative">
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <div className="text-white text-center">
            <h2 className="text-2xl font-bold mb-4">FK-Only Mode</h2>
            <p className="text-gray-300 mb-2">Lightweight Forward Kinematics</p>
            <p className="text-gray-400 text-sm">Direct joint manipulation only</p>
            
            {/* Placeholder for canvas */}
            <div className="mt-8 w-64 h-64 bg-gray-700 rounded-lg flex items-center justify-center">
              <span className="text-gray-400">Canvas Area</span>
            </div>
          </div>
        </div>
      </div>

      {/* FK Controls Panel */}
      <div className="w-80 bg-gray-900 border-l border-gray-700 p-4">
        <h3 className="text-white font-semibold mb-4">FK Controls</h3>
        
        {/* Joint Rotation Controls */}
        <div className="space-y-4">
          <div className="bg-gray-800 p-3 rounded">
            <h4 className="text-white text-sm font-medium mb-2">Joint Rotations</h4>
            {/* Add joint rotation sliders here */}
            <div className="text-gray-400 text-xs">Joint controls will be implemented here</div>
          </div>
          
          <div className="bg-gray-800 p-3 rounded">
            <h4 className="text-white text-sm font-medium mb-2">Position Controls</h4>
            {/* Add position controls here */}
            <div className="text-gray-400 text-xs">Position controls will be implemented here</div>
          </div>
          
          <div className="bg-gray-800 p-3 rounded">
            <h4 className="text-white text-sm font-medium mb-2">Pose Management</h4>
            <button 
              onClick={() => engine.reset()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm"
            >
              Reset Pose
            </button>
            <div className="text-gray-400 text-xs mt-2">Export/Import controls</div>
          </div>
        </div>
        
        {/* Build Info */}
        <div className="mt-6 pt-4 border-t border-gray-700">
          <div className="text-gray-400 text-xs">
            <div>Build: FK-Only</div>
            <div>Features: Forward Kinematics</div>
            <div>Size: Lightweight</div>
          </div>
        </div>
      </div>
    </div>
  );
}
