import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Layers, 
  Settings, 
  Image as ImageIcon,
  Circle,
  Square,
  Minus
} from 'lucide-react';
import type { CutoutAsset, CutoutSlot, SkeletonState, JointMask, HeadMask } from '../engine/types';
import { createViewPreset, switchToView, updateViewFromCurrentState, deleteView } from '../engine/views';
import { HelpTip } from './HelpTip';
import { RotationWheelControl } from '@/components/RotationWheelControl';

interface AssetMaskManagerProps {
  state: SkeletonState;
  setState: (updater: (prev: SkeletonState) => SkeletonState) => void;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
  requestViewSwitch?: (viewId: string) => void;
  maskJointId: string;
  setMaskJointId: (id: string) => void;
  maskEditArmed: boolean;
  setMaskEditArmed: (armed: boolean) => void;
  uploadJointMaskFile: (file: File, jointId: string) => Promise<void>;
  uploadMaskFile: (file: File) => Promise<void>;
  addConsoleLog: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const AssetMaskManager: React.FC<AssetMaskManagerProps> = ({
  state,
  setState,
  setStateWithHistory,
  requestViewSwitch,
  maskJointId,
  setMaskJointId,
  maskEditArmed,
  setMaskEditArmed,
  uploadJointMaskFile,
  uploadMaskFile,
  addConsoleLog,
}) => {
  const [activeTab, setActiveTab] = useState<'assets' | 'slots' | 'views' | 'masks'>('assets');
  const jointMaskUploadInputRef = useRef<HTMLInputElement>(null);
  const maskUploadInputRef = useRef<HTMLInputElement>(null);

  // Asset management
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const newAsset: CutoutAsset = {
          id: `asset_${Date.now()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          kind: 'image',
          image: {
            src,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          },
        };

        setStateWithHistory('add_asset', (prev) => ({
          ...prev,
          assets: { ...prev.assets, [newAsset.id]: newAsset },
        }));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const createShapeAsset = (shapeType: 'circle' | 'rect' | 'capsule') => {
    const newAsset: CutoutAsset = {
      id: `shape_${shapeType}_${Date.now()}`,
      name: `${shapeType} Shape`,
      kind: 'shape',
      shape: {
        shapeType,
        fill: '#3b82f6',
        stroke: '#1e40af',
        strokeWidth: 2,
      },
    };

    setStateWithHistory('add_shape_asset', (prev) => ({
      ...prev,
      assets: { ...prev.assets, [newAsset.id]: newAsset },
    }));
  };

  // Slot management
  const updateSlot = (slotId: string, updates: Partial<CutoutSlot>) => {
    setStateWithHistory('update_slot', (prev) => ({
      ...prev,
      cutoutSlots: {
        ...prev.cutoutSlots,
        [slotId]: { ...prev.cutoutSlots[slotId], ...updates },
      },
    }));
  };

  const assignAssetToSlot = (slotId: string, assetId: string | null) => {
    updateSlot(slotId, { assetId });
  };

  // View management
  const switchToViewWrapper = (viewId: string) => (prev: SkeletonState) => switchToView(prev, viewId);
  const updateViewFromCurrentWrapper = (prev: SkeletonState) => updateViewFromCurrentState(prev, prev.activeViewId);
  const deleteViewWrapper = (prev: SkeletonState) => deleteView(prev, prev.activeViewId);

  const createNewView = () => {
    const newView = createViewPreset(`View ${state.views.length + 1}`, state);
    setStateWithHistory('create_view', (prev) => ({
      ...prev,
      views: [...prev.views, newView],
      activeViewId: newView.id,
    }));
  };

  // Mask management
  const handleJointMaskUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    await uploadJointMaskFile(file, maskJointId);
  };

  const handleHeadMaskUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    await uploadMaskFile(file);
  };

  const isJointSelected = state.joints[maskJointId] !== undefined;

  return (
    <div className="space-y-4">
      {isJointSelected && (
        <section className="p-3 bg-[#181818] rounded-lg border border-accent/20">
          <div className="flex items-center gap-2 mb-3 text-accent">
            <Settings size={14} />
            <h2 className="text-[10px] font-bold uppercase tracking-widest">Rigging & Mask: {maskJointId}</h2>
          </div>
          <div className="space-y-4">
            <div className="flex gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all cursor-pointer">
                <Upload size={12} />
                Upload Mask
                <input type="file" accept="image/*" onChange={handleJointMaskUpload} className="hidden" />
              </label>
            </div>
            {/* Visual Pin Tool Placeholder */}
            <div className="p-2 bg-[#111] rounded border border-[#222] text-center">
              <p className="text-[8px] text-[#666] uppercase">Visual Pin Tool active on canvas</p>
            </div>
          </div>
        </section>
      )}
      <section>
        <div className="flex items-center gap-2 mb-4 text-[#666]">
          <Layers size={14} />
          <h2 className="text-[10px] font-bold uppercase tracking-widest">Assets & Masks</h2>
        </div>
        <div className="flex gap-1 p-1 bg-[#181818] rounded-lg">
          {(['assets', 'slots', 'views', 'masks'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase transition-all ${
                activeTab === tab 
                  ? 'bg-white text-black' 
                  : 'text-[#666] hover:text-white hover:bg-[#222]'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </section>

      {/* Assets Tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'assets' && (
          <motion.section
            key="assets"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Upload/Create Controls */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <label className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all cursor-pointer">
                  <Upload size={12} />
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => createShapeAsset('circle')}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
                >
                  <Circle size={12} />
                  Circle
                </button>
                <button
                  onClick={() => createShapeAsset('rect')}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
                >
                  <Square size={12} />
                  Rectangle
                </button>
                <button
                  onClick={() => createShapeAsset('capsule')}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
                >
                  <Minus size={12} />
                  Capsule
                </button>
              </div>
            </div>

            {/* Asset List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Object.values(state.assets).map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-2 p-2 bg-[#181818] rounded-lg"
                >
                  <div className="w-8 h-8 bg-[#222] rounded flex items-center justify-center">
                    {asset.kind === 'image' ? (
                      <ImageIcon size={12} className="text-[#666]" />
                    ) : (
                      <div className="w-4 h-4 bg-blue-500 rounded" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-medium">{asset.name}</div>
                    <div className="text-[8px] text-[#666]">{asset.kind}</div>
                  </div>
                  <button
                    onClick={() => {
                      setStateWithHistory('delete_asset', (prev) => {
                        const newAssets = { ...prev.assets };
                        delete newAssets[asset.id];
                        return { ...prev, assets: newAssets };
                      });
                    }}
                    className="p-1 text-[#666] hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Slots Tab */}
        {activeTab === 'slots' && (
          <motion.section
            key="slots"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Slot List */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {Object.entries(state.cutoutSlots)
                .sort(([_, a], [__, b]) => a.name.localeCompare(b.name))
                .map(([slotId, slot]) => (
                  <div key={slotId} className="space-y-2 p-3 bg-[#181818] rounded-lg">
                    {/* Slot Header */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateSlot(slotId, { visible: !slot.visible })}
                        className="p-1 text-[#666] hover:text-white transition-colors"
                      >
                        {slot.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                      <span className="flex-1 text-[10px] font-medium">{slot.name}</span>
                      <select
                        multiple={false}
                        value={slot.assetId || ''}
                        onChange={(e) => assignAssetToSlot(slotId, e.target.value || null)}
                        className="flex-1 bg-[#222] text-[10px] px-2 py-1 rounded border border-[#333] focus:border-white outline-none"
                      >
                        <option value="">No Asset</option>
                        {Object.values(state.assets).map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Slot Controls */}
                    {slot.assetId && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <label className="text-[#666]">Scale</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              max="5"
                              value={slot.scale}
                              onChange={(e) => updateSlot(slotId, { scale: parseFloat(e.target.value) || 1 })}
                              className="w-full px-2 py-1 bg-[#222] rounded border border-[#333] focus:border-white outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-[#666]">Opacity</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="1"
                              value={slot.opacity}
                              onChange={(e) => updateSlot(slotId, { opacity: parseFloat(e.target.value) || 1 })}
                              className="w-full px-2 py-1 bg-[#222] rounded border border-[#333] focus:border-white outline-none"
                            />
                          </div>
                        </div>
                        
                        {/* Enhanced Position Controls */}
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-[#666] uppercase tracking-widest">Position</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-[#666]">X</label>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateSlot(slotId, { offsetX: (slot.offsetX || 0) - 10 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -10
                                </button>
                                <button
                                  onClick={() => updateSlot(slotId, { offsetX: (slot.offsetX || 0) - 1 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -1
                                </button>
                                <input
                                  type="number"
                                  step="1"
                                  value={slot.offsetX || 0}
                                  onChange={(e) => updateSlot(slotId, { offsetX: parseFloat(e.target.value) || 0 })}
                                  className="flex-1 px-1 py-1 bg-[#222] rounded border border-[#333] text-[9px] text-center"
                                />
                                <button
                                  onClick={() => updateSlot(slotId, { offsetX: (slot.offsetX || 0) + 1 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => updateSlot(slotId, { offsetX: (slot.offsetX || 0) + 10 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +10
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="text-[8px] text-[#666]">Y</label>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateSlot(slotId, { offsetY: (slot.offsetY || 0) - 10 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -10
                                </button>
                                <button
                                  onClick={() => updateSlot(slotId, { offsetY: (slot.offsetY || 0) - 1 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -1
                                </button>
                                <input
                                  type="number"
                                  step="1"
                                  value={slot.offsetY || 0}
                                  onChange={(e) => updateSlot(slotId, { offsetY: parseFloat(e.target.value) || 0 })}
                                  className="flex-1 px-1 py-1 bg-[#222] rounded border border-[#333] text-[9px] text-center"
                                />
                                <button
                                  onClick={() => updateSlot(slotId, { offsetY: (slot.offsetY || 0) + 1 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => updateSlot(slotId, { offsetY: (slot.offsetY || 0) + 10 })}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +10
                                </button>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => updateSlot(slotId, { offsetX: 0, offsetY: 0 })}
                            className="w-full py-1 bg-[#222] hover:bg-[#333] rounded text-[8px] font-bold uppercase"
                          >
                            Reset Position
                          </button>
                        </div>
                        
                        {/* Anchor Controls */}
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-[#666] uppercase tracking-widest">Anchor Point</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-[#666]">X</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="1"
                                value={slot.anchorX}
                                onChange={(e) => updateSlot(slotId, { anchorX: parseFloat(e.target.value) || 0.5 })}
                                className="w-full px-2 py-1 bg-[#222] rounded border border-[#333] text-[9px]"
                              />
                            </div>
                            <div>
                              <label className="text-[8px] text-[#666]">Y</label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                max="1"
                                value={slot.anchorY}
                                onChange={(e) => updateSlot(slotId, { anchorY: parseFloat(e.target.value) || 0.5 })}
                                className="w-full px-2 py-1 bg-[#222] rounded border border-[#333] text-[9px]"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 0, anchorY: 0 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Top Left
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 0.5, anchorY: 0 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Top
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 1, anchorY: 0 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Top Right
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 0, anchorY: 0.5 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Left
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 0.5, anchorY: 0.5 })}
                              className="py-1 bg-[#2b0057] hover:bg-[#3a007a] rounded text-[8px] font-bold"
                            >
                              Center
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 1, anchorY: 0.5 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Right
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 0, anchorY: 1 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Bottom Left
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 0.5, anchorY: 1 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Bottom
                            </button>
                            <button
                              onClick={() => updateSlot(slotId, { anchorX: 1, anchorY: 1 })}
                              className="py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                            >
                              Bottom Right
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </motion.section>
        )}

        {/* Views Tab */}
        {activeTab === 'views' && (
          <motion.section
            key="views"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex gap-2">
              <button
                onClick={createNewView}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
              >
                <Plus size={12} />
                New View
              </button>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {state.views.map((view) => (
                <div
                  key={view.id}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    view.id === state.activeViewId
                      ? 'bg-white text-black border-white'
                      : 'bg-[#181818] border-[#333] hover:border-[#666]'
                  }`}
                  onClick={() => {
                    if (view.id === state.activeViewId) return;
                    if (requestViewSwitch) requestViewSwitch(view.id);
                    else setState(switchToViewWrapper(view.id));
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium">{view.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setState(updateViewFromCurrentWrapper);
                        }}
                        className="p-1 text-[#666] hover:text-white transition-colors"
                      >
                        <Settings size={12} />
                      </button>
                      {state.views.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setState(deleteViewWrapper);
                          }}
                          className="p-1 text-[#666] hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Masks Tab */}
        {activeTab === 'masks' && (
          <motion.section
            key="masks"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* Head Mask */}
            <div className="space-y-2 p-3 bg-[#181818] rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest">Head Mask</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => maskUploadInputRef.current?.click()}
                    className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                  >
                    Upload
                  </button>
                </div>
              </div>

              <input
                ref={maskUploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleHeadMaskUpload}
              />

              {state.scene.headMask.src && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[10px]">
                    <input
                      type="checkbox"
                      checked={state.scene.headMask.visible}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_visible', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, visible: e.target.checked },
                          },
                        }))
                      }
                      className="rounded"
                    />
                    Visible
                  </label>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Head/Neck</span>
                      <span className="text-[#999]">
                        {(() => {
                          const base = state.scene.headMask?.relatedJoints?.[0];
                          if (base === 'sternum') return 'Sternum';
                          if (base === 'collar') return 'Collar';
                          if (base === 'neck_upper') return 'Upper Neck';
                          return 'Separate';
                        })()}
                      </span>
                    </div>
                    <select
                      multiple={false}
                      value={state.scene.headMask?.relatedJoints?.[0] || 'neck_base'}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDownCapture={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_base_joint', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: {
                              ...(prev.scene.headMask || {}),
                              relatedJoints: e.target.value === 'neck_base' ? [] : [e.target.value],
                            },
                          },
                        }))
                      }
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                    >
                      <option value="neck_base">Separate (Head only)</option>
                      <option value="neck_upper">Upper Neck</option>
                      <option value="collar">Collar Joint</option>
                      <option value="sternum">Sternum</option>
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Opacity</span>
                      <span>{state.scene.headMask.opacity.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={state.scene.headMask.opacity}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDownCapture={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_opacity', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, opacity: parseFloat(e.target.value) },
                          },
                        }))
                      }
                      className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Stretch Controls */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Stretch X</span>
                      <span>{state.scene.headMask.stretchX.toFixed(2)}×</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={state.scene.headMask.stretchX}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDownCapture={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_stretch_x', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, stretchX: parseFloat(e.target.value) },
                          },
                        }))
                      }
                      className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Stretch Y</span>
                      <span>{state.scene.headMask.stretchY.toFixed(2)}×</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="10"
                      step="0.1"
                      value={state.scene.headMask.stretchY}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDownCapture={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_stretch_y', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, stretchY: parseFloat(e.target.value) },
                          },
                        }))
                      }
                      className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Skew Controls */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Skew X</span>
                      <span>{state.scene.headMask.skewX.toFixed(1)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      step="1"
                      value={state.scene.headMask.skewX}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDownCapture={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_skew_x', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, skewX: parseFloat(e.target.value) },
                          },
                        }))
                      }
                      className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Skew Y</span>
                      <span>{state.scene.headMask.skewY.toFixed(1)}°</span>
                    </div>
                    <input
                      type="range"
                      min="-45"
                      max="45"
                      step="1"
                      value={state.scene.headMask.skewY}
                      onPointerDownCapture={(e) => e.stopPropagation()}
                      onMouseDownCapture={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_skew_y', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, skewY: parseFloat(e.target.value) },
                          },
                        }))
                      }
                      className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Joint Masks */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest">Joint Masks</span>
                <div className="flex items-center gap-2">
                  <select
                    multiple={false}
                    value={maskJointId}
                    onChange={(e) => setMaskJointId(e.target.value)}
                    className="px-2 py-1 bg-[#222] rounded text-[10px] border border-[#333] focus:border-white outline-none"
                  >
                    {Object.keys(state.joints).map((jointId) => (
                      <option key={jointId} value={jointId}>
                        {jointId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => jointMaskUploadInputRef.current?.click()}
                    className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                  >
                    Upload
                  </button>
                </div>
              </div>

              <input
                ref={jointMaskUploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleJointMaskUpload}
              />

              {(() => {
                const mask = state.scene.jointMasks[maskJointId];
                if (!mask) {
                  return (
                    <div className="text-[10px] text-[#444]">
                      Joint mask state missing (try Reset Engine).
                    </div>
                  );
                }

                const canPlace = Boolean(mask.src && mask.visible);

                return (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMaskEditArmed(!maskEditArmed)}
                        disabled={!canPlace}
                        className={`px-2 py-1 rounded text-[10px] transition-colors ${
                          canPlace
                            ? maskEditArmed
                              ? 'bg-[#2b0057] hover:bg-[#3a007a]'
                              : 'bg-[#222] hover:bg-[#333]'
                            : 'bg-[#181818] text-[#444] cursor-not-allowed'
                        }`}
                      >
                        {maskEditArmed ? 'Placing…' : 'Place'}
                      </button>
                    </div>

                    {mask.src && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px]">
                          <input
                            type="checkbox"
                            checked={mask.visible}
                            onChange={(e) =>
                              setStateWithHistory(`joint_mask_visible:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...mask, visible: e.target.checked },
                                  },
                                },
                              }))
                            }
                            className="rounded"
                          />
                          Visible
                        </label>
                        
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span>Opacity</span>
                            <span>{mask.opacity.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={mask.opacity}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            onMouseDownCapture={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setStateWithHistory(`joint_mask_opacity:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...mask, opacity: parseFloat(e.target.value) },
                                  },
                                },
                              }))
                            }
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Position Controls */}
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold text-[#666] uppercase tracking-widest">Position</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[8px] text-[#666]">X Offset</label>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_x_minus_10:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetX: (mask.offsetX || 0) - 10 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -10
                                </button>
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_x_minus_1:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetX: (mask.offsetX || 0) - 1 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -1
                                </button>
                                <input
                                  type="number"
                                  step="1"
                                  value={mask.offsetX || 0}
                                  onChange={(e) =>
                                    setStateWithHistory(`joint_mask_x:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetX: parseInt(e.target.value, 10) || 0 },
                                        },
                                      },
                                    }))
                                  }
                                  className="flex-1 px-1 py-1 bg-[#222] rounded border border-[#333] text-[9px] text-center"
                                />
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_x_plus_1:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetX: (mask.offsetX || 0) + 1 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_x_plus_10:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetX: (mask.offsetX || 0) + 10 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +10
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="text-[8px] text-[#666]">Y Offset</label>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_y_minus_10:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetY: (mask.offsetY || 0) - 10 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -10
                                </button>
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_y_minus_1:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetY: (mask.offsetY || 0) - 1 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  -1
                                </button>
                                <input
                                  type="number"
                                  step="1"
                                  value={mask.offsetY || 0}
                                  onChange={(e) =>
                                    setStateWithHistory(`joint_mask_y:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetY: parseInt(e.target.value, 10) || 0 },
                                        },
                                      },
                                    }))
                                  }
                                  className="flex-1 px-1 py-1 bg-[#222] rounded border border-[#333] text-[9px] text-center"
                                />
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_y_plus_1:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetY: (mask.offsetY || 0) + 1 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => {
                                    setStateWithHistory(`joint_mask_y_plus_10:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...mask, offsetY: (mask.offsetY || 0) + 10 },
                                        },
                                      },
                                    }));
                                  }}
                                  className="px-1 py-1 bg-[#333] hover:bg-[#444] rounded text-[8px] font-bold"
                                >
                                  +10
                                </button>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setStateWithHistory(`joint_mask_reset_position:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...mask, offsetX: 0, offsetY: 0 },
                                  },
                                },
                              }));
                            }}
                            className="w-full py-1 bg-[#222] hover:bg-[#333] rounded text-[8px] font-bold uppercase"
                          >
                            Reset Position
                          </button>
                        </div>

                        {/* Stretch Controls */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span>Stretch X</span>
                            <span>{mask.stretchX.toFixed(2)}×</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="10"
                            step="0.1"
                            value={mask.stretchX}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            onMouseDownCapture={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setStateWithHistory(`joint_mask_stretch_x:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...mask, stretchX: parseFloat(e.target.value) },
                                  },
                                },
                              }))
                            }
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span>Stretch Y</span>
                            <span>{mask.stretchY.toFixed(2)}×</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="10"
                            step="0.1"
                            value={mask.stretchY}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            onMouseDownCapture={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setStateWithHistory(`joint_mask_stretch_y:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...mask, stretchY: parseFloat(e.target.value) },
                                  },
                                },
                              }))
                            }
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                          />
                        </div>

                        {/* Skew Controls */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span>Skew X</span>
                            <span>{mask.skewX.toFixed(1)}°</span>
                          </div>
                          <input
                            type="range"
                            min="-45"
                            max="45"
                            step="1"
                            value={mask.skewX}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            onMouseDownCapture={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setStateWithHistory(`joint_mask_skew_x:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...mask, skewX: parseFloat(e.target.value) },
                                  },
                                },
                              }))
                            }
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span>Skew Y</span>
                            <span>{mask.skewY.toFixed(1)}°</span>
                          </div>
                          <input
                            type="range"
                            min="-45"
                            max="45"
                            step="1"
                            value={mask.skewY}
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            onMouseDownCapture={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              setStateWithHistory(`joint_mask_skew_y:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...mask, skewY: parseFloat(e.target.value) },
                                  },
                                },
                              }))
                            }
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
};
