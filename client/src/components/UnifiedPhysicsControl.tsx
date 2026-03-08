import React, { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, Zap, Scale, Wrench } from 'lucide-react';
import type { SkeletonState } from '../engine/types';
import { 
  UnifiedPhysicsMode, 
  PHYSICS_PROFILES, 
  getOptimalMode, 
  applyPhysicsProfile,
  shouldAutoSwitch,
  createSmoothTransition
} from '../engine/unifiedPhysics';

type UnifiedPhysicsControlProps = {
  state: SkeletonState;
  setState: (updater: (prev: SkeletonState) => SkeletonState) => void;
  onTransitionStart?: (config: any) => void;
  disabled?: boolean;
};

const MODE_ICONS: Record<UnifiedPhysicsMode, React.ReactNode> = {
  rigid: <Wrench size={16} />,
  balanced: <Scale size={16} />,
  fluid: <Zap size={16} />,
  fk: <Settings size={16} />
};

const MODE_COLORS: Record<UnifiedPhysicsMode, string> = {
  rigid: '#ef4444',
  balanced: '#3b82f6', 
  fluid: '#8b5cf6',
  fk: '#6b7280'
};

export const UnifiedPhysicsControl: React.FC<UnifiedPhysicsControlProps> = ({
  state,
  setState,
  onTransitionStart,
  disabled = false
}) => {
  const currentMode = useMemo(() => getOptimalMode(state), [state]);
  const currentProfile = PHYSICS_PROFILES[currentMode];

  const handleModeChange = useCallback((targetMode: UnifiedPhysicsMode) => {
    if (disabled || targetMode === currentMode) return;

    const transition = createSmoothTransition(state, targetMode, Date.now());
    
    setState(prev => {
      // Apply the target profile immediately, the animation system will handle smooth blending
      return applyPhysicsProfile(prev, targetMode);
    });

    onTransitionStart?.(transition);
  }, [state, currentMode, disabled, setState, onTransitionStart]);

  const handleSmartSwitch = useCallback(() => {
    // Intelligent auto-switch based on current context
    let suggestedMode: UnifiedPhysicsMode;
    
    if (state.activeRoots.length > 2) {
      suggestedMode = 'rigid'; // Too many constraints, go rigid
    } else if (state.stretchEnabled && state.bendEnabled) {
      suggestedMode = 'fluid'; // Full physics enabled
    } else if (state.controlMode === 'IK') {
      suggestedMode = 'balanced'; // IK with some constraints
    } else {
      suggestedMode = 'rigid'; // Default to rigid
    }

    handleModeChange(suggestedMode);
  }, [state, handleModeChange]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.4em] text-[#666]">Physics Mode</div>
          <div className="text-sm text-white/90 font-medium">{currentProfile.description}</div>
        </div>
        <button
          onClick={handleSmartSwitch}
          disabled={disabled}
          className="px-3 py-1.5 rounded-full border border-white/20 text-[9px] uppercase tracking-[0.3em] text-white/80 hover:border-white/40 disabled:opacity-40 transition-all"
        >
          Auto
        </button>
      </div>

      {/* Mode Selector */}
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(PHYSICS_PROFILES) as UnifiedPhysicsMode[]).map((mode) => {
          const profile = PHYSICS_PROFILES[mode];
          const isActive = mode === currentMode;
          
          return (
            <motion.button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              disabled={disabled}
              className={`
                relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all
                ${isActive 
                  ? 'border-white bg-white/10 text-white' 
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/40 hover:bg-white/10'
                }
                disabled:opacity-40
              `}
              whileHover={{ scale: disabled ? 1 : 1.02 }}
              whileTap={{ scale: disabled ? 1 : 0.98 }}
            >
              <div 
                className="p-2 rounded-full transition-colors"
                style={{ 
                  backgroundColor: isActive ? MODE_COLORS[mode] : 'transparent',
                  color: isActive ? 'white' : 'currentColor'
                }}
              >
                {MODE_ICONS[mode]}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-center">
                {mode === 'fk' ? 'FK' : mode}
              </div>
              <div className="text-[7px] text-white/40 text-center leading-tight">
                {profile.controlMode}
              </div>
              
              {/* Active indicator */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute inset-0 rounded-xl border-2"
                    style={{ borderColor: MODE_COLORS[mode] }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  />
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </div>

      {/* Current Settings Display */}
      <div className="space-y-2 text-[9px] text-white/60">
        <div className="flex justify-between">
          <span>Control</span>
          <span className="text-white/80 font-mono">{currentProfile.controlMode}</span>
        </div>
        <div className="flex justify-between">
          <span>Rigidity</span>
          <span className="text-white/80 font-mono">{Math.round(currentProfile.physicsRigidity * 100)}%</span>
        </div>
        <div className="flex justify-between">
          <span>Constraints</span>
          <span className="text-white/80 font-mono">
            {[currentProfile.bendEnabled && 'Bend', currentProfile.stretchEnabled && 'Stretch', currentProfile.hardStop && 'HardStop']
              .filter(Boolean)
              .join(', ') || 'None'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Roots</span>
          <span className="text-white/80 font-mono">{currentProfile.activeRoots.length}</span>
        </div>
      </div>

      {/* IK Sensitivity Control */}
      {(state.controlMode === 'IK' || state.controlMode === 'Rubberband') && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex justify-between text-[9px] text-white/60">
            <span>IK Sensitivity</span>
            <span className="text-white/80 font-mono">{Math.round(state.ikSensitivity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={state.ikSensitivity * 100}
            onChange={(e) => {
              const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 30)) / 100;
              setState(prev => ({ ...prev, ikSensitivity: value }));
            }}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, ${MODE_COLORS[currentMode]} 0%, ${MODE_COLORS[currentMode]} ${state.ikSensitivity * 100}%, rgba(255,255,255,0.1) ${state.ikSensitivity * 100}%, rgba(255,255,255,0.1) 100%)`
            }}
          />
          <div className="flex justify-between text-[7px] text-white/40">
            <span>Fluid</span>
            <span>Clay</span>
            <span>Instant</span>
          </div>
        </div>
      )}
    </div>
  );
};
