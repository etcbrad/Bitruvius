import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Lock, 
  Unlock, 
  Eye, 
  EyeOff, 
  Move3d,
  RotateCw,
  Maximize2
} from 'lucide-react';

import type { 
  CutoutNode, 
  CutoutEditorState, 
  SkeletonState 
} from '../engine/types';

interface CutoutPropertyPanelProps {
  state: SkeletonState;
  setState: (updater: (prev: SkeletonState) => SkeletonState) => void;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
}

export const CutoutPropertyPanel: React.FC<CutoutPropertyPanelProps> = ({ 
  state, 
  setState, 
  setStateWithHistory 
}) => {
  const editorState = state.cutoutEditor;
  const selectedNode = editorState.selectedNodeId 
    ? editorState.nodes[editorState.selectedNodeId] 
    : null;

  const [expandedSections, setExpandedSections] = useState<{
    transform: boolean;
    appearance: boolean;
    anchors: boolean;
  }>({
    transform: true,
    appearance: true,
    anchors: false,
  });

  const updateNode = useCallback((nodeId: string, updates: Partial<CutoutNode>) => {
    if (!nodeId) return;
    
    setStateWithHistory('update_cutout_node', (prev) => {
      const currentNode = prev.cutoutEditor?.nodes?.[nodeId];
      if (!currentNode) return prev;
      
      return {
        ...prev,
        cutoutEditor: prev.cutoutEditor ? {
          ...prev.cutoutEditor,
          nodes: {
            ...prev.cutoutEditor.nodes,
            [nodeId]: {
              ...currentNode,
              ...updates,
            },
          },
        } : {
          mode: 'layout',
          nodes: {},
          selectedNodeId: null,
          selectedAnchorId: null,
          showAnchors: true,
          showConnections: true,
          snapToAnchors: true,
          gridSize: 20,
          viewTransform: { x: 0, y: 0, scale: 1 }
        },
      };
    });
  }, [setStateWithHistory]);

  // Helper to safely call updateNode with the selected node ID
  const updateSelectedNode = useCallback((updates: Partial<CutoutNode>) => {
    if (editorState.selectedNodeId) {
      updateNode(editorState.selectedNodeId, updates);
    }
  }, [editorState.selectedNodeId, updateNode]);

  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  if (!selectedNode) {
    return (
      <div className="w-80 bg-[#252018] border-l border-white/10 p-4 space-y-4">
        <div className="text-center text-white/40 py-8">
          <Settings size={24} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No piece selected</p>
          <p className="text-xs text-white/20 mt-1">Select a piece to edit properties</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-80 bg-[#252018] border-l border-white/10 p-4 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-mono text-white/80 uppercase tracking-wider">
          {selectedNode.name}
        </h3>
        <button
          onClick={() => updateSelectedNode({ locked: !selectedNode.locked })}
          className={`p-1.5 rounded transition-colors ${
            selectedNode.locked 
              ? 'bg-[#c9a84c] text-black' 
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
          title={selectedNode.locked ? 'Unlock' : 'Lock'}
        >
          {selectedNode.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
      </div>

      {/* Transform Section */}
      <div className="space-y-3">
        <button
          onClick={() => toggleSection('transform')}
          className="w-full flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-mono text-white/60 uppercase">
            <Move3d size={12} />
            Transform
          </span>
          <span className="text-white/40">
            {expandedSections.transform ? '−' : '+'}
          </span>
        </button>

        <AnimatePresence>
          {expandedSections.transform && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {/* Position */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/40 uppercase tracking-wider">
                  Position
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-white/60">X</label>
                    <input
                      type="number"
                      value={selectedNode.transform.x.toFixed(1)}
                      onChange={(e) => updateSelectedNode({
                        transform: {
                          ...selectedNode.transform,
                          x: parseFloat(e.target.value) || 0,
                        },
                      })}
                      className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white focus:outline-none focus:border-[#c9a84c]"
                      disabled={selectedNode.locked}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60">Y</label>
                    <input
                      type="number"
                      value={selectedNode.transform.y.toFixed(1)}
                      onChange={(e) => updateSelectedNode({
                        transform: {
                          ...selectedNode.transform,
                          y: parseFloat(e.target.value) || 0,
                        },
                      })}
                      className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white focus:outline-none focus:border-[#c9a84c]"
                      disabled={selectedNode.locked}
                    />
                  </div>
                </div>
              </div>

              {/* Rotation */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/40 uppercase tracking-wider">
                  Rotation
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={(selectedNode.transform.rotation * 180 / Math.PI).toFixed(0)}
                    onChange={(e) => updateSelectedNode({
                      transform: {
                        ...selectedNode.transform,
                        rotation: parseFloat(e.target.value) * Math.PI / 180,
                      },
                    })}
                    className="flex-1 accent-[#c9a84c]"
                    disabled={selectedNode.locked}
                  />
                  <input
                    type="number"
                    value={(selectedNode.transform.rotation * 180 / Math.PI).toFixed(0)}
                    onChange={(e) => updateSelectedNode({
                      transform: {
                        ...selectedNode.transform,
                        rotation: parseFloat(e.target.value) * Math.PI / 180,
                      },
                    })}
                    className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white focus:outline-none focus:border-[#c9a84c]"
                    disabled={selectedNode.locked}
                  />
                  <span className="text-xs text-white/60">°</span>
                </div>
              </div>

              {/* Scale */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/40 uppercase tracking-wider">
                  Scale
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-white/60">X</label>
                    <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={selectedNode.transform.scaleX.toFixed(1)}
                      onChange={(e) => updateSelectedNode({
                        transform: {
                          ...selectedNode.transform,
                          scaleX: parseFloat(e.target.value),
                        },
                      })}
                      className="w-full accent-[#c9a84c]"
                      disabled={selectedNode.locked}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60">Y</label>
                    <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={selectedNode.transform.scaleY.toFixed(1)}
                      onChange={(e) => updateSelectedNode({
                        transform: {
                          ...selectedNode.transform,
                          scaleY: parseFloat(e.target.value),
                        },
                      })}
                      className="w-full accent-[#c9a84c]"
                      disabled={selectedNode.locked}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => updateSelectedNode({
                      transform: {
                        ...selectedNode.transform,
                        flipX: !selectedNode.transform.flipX,
                      },
                    })}
                    className={`px-3 py-1 text-xs rounded transition-colors ${
                      selectedNode.transform.flipX 
                        ? 'bg-[#c9a84c] text-black' 
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    Flip H
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Appearance Section */}
      <div className="space-y-3">
        <button
          onClick={() => toggleSection('appearance')}
          className="w-full flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-mono text-white/60 uppercase">
            <Eye size={12} />
            Appearance
          </span>
          <span className="text-white/40">
            {expandedSections.appearance ? '−' : '+'}
          </span>
        </button>

        <AnimatePresence>
          {expandedSections.appearance && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {/* Opacity */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/40 uppercase tracking-wider">
                  Opacity
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedNode.opacity.toFixed(2)}
                    onChange={(e) => updateSelectedNode({
                      opacity: parseFloat(e.target.value),
                    })}
                    className="flex-1 accent-[#c9a84c]"
                    disabled={selectedNode.locked}
                  />
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedNode.opacity.toFixed(2)}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value);
                      const clamped = Math.max(0, Math.min(1, Number.isNaN(parsed) ? 1 : parsed));
                      updateSelectedNode({
                        opacity: clamped,
                      });
                    }}
                    className="w-16 px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white focus:outline-none focus:border-[#c9a84c]"
                    disabled={selectedNode.locked}
                  />
                </div>
              </div>

              {/* Visibility */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-white/40 uppercase tracking-wider">
                  Visible
                </label>
                <button
                  onClick={() => updateSelectedNode({ visible: !selectedNode.visible })}
                  className={`p-1.5 rounded transition-colors ${
                    selectedNode.visible 
                      ? 'bg-[#c9a84c] text-black' 
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                  disabled={selectedNode.locked}
                >
                  {selectedNode.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>

              {/* Z-Index */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-white/40 uppercase tracking-wider">
                  Layer
                </label>
                <input
                  type="number"
                  value={selectedNode.zIndex}
                  onChange={(e) => updateSelectedNode({
                    zIndex: parseInt(e.target.value) || 0,
                  })}
                  className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white focus:outline-none focus:border-[#c9a84c]"
                  disabled={selectedNode.locked}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Anchors Section */}
      <div className="space-y-3">
        <button
          onClick={() => toggleSection('anchors')}
          className="w-full flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-mono text-white/60 uppercase">
            <Maximize2 size={12} />
            Anchors ({selectedNode.anchors.length})
          </span>
          <span className="text-white/40">
            {expandedSections.anchors ? '−' : '+'}
          </span>
        </button>

        <AnimatePresence>
          {expandedSections.anchors && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-2 overflow-hidden"
            >
              {selectedNode.anchors.map((anchor, index) => (
                <div 
                  key={anchor.id}
                  className="p-2 bg-white/5 rounded border border-white/10"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono text-white/60">
                      Anchor {index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${
                        anchor.type === 'parent' ? 'bg-[#6aaa8a]' :
                        anchor.type === 'child' ? 'bg-[#c9a84c]' :
                        'bg-white/40'
                      }`} />
                      <button
                        onClick={() => {
                          const updatedAnchors = [...selectedNode.anchors];
                          updatedAnchors[index] = {
                            ...anchor,
                            visible: !anchor.visible,
                          };
                          updateSelectedNode({ anchors: updatedAnchors });
                        }}
                        className={`p-1 rounded transition-colors ${
                          anchor.visible 
                            ? 'bg-white/20' 
                            : 'bg-white/10'
                        }`}
                      >
                        {anchor.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-white/60">
                    <div>X: {anchor.localPosition.x.toFixed(0)}</div>
                    <div>Y: {anchor.localPosition.y.toFixed(0)}</div>
                  </div>
                  {anchor.connectedTo && (
                    <div className="text-xs text-[#6aaa8a] mt-1">
                      Connected to: {anchor.connectedTo}
                    </div>
                  )}
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
