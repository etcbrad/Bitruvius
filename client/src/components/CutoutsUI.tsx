import React, { useState } from 'react';
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
import type { CutoutAsset, CutoutSlot, SkeletonState } from '../engine/types';
import { createViewPreset, switchToView, updateViewFromCurrentState, deleteView } from '../engine/views';

interface CutoutsUIProps {
  state: SkeletonState;
  setState: (updater: (prev: SkeletonState) => SkeletonState) => void;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
  requestViewSwitch?: (viewId: string) => void;
}

export const CutoutsUI: React.FC<CutoutsUIProps> = ({ state, setState, setStateWithHistory, requestViewSwitch }) => {
  const [activeTab, setActiveTab] = useState<'assets' | 'slots' | 'views'>('assets');

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

  const switchToViewWrapper = (viewId: string) => (prev: SkeletonState) => switchToView(prev, viewId);
  const updateViewFromCurrentWrapper = (prev: SkeletonState) => updateViewFromCurrentState(prev, prev.activeViewId);
  const deleteViewWrapper = (prev: SkeletonState) => deleteView(prev, prev.activeViewId);

  // View management
  const createNewView = () => {
    const newView = createViewPreset(`View ${state.views.length + 1}`, state);
    setStateWithHistory('create_view', (prev) => ({
      ...prev,
      views: [...prev.views, newView],
      activeViewId: newView.id,
    }));
  };

  const updateViewFromCurrent = () => {
    if (!state.activeViewId) return;
    setStateWithHistory('update_view', updateViewFromCurrentWrapper);
  };

  const deleteCurrentView = () => {
    if (!state.activeViewId) return;
    setStateWithHistory('delete_view', deleteViewWrapper);
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <section>
        <div className="flex items-center gap-2 mb-4 text-[#666]">
          <Layers size={14} />
          <h2 className="text-[10px] font-bold uppercase tracking-widest">Cutouts</h2>
        </div>
        <div className="flex gap-1 p-1 bg-[#181818] rounded-lg">
          {(['assets', 'slots', 'views'] as const).map((tab) => (
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
                  <Circle size={10} />
                  Circle
                </button>
                <button
                  onClick={() => createShapeAsset('rect')}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
                >
                  <Square size={10} />
                  Rect
                </button>
                <button
                  onClick={() => createShapeAsset('capsule')}
                  className="flex items-center justify-center gap-1 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
                >
                  <Minus size={10} />
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
                      <ImageIcon size={14} className="text-[#666]" />
                    ) : (
                      <div className="w-4 h-4 bg-blue-500 rounded" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-medium truncate">{asset.name}</div>
                    <div className="text-[8px] text-[#666] uppercase">{asset.kind}</div>
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
      </AnimatePresence>

      {/* Slots Tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'slots' && (
          <motion.section
            key="slots"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
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
                      <div className="flex-1">
                        <div className="text-[10px] font-medium">{slot.name}</div>
                        <div className="text-[8px] text-[#666]">
                          {slot.attachment.fromJointId} → {slot.attachment.toJointId}
                        </div>
                      </div>
                    </div>

                    {/* Asset Assignment */}
                    <div className="flex gap-2">
                      <select
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

                    {/* Mode Selection */}
                    {slot.assetId && (
                      <div className="flex gap-1">
                        {(['cutout', 'rubberhose', 'roto'] as const).map((mode) => (
                          <button
                            key={mode}
                            onClick={() => updateSlot(slotId, { mode })}
                            className={`flex-1 py-1 px-2 rounded text-[8px] font-bold uppercase transition-all ${
                              slot.mode === mode
                                ? 'bg-white text-black'
                                : 'bg-[#222] text-[#666] hover:text-white'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Z-Index Control */}
                    {slot.assetId && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[8px] text-[#666]">
                          <span>Z-Index</span>
                          <span>{slot.zIndex}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="200"
                          value={slot.zIndex}
                          onChange={(e) => updateSlot(slotId, { zIndex: parseInt(e.target.value) })}
                          className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-white"
                        />
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Views Tab */}
      <AnimatePresence mode="wait">
        {activeTab === 'views' && (
          <motion.section
            key="views"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {/* View Controls */}
            <div className="flex gap-2">
              <button
                onClick={createNewView}
                className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
              >
                <Plus size={12} />
                New View
              </button>
              <button
                onClick={updateViewFromCurrent}
                disabled={!state.activeViewId}
                className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Update Current
              </button>
              <button
                onClick={deleteCurrentView}
                disabled={!state.activeViewId || state.views.length <= 1}
                className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </div>

            {/* View List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {state.views.map((view) => (
                <div
                  key={view.id}
                  onClick={() => {
                    if (state.activeViewId === view.id) return;
                    if (requestViewSwitch) requestViewSwitch(view.id);
                    else setStateWithHistory('switch_view', switchToViewWrapper(view.id));
                  }}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    state.activeViewId === view.id
                      ? 'bg-white text-black'
                      : 'bg-[#181818] hover:bg-[#222] text-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="text-[10px] font-bold">{view.name}</div>
                      <div className="text-[8px] opacity-70">
                        {Object.keys(view.slotOverrides).length} slot overrides
                      </div>
                    </div>
                    {state.activeViewId === view.id && (
                      <div className="w-2 h-2 bg-black rounded-full" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
};
