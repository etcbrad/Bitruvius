import React, { useMemo, useRef, useState } from 'react';
import type { SkeletonState } from '@/engine/types';
import { HelpTip } from '@/components/HelpTip';
import { Slider } from '@/components/ui/slider';
import { RotationWheelControl } from '@/components/RotationWheelControl';

type Props = {
  state: SkeletonState;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
  maskJointId: string;
  setMaskJointId: (id: string) => void;
  maskEditArmed: boolean;
  setMaskEditArmed: (armed: boolean) => void;
  uploadJointMaskFile: (file: File, jointId: string) => Promise<void>;
  uploadMaskFile: (file: File) => Promise<void>;
  copyJointMaskTo: (sourceJointId: string, targetJointId: string) => void;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function Thumb({
  label,
  selected,
  src,
  visible,
  onClick,
  onUploadClick,
}: {
  label: string;
  selected: boolean;
  src: string | null | undefined;
  visible: boolean | undefined;
  onClick: () => void;
  onUploadClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group text-left rounded-lg p-1.5 transition-all border ${
        selected ? 'border-white/50 bg-white/5' : 'border-white/10 hover:border-white/25 hover:bg-white/5'
      }`}
      title={label}
    >
      <div className="relative w-full aspect-square rounded-md overflow-hidden bg-[#0a0a0a] border border-white/10">
        {src ? (
          <img src={src} alt={label} className={`w-full h-full object-contain ${visible ? '' : 'opacity-40'}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[9px] text-[#555] uppercase tracking-widest">
            Empty
          </div>
        )}
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUploadClick();
            }}
            className="px-1.5 py-0.5 rounded bg-black/60 border border-white/10 text-[9px] text-[#ddd] hover:bg-black/80"
          >
            Upload
          </button>
        </div>
      </div>
      <div className="mt-1 text-[9px] text-[#bbb] truncate">{label}</div>
    </button>
  );
}

export function JointMaskWidget({
  state,
  setStateWithHistory,
  maskJointId,
  setMaskJointId,
  maskEditArmed,
  setMaskEditArmed,
  uploadJointMaskFile,
  uploadMaskFile,
  copyJointMaskTo,
}: Props) {
  const [activeTab, setActiveTab] = useState<'joint' | 'head'>('joint');
  const headInputRef = useRef<HTMLInputElement>(null);
  const jointInputRef = useRef<HTMLInputElement>(null);

  const jointIds = useMemo(() => Object.keys(state.joints), [state.joints]);
  const selectedJoint = state.joints[maskJointId];
  const jointMask = state.scene.jointMasks[maskJointId];
  const canPlace = Boolean(jointMask?.src && jointMask.visible);

  const setJointMask = (updates: Partial<typeof jointMask>) => {
    if (!jointMask) return;
    setStateWithHistory(`joint_mask_update:${maskJointId}`, (prev) => ({
      ...prev,
      scene: {
        ...prev.scene,
        jointMasks: {
          ...prev.scene.jointMasks,
          [maskJointId]: { ...prev.scene.jointMasks[maskJointId], ...(updates as any) },
        },
      },
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex bg-[#222] rounded-lg p-1">
        {(['joint', 'head'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${
              activeTab === t ? 'bg-white text-black' : 'text-[#666] hover:text-white'
            }`}
          >
            {t === 'joint' ? 'Joint' : 'Head'}
          </button>
        ))}
      </div>

      {activeTab === 'head' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Head Mask</div>
              <HelpTip
                text={
                  <>
                    <div className="font-bold mb-1">Head mask</div>
                    <div className="text-[#ddd]">
                      Works like a joint mask, but anchored to the head. Use <span className="font-bold">Roto</span>{' '}
                      when you want manual rotation (rotoscope-style tracking).
                    </div>
                  </>
                }
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => headInputRef.current?.click()}
                className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
              >
                Upload
              </button>
              <button
                type="button"
                onClick={() =>
                  setStateWithHistory('head_mask_clear', (prev) => ({
                    ...prev,
                    scene: {
                      ...prev.scene,
                      headMask: { ...prev.scene.headMask, src: null, visible: false },
                    },
                  }))
                }
                className="px-2 py-1 bg-[#333] hover:bg-[#444] rounded text-[10px] transition-colors"
                disabled={!state.scene.headMask.src}
              >
                Clear
              </button>
            </div>
          </div>

          <input
            ref={headInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              await uploadMaskFile(file);
            }}
          />

          <div className="grid grid-cols-[96px_1fr] gap-3 items-start">
            <div className="space-y-2">
              <div className="w-full aspect-square rounded-lg overflow-hidden bg-[#0a0a0a] border border-white/10">
                {state.scene.headMask.src ? (
                  <img
                    src={state.scene.headMask.src}
                    alt="Head mask"
                    className={`w-full h-full object-contain ${state.scene.headMask.visible ? '' : 'opacity-40'}`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] text-[#555] uppercase tracking-widest">
                    Empty
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-[10px] select-none">
                <input
                  type="checkbox"
                  checked={state.scene.headMask.visible}
                  onChange={(e) =>
                    setStateWithHistory('head_mask_visible', (prev) => ({
                      ...prev,
                      scene: { ...prev.scene, headMask: { ...prev.scene.headMask, visible: e.target.checked } },
                    }))
                  }
                  className="rounded"
                  disabled={!state.scene.headMask.src}
                />
                Visible
              </label>
            </div>

            {state.scene.headMask.src ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#666]">Opacity</span>
                    <span>{Math.round(clamp(state.scene.headMask.opacity, 0, 1) * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[state.scene.headMask.opacity]}
                    onValueChange={([val]) =>
                      setStateWithHistory('head_mask_opacity', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...prev.scene.headMask, opacity: val } },
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#666]">Scale</span>
                    <span>{state.scene.headMask.scale.toFixed(2)}×</span>
                  </div>
                  <Slider
                    min={0.01}
                    max={5}
                    step={0.01}
                    value={[state.scene.headMask.scale]}
                    onValueChange={([val]) =>
                      setStateWithHistory('head_mask_scale', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...prev.scene.headMask, scale: val } },
                      }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Stretch X</span>
                      <span>{(state.scene.headMask.stretchX ?? 1).toFixed(2)}×</span>
                    </div>
                    <Slider
                      min={0.1}
                      max={3}
                      step={0.01}
                      value={[state.scene.headMask.stretchX ?? 1]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_stretch_x', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...prev.scene.headMask, stretchX: val } },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Stretch Y</span>
                      <span>{(state.scene.headMask.stretchY ?? 1).toFixed(2)}×</span>
                    </div>
                    <Slider
                      min={0.1}
                      max={3}
                      step={0.01}
                      value={[state.scene.headMask.stretchY ?? 1]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_stretch_y', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...prev.scene.headMask, stretchY: val } },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Skew X</span>
                      <span>{(state.scene.headMask.skewX ?? 0).toFixed(0)}°</span>
                    </div>
                    <Slider
                      min={-45}
                      max={45}
                      step={1}
                      value={[state.scene.headMask.skewX ?? 0]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_skew_x', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...prev.scene.headMask, skewX: val } },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Skew Y</span>
                      <span>{(state.scene.headMask.skewY ?? 0).toFixed(0)}°</span>
                    </div>
                    <Slider
                      min={-45}
                      max={45}
                      step={1}
                      value={[state.scene.headMask.skewY ?? 0]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_skew_y', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...prev.scene.headMask, skewY: val } },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span>Mode</span>
                    <span className="text-[#666]">{(state.scene.headMask.mode || 'cutout').toUpperCase()}</span>
                  </div>
                  <select
                    value={state.scene.headMask.mode || 'cutout'}
                    onChange={(e) =>
                      setStateWithHistory('head_mask_mode', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...prev.scene.headMask, mode: e.target.value as any } },
                      }))
                    }
                    className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                  >
                    <option value="cutout">Cutout (Rigid)</option>
                    <option value="rubberhose">Rubberhose (Stretch)</option>
                    <option value="roto">Roto (Manual Rotation)</option>
                  </select>
                </div>

                {(state.scene.headMask.mode || 'cutout') === 'rubberhose' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#666]">Length Scale</span>
                        <span>{(state.scene.headMask.lengthScale || 1).toFixed(2)}×</span>
                      </div>
                      <Slider
                        min={0.05}
                        max={3}
                        step={0.01}
                        value={[state.scene.headMask.lengthScale || 1]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_length_scale', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...prev.scene.headMask, lengthScale: val } },
                          }))
                        }
                      />
                    </div>
                    <label className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-[#666]">Volume Preserve</span>
                      <input
                        type="checkbox"
                        checked={Boolean(state.scene.headMask.volumePreserve)}
                        onChange={(e) =>
                          setStateWithHistory('head_mask_volume_preserve', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...prev.scene.headMask, volumePreserve: e.target.checked } },
                          }))
                        }
                        className="rounded accent-white"
                      />
                    </label>
                  </>
                )}

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span>Rotation</span>
                    <span>{(state.scene.headMask.rotation ?? 0).toFixed(0)}°</span>
                  </div>
                  <RotationWheelControl
                    value={state.scene.headMask.rotation ?? 0}
                    min={-360}
                    max={360}
                    step={1}
                    onChange={(val) =>
                      setStateWithHistory('head_mask_rotation', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...prev.scene.headMask, rotation: val } },
                      }))
                    }
                    isDisabled={!state.scene.headMask.src}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[#666]">Offset X</label>
                    <input
                      type="number"
                      value={state.scene.headMask.offsetX ?? 0}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_offset_x', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, offsetX: parseFloat(e.target.value) || 0 },
                          },
                        }))
                      }
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#666]">Offset Y</label>
                    <input
                      type="number"
                      value={state.scene.headMask.offsetY ?? 0}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_offset_y', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: { ...prev.scene.headMask, offsetY: parseFloat(e.target.value) || 0 },
                          },
                        }))
                      }
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Anchor X</span>
                      <span>{Math.round((state.scene.headMask.anchorX ?? 0.5) * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[state.scene.headMask.anchorX ?? 0.5]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_anchor_x', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...prev.scene.headMask, anchorX: val } },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Anchor Y</span>
                      <span>{Math.round((state.scene.headMask.anchorY ?? 0.5) * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[state.scene.headMask.anchorY ?? 0.5]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_anchor_y', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...prev.scene.headMask, anchorY: val } },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[#444]">No head mask uploaded.</div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'joint' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Joint/Mask</div>
              <HelpTip
                text={
                  <>
                    <div className="font-bold mb-1">Mask modes</div>
                    <div className="text-[#ddd]">
                      <span className="font-bold">Cutout</span>: rigid sticker that rotates with the bone.
                    </div>
                    <div className="text-[#ddd]">
                      <span className="font-bold">Rubberhose</span>: stretches along the parent bone (use Length Scale / Volume
                      Preserve).
                    </div>
                    <div className="text-[#ddd]">
                      <span className="font-bold">Roto</span>: follows position but rotation is manual (no auto bone rotation).
                    </div>
                    <div className="mt-2 text-[#ddd]">
                      Tip: click <span className="font-bold">Place</span>, then drag the mask once to set offsets.
                    </div>
                  </>
                }
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMaskEditArmed((v) => !v)}
                disabled={!canPlace}
                className={`px-2 py-1 rounded text-[10px] transition-colors ${
                  canPlace
                    ? maskEditArmed
                      ? 'bg-[#2b0057] hover:bg-[#3a007a]'
                      : 'bg-[#222] hover:bg-[#333]'
                    : 'bg-[#181818] text-[#444] cursor-not-allowed'
                }`}
                title={canPlace ? 'Click + drag the mask once to place it' : 'Upload a mask and enable Visible to place'}
              >
                {maskEditArmed ? 'Placing…' : 'Place'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setStateWithHistory('clear_all_masks', (prev) => {
                    const newMasks = { ...prev.scene.jointMasks };
                    for (const id in newMasks) {
                      newMasks[id] = {
                        ...newMasks[id],
                        src: null,
                        visible: false,
                        opacity: 1,
                        scale: 1,
                        offsetX: 0,
                        offsetY: 0,
                        rotation: 0,
                        anchorX: 0.5,
                        anchorY: 0.5,
                        stretchX: 1,
                        stretchY: 1,
                        skewX: 0,
                        skewY: 0,
                        relatedJoints: [],
                      };
                    }
                    return { ...prev, scene: { ...prev.scene, jointMasks: newMasks } };
                  })
                }
                className="px-2 py-1 bg-[#331111] hover:bg-[#551111] rounded text-[10px] transition-colors"
                title="Clear all joint masks"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={() => jointInputRef.current?.click()}
                className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                disabled={!selectedJoint}
                title={selectedJoint ? `Upload mask for ${selectedJoint.label || maskJointId}` : 'Select a joint'}
              >
                Upload
              </button>
            </div>
          </div>

          <input
            ref={jointInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              await uploadJointMaskFile(file, maskJointId);
            }}
          />

          <div className="grid grid-cols-5 gap-2">
            {jointIds.map((id) => {
              const m = state.scene.jointMasks[id];
              const label = state.joints[id]?.label || id;
              return (
                <Thumb
                  key={id}
                  label={label}
                  selected={id === maskJointId}
                  src={m?.src}
                  visible={m?.visible}
                  onClick={() => setMaskJointId(id)}
                  onUploadClick={() => {
                    setMaskJointId(id);
                    jointInputRef.current?.click();
                  }}
                />
              );
            })}
          </div>

          {!selectedJoint || !jointMask ? (
            <div className="text-[10px] text-[#444]">Select a joint to edit its mask.</div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">
                  {selectedJoint.label || maskJointId}
                </div>
                <div className="flex gap-2 items-center">
                  <label className="flex items-center gap-2 text-[10px] select-none">
                    <input
                      type="checkbox"
                      checked={jointMask.visible}
                      onChange={(e) => setJointMask({ visible: e.target.checked })}
                      className="rounded"
                      disabled={!jointMask.src}
                    />
                    Visible
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setJointMask({
                        src: null,
                        visible: false,
                        opacity: 1,
                        scale: 1,
                        offsetX: 0,
                        offsetY: 0,
                        rotation: 0,
                        anchorX: 0.5,
                        anchorY: 0.5,
                        stretchX: 1,
                        stretchY: 1,
                        skewX: 0,
                        skewY: 0,
                        relatedJoints: [],
                      } as any)
                    }
                    className="px-2 py-1 bg-[#333] hover:bg-[#444] rounded text-[10px] transition-colors"
                    disabled={!jointMask.src}
                  >
                    Clear
                  </button>
                </div>
              </div>

              {!jointMask.src ? (
                <div className="text-[10px] text-[#444]">No joint mask uploaded.</div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#666]">Opacity</span>
                      <span>{Math.round(clamp(jointMask.opacity, 0, 1) * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[jointMask.opacity]}
                      onValueChange={([val]) => setJointMask({ opacity: val })}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#666]">Scale</span>
                      <span>{jointMask.scale.toFixed(2)}×</span>
                    </div>
                    <Slider
                      min={0.01}
                      max={5}
                      step={0.01}
                      value={[jointMask.scale]}
                      onValueChange={([val]) => setJointMask({ scale: val })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Stretch X</span>
                        <span>{(jointMask.stretchX ?? 1).toFixed(2)}×</span>
                      </div>
                      <Slider
                        min={0.1}
                        max={3}
                        step={0.01}
                        value={[jointMask.stretchX ?? 1]}
                        onValueChange={([val]) => setJointMask({ stretchX: val } as any)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Stretch Y</span>
                        <span>{(jointMask.stretchY ?? 1).toFixed(2)}×</span>
                      </div>
                      <Slider
                        min={0.1}
                        max={3}
                        step={0.01}
                        value={[jointMask.stretchY ?? 1]}
                        onValueChange={([val]) => setJointMask({ stretchY: val } as any)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Skew X</span>
                        <span>{(jointMask.skewX ?? 0).toFixed(0)}°</span>
                      </div>
                      <Slider
                        min={-45}
                        max={45}
                        step={1}
                        value={[jointMask.skewX ?? 0]}
                        onValueChange={([val]) => setJointMask({ skewX: val } as any)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Skew Y</span>
                        <span>{(jointMask.skewY ?? 0).toFixed(0)}°</span>
                      </div>
                      <Slider
                        min={-45}
                        max={45}
                        step={1}
                        value={[jointMask.skewY ?? 0]}
                        onValueChange={([val]) => setJointMask({ skewY: val } as any)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Mode</span>
                      <span className="text-[#666]">{(jointMask.mode || 'cutout').toUpperCase()}</span>
                    </div>
                    <select
                      value={jointMask.mode || 'cutout'}
                      onChange={(e) => setJointMask({ mode: e.target.value as any } as any)}
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                      disabled={!jointMask.src}
                    >
                      <option value="cutout">Cutout (Rigid)</option>
                      <option value="rubberhose">Rubberhose (Stretch)</option>
                      <option value="roto">Roto (Manual Rotation)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span>Relationship Joints</span>
                      <button
                        type="button"
                        onClick={() => setJointMask({ relatedJoints: [] } as any)}
                        className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                        title="Clear relationship joints (use parent bone instead)"
                        disabled={!jointMask.src}
                      >
                        Use Parent
                      </button>
                    </div>
                    <select
                      multiple
                      value={(jointMask.relatedJoints || []).filter((id) => id !== maskJointId)}
                      onChange={(e) => {
                        const next = Array.from(e.target.selectedOptions)
                          .map((o) => o.value)
                          .filter((id) => id && id !== maskJointId);
                        setJointMask({ relatedJoints: next } as any);
                      }}
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px] h-24"
                      disabled={!jointMask.src}
                    >
                      {jointIds
                        .filter((id) => id !== maskJointId)
                        .map((id) => (
                          <option key={id} value={id}>
                            {state.joints[id]?.label || id}
                          </option>
                        ))}
                    </select>
                    <div className="text-[9px] text-[#666]">
                      Select one or more joints to drive placement/orientation. Empty uses the joint&apos;s parent bone.
                    </div>
                  </div>

                  {(jointMask.mode || 'cutout') === 'rubberhose' && (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[#666]">Length Scale</span>
                          <span>{(jointMask.lengthScale || 1).toFixed(2)}×</span>
                        </div>
                        <Slider
                          min={0.05}
                          max={3}
                          step={0.01}
                          value={[jointMask.lengthScale || 1]}
                          onValueChange={([val]) => setJointMask({ lengthScale: val } as any)}
                        />
                      </div>
                      <label className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-[#666]">Volume Preserve</span>
                        <input
                          type="checkbox"
                          checked={Boolean(jointMask.volumePreserve)}
                          onChange={(e) => setJointMask({ volumePreserve: e.target.checked } as any)}
                          className="rounded accent-white"
                          disabled={!jointMask.src}
                        />
                      </label>
                    </>
                  )}

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Rotation</span>
                      <span>{(jointMask.rotation ?? 0).toFixed(0)}°</span>
                    </div>
                    <RotationWheelControl
                      value={jointMask.rotation ?? 0}
                      min={-360}
                      max={360}
                      step={1}
                      onChange={(val) => setJointMask({ rotation: val } as any)}
                      isDisabled={!jointMask.src}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#666]">Offset X</label>
                      <input
                        type="number"
                        value={jointMask.offsetX ?? 0}
                        onChange={(e) => setJointMask({ offsetX: parseFloat(e.target.value) || 0 } as any)}
                        className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                        disabled={!jointMask.src}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#666]">Offset Y</label>
                      <input
                        type="number"
                        value={jointMask.offsetY ?? 0}
                        onChange={(e) => setJointMask({ offsetY: parseFloat(e.target.value) || 0 } as any)}
                        className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                        disabled={!jointMask.src}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Anchor X</span>
                        <span>{Math.round((jointMask.anchorX ?? 0.5) * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[jointMask.anchorX ?? 0.5]}
                        onValueChange={([val]) => setJointMask({ anchorX: val } as any)}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Anchor Y</span>
                        <span>{Math.round((jointMask.anchorY ?? 0.5) * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[jointMask.anchorY ?? 0.5]}
                        onValueChange={([val]) => setJointMask({ anchorY: val } as any)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 items-end">
                    <button
                      type="button"
                      onClick={() => {
                        copyJointMaskTo(maskJointId, '');
                      }}
                      className="hidden"
                    />
                    <select
                      value=""
                      onChange={(e) => {
                        const target = e.target.value;
                        if (!target) return;
                        copyJointMaskTo(maskJointId, target);
                        e.target.value = '';
                      }}
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                      disabled={!jointMask.src}
                    >
                      <option value="" disabled>
                        Copy graphic to…
                      </option>
                      {jointIds
                        .filter((id) => id !== maskJointId)
                        .map((id) => (
                          <option key={id} value={id}>
                            {state.joints[id]?.label || id}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setJointMask({ offsetX: 0, offsetY: 0 } as any)}
                      className="w-full py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                      disabled={!jointMask.src}
                    >
                      Center on joint
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

