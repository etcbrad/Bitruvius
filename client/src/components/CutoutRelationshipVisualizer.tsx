import React, { useState, useMemo } from 'react';
import { 
  Eye, 
  EyeOff, 
  Settings, 
  Upload, 
  Copy, 
  Trash2, 
  Link2, 
  Unlink,
  ChevronDown,
  ChevronRight,
  Bone,
  User,
  Layers
} from 'lucide-react';
import type { SkeletonState, JointMask, Connection } from '../engine/types';
import { CONNECTIONS, INITIAL_JOINTS } from '../engine/model';

interface CutoutRelationshipVisualizerProps {
  state: SkeletonState;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
  uploadJointMaskFile: (file: File, jointId: string) => Promise<void>;
  addConsoleLog: (type: 'success' | 'error' | 'info', message: string) => void;
}

interface JointRelationship {
  jointId: string;
  joint: any;
  mask?: JointMask | null;
  parentJointId?: string | null;
  childJointIds: string[];
  connectedBones: Connection[];
  hasMask: boolean;
  maskVisible: boolean;
}

export const CutoutRelationshipVisualizer: React.FC<CutoutRelationshipVisualizerProps> = ({
  state,
  setStateWithHistory,
  uploadJointMaskFile,
  addConsoleLog,
}) => {
  const [expandedJoints, setExpandedJoints] = useState<Set<string>>(new Set());
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null);

  // Build relationship tree
  const jointRelationships = useMemo(() => {
    if (!state.joints || !state.scene.jointMasks) {
      return {};
    }
    
    const relationships: Record<string, JointRelationship> = {};
    
    // Initialize all joints
    Object.keys(state.joints).forEach(jointId => {
      const joint = state.joints[jointId];
      const mask = state.scene.jointMasks[jointId];
      
      relationships[jointId] = {
        jointId,
        joint,
        mask,
        parentJointId: joint.parent,
        childJointIds: [],
        connectedBones: [],
        hasMask: Boolean(mask?.src),
        maskVisible: Boolean(mask?.visible),
      };
    });

    // Build parent-child relationships
    Object.keys(relationships).forEach(jointId => {
      const rel = relationships[jointId];
      if (rel.parentJointId && relationships[rel.parentJointId]) {
        relationships[rel.parentJointId].childJointIds.push(jointId);
      }
    });

    // Find connected bones
    CONNECTIONS.forEach(conn => {
      if (relationships[conn.from]) {
        relationships[conn.from].connectedBones.push(conn);
      }
      if (relationships[conn.to]) {
        relationships[conn.to].connectedBones.push(conn);
      }
    });

    return relationships;
  }, [state.joints, state.scene.jointMasks]);

  // Get root joints (no parent)
  const rootJoints = useMemo(() => {
    if (!jointRelationships) {
      return [];
    }
    return Object.keys(jointRelationships).filter(jointId => 
      !jointRelationships[jointId].parentJointId
    );
  }, [jointRelationships]);

  const toggleJointExpansion = (jointId: string) => {
    setExpandedJoints(prev => {
      const next = new Set(prev);
      if (next.has(jointId)) {
        next.delete(jointId);
      } else {
        next.add(jointId);
      }
      return next;
    });
  };

  const toggleMaskVisibility = (jointId: string) => {
    if (!state.scene.jointMasks?.[jointId]) return;
    
    setStateWithHistory('toggle_mask_visibility', (prev) => ({
      ...prev,
      scene: {
        ...prev.scene,
        jointMasks: {
          ...prev.scene.jointMasks,
          [jointId]: {
            ...prev.scene.jointMasks[jointId],
            visible: !prev.scene.jointMasks[jointId]?.visible,
          },
        },
      },
    }));
  };

  const removeMask = (jointId: string) => {
    setStateWithHistory('remove_mask', (prev) => ({
      ...prev,
      scene: {
        ...prev.scene,
        jointMasks: {
          ...prev.scene.jointMasks,
          [jointId]: {
            ...prev.scene.jointMasks[jointId],
            src: null,
            visible: false,
          },
        },
      },
    }));
    addConsoleLog('info', `Mask removed from ${jointId}`);
  };

  const copyMaskToChildren = (jointId: string) => {
    const sourceMask = state.scene.jointMasks?.[jointId];
    if (!sourceMask?.src) {
      addConsoleLog('error', `No mask found on ${jointId} to copy`);
      return;
    }

    const rel = jointRelationships[jointId];
    if (!rel) {
      addConsoleLog('error', `Joint ${jointId} not found in relationships`);
      return;
    }

    const childrenToUpdate = rel.childJointIds.filter(childId => 
      !state.scene.jointMasks?.[childId]?.src
    );

    if (childrenToUpdate.length === 0) {
      addConsoleLog('info', 'All children already have masks');
      return;
    }

    setStateWithHistory('copy_mask_to_children', (prev) => {
      const updatedMasks = { ...prev.scene.jointMasks };
      childrenToUpdate.forEach(childId => {
        updatedMasks[childId] = {
          ...updatedMasks[childId],
          ...sourceMask,
          src: sourceMask.src,
          visible: true,
        };
      });

      return {
        ...prev,
        scene: {
          ...prev.scene,
          jointMasks: updatedMasks,
        },
      };
    });

    addConsoleLog('success', `Mask copied to ${childrenToUpdate.length} children`);
  };

  const renderJointTree = (jointId: string, level: number = 0) => {
    const rel = jointRelationships[jointId];
    if (!rel) return null;

    const isExpanded = expandedJoints.has(jointId);
    const isSelected = selectedJoint === jointId;
    const hasChildren = rel.childJointIds.length > 0;

    return (
      <div key={jointId} className="select-none">
        {/* Joint Row */}
        <div 
          className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
            isSelected ? 'bg-white/10' : 'hover:bg-white/5'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => setSelectedJoint(jointId)}
        >
          {/* Expand/Collapse */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleJointExpansion(jointId);
              }}
              className="p-0.5 hover:bg-white/10 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown size={12} className="text-[#666]" />
              ) : (
                <ChevronRight size={12} className="text-[#666]" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}

          {/* Joint Info */}
          <div className="flex-1 flex items-center gap-2">
            {/* Joint Icon */}
            <div className={`w-2 h-2 rounded-full ${
              rel.joint.isEndEffector ? 'bg-white' : 'bg-[#444]'
            }`} />
            
            {/* Joint Name */}
            <span className="text-xs font-medium flex-1">
              {rel.joint.label}
            </span>

            {/* Mask Status */}
            {rel.hasMask && (
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${
                  rel.maskVisible ? 'bg-[#00ff88]' : 'bg-[#666]'
                }`} />
                <Layers size={10} className={rel.maskVisible ? 'text-[#00ff88]' : 'text-[#666]'} />
              </div>
            )}

            {/* Bone Count */}
            {rel.connectedBones.length > 0 && (
              <div className="flex items-center gap-1 text-[#666]">
                <Bone size={10} />
                <span className="text-[10px]">{rel.connectedBones.length}</span>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          {rel.hasMask && (
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMaskVisibility(jointId);
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title={rel.maskVisible ? 'Hide mask' : 'Show mask'}
              >
                {rel.maskVisible ? (
                  <Eye size={10} className="text-[#00ff88]" />
                ) : (
                  <EyeOff size={10} className="text-[#666]" />
                )}
              </button>
              
              {hasChildren && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyMaskToChildren(jointId);
                  }}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                  title="Copy mask to children"
                >
                  <Copy size={10} className="text-[#666]" />
                </button>
              )}
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeMask(jointId);
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors"
                title="Remove mask"
              >
                <Trash2 size={10} className="text-[#666]" />
              </button>
            </div>
          )}
        </div>

        {/* Children */}
        {isExpanded && rel.childJointIds.map(childId => 
          renderJointTree(childId, level + 1)
        )}

        {/* Selected Joint Details */}
        {isSelected && (
          <div className="ml-8 mr-2 mt-1 p-2 bg-[#181818] rounded border border-[#333]">
            <div className="space-y-2">
              {/* Mask Upload */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium">Mask:</span>
                {rel.hasMask ? (
                  <div className="flex items-center gap-2 flex-1">
                    <div className={`w-2 h-2 rounded-full ${
                      rel.maskVisible ? 'bg-[#00ff88]' : 'bg-[#666]'
                    }`} />
                    <span className="text-[10px] text-[#666]">
                      {rel.maskVisible ? 'Visible' : 'Hidden'}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] text-[#666]">No mask</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`mask-upload-${jointId}`}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      await uploadJointMaskFile(file, jointId);
                    }
                  }}
                />
                <label
                  htmlFor={`mask-upload-${jointId}`}
                  className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] cursor-pointer transition-colors"
                >
                  <Upload size={10} className="inline mr-1" />
                  Upload
                </label>
              </div>

              {/* Connected Bones */}
              {rel.connectedBones.length > 0 && (
                <div>
                  <span className="text-[10px] font-medium">Connected Bones:</span>
                  <div className="mt-1 space-y-1">
                    {rel.connectedBones.map((bone, index) => (
                      <div key={index} className="flex items-center gap-2 text-[10px] text-[#666]">
                        <Bone size={8} />
                        <span>{bone.label}</span>
                        <span className="text-[#888]">
                          {rel.jointId === bone.from ? '→' : '←'} 
                          {rel.jointId === bone.from ? bone.to : bone.from}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Parent/Child Info */}
              <div className="text-[10px] text-[#666]">
                {rel.parentJointId && (
                  <div>Parent: {jointRelationships[rel.parentJointId]?.joint.label}</div>
                )}
                {rel.childJointIds.length > 0 && (
                  <div>Children: {rel.childJointIds.length}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#666]">
          Cutout Relationships
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-[#666]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[#00ff88]" />
            <span>Mask</span>
          </div>
          <div className="flex items-center gap-1">
            <Bone size={10} />
            <span>Bone</span>
          </div>
        </div>
      </div>

      {/* Tree View */}
      <div className="max-h-[400px] overflow-y-auto space-y-1 border border-[#333] rounded bg-[#0a0a0a]">
        {rootJoints.map(jointId => renderJointTree(jointId))}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="p-2 bg-[#181818] rounded text-center">
          <div className="text-[#666]">Total Joints</div>
          <div className="font-bold">{state.joints ? Object.keys(state.joints).length : 0}</div>
        </div>
        <div className="p-2 bg-[#181818] rounded text-center">
          <div className="text-[#666]">With Masks</div>
          <div className="font-bold text-[#00ff88]">
            {state.scene.jointMasks ? Object.values(state.scene.jointMasks).filter(m => m?.src).length : 0}
          </div>
        </div>
        <div className="p-2 bg-[#181818] rounded text-center">
          <div className="text-[#666]">Total Bones</div>
          <div className="font-bold">{CONNECTIONS ? CONNECTIONS.length : 0}</div>
        </div>
      </div>
    </div>
  );
};
