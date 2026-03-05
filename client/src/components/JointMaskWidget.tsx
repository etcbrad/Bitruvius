import React, { useMemo, useRef, useState, useCallback } from 'react';
import type { JointMask, MaskBlendMode, SkeletonState } from '@/engine/types';
import { HelpTip } from '@/components/HelpTip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { RotationWheelControl, type MaskInfo, type PieceInfo } from '@/components/RotationWheelControl';
import { AngleDial } from '@/components/AngleDial';
import type { ControlMode } from '@/engine/types';
import { BONE_PALETTE } from '@/app/constants';
import { applyLightness, getBoneHex, rgbCss } from '@/app/color';

export type MaskDragMode =
  | 'move'
  | 'widen'
  | 'expand'
  | 'shrink'
  | 'rotate'
  | 'scale'
  | 'stretch'
  | 'skew'
  | 'anchor';

type Props = {
  state: SkeletonState;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
  maskJointId: string;
  setMaskJointId: (id: string) => void;
  maskEditArmed: boolean;
  setMaskEditArmed: React.Dispatch<React.SetStateAction<boolean>>;
  maskDragMode: MaskDragMode;
  setMaskDragMode: React.Dispatch<React.SetStateAction<MaskDragMode>>;
  uploadJointMaskFile: (file: File, jointId: string) => Promise<void>;
  uploadMaskFile: (file: File) => Promise<void>;
  copyJointMaskTo: (sourceJointId: string, targetJointId: string) => void;
  // Enhanced props for integrated wheel
  currentControlMode: ControlMode;
  onControlModeChange: (mode: ControlMode) => void;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const wrapDeg360 = (deg: number): number => {
  // Keep degrees in [-360, 360] while still wrapping for stability.
  const n = ((deg + 360) % 720 + 720) % 720 - 360;
  return n === -360 ? 360 : n;
};

const MASK_BLEND_MODE_OPTIONS: Array<{ value: MaskBlendMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
];

const dedupe = (ids: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

const moveItem = <T,>(arr: T[], from: number, to: number): T[] => {
  if (from === to) return arr;
  if (from < 0 || from >= arr.length) return arr;
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it!);
  return next;
};

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

function CompactThumb({
  label,
  src,
  visible,
}: {
  label: string;
  src: string | null | undefined;
  visible: boolean | undefined;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-8 h-8 rounded-md overflow-hidden bg-[#0a0a0a] border border-white/10 shrink-0">
        {src ? (
          <img src={src} alt={label} className={`w-full h-full object-contain ${visible ? '' : 'opacity-40'}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[9px] text-[#555] uppercase tracking-widest">
            —
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-[#ddd] truncate">{label}</div>
        <div className="text-[9px] text-[#555] truncate">{src ? (visible ? 'Visible' : 'Hidden') : 'No mask'}</div>
      </div>
    </div>
  );
}

export function JointMaskWidget({
  state,
  setStateWithHistory,
  maskJointId,
  setMaskJointId,
  maskEditArmed,
  setMaskEditArmed,
  maskDragMode,
  setMaskDragMode,
  uploadJointMaskFile,
  uploadMaskFile,
  copyJointMaskTo,
  currentControlMode,
  onControlModeChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<'joint' | 'head'>('joint');
  const [jointPickerOpen, setJointPickerOpen] = useState(false);
  const headInputRef = useRef<HTMLInputElement>(null);
  const jointInputRef = useRef<HTMLInputElement>(null);
  const wheelTargetRotationRef = useRef<number | null>(null);

  // Universal mask selection - works for both joint and head masks
  const currentMaskTarget = activeTab === 'head' ? 'head' : maskJointId;
  const currentMask = activeTab === 'head' ? state.scene.headMask : state.scene.jointMasks[maskJointId];
  const currentJoint = activeTab === 'head' ? null : state.joints[maskJointId];

  // Universal helper to safely access mask properties for both head and joint masks
  const getMaskProp = <K extends keyof JointMask>(key: K, defaultValue: JointMask[K]) => 
    currentMask?.[key] ?? defaultValue;

  const jointIds = useMemo(() => Object.keys(state.joints), [state.joints]);
  const selectedJoint = state.joints[maskJointId];
  
  // Helper to safely access headMask properties
  const getHeadMaskProp = <K extends keyof JointMask>(key: K, defaultValue: JointMask[K]) => 
    state.scene.headMask?.[key] ?? defaultValue;
  const jointMask: JointMask | undefined = state.scene.jointMasks[maskJointId];
  const canPlace = Boolean(jointMask?.src && jointMask.visible);
  const jointMaskOpacity = Number.isFinite(jointMask?.opacity) ? (jointMask!.opacity as number) : 1;
  const jointMaskScale = Number.isFinite(jointMask?.scale) ? (jointMask!.scale as number) : 1;

  const setJointMask = (updates: Partial<JointMask>) => {
    if (!jointMask) return;
    setStateWithHistory(`joint_mask_update:${maskJointId}`, (prev) => ({
      ...prev,
      scene: {
        ...prev.scene,
        jointMasks: {
          ...prev.scene.jointMasks,
          [maskJointId]: { ...prev.scene.jointMasks[maskJointId], ...updates },
        },
      },
    }));
  };

  const setHeadMask = (updates: Partial<JointMask>) => {
    setStateWithHistory('head_mask_update', (prev) => ({
      ...prev,
      scene: {
        ...prev.scene,
        headMask: { ...prev.scene.headMask, ...updates },
      },
    }));
  };

  const handleMaskRotationBegin = () => {
    const currentRotation = getMaskProp('rotation', 0);
    wheelTargetRotationRef.current = currentRotation;
  };

  const handleMaskRotationEnd = () => {
    wheelTargetRotationRef.current = null;
  };

  const handleMaskRotationDelta = (deltaDeg: number) => {
    const base = wheelTargetRotationRef.current ?? getMaskProp('rotation', 0);
    const next = wrapDeg360(base + deltaDeg);
    wheelTargetRotationRef.current = next;
    
    if (activeTab === 'head') {
      setHeadMask({ rotation: next });
    } else {
      setJointMask({ rotation: next });
    }
  };

  const nudgeMaskRotation = (deltaDeg: number) => {
    const currentRotation = getMaskProp('rotation', 0);
    const next = wrapDeg360(currentRotation + deltaDeg);
    
    if (activeTab === 'head') {
      setHeadMask({ rotation: next });
    } else {
      setJointMask({ rotation: next });
    }
  };

  const relationshipIds = useMemo(
    () => dedupe((jointMask?.relatedJoints || []).filter((id) => id && id !== maskJointId && id in state.joints)),
    [jointMask?.relatedJoints, maskJointId, state.joints],
  );

  const setRelationshipIds = (next: string[]) => {
    setJointMask({ relatedJoints: dedupe(next).filter((id) => id !== maskJointId && id in state.joints) } as any);
  };

  // Prepare data for enhanced wheel
  const availableMasks: MaskInfo[] = useMemo(() => {
    const masks: MaskInfo[] = [];
    
    // Add head mask
    if (state.scene.headMask?.src) {
      masks.push({
        id: 'head',
        type: 'head',
        src: state.scene.headMask.src,
        visible: state.scene.headMask.visible,
        label: 'Head Mask',
      });
    }
    
    // Add joint masks
    Object.entries(state.scene.jointMasks).forEach(([jointId, mask]) => {
      if (mask.src) {
        const joint = state.joints[jointId];
        masks.push({
          id: jointId,
          type: 'joint',
          src: mask.src,
          visible: mask.visible,
          label: joint?.label || jointId,
        });
      }
    });
    
    return masks;
  }, [state.scene.headMask, state.scene.jointMasks, state.joints]);

  const availablePieces: PieceInfo[] = useMemo(() => {
    return Object.keys(state.joints).map((jointId) => {
      const joint = state.joints[jointId];
      const hasMask = Boolean(state.scene.jointMasks[jointId]?.src);
      return {
        id: jointId,
        label: joint?.label || jointId,
        hasMask,
      };
    });
  }, [state.joints, state.scene.jointMasks]);

  // Handlers for enhanced wheel
  const handleMaskSelect = useCallback((maskId: string, type: string) => {
    if (type === 'head') {
      setActiveTab('head');
    } else {
      setActiveTab('joint');
      setMaskJointId(maskId);
    }
  }, [setActiveTab, setMaskJointId]);

  const handlePieceSelect = useCallback((pieceId: string) => {
    setActiveTab('joint');
    setMaskJointId(pieceId);
  }, [setActiveTab, setMaskJointId]);

  const handleMaskUpdate = useCallback((updates: Partial<JointMask>) => {
    if (activeTab === 'head') {
      setStateWithHistory('head_mask_update', (prev) => ({
        ...prev,
        scene: { ...prev.scene, headMask: { ...prev.scene.headMask, ...updates } },
      }));
    } else {
      setStateWithHistory(`joint_mask_update:${maskJointId}`, (prev) => ({
        ...prev,
        scene: {
          ...prev.scene,
          jointMasks: {
            ...prev.scene.jointMasks,
            [maskJointId]: { ...prev.scene.jointMasks[maskJointId], ...updates },
          },
        },
      }));
    }
  }, [activeTab, maskJointId, setStateWithHistory]);

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Bone Color</div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] font-mono">{getBoneHex(state.boneStyle)}</div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Violet → Magenta</div>
              <div className="text-[10px] font-mono text-[#777]">{Math.round((state.boneStyle?.hueT ?? 0) * 100)}%</div>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[state.boneStyle?.hueT ?? 0]}
              onValueChange={(values) => {
                const v = values[0] ?? 0;
                setStateWithHistory('bone_style:hue', (prev) => ({
                  ...prev,
                  boneStyle: { ...(prev.boneStyle ?? { hueT: 0, lightness: 0 }), hueT: clamp(v, 0, 1) },
                }));
              }}
              className="w-full"
              trackClassName="bg-transparent h-2"
              rangeClassName="bg-transparent"
              thumbClassName="border-white/20"
              trackStyle={{
                background: `linear-gradient(90deg, ${applyLightness(BONE_PALETTE.violet, 0.35)}, ${applyLightness(BONE_PALETTE.magenta, 0.35)})`,
              }}
              rangeStyle={{ backgroundColor: rgbCss(getBoneHex(state.boneStyle), 0.7) }}
              thumbStyle={{
                backgroundColor: getBoneHex(state.boneStyle),
                boxShadow: '0 0 0 4px rgb(125 255 170 / 0.18), 0 0 14px rgb(125 255 170 / 0.28)',
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Darken / Lighten</div>
              <div className="text-[10px] font-mono text-[#777]">{Math.round((state.boneStyle?.lightness ?? 0) * 100)}%</div>
            </div>
            <Slider
              min={-0.5}
              max={0.5}
              step={0.01}
              value={[state.boneStyle?.lightness ?? 0]}
              onValueChange={(values) => {
                const v = values[0] ?? 0;
                setStateWithHistory('bone_style:lightness', (prev) => ({
                  ...prev,
                  boneStyle: {
                    ...(prev.boneStyle ?? { hueT: 0, lightness: 0 }),
                    lightness: clamp(v, -0.5, 0.5),
                  },
                }));
              }}
              className="w-full"
              trackClassName="bg-transparent h-2"
              rangeClassName="bg-transparent"
              thumbClassName="border-white/20"
              trackStyle={{
                background: `linear-gradient(90deg, ${applyLightness(getBoneHex(state.boneStyle), -0.45)}, ${getBoneHex(state.boneStyle)}, ${applyLightness(
                  getBoneHex(state.boneStyle),
                  0.45,
                )})`,
              }}
              rangeStyle={{ backgroundColor: rgbCss(getBoneHex(state.boneStyle), 0.8) }}
              thumbStyle={{
                backgroundColor: getBoneHex(state.boneStyle),
                boxShadow: '0 0 0 4px rgb(125 255 170 / 0.18), 0 0 14px rgb(125 255 170 / 0.28)',
              }}
            />
          </div>
        </div>
      </div>

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

      {/* Universal joint/piece selection - works for both tabs */}
      {activeTab === 'joint' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Piece</div>
            <Popover open={jointPickerOpen} onOpenChange={setJointPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex-1 flex items-center justify-between gap-2 px-2 py-1.5 bg-[#0a0a0a] border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  title="Select joint"
                >
                  <CompactThumb
                    label={currentJoint?.label || maskJointId}
                    src={currentMask?.src}
                    visible={currentMask?.visible}
                  />
                  <div className="text-[10px] text-[#666] shrink-0">▼</div>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[300px] p-2 bg-[#121212] border border-[#222]">
                <div className="max-h-[320px] overflow-auto space-y-1 pr-1">
                  {jointIds.map((id) => {
                    const m = state.scene.jointMasks[id];
                    const label = state.joints[id]?.label || id;
                    const active = id === maskJointId;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setMaskJointId(id);
                          setJointPickerOpen(false);
                        }}
                        className={`w-full text-left p-2 rounded-md border transition-colors ${
                          active ? 'bg-white/5 border-white/20' : 'bg-transparent border-transparent hover:bg-white/5'
                        }`}
                      >
                        <CompactThumb label={label} src={m?.src} visible={m?.visible} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentJoint) {
                        jointInputRef.current?.click();
                        setJointPickerOpen(false);
                      }
                    }}
                    disabled={!currentJoint}
                    className="flex-1 py-1.5 bg-[#222] hover:bg-[#333] rounded text-[10px] font-bold uppercase tracking-widest transition-all border border-[#333] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Upload to Selected
                  </button>
                  <button
                    type="button"
                    onClick={() => setJointPickerOpen(false)}
                    className="px-2 py-1.5 bg-[#333] hover:bg-[#444] rounded text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

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
                disabled={!getHeadMaskProp('src', null)}
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

          {/* Mask controls for continuity */}
          {getMaskProp('src', null) && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#666]">Opacity</span>
                <span>{Math.round(clamp(getMaskProp('opacity', 1), 0, 1) * 100)}%</span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[getMaskProp('opacity', 1)]}
                onValueChange={([val]) =>
                  setStateWithHistory('head_mask_opacity', (prev) => ({
                    ...prev,
                    scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), opacity: val } },
                  }))
                }
              />

              <div className="flex justify-between text-[10px]">
                <span className="text-[#666]">Scale</span>
                <span>{getMaskProp('scale', 1).toFixed(2)}×</span>
              </div>
              <Slider
                min={0.01}
                max={200}
                step={0.01}
                value={[getMaskProp('scale', 1)]}
                onValueChange={([val]) =>
                  setStateWithHistory('head_mask_scale', (prev) => ({
                    ...prev,
                    scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), scale: val } },
                  }))
                }
              />

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-[#666]">
                    <span>Stretch X</span>
                    <span>{(getMaskProp('stretchX', 1) ?? 1).toFixed(2)}×</span>
                  </div>
                  <Slider
                    min={0.1}
                    max={10}
                    step={0.01}
                    value={[getMaskProp('stretchX', 1) ?? 1]}
                    onValueChange={([val]) =>
                      setStateWithHistory('head_mask_stretch_x', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), stretchX: val } },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] text-[#666]">
                    <span>Stretch Y</span>
                    <span>{(getMaskProp('stretchY', 1) ?? 1).toFixed(2)}×</span>
                  </div>
                  <Slider
                    min={0.1}
                    max={10}
                    step={0.01}
                    value={[getMaskProp('stretchY', 1) ?? 1]}
                    onValueChange={([val]) =>
                      setStateWithHistory('head_mask_stretch_y', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), stretchY: val } },
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span>Rotation</span>
                  <span>{(getMaskProp('rotation', 0) ?? 0).toFixed(0)}°</span>
                </div>
                <RotationWheelControl
                  value={getMaskProp('rotation', 0) ?? 0}
                  min={-360}
                  max={360}
                  step={1}
                  onChange={(val) =>
                    setStateWithHistory('head_mask_rotation', (prev) => ({
                      ...prev,
                      scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), rotation: val } },
                    }))
                  }
                  isDisabled={!getMaskProp('src', null)}
                  showIntegratedControls={true}
                  currentMaskType="head"
                  currentMaskId="head"
                  maskData={state.scene.headMask}
                  availableMasks={availableMasks}
                  availablePieces={availablePieces}
                  currentControlMode={currentControlMode}
                  onMaskSelect={handleMaskSelect}
                  onPieceSelect={handlePieceSelect}
                  onMaskUpdate={handleMaskUpdate}
                  onControlModeChange={onControlModeChange}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-[#666]">Offset X</label>
                  <input
                    type="number"
                    value={getMaskProp('offsetX', 0) ?? 0}
                    onChange={(e) =>
                      setStateWithHistory('head_mask_offset_x', (prev) => ({
                        ...prev,
                        scene: {
                          ...prev.scene,
                          headMask: { ...(prev.scene.headMask || {}), offsetX: parseFloat(e.target.value) || 0 },
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
                    value={getMaskProp('offsetY', 0) ?? 0}
                    onChange={(e) =>
                      setStateWithHistory('head_mask_offset_y', (prev) => ({
                        ...prev,
                        scene: {
                          ...prev.scene,
                          headMask: { ...(prev.scene.headMask || {}), offsetY: parseFloat(e.target.value) || 0 },
                        },
                      }))
                    }
                    className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                  />
                </div>
              </div>
            </div>
          )}

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
                  checked={getHeadMaskProp('visible', false)}
                  onChange={(e) =>
                    setStateWithHistory('head_mask_visible', (prev) => ({
                      ...prev,
                      scene: { ...prev.scene, headMask: { ...prev.scene.headMask, visible: e.target.checked } },
                    }))
                  }
                  className="rounded"
                  disabled={!getHeadMaskProp('src', null)}
                />
                Visible
              </label>
            </div>

            {getHeadMaskProp('src', null) ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#666]">Opacity</span>
                    <span>{Math.round(clamp(getHeadMaskProp('opacity', 1), 0, 1) * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[getHeadMaskProp('opacity', 1)]}
                    onValueChange={([val]) =>
                      setStateWithHistory('head_mask_opacity', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), opacity: val } },
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#666]">Scale</span>
                    <span>{getHeadMaskProp('scale', 1).toFixed(2)}×</span>
                  </div>
                  <Slider
                    min={0.01}
                    max={50}
                    step={0.01}
                    value={[getHeadMaskProp('scale', 1)]}
                    onValueChange={([val]) =>
                      setStateWithHistory('head_mask_scale', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), scale: val } },
                      }))
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Stretch X</span>
                      <span>{(getHeadMaskProp('stretchX', 1) ?? 1).toFixed(2)}×</span>
                    </div>
                    <Slider
                      min={0.1}
                      max={10}
                      step={0.01}
                      value={[getHeadMaskProp('stretchX', 1) ?? 1]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_stretch_x', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), stretchX: val } },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Stretch Y</span>
                      <span>{(getHeadMaskProp('stretchY', 1) ?? 1).toFixed(2)}×</span>
                    </div>
                    <Slider
                      min={0.1}
                      max={10}
                      step={0.01}
                      value={[getHeadMaskProp('stretchY', 1) ?? 1]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_stretch_y', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), stretchY: val } },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Skew X</span>
                      <span>{(getHeadMaskProp('skewX', 0) ?? 0).toFixed(0)}°</span>
                    </div>
                    <Slider
                      min={-45}
                      max={45}
                      step={1}
                      value={[getHeadMaskProp('skewX', 0) ?? 0]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_skew_x', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), skewX: val } },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Skew Y</span>
                      <span>{(getHeadMaskProp('skewY', 0) ?? 0).toFixed(0)}°</span>
                    </div>
                    <Slider
                      min={-45}
                      max={45}
                      step={1}
                      value={[getHeadMaskProp('skewY', 0) ?? 0]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_skew_y', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), skewY: val } },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span>Mode</span>
                    <span className="text-[#666]">{(getHeadMaskProp('mode', 'cutout') || 'cutout').toUpperCase()}</span>
                  </div>
                  <select
                    multiple={false}
                    value={getHeadMaskProp('mode', 'cutout') || 'cutout'}
                    onChange={(e) =>
                      setStateWithHistory('head_mask_mode', (prev) => ({
                        ...prev,
                        scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), mode: e.target.value as any } },
                      }))
                    }
                    className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                  >
                    <option value="cutout">Cutout (Rigid)</option>
                    <option value="rubberhose">Rubberhose (Stretch)</option>
                    <option value="roto">Roto (Manual Rotation)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span>Head Rotation Point</span>
                    <span className="text-[#666]">NECK BASE</span>
                  </div>
                  <div className="text-[9px] text-[#555] text-center py-2">
                    Head masks always rotate at the neck base joint
                  </div>
                </div>

                {(getHeadMaskProp('mode', 'cutout') || 'cutout') === 'rubberhose' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#666]">Length Scale</span>
                        <span>{(getHeadMaskProp('lengthScale', 1) || 1).toFixed(2)}×</span>
                      </div>
                      <Slider
                        min={0.05}
                        max={3}
                        step={0.01}
                        value={[getHeadMaskProp('lengthScale', 1) || 1]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_length_scale', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), lengthScale: val } },
                          }))
                        }
                      />
                    </div>
                    <label className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-[#666]">Volume Preserve</span>
                      <input
                        type="checkbox"
                        checked={Boolean(getHeadMaskProp('volumePreserve', false))}
                        onChange={(e) =>
                          setStateWithHistory('head_mask_volume_preserve', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), volumePreserve: e.target.checked } },
                          }))
                        }
                        className="rounded accent-white"
                      />
                    </label>
                  </>
                )}

                <div className="space-y-3">
                  <div className="flex flex-col items-center">
                    <AngleDial
                      valueDeg={getHeadMaskProp('rotation', 0) ?? 0}
                      isDisabled={!getHeadMaskProp('src', null)}
                      onBegin={handleMaskRotationBegin}
                      onEnd={handleMaskRotationEnd}
                      onRotateDelta={handleMaskRotationDelta}
                      label="Rotation"
                    />

                    {getHeadMaskProp('src', null) && (
                      <div className="mt-3 w-full flex items-center gap-2">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] shrink-0">Rotate</div>
                        <input
                          type="range"
                          min={-360}
                          max={360}
                          step={1}
                          value={getHeadMaskProp('rotation', 0) ?? 0}
                          onPointerDown={handleMaskRotationBegin}
                          onPointerUp={handleMaskRotationEnd}
                          onPointerCancel={handleMaskRotationEnd}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isFinite(v)) return;
                            wheelTargetRotationRef.current = v;
                            setHeadMask({ rotation: v });
                          }}
                          className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                          title="Unified rotation slider"
                        />
                        <div className="text-[10px] font-mono text-[#444] w-12 text-right tabular-nums">
                          {(getHeadMaskProp('rotation', 0) ?? 0).toFixed(0)}°
                        </div>
                      </div>
                    )}

                    {getHeadMaskProp('src', null) && (
                      <div className="mt-2 grid grid-cols-6 gap-1 w-full">
                        {(
                          [
                            { label: '-45', delta: -45 },
                            { label: '-15', delta: -15 },
                            { label: '-5', delta: -5 },
                            { label: '+5', delta: 5 },
                            { label: '+15', delta: 15 },
                            { label: '+45', delta: 45 },
                          ] as const
                        ).map(({ label, delta }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => nudgeMaskRotation(delta)}
                            className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white"
                            title={`Nudge ${label}°`}
                          >
                            {label}°
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Fine Rotation</span>
                      <span>{(getHeadMaskProp('rotation', 0) ?? 0).toFixed(0)}°</span>
                    </div>
                    <RotationWheelControl
                      value={getHeadMaskProp('rotation', 0) ?? 0}
                      min={-360}
                      max={360}
                      step={1}
                      onChange={(val) => setHeadMask({ rotation: val })}
                      isDisabled={!getHeadMaskProp('src', null)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[#666]">Offset X</label>
                    <input
                      type="number"
                      value={getHeadMaskProp('offsetX', 0) ?? 0}
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
                      value={getHeadMaskProp('offsetY', 0) ?? 0}
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

                <div className="space-y-2">
                  <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Nudge</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[9px] text-[#666]">X</div>
                      <div className="grid grid-cols-4 gap-1">
                        {([-10, -1, 1, 10] as const).map((d) => (
                          <button
                            key={`head-nudge-x:${d}`}
                            type="button"
                            onClick={() =>
                              setStateWithHistory('head_mask_nudge_x', (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  headMask: {
                                    ...prev.scene.headMask,
                                    offsetX: clamp((prev.scene.headMask?.offsetX ?? 0) + d, -5000, 5000),
                                  },
                                },
                              }))
                            }
                            className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white"
                            disabled={!getHeadMaskProp('src', null)}
                            title={`Offset X ${d > 0 ? '+' : ''}${d}`}
                          >
                            {d > 0 ? `+${d}` : d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[9px] text-[#666]">Y</div>
                      <div className="grid grid-cols-4 gap-1">
                        {([-10, -1, 1, 10] as const).map((d) => (
                          <button
                            key={`head-nudge-y:${d}`}
                            type="button"
                            onClick={() =>
                              setStateWithHistory('head_mask_nudge_y', (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  headMask: {
                                    ...prev.scene.headMask,
                                    offsetY: clamp((prev.scene.headMask?.offsetY ?? 0) + d, -5000, 5000),
                                  },
                                },
                              }))
                            }
                            className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white"
                            disabled={!getHeadMaskProp('src', null)}
                            title={`Offset Y ${d > 0 ? '+' : ''}${d}`}
                          >
                            {d > 0 ? `+${d}` : d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Anchor X</span>
                      <span>{Math.round((getHeadMaskProp('anchorX', 0.5) ?? 0.5) * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[getHeadMaskProp('anchorX', 0.5) ?? 0.5]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_anchor_x', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), anchorX: val } },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-[#666]">
                      <span>Anchor Y</span>
                      <span>{Math.round((getHeadMaskProp('anchorY', 0.5) ?? 0.5) * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[getHeadMaskProp('anchorY', 0.5) ?? 0.5]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_anchor_y', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), anchorY: val } },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Filters</div>
                    <button
                      type="button"
                      onClick={() =>
                        setStateWithHistory('head_mask_filters_reset', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            headMask: {
                              ...(prev.scene.headMask || {}),
                              blendMode: 'normal',
                              blurPx: 0,
                              brightness: 1,
                              contrast: 1,
                              saturation: 1,
                              hueRotate: 0,
                              grayscale: 0,
                              sepia: 0,
                              invert: 0,
                              pixelate: 0,
                            } as any,
                          },
                        }))
                      }
                      className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                      disabled={!getHeadMaskProp('src', null)}
                      title="Reset filter + blend values"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span>Blend</span>
                      <span className="text-[#666]">
                        {(getHeadMaskProp('blendMode', 'normal') || 'normal').toUpperCase()}
                      </span>
                    </div>
                    <select
                      multiple={false}
                      value={getHeadMaskProp('blendMode', 'normal') || 'normal'}
                      onChange={(e) =>
                        setStateWithHistory('head_mask_blend_mode', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), blendMode: e.target.value as any } },
                        }))
                      }
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                      disabled={!getHeadMaskProp('src', null)}
                    >
                      {MASK_BLEND_MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#666]">Blur</span>
                      <span>{(getHeadMaskProp('blurPx', 0) ?? 0).toFixed(1)}px</span>
                    </div>
                    <Slider
                      min={0}
                      max={60}
                      step={0.5}
                      value={[getHeadMaskProp('blurPx', 0) ?? 0]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_blur', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), blurPx: val } },
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#666]">Pixelate</span>
                      <span>{(getHeadMaskProp('pixelate', 0) ?? 0) > 0 ? `${getHeadMaskProp('pixelate', 0) ?? 0}` : 'Off'}</span>
                    </div>
                    <Slider
                      min={0}
                      max={32}
                      step={1}
                      value={[getHeadMaskProp('pixelate', 0) ?? 0]}
                      onValueChange={([val]) =>
                        setStateWithHistory('head_mask_pixelate', (prev) => ({
                          ...prev,
                          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), pixelate: val } },
                        }))
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Brightness</span>
                        <span>{(getHeadMaskProp('brightness', 1) ?? 1).toFixed(2)}</span>
                      </div>
                      <Slider
                        min={0}
                        max={3}
                        step={0.01}
                        value={[getHeadMaskProp('brightness', 1) ?? 1]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_brightness', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), brightness: val } },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Contrast</span>
                        <span>{(getHeadMaskProp('contrast', 1) ?? 1).toFixed(2)}</span>
                      </div>
                      <Slider
                        min={0}
                        max={3}
                        step={0.01}
                        value={[getHeadMaskProp('contrast', 1) ?? 1]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_contrast', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), contrast: val } },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Saturation</span>
                        <span>{(getHeadMaskProp('saturation', 1) ?? 1).toFixed(2)}</span>
                      </div>
                      <Slider
                        min={0}
                        max={5}
                        step={0.01}
                        value={[getHeadMaskProp('saturation', 1) ?? 1]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_saturation', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), saturation: val } },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Hue</span>
                        <span>{(getHeadMaskProp('hueRotate', 0) ?? 0).toFixed(0)}°</span>
                      </div>
                      <Slider
                        min={-360}
                        max={360}
                        step={1}
                        value={[getHeadMaskProp('hueRotate', 0) ?? 0]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_hue', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), hueRotate: val } },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Gray</span>
                        <span>{Math.round(clamp(getHeadMaskProp('grayscale', 0) ?? 0, 0, 1) * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[getHeadMaskProp('grayscale', 0) ?? 0]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_grayscale', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), grayscale: val } },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Sepia</span>
                        <span>{Math.round(clamp(getHeadMaskProp('sepia', 0) ?? 0, 0, 1) * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[getHeadMaskProp('sepia', 0) ?? 0]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_sepia', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), sepia: val } },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Invert</span>
                        <span>{Math.round(clamp(getHeadMaskProp('invert', 0) ?? 0, 0, 1) * 100)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[getHeadMaskProp('invert', 0) ?? 0]}
                        onValueChange={([val]) =>
                          setStateWithHistory('head_mask_invert', (prev) => ({
                            ...prev,
                            scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), invert: val } },
                          }))
                        }
                      />
                    </div>
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
	                onClick={() => setMaskEditArmed(!maskEditArmed)}
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
                        blendMode: 'normal',
                        blurPx: 0,
                        brightness: 1,
                        contrast: 1,
                        saturation: 1,
                        hueRotate: 0,
                        grayscale: 0,
                        sepia: 0,
                        invert: 0,
                        pixelate: 0,
                        mode: 'cutout',
                        lengthScale: 1,
                        volumePreserve: false,
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

          {maskEditArmed && (
            <div className="text-[9px] text-[#666]">
              Joints stay draggable while placing; grab the mask away from the joint to transform it.
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Drag Mode</div>
            <div className="flex flex-wrap bg-[#222] rounded-md p-0.5">
              {(['move', 'widen', 'expand', 'shrink', 'rotate', 'scale', 'stretch', 'skew', 'anchor'] as const).map(
                (m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMaskDragMode(m)}
                  className={`px-2 py-1 rounded text-[8px] font-bold uppercase transition-all ${
                    maskDragMode === m ? 'bg-white text-black' : 'text-[#666] hover:text-white'
                  }`}
                  title={
                    m === 'move'
                      ? 'Drag to move'
                      : m === 'widen'
                        ? 'Drag left/right to widen/narrow'
                        : m === 'expand'
                          ? 'Drag up/down to expand'
                          : m === 'shrink'
                            ? 'Drag up/down to shrink'
                      : m === 'rotate'
                        ? 'Drag left/right to rotate'
                        : m === 'scale'
                          ? 'Drag up/down to scale'
                          : m === 'stretch'
                            ? 'Drag to stretch X/Y'
                            : m === 'skew'
                              ? 'Drag to skew X/Y'
                              : 'Drag to move anchor'
                  }
                >
                  {m}
                </button>
                ),
              )}
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

          {!currentJoint || !currentMask ? (
            <div className="text-[10px] text-[#444]">Select a joint to edit its mask.</div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">
                  {currentJoint?.label || maskJointId}
                </div>
                <div className="flex gap-2 items-center">
                  <label className="flex items-center gap-2 text-[10px] select-none">
                    <input
                      type="checkbox"
                      checked={currentMask?.visible}
                      onChange={(e) => setJointMask({ visible: e.target.checked })}
                      className="rounded"
                      disabled={!currentMask?.src}
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
                        blendMode: 'normal',
                        blurPx: 0,
                        brightness: 1,
                        contrast: 1,
                        saturation: 1,
                        hueRotate: 0,
                        grayscale: 0,
                        sepia: 0,
                        invert: 0,
                        pixelate: 0,
                        relatedJoints: [],
                        mode: 'cutout',
                        lengthScale: 1,
                        volumePreserve: true,
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
                      <span>{Math.round(clamp(jointMaskOpacity, 0, 1) * 100)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.01}
                      value={[jointMaskOpacity]}
                      onValueChange={([val]) => setJointMask({ opacity: val })}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#666]">Scale</span>
                      <span>{jointMaskScale.toFixed(2)}×</span>
                    </div>
                    <Slider
                      min={0.01}
                      max={50}
                      step={0.01}
                      value={[jointMaskScale]}
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
                        max={10}
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
                        max={10}
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
                      multiple={false}
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
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const parent = selectedJoint?.parent;
                            if (parent && parent !== maskJointId && parent in state.joints) setRelationshipIds([parent]);
                            else setRelationshipIds([]);
                          }}
                          className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                          title="Set driver to the joint’s parent (if any)"
                          disabled={!jointMask.src}
                        >
                          Use Parent
                        </button>
                        <button
                          type="button"
                          onClick={() => setRelationshipIds([])}
                          className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                          title="Clear relationship joints (fallback to parent bone)"
                          disabled={!jointMask.src}
                        >
                          Clear
                        </button>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                              disabled={!jointMask.src}
                            >
                              + Add
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-2" align="end">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">
                              Add Relationship Joint
                            </div>
                            <div className="max-h-56 overflow-auto space-y-1">
                              {jointIds
                                .filter((id) => id !== maskJointId)
                                .map((id) => {
                                  const active = relationshipIds.includes(id);
                                  return (
                                    <button
                                      key={`rel-add:${id}`}
                                      type="button"
                                      onClick={() => setRelationshipIds([...relationshipIds, id])}
                                      disabled={active}
                                      className={`w-full text-left px-2 py-1 rounded text-[10px] transition-colors ${
                                        active ? 'bg-white/10 text-[#888]' : 'bg-[#0a0a0a] hover:bg-white/5 text-[#ddd]'
                                      }`}
                                    >
                                      {state.joints[id]?.label || id}
                                    </button>
                                  );
                                })}
                            </div>
                            <div className="mt-2 text-[9px] text-[#666]">
                              First item = directional driver. Others = anchor helpers.
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    {relationshipIds.length ? (
                      <div className="space-y-1">
                        {relationshipIds.map((id, idx) => (
                          <div
                            key={`rel:${id}`}
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#222] border border-white/5"
                          >
                            <div className="min-w-0">
                              <div className="text-[10px] text-[#ddd] truncate">
                                {idx === 0 ? 'Driver: ' : 'Anchor: '}
                                {state.joints[id]?.label || id}
                              </div>
                              <div className="text-[9px] text-[#666] truncate">{id}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setRelationshipIds(moveItem(relationshipIds, idx, idx - 1))}
                                className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[9px] text-[#ddd] hover:bg-black/50 disabled:opacity-40"
                                disabled={idx === 0}
                                title="Move up"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => setRelationshipIds(moveItem(relationshipIds, idx, idx + 1))}
                                className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[9px] text-[#ddd] hover:bg-black/50 disabled:opacity-40"
                                disabled={idx === relationshipIds.length - 1}
                                title="Move down"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => setRelationshipIds(relationshipIds.filter((x) => x !== id))}
                                className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[9px] text-[#ddd] hover:bg-black/50"
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-2 rounded bg-white/5 border border-white/10 text-[10px] text-[#555]">
                        Uses the joint’s parent for direction/length.
                      </div>
                    )}
                    <div className="text-[9px] text-[#666]">
                      Driver controls orientation/length. Extra joints shift the anchor point (useful for torso clusters).
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

                  <div className="space-y-3">
                    <div className="flex flex-col items-center">
                      <AngleDial
                        valueDeg={jointMask.rotation ?? 0}
                        isDisabled={!jointMask.src}
                        onBegin={handleMaskRotationBegin}
                        onEnd={handleMaskRotationEnd}
                        onRotateDelta={handleMaskRotationDelta}
                        label="Rotation"
                      />

                      {jointMask.src && (
                        <div className="mt-3 w-full flex items-center gap-2">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] shrink-0">Rotate</div>
                        <input
                          type="range"
                          min={-360}
                          max={360}
                          step={1}
                          value={jointMask.rotation ?? 0}
                          onPointerDown={handleMaskRotationBegin}
                          onPointerUp={handleMaskRotationEnd}
                          onPointerCancel={handleMaskRotationEnd}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isFinite(v)) return;
                              wheelTargetRotationRef.current = v;
                              setJointMask({ rotation: v } as any);
                            }}
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                            title="Unified rotation slider"
                          />
                          <div className="text-[10px] font-mono text-[#444] w-12 text-right tabular-nums">
                            {(jointMask.rotation ?? 0).toFixed(0)}°
                          </div>
                        </div>
                      )}

                      {jointMask.src && (
                        <div className="mt-2 grid grid-cols-6 gap-1 w-full">
                          {(
                            [
                              { label: '-45', delta: -45 },
                              { label: '-15', delta: -15 },
                              { label: '-5', delta: -5 },
                              { label: '+5', delta: 5 },
                              { label: '+15', delta: 15 },
                              { label: '+45', delta: 45 },
                            ] as const
                          ).map(({ label, delta }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => nudgeMaskRotation(delta)}
                              className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white"
                              title={`Nudge ${label}°`}
                            >
                              {label}°
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span>Fine Rotation</span>
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

                  <div className="space-y-2">
                    <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Nudge</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="text-[9px] text-[#666]">X</div>
                        <div className="grid grid-cols-4 gap-1">
                          {([-10, -1, 1, 10] as const).map((d) => (
                            <button
                              key={`joint-nudge-x:${d}`}
                              type="button"
                              onClick={() => setJointMask({ offsetX: clamp((jointMask.offsetX ?? 0) + d, -5000, 5000) } as any)}
                              className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white"
                              disabled={!jointMask.src}
                              title={`Offset X ${d > 0 ? '+' : ''}${d}`}
                            >
                              {d > 0 ? `+${d}` : d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-[#666]">Y</div>
                        <div className="grid grid-cols-4 gap-1">
                          {([-10, -1, 1, 10] as const).map((d) => (
                            <button
                              key={`joint-nudge-y:${d}`}
                              type="button"
                              onClick={() => setJointMask({ offsetY: clamp((jointMask.offsetY ?? 0) + d, -5000, 5000) } as any)}
                              className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white"
                              disabled={!jointMask.src}
                              title={`Offset Y ${d > 0 ? '+' : ''}${d}`}
                            >
                              {d > 0 ? `+${d}` : d}
                            </button>
                          ))}
                        </div>
                      </div>
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

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-[#666] uppercase tracking-widest font-bold">Filters</div>
                      <button
                        type="button"
                        onClick={() =>
                          setJointMask({
                            blendMode: 'normal',
                            blurPx: 0,
                            brightness: 1,
                            contrast: 1,
                            saturation: 1,
                            hueRotate: 0,
                            grayscale: 0,
                            sepia: 0,
                            invert: 0,
                            pixelate: 0,
                          } as any)
                        }
                        className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                        disabled={!jointMask.src}
                        title="Reset filter + blend values"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span>Blend</span>
                        <span className="text-[#666]">{((jointMask as any).blendMode || 'normal').toUpperCase()}</span>
                      </div>
                      <select
                        multiple={false}
                        value={((jointMask as any).blendMode || 'normal') as any}
                        onChange={(e) => setJointMask({ blendMode: e.target.value as any } as any)}
                        className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                        disabled={!jointMask.src}
                      >
                        {MASK_BLEND_MODE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#666]">Blur</span>
                        <span>{(((jointMask as any).blurPx ?? 0) as number).toFixed(1)}px</span>
                      </div>
                      <Slider
                        min={0}
                        max={60}
                        step={0.5}
                        value={[((jointMask as any).blurPx ?? 0) as number]}
                        onValueChange={([val]) => setJointMask({ blurPx: val } as any)}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#666]">Pixelate</span>
                        <span>{(((jointMask as any).pixelate ?? 0) as number) > 0 ? `${(jointMask as any).pixelate ?? 0}` : 'Off'}</span>
                      </div>
                      <Slider
                        min={0}
                        max={32}
                        step={1}
                        value={[((jointMask as any).pixelate ?? 0) as number]}
                        onValueChange={([val]) => setJointMask({ pixelate: val } as any)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Brightness</span>
                          <span>{(((jointMask as any).brightness ?? 1) as number).toFixed(2)}</span>
                        </div>
                        <Slider
                          min={0}
                          max={3}
                          step={0.01}
                          value={[((jointMask as any).brightness ?? 1) as number]}
                          onValueChange={([val]) => setJointMask({ brightness: val } as any)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Contrast</span>
                          <span>{(((jointMask as any).contrast ?? 1) as number).toFixed(2)}</span>
                        </div>
                        <Slider
                          min={0}
                          max={3}
                          step={0.01}
                          value={[((jointMask as any).contrast ?? 1) as number]}
                          onValueChange={([val]) => setJointMask({ contrast: val } as any)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Saturation</span>
                          <span>{(((jointMask as any).saturation ?? 1) as number).toFixed(2)}</span>
                        </div>
                        <Slider
                          min={0}
                          max={5}
                          step={0.01}
                          value={[((jointMask as any).saturation ?? 1) as number]}
                          onValueChange={([val]) => setJointMask({ saturation: val } as any)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Hue</span>
                          <span>{(((jointMask as any).hueRotate ?? 0) as number).toFixed(0)}°</span>
                        </div>
                      <Slider
                          min={-360}
                          max={360}
                          step={1}
                          value={[((jointMask as any).hueRotate ?? 0) as number]}
                          onValueChange={([val]) => setJointMask({ hueRotate: val } as any)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Gray</span>
                          <span>{Math.round(clamp(((jointMask as any).grayscale ?? 0) as number, 0, 1) * 100)}%</span>
                        </div>
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={[((jointMask as any).grayscale ?? 0) as number]}
                          onValueChange={([val]) => setJointMask({ grayscale: val } as any)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Sepia</span>
                          <span>{Math.round(clamp(((jointMask as any).sepia ?? 0) as number, 0, 1) * 100)}%</span>
                        </div>
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={[((jointMask as any).sepia ?? 0) as number]}
                          onValueChange={([val]) => setJointMask({ sepia: val } as any)}
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Invert</span>
                          <span>{Math.round(clamp(((jointMask as any).invert ?? 0) as number, 0, 1) * 100)}%</span>
                        </div>
                        <Slider
                          min={0}
                          max={1}
                          step={0.01}
                          value={[((jointMask as any).invert ?? 0) as number]}
                          onValueChange={([val]) => setJointMask({ invert: val } as any)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 items-end">
                    <select
                      multiple={false}
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
