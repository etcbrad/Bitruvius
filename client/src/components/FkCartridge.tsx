import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'motion/react';
import { Settings, RotateCw, RotateCcw, Move } from 'lucide-react';
import type { SkeletonState, Joint, Point } from '../engine/types';
import { applyManikinFkRotation } from '../engine/manikinFk';
import { capturePoseSnapshot } from '../engine/timeline';
import { INITIAL_JOINTS } from '../engine/model';
import { getWorldPosition } from '../engine/kinematics';
import { useCoreState, useCoreRefs } from './AppCore';

export type FkCartridgeProps = {
  initialState: SkeletonState;
  onStateChange: (state: SkeletonState) => void;
  onExit: () => void;
};

export const FkCartridge: React.FC<FkCartridgeProps> = ({
  initialState,
  onStateChange,
  onExit
}) => {
  const { state, setState } = useCoreState(initialState);
  const { canvasRef, svgRef } = useCoreRefs();
  
  // FK-specific state
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [manikinRotateDragging, setManikinRotateDragging] = useState<{
    sourceJointId: string;
    targetJointId: string;
    deltaRad: number;
    localOnly: boolean;
  } | null>(null);
  
  const manikinRotateDraggingLiveRef = useRef(manikinRotateDragging);
  manikinRotateDraggingLiveRef.current = manikinRotateDragging;

  // FK-specific effects
  useEffect(() => {
    // Ensure FK mode is active
    if (state.controlMode !== 'Cardboard') {
      onStateChange({
        ...state,
        controlMode: 'Cardboard',
        activeRoots: [],
        stretchEnabled: false,
        bendEnabled: false,
        hardStop: true,
        snappiness: 1.0,
        rigidity: 'cardboard',
        physicsRigidity: 0
      });
    }
  }, [state.controlMode, onStateChange]);

  // FK-specific handlers
  const handleJointClick = useCallback((jointId: string) => {
    setSelectedJointId(jointId);
  }, []);

  const handleJointDrag = useCallback((jointId: string, delta: Point) => {
    if (!state.joints[jointId]) return;

    // Apply FK rotation for the joint
    const rotationDelta = Math.atan2(delta.y, delta.x);
    const nextJoints = applyManikinFkRotation({
      joints: state.joints,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: jointId,
      deltaRad: rotationDelta,
      connectionOverrides: state.connectionOverrides,
      rotateBaseOffsets: true
    });

    onStateChange({
      ...state,
      joints: nextJoints
    });
  }, [state.joints, state.connectionOverrides, onStateChange]);

  const handleReset = useCallback(() => {
    const tPose = capturePoseSnapshot(INITIAL_JOINTS, 'current');
    onStateChange({
      ...state,
      joints: { ...INITIAL_JOINTS }
    });
  }, [state, onStateChange]);

  const handleExit = useCallback(() => {
    // Save current pose before exiting
    const currentPose = capturePoseSnapshot(state.joints, 'current');
    onExit();
  }, [state.joints, onExit]);

  return (
    <div className="fk-cartridge">
      {/* FK Controls */}
      <div className="fk-controls absolute top-4 left-4 bg-black/80 backdrop-blur-sm rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-white/60" />
          <span className="text-white text-sm font-medium">FK Mode</span>
        </div>
        
        <div className="space-y-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded text-white text-sm"
          >
            <RotateCcw size={14} />
            Reset Pose
          </button>
          
          <button
            onClick={handleExit}
            className="flex items-center gap-2 px-3 py-2 bg-[#F27D26] hover:bg-[#F27D26]/80 rounded text-black text-sm font-medium"
          >
            <Move size={14} />
            Switch to IK
          </button>
        </div>
      </div>

      {/* Joint Selection Info */}
      {selectedJointId && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-3"
        >
          <div className="text-white text-sm">
            <div className="font-medium">{selectedJointId}</div>
            <div className="text-white/60 text-xs">
              Click and drag to rotate
            </div>
          </div>
        </motion.div>
      )}

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="w-full h-full relative"
        onMouseDown={(e) => {
          // Handle joint selection and dragging
          const target = e.target as SVGElement;
          const jointId = target.dataset.jointId;
          if (jointId) {
            handleJointClick(jointId);
          }
        }}
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
                r={selectedJointId === id ? 8 : 6}
                fill={selectedJointId === id ? '#F27D26' : '#ffffff'}
                stroke="#000000"
                strokeWidth="2"
                data-joint-id={id}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              />
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
