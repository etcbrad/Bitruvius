import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Move, Target, Zap, Settings } from 'lucide-react';
import type { SkeletonState, Joint, Point } from '../engine/types';
import { applyDragToState, applyBalanceDragToState } from '../engine/interaction';
import { shouldRunPosePhysics, stepPosePhysics } from '../engine/physics/posePhysics';
import { getWorldPosition } from '../engine/kinematics';
import { getOptimalMode, applyPhysicsProfile, shouldAutoSwitch, createSmoothTransition, type UnifiedPhysicsMode } from '../engine/unifiedPhysics';
import { useCoreState, useCoreRefs } from './AppCore';
import { UnifiedPhysicsControl } from './UnifiedPhysicsControl';

export type IkCartridgeProps = {
  initialState: SkeletonState;
  onStateChange: (updater: (prev: SkeletonState) => SkeletonState) => void;
  onExit: () => void;
};

export const IkCartridge: React.FC<IkCartridgeProps> = ({
  initialState,
  onStateChange,
  onExit
}) => {
  const { state, setState } = useCoreState(initialState);
  const { canvasRef, svgRef } = useCoreRefs();
  
  // IK-specific state
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [activeRoots, setActiveRoots] = useState<string[]>(['r_ankle']);
  const [physicsMode, setPhysicsMode] = useState<UnifiedPhysicsMode>('balanced');
  
  // IK-specific refs
  const draggingIdLiveRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Ensure IK mode is active
  useEffect(() => {
    if (state.controlMode === 'Cardboard') {
      const targetMode = getOptimalMode(state);
      const transition = createSmoothTransition(state, targetMode, Date.now());
      onStateChange(prev => applyPhysicsProfile(prev, targetMode));
    }
  }, [state.controlMode, state, onStateChange]);

  // IK-specific handlers
  const handleJointClick = useCallback((jointId: string) => {
    setSelectedJointId(jointId);
    
    // Toggle root joint
    if (activeRoots.includes(jointId)) {
      setActiveRoots(prev => prev.filter(id => id !== jointId));
    } else {
      setActiveRoots(prev => [...prev, jointId]);
    }
  }, [activeRoots]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    dragStartRef.current = { x, y };
    setDraggingId('canvas');
    draggingIdLiveRef.current = 'canvas';
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingIdLiveRef.current || !dragStartRef.current) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - dragStartRef.current.x;
    const dy = y - dragStartRef.current.y;
    
    // Apply IK drag to state
    let nextState = state;
    
    if (shouldRunPosePhysics(state)) {
      nextState = applyDragToState(state, 'canvas', { x, y });
      const physicsResult = stepPosePhysics({
        joints: nextState.joints,
        baseJoints: state.joints,
        activeRoots: activeRoots,
        rootTargets: {},
        drag: { id: 'canvas', target: { x, y } },
        connectionOverrides: state.connectionOverrides,
        options: {
          dt: 1/60,
          iterations: 10,
          damping: 0.95,
          wireCompliance: 0.01,
          rigidity: state.rigidity,
          hardStop: state.hardStop,
          bendEnabled: state.bendEnabled,
          stretchEnabled: state.stretchEnabled
        }
      });
      onStateChange(prev => ({ ...prev, joints: physicsResult.joints }));
    } else {
      nextState = applyBalanceDragToState(state, 'canvas', { x, y }, {});
      onStateChange(prev => nextState);
    }
  }, [state, onStateChange]);

  const handleCanvasMouseUp = useCallback(() => {
    dragStartRef.current = null;
    setDraggingId(null);
    draggingIdLiveRef.current = null;
  }, []);

  const handlePhysicsModeChange = useCallback((mode: UnifiedPhysicsMode) => {
    onStateChange(prev => applyPhysicsProfile(prev, mode));
  }, [state, onStateChange]);

  const handleExit = useCallback(() => {
    onExit();
  }, [onExit]);

  return (
    <div className="ik-cartridge">
      {/* IK Controls */}
      <div className="ik-controls absolute top-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Move size={16} className="text-white/60" />
          <span className="text-white text-sm font-medium">IK Mode</span>
        </div>
        
        <div className="space-y-2">
          <div className="text-white/60 text-xs">
            Active Roots: {activeRoots.length}
          </div>
          
          <button
            onClick={handleExit}
            className="flex items-center gap-2 px-3 py-2 bg-[#F27D26] hover:bg-[#F27D26]/80 rounded text-black text-sm font-medium"
          >
            <Settings size={14} />
            Switch to FK
          </button>
        </div>
      </div>

      {/* Physics Mode Control */}
      <div className="physics-controls absolute top-4 right-4">
        <UnifiedPhysicsControl
          state={state}
          setState={onStateChange}
          onTransitionStart={(transition) => {
            console.log('Physics transition started:', transition);
          }}
        />
      </div>

      {/* Joint Selection Info */}
      {selectedJointId && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg p-3"
        >
          <div className="text-white text-sm">
            <div className="font-medium">{selectedJointId}</div>
            <div className="text-white/60 text-xs">
              {activeRoots.includes(selectedJointId) ? 'Root joint (click to unpin)' : 'Click to pin'}
            </div>
          </div>
        </motion.div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="w-full h-full relative cursor-crosshair"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        <svg
          ref={svgRef}
          className="w-full h-full"
          viewBox="-400 -400 800 800"
        >
          {/* Render joints */}
          {Object.entries(state.joints).map(([id, joint]) => (
            <g key={id}>
              <circle
                cx={joint.currentOffset.x}
                cy={joint.currentOffset.y}
                r={activeRoots.includes(id) ? 10 : selectedJointId === id ? 8 : 6}
                fill={
                  activeRoots.includes(id) ? '#F27D26' : 
                  selectedJointId === id ? '#3b82f6' : '#ffffff'
                }
                stroke="#000000"
                strokeWidth="2"
                data-joint-id={id}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => handleJointClick(id)}
              />
              
              {/* Root indicator */}
              {activeRoots.includes(id) && (
                <circle
                  cx={joint.currentOffset.x}
                  cy={joint.currentOffset.y}
                  r={15}
                  fill="none"
                  stroke="#F27D26"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  className="pointer-events-none"
                />
              )}
              
              <text
                x={joint.currentOffset.x}
                y={joint.currentOffset.y - 12}
                fill="white"
                fontSize="10"
                textAnchor="middle"
                className="pointer-events-none select-none"
              >
                {id}
              </text>
            </g>
          ))}
          
          {/* Render bones */}
          {Object.entries(state.joints).map(([id, joint]) => {
            if (!joint.parent) return null;
            const parentJoint = state.joints[joint.parent];
            if (!parentJoint) return null;
            
            return (
              <line
                key={`${joint.parent}-${id}`}
                x1={parentJoint.currentOffset.x}
                y1={parentJoint.currentOffset.y}
                x2={joint.currentOffset.x}
                y2={joint.currentOffset.y}
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};
