import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FkCartridge } from './FkCartridge';
import { IkCartridge } from './IkCartridge';
import type { SkeletonState } from '../engine/types';
import { makeDefaultState } from '../engine/settings';
import { DEFAULT_BALANCED_NECK_CONFIG } from '../engine/balancedNeck';
import { cartridgePersistence } from '../utils/cartridgePersistence';
import { performanceMonitor } from '../utils/performance';

export type CartridgeLoaderProps = {
  onStateChange: (state: SkeletonState) => void;
};

type CartridgeMode = 'fk' | 'ik';

export const CartridgeLoader: React.FC<CartridgeLoaderProps> = ({ onStateChange }) => {
  const [currentMode, setCurrentMode] = useState<CartridgeMode>(() => {
    return cartridgePersistence.getCurrentMode();
  });
  
  // Create initial states for each cartridge
  const createFkInitialState = useCallback((): SkeletonState => {
    const operationId = performanceMonitor.startOperation('create_fk_initial_state');
    
    try {
      const persistedState = cartridgePersistence.loadCartridgeState('fk');
      if (persistedState) {
        performanceMonitor.endOperation(operationId);
        return persistedState;
      }
      
      const baseState = makeDefaultState();
      const newState = {
        ...baseState,
        controlMode: 'Cardboard' as const,
        activeRoots: [],
        stretchEnabled: false,
        bendEnabled: false,
        hardStop: true,
        snappiness: 1.0,
        rigidity: 'cardboard' as const,
        physicsRigidity: 0,
        balancedNeck: DEFAULT_BALANCED_NECK_CONFIG,
      };
      
      cartridgePersistence.saveCartridgeState('fk', newState);
      performanceMonitor.endOperation(operationId);
      return newState;
    } catch (error) {
      performanceMonitor.endOperation(operationId);
      console.error('Failed to create FK initial state:', error);
      throw error;
    }
  }, []);

  const createIkInitialState = useCallback((): SkeletonState => {
    const operationId = performanceMonitor.startOperation('create_ik_initial_state');
    
    try {
      const persistedState = cartridgePersistence.loadCartridgeState('ik');
      if (persistedState) {
        performanceMonitor.endOperation(operationId);
        return persistedState;
      }
      
      const baseState = makeDefaultState();
      const newState = {
        ...baseState,
        controlMode: 'IK' as const,
        activeRoots: ['r_ankle'],
        stretchEnabled: true,
        bendEnabled: true,
        hardStop: false,
        snappiness: 0.7,
        rigidity: 'realistic' as const,
        physicsRigidity: 0.4,
        balancedNeck: DEFAULT_BALANCED_NECK_CONFIG,
      };
      
      cartridgePersistence.saveCartridgeState('ik', newState);
      performanceMonitor.endOperation(operationId);
      return newState;
    } catch (error) {
      performanceMonitor.endOperation(operationId);
      console.error('Failed to create IK initial state:', error);
      throw error;
    }
  }, []);

  const handleCartridgeExit = useCallback((fromMode: CartridgeMode) => {
    const operationId = performanceMonitor.startOperation('cartridge_mode_switch');
    
    try {
      // Switch to the other mode
      const nextMode = fromMode === 'fk' ? 'ik' : 'fk';
      setCurrentMode(nextMode);
      cartridgePersistence.setCurrentMode(nextMode);
      performanceMonitor.endOperation(operationId);
    } catch (error) {
      performanceMonitor.endOperation(operationId);
      console.error('Failed to switch cartridge mode:', error);
    }
  }, []);

  const handleStateChange = useCallback((newState: SkeletonState) => {
    const operationId = performanceMonitor.startOperation('cartridge_state_change');
    
    try {
      cartridgePersistence.saveCartridgeState(currentMode, newState);
      onStateChange(newState);
      performanceMonitor.endOperation(operationId);
    } catch (error) {
      performanceMonitor.endOperation(operationId);
      console.error('Failed to handle state change:', error);
    }
  }, [onStateChange, currentMode]);

  return (
    <div className="cartridge-loader w-full h-full relative">
      {/* Mode Switcher */}
      <div className="absolute top-4 right-4 z-50 bg-black/80 backdrop-blur-sm rounded-lg p-2">
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentMode('fk')}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              currentMode === 'fk' 
                ? 'bg-[#F27D26] text-black' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            FK
          </button>
          <button
            onClick={() => setCurrentMode('ik')}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              currentMode === 'ik' 
                ? 'bg-[#F27D26] text-black' 
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            IK
          </button>
        </div>
      </div>

      {/* Cartridge Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentMode}
          initial={{ opacity: 0, x: currentMode === 'ik' ? 100 : -100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: currentMode === 'ik' ? -100 : 100 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="w-full h-full"
        >
          {currentMode === 'fk' ? (
            <FkCartridge
              initialState={createFkInitialState()}
              onStateChange={handleStateChange}
              onExit={() => handleCartridgeExit('fk')}
            />
          ) : (
            <IkCartridge
              initialState={createIkInitialState()}
              onStateChange={(updater) => {
                const operationId = performanceMonitor.startOperation('ik_cartridge_state_change');
                try {
                  // Get current state from persistence to pass to updater
                  const currentState = cartridgePersistence.loadCartridgeState('ik') || createIkInitialState();
                  const newState = updater(currentState);
                  cartridgePersistence.saveCartridgeState('ik', newState);
                  onStateChange(newState);
                  performanceMonitor.endOperation(operationId);
                } catch (error) {
                  performanceMonitor.endOperation(operationId);
                  console.error('Failed to handle IK state change:', error);
                }
              }}
              onExit={() => handleCartridgeExit('ik')}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
