import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Settings, 
  X, 
  Check, 
  Move,
  Maximize2,
  RotateCw,
  Eye,
  EyeOff
} from 'lucide-react';
import type { SkeletonState, JointMask } from '@/engine/types';

interface MaskToggleProps {
  state: SkeletonState;
  selectedJointId: string | null;
  maskEditArmed: boolean;
  setMaskEditArmed: (armed: boolean) => void;
  uploadJointMaskFile: (file: File, jointId: string) => Promise<void>;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
}

export function MaskToggle({
  state,
  selectedJointId,
  maskEditArmed,
  setMaskEditArmed,
  uploadJointMaskFile,
  setStateWithHistory,
}: MaskToggleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const selectedJoint = selectedJointId ? state.joints[selectedJointId] : null;
  const jointMask = selectedJointId ? state.scene.jointMasks[selectedJointId] : null;
  const hasMask = Boolean(jointMask?.src);
  const canPlace = Boolean(hasMask && jointMask?.visible);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedJointId) return;
    
    event.target.value = '';
    
    try {
      await uploadJointMaskFile(file, selectedJointId);
      setIsOpen(true);
    } catch (error) {
      console.error('Failed to upload joint mask:', error);
      // TODO: Add user feedback (e.g., toast notification)
    }
  };

  const toggleMaskVisibility = () => {
    if (!selectedJointId) return;
    
    setStateWithHistory(`joint_mask_visible:${selectedJointId}`, (prev) => {
      const currentMask = prev.scene.jointMasks[selectedJointId];
      if (!currentMask) return prev;
      
      return {
        ...prev,
        scene: {
          ...prev.scene,
          jointMasks: {
            ...prev.scene.jointMasks,
            [selectedJointId]: { ...currentMask, visible: !currentMask.visible },
          },
        },
      };
    });
  };

  const startPlacing = () => {
    if (!canPlace) return;
    setMaskEditArmed(true);
    setIsOpen(false);
  };

  const cancelPlacing = () => {
    setMaskEditArmed(false);
  };

  const setMask = () => {
    // Finalize mask placement
    setMaskEditArmed(false);
    setIsOpen(false);
  };

  if (!selectedJoint) {
    return null;
  }

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.div
        className="fixed bottom-4 right-4 z-50"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className={`relative p-3 rounded-full shadow-lg transition-all ${
            maskEditArmed 
              ? 'bg-purple-600 text-white' 
              : hasMask 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300'
          }`}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Toggle mask panel"
        >
          {maskEditArmed ? (
            <Move size={20} />
          ) : hasMask ? (
            <Eye size={20} />
          ) : (
            <Upload size={20} />
          )}
          
          {/* Status indicator */}
          {maskEditArmed && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-white"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            />
          )}
        </motion.button>
      </motion.div>

      {/* Expanded Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-20 right-4 z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-xl"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-blue-400" />
                <span className="text-sm font-medium text-white">
                  Mask: {selectedJoint.label || selectedJointId}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-gray-800 transition-colors"
                aria-label="Close panel"
              >
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Upload Section */}
              {!hasMask && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400 mb-3">No mask uploaded</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Upload size={16} />
                    Upload Mask
                  </button>
                </div>
              )}

              {/* Mask Controls */}
              {hasMask && (
                <>
                  {/* Visibility Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Visibility</span>
                    <button
                      onClick={toggleMaskVisibility}
                      className={`p-2 rounded-lg transition-colors ${
                        jointMask?.visible 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-700 text-gray-400'
                      }`}
                      aria-label={jointMask?.visible ? "Hide mask" : "Show mask"}
                      aria-pressed={jointMask?.visible ?? false}
                    >
                      {jointMask?.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                  </div>

                  {/* Quick Actions */}
                  <div className="space-y-2">
                    {canPlace && !maskEditArmed && (
                      <button
                        onClick={startPlacing}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        <Move size={16} />
                        Start Placing
                      </button>
                    )}

                    {maskEditArmed && (
                      <div className="space-y-2">
                        <div className="p-3 bg-purple-900/30 border border-purple-600 rounded-lg">
                          <p className="text-sm text-purple-300 text-center">
                            Drag to position, resize handles to scale, then click "Set" to finalize
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={setMask}
                            className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            <Check size={16} />
                            Set
                          </button>
                          <button
                            onClick={cancelPlacing}
                            className="flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            <X size={16} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Mask Preview */}
                  {jointMask?.src && (
                    <div className="mt-4">
                      <div className="w-full h-24 bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                        <img
                          src={jointMask.src}
                          alt="Mask preview"
                          className={`w-full h-full object-contain ${jointMask.visible ? '' : 'opacity-40'}`}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
