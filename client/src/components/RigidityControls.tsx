import React, { useCallback } from 'react';
import { Box, Zap, Wrench } from 'lucide-react';
import type { RigidityPreset } from '../engine/types';

type RigidityControlsProps = {
  currentRigidity: RigidityPreset;
  onRigidityChange: (rigidity: RigidityPreset) => void;
};

const RIGIDITY_PRESETS: RigidityPreset[] = ['cardboard', 'realistic', 'rubberhose'];

const RIGIDITY_INFO: Record<RigidityPreset, {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  explanation: string;
}> = {
  cardboard: {
    label: 'Cardboard',
    description: 'Stiff & rigid',
    icon: <Box size={16} />,
    color: '#ef4444',
    explanation: 'Completely rigid movement. Perfect for mechanical objects or stiff poses. No bending or stretching.'
  },
  realistic: {
    label: 'Realistic',
    description: 'Natural movement',
    icon: <Wrench size={16} />,
    color: '#3b82f6',
    explanation: 'Balanced feel with subtle flexibility. Ideal for characters and organic movement.'
  },
  rubberhose: {
    label: 'Rubberhose',
    description: 'Flexible & bouncy',
    icon: <Zap size={16} />,
    color: '#8b5cf6',
    explanation: 'Very flexible with cartoon-like bounce. Great for stylized animation and rubbery effects.'
  }
};

export const RigidityControls: React.FC<RigidityControlsProps> = ({
  currentRigidity,
  onRigidityChange,
}) => {
  const handleRigidityChange = useCallback((rigidity: RigidityPreset) => {
    if (rigidity !== currentRigidity) {
      onRigidityChange(rigidity);
    }
  }, [currentRigidity, onRigidityChange]);

  return (
    <div className="space-y-3">
      {/* Header with explanation */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
            Rigidity
          </div>
          <div className="text-[9px] text-[#888]">
            How stiff the rig behaves
          </div>
        </div>
        <div className="text-[10px] text-[#aaa] leading-relaxed">
          Choose how flexible or rigid your character moves. Each preset affects the overall feel of posing and animation.
        </div>
      </div>

      {/* Toggle buttons */}
      <div className="space-y-2">
        {RIGIDITY_PRESETS.map((rigidity) => {
          const info = RIGIDITY_INFO[rigidity];
          const isActive = rigidity === currentRigidity;
          
          return (
            <button
              key={rigidity}
              type="button"
              onClick={() => handleRigidityChange(rigidity)}
              aria-pressed={isActive}
              className={`
                w-full flex items-center gap-3 p-3 rounded-lg border transition-all
                ${isActive 
                  ? 'border-white/30 bg-white/10 text-white' 
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10'
                }
              `}
            >
              {/* Icon */}
              <div 
                className="p-2 rounded-md transition-colors"
                style={{ 
                  backgroundColor: isActive ? info.color + '20' : 'transparent',
                  color: isActive ? info.color : 'currentColor'
                }}
              >
                {info.icon}
              </div>
              
              {/* Content */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-[11px] font-bold uppercase">
                    {info.label}
                  </div>
                  <div 
                    className="text-[8px] px-1.5 py-0.5 rounded-full"
                    style={{ 
                      backgroundColor: isActive ? info.color + '30' : 'rgba(255,255,255,0.1)',
                      color: isActive ? info.color : 'rgba(255,255,255,0.6)'
                    }}
                  >
                    {info.description}
                  </div>
                </div>
                <div className="text-[9px] text-white/60 leading-relaxed">
                  {info.explanation}
                </div>
              </div>
              
              {/* Active indicator */}
              {isActive && (
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: info.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Quick tip */}
      <div className="mt-3 p-2 rounded-lg bg-white/5 border border-white/10">
        <div className="text-[9px] text-white/50">
          <span className="font-bold text-white/70">Tip:</span> Start with Realistic for most characters, then adjust based on your animation style.
        </div>
      </div>
    </div>
  );
};
