import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Upload, X } from 'lucide-react';
import type { CutoutAsset, CutoutSlot, SkeletonState } from '../engine/types';
import { canonicalConnKey } from '../app/connectionKey';
import { getWorldPosition, toAngleDeg } from '../engine/kinematics';
import { AngleDial } from './AngleDial';
import { INITIAL_JOINTS } from '../engine/model';
import { applyPoseSnapshotToJoints, capturePoseSnapshot, interpolatePoseSnapshots } from '../engine/timeline';
import { processMaskImageFileToDataUrl } from '../app/maskImageProcessing';

const MANIKIN_SLOT_ORDER = [
  'head',
  'collar',
  'torso',
  'l_thigh',
  'l_calf',
  'l_foot',
  'r_thigh',
  'r_calf',
  'r_foot',
  'l_upper_arm',
  'l_forearm',
  'l_hand',
  'r_upper_arm',
  'r_forearm',
  'r_hand',
  'waist',
] as const;

type ManikinSlotId = (typeof MANIKIN_SLOT_ORDER)[number];

type PoseSnapshot = Omit<SkeletonState, 'timeline'> & { timestamp?: number };

type ManikinConsoleProps = {
  state: SkeletonState;
  setStateNoHistory: (update: (prev: SkeletonState) => SkeletonState) => void;
  setStateWithHistory: (actionId: string, update: (prev: SkeletonState) => SkeletonState) => void;
  beginHistoryAction: (actionId: string) => void;
  commitHistoryAction: () => void;
  setSelectedJointId: (id: string | null) => void;
  setSelectedConnectionKey: (key: string | null) => void;
  setMaskJointId: (id: string) => void;
  setManikinJointAngleDeg: (rootRotateJointId: string, angleDeg: number) => void;
  poseSnapshots: PoseSnapshot[];
  selectedPoseIndex: number | null;
  setSelectedPoseIndex: (index: number | null) => void;
  onAddPose: () => void;
  onUpdatePose: (index: number) => void;
  onApplyPose: (index: number) => void;
};

const isWaistSlot = (slot: CutoutSlot) =>
  slot.id === 'waist' || canonicalConnKey(slot.attachment.fromJointId, slot.attachment.toJointId) === canonicalConnKey('l_hip', 'r_hip');

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const wrapDeg180 = (deg: number): number => {
  // Keep degrees in [-180, 180) so downstream angle unwrapping stays cheap/stable.
  const n = ((deg + 180) % 360 + 360) % 360 - 180;
  return n === -180 ? 180 : n;
};

export const ManikinConsole: React.FC<ManikinConsoleProps> = ({
  state,
  setStateNoHistory,
  setStateWithHistory,
  beginHistoryAction,
  commitHistoryAction,
  setSelectedJointId,
  setSelectedConnectionKey,
  setMaskJointId,
  setManikinJointAngleDeg,
  poseSnapshots,
  selectedPoseIndex,
  setSelectedPoseIndex,
  onAddPose,
  onUpdatePose,
  onApplyPose,
}) => {
  const [selectedSlotId, setSelectedSlotId] = useState<ManikinSlotId>('torso');
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const wheelTargetDegRef = useRef<number | null>(null);
  const [poseToPoseEnabled, setPoseToPoseEnabled] = useState(false);
  const [poseAIndex, setPoseAIndex] = useState<number | null>(null);
  const [poseBIndex, setPoseBIndex] = useState<number | null>(null);
  const [poseBlendT, setPoseBlendT] = useState(0);
  const [selectorTab, setSelectorTab] = useState<'mask' | 'bone'>('mask');

  const slotsById = state.cutoutSlots;
  const selectedSlot = slotsById[selectedSlotId] ?? null;
  const linkWaistToTorso = Boolean(state.cutoutRig?.linkWaistToTorso);

  const selectedSlotConnKey = useMemo(() => {
    if (!selectedSlot) return null;
    return canonicalConnKey(selectedSlot.attachment.fromJointId, selectedSlot.attachment.toJointId);
  }, [selectedSlot]);

  const selectSlot = useCallback(
    (slotId: ManikinSlotId) => {
      const slot = slotsById[slotId];
      setSelectedSlotId(slotId);
      wheelTargetDegRef.current = null;
      if (!slot) return;
      const { fromJointId, toJointId } = slot.attachment;
      setSelectedJointId(toJointId);
      setSelectedConnectionKey(canonicalConnKey(fromJointId, toJointId));
      setMaskJointId(toJointId);
    },
    [setMaskJointId, setSelectedConnectionKey, setSelectedJointId, slotsById],
  );

  const setFkModeForSlot = useCallback(
    (slotId: ManikinSlotId, desired: 'stretch' | 'bend') => {
      const slot = slotsById[slotId];
      if (!slot || isWaistSlot(slot)) return;
      const key = canonicalConnKey(slot.attachment.fromJointId, slot.attachment.toJointId);

      setStateWithHistory(`manikin_fk_mode:${slotId}`, (prev) => {
        const existing = prev.connectionOverrides[key];
        const currentFollowDeg = existing?.fkFollowDeg;
        const currentSign = typeof currentFollowDeg === 'number' && Number.isFinite(currentFollowDeg) ? Math.sign(currentFollowDeg) : 0;
        const desiredSign = desired === 'stretch' ? 1 : -1;
        const nextOverrides = { ...prev.connectionOverrides };

        // Toggle behavior: default off (0). Clicking sets +/-1; clicking again turns it off.
        const nextFollowDeg = currentSign === desiredSign ? 0 : desiredSign * 1;

        if (!existing && nextFollowDeg === 0) return prev;
        const next = { ...(existing ?? {}) } as any;
        if (nextFollowDeg === 0) delete next.fkFollowDeg;
        else next.fkFollowDeg = nextFollowDeg;

        // Clean up legacy field if present.
        if ('fkMode' in next) delete next.fkMode;

        if (Object.keys(next).length === 0) delete nextOverrides[key];
        else nextOverrides[key] = next;
        return { ...prev, connectionOverrides: nextOverrides };
      });
    },
    [setStateWithHistory, slotsById],
  );

  const setFkFollowDegForSlot = useCallback(
    (slotId: ManikinSlotId, followDeg: number) => {
      const slot = slotsById[slotId];
      if (!slot || isWaistSlot(slot)) return;
      const key = canonicalConnKey(slot.attachment.fromJointId, slot.attachment.toJointId);
      if (!Number.isFinite(followDeg) || Math.abs(followDeg) > 360) return;

      setStateWithHistory(`manikin_fk_follow_deg:${slotId}`, (prev) => {
        const existing = prev.connectionOverrides[key];
        const nextOverrides = { ...prev.connectionOverrides };
        const next = { ...(existing ?? {}) } as any;
        if (Math.abs(followDeg) < 1e-9) delete next.fkFollowDeg;
        else next.fkFollowDeg = followDeg;
        if ('fkMode' in next) delete next.fkMode;
        if (Object.keys(next).length === 0) delete nextOverrides[key];
        else nextOverrides[key] = next;
        return { ...prev, connectionOverrides: nextOverrides };
      });
    },
    [setStateWithHistory, slotsById],
  );

  const toggleSlotVisible = useCallback(
    (slotId: ManikinSlotId) => {
      setStateWithHistory(`manikin_slot_visible:${slotId}`, (prev) => {
        const slot = prev.cutoutSlots[slotId];
        if (!slot) return prev;
        return {
          ...prev,
          cutoutSlots: { ...prev.cutoutSlots, [slotId]: { ...slot, visible: !slot.visible } },
        };
      });
    },
    [setStateWithHistory],
  );

  const clearSlotMask = useCallback(
    (slotId: ManikinSlotId) => {
      setStateWithHistory(`manikin_slot_clear:${slotId}`, (prev) => {
        const slot = prev.cutoutSlots[slotId];
        if (!slot) return prev;
        return {
          ...prev,
          cutoutSlots: { ...prev.cutoutSlots, [slotId]: { ...slot, assetId: null, visible: false } },
        };
      });
    },
    [setStateWithHistory],
  );

  const uploadMaskForSlot = useCallback(
    async (slotId: ManikinSlotId, file: File) => {
      const slot = slotsById[slotId];
      if (!slot) return;

      try {
        const processed = await processMaskImageFileToDataUrl(file, {
          removeBorderBackground: true,
          cropToContent: true,
          cropPaddingPx: 6,
        });
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const asset: CutoutAsset = {
          id: assetId,
          name: file.name.replace(/\.[^/.]+$/, '') || 'Mask',
          kind: 'image',
          image: { src: processed.dataUrl, naturalWidth: processed.width || 1, naturalHeight: processed.height || 1 },
        };

        setStateWithHistory(`manikin_slot_mask_upload:${slotId}`, (prev) => {
          const existingSlot = prev.cutoutSlots[slotId];
          if (!existingSlot) return prev;

          const hadAsset = Boolean(existingSlot.assetId);
          let nextSlot: CutoutSlot = { ...existingSlot, assetId, visible: true };

          // Auto-fit defaults on first add; preserve user tweaks on replace.
          if (!hadAsset) {
            const fromPos = getWorldPosition(existingSlot.attachment.fromJointId, prev.joints, INITIAL_JOINTS);
            const toPos = getWorldPosition(existingSlot.attachment.toJointId, prev.joints, INITIAL_JOINTS);
            const boneLenPx = Math.max(1, Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y) * 20);

            const headPos = getWorldPosition('head', prev.joints, INITIAL_JOINTS);
            const neckPos = getWorldPosition('neck_base', prev.joints, INITIAL_JOINTS);
            const headLenPx = Math.max(1, Math.hypot(headPos.x - neckPos.x, headPos.y - neckPos.y) * 20);

            const w = Math.max(1, processed.width);
            const h = Math.max(1, processed.height);
            const aspect = h / w;
            const mode: CutoutSlot['mode'] = aspect >= 1.15 ? 'rubberhose' : 'cutout';

            // Choose `scale` so the image height roughly matches the bone length while preserving aspect ratio.
            // Rendered height:
            // - cutout: (headLenPx * scale) * (h / w)
            // - rubberhose: boneLenPx * lengthScale (lengthScale defaults to 1)
            const scaleRaw = (boneLenPx / Math.max(1e-6, headLenPx)) * (w / h);
            const scale = clamp(scaleRaw, 0.01, 20);

            nextSlot = {
              ...nextSlot,
              mode,
              scale,
              lengthScale: 1.0,
              volumePreserve: false,
              offsetX: 0,
              offsetY: 0,
              rotation: 0,
              anchorX: 0.5,
              anchorY: 0.5,
            };
          }

          return {
            ...prev,
            assets: { ...prev.assets, [assetId]: asset },
            cutoutSlots: {
              ...prev.cutoutSlots,
              [slotId]: nextSlot,
            },
          };
        });
      } catch (err) {
        console.error('[manikin] mask upload failed', err);
      }
    },
    [setStateWithHistory, slotsById],
  );

  const selectedAngleDeg = useMemo(() => {
    if (!selectedSlot || isWaistSlot(selectedSlot)) return null;
    const toId = selectedSlot.attachment.toJointId;
    const joint = state.joints[toId];
    if (!joint?.parent) return null;
    return toAngleDeg(joint.previewOffset);
  }, [selectedSlot, state.joints]);

  const selectAdjacentSlot = useCallback(
    (dir: -1 | 1) => {
      const startIndex = MANIKIN_SLOT_ORDER.indexOf(selectedSlotId);
      if (startIndex < 0) return;
      const len = MANIKIN_SLOT_ORDER.length;
      for (let step = 1; step <= len; step += 1) {
        const idx = (startIndex + dir * step + len) % len;
        const nextId = MANIKIN_SLOT_ORDER[idx];
        if (slotsById[nextId]) {
          selectSlot(nextId);
          return;
        }
      }
      const idx = (startIndex + dir + len) % len;
      selectSlot(MANIKIN_SLOT_ORDER[idx]);
    },
    [selectSlot, selectedSlotId, slotsById],
  );

  const selectedFkFollowDeg = useMemo(() => {
    if (!selectedSlotConnKey) return 0;
    const override = state.connectionOverrides[selectedSlotConnKey];
    const raw = override?.fkFollowDeg;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return override?.fkMode === 'stretch' ? 1 : override?.fkMode === 'bend' ? -1 : 0;
  }, [selectedSlotConnKey, state.connectionOverrides]);

  const selectedFkSign = Math.sign(selectedFkFollowDeg);

  const onWheelBegin = useCallback(() => {
    if (!selectedSlot || selectedAngleDeg === null || isWaistSlot(selectedSlot)) return;
    wheelTargetDegRef.current = selectedAngleDeg;
    beginHistoryAction(`manikin_piece_angle:${selectedSlotId}`);
  }, [beginHistoryAction, selectedAngleDeg, selectedSlot, selectedSlotId]);

  const onWheelEnd = useCallback(() => {
    wheelTargetDegRef.current = null;
    commitHistoryAction();
  }, [commitHistoryAction]);

  const onWheelRotateDelta = useCallback(
    (deltaDeg: number) => {
      const slot = slotsById[selectedSlotId];
      if (!slot || isWaistSlot(slot)) return;

      const base = wheelTargetDegRef.current ?? selectedAngleDeg ?? 0;
      const next = wrapDeg180(base + deltaDeg);
      wheelTargetDegRef.current = next;
      setManikinJointAngleDeg(slot.attachment.toJointId, next);
    },
    [selectedAngleDeg, selectedSlotId, setManikinJointAngleDeg, slotsById],
  );

  const nudgeAngle = useCallback(
    (deltaDeg: number) => {
      const slot = slotsById[selectedSlotId];
      if (!slot || isWaistSlot(slot) || selectedAngleDeg === null) return;
      beginHistoryAction(`manikin_piece_angle:${selectedSlotId}`);
      setManikinJointAngleDeg(slot.attachment.toJointId, wrapDeg180(selectedAngleDeg + deltaDeg));
      commitHistoryAction();
    },
    [beginHistoryAction, commitHistoryAction, selectedAngleDeg, selectedSlotId, setManikinJointAngleDeg, slotsById],
  );

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Manikin</div>
        <div className="text-[10px] text-[#444]">FK</div>
      </div>

      <div className="mb-3 p-3 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Wheel</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => selectAdjacentSlot(-1)}
              className="p-1 rounded bg-[#222] hover:bg-[#333] text-white"
              title="Previous piece"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => selectAdjacentSlot(1)}
              className="p-1 rounded bg-[#222] hover:bg-[#333] text-white"
              title="Next piece"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {!selectedSlot ? (
          <div className="mt-2 text-[10px] text-[#444]">Select a piece.</div>
        ) : (
          <>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] truncate">{selectedSlot.name}</div>
                {selectedSlotConnKey && (
                  <div className="text-[10px] text-[#444] font-mono truncate" title={selectedSlotConnKey}>
                    {selectedSlotConnKey}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleSlotVisible(selectedSlotId)}
                  className="p-1 rounded bg-[#222] hover:bg-[#333] text-white"
                  title={selectedSlot.visible ? 'Hide' : 'Show'}
                >
                  {selectedSlot.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => clearSlotMask(selectedSlotId)}
                  className="p-1 rounded bg-[#222] hover:bg-[#333] text-white"
                  title="Clear mask"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {!isWaistSlot(selectedSlot) && selectedSlotConnKey && (
              <div className="mt-3 p-2 rounded-lg bg-[#111]/40 border border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Link</div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFkModeForSlot(selectedSlotId, 'stretch')}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        selectedFkSign > 0 ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                      }`}
                      title="Stretch (follow parent +deg)"
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() => setFkModeForSlot(selectedSlotId, 'bend')}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        selectedFkSign < 0 ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                      }`}
                      title="Bend (follow parent -deg)"
                    >
                      B
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">FK Follow (deg)</div>
                  <input
                    type="text"
                    value={String(selectedFkFollowDeg)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setFkFollowDegForSlot(selectedSlotId, Math.max(-360, Math.min(360, v)));
                    }}
                    className="w-20 px-2 py-1 rounded bg-[#111] border border-white/10 text-[10px] font-mono text-white"
                    title="0 = off; positive follows parent; negative opposes parent"
                  />
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-col items-center">
              <AngleDial
                valueDeg={selectedAngleDeg ?? 0}
                isDisabled={selectedAngleDeg === null}
                onBegin={onWheelBegin}
                onEnd={onWheelEnd}
                onRotateDelta={onWheelRotateDelta}
                label="Angle"
              />

              {selectedAngleDeg !== null && (
                <div className="mt-3 w-full flex items-center gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] shrink-0">Rotate</div>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={selectedAngleDeg}
                    onPointerDown={onWheelBegin}
                    onPointerUp={onWheelEnd}
                    onPointerCancel={onWheelEnd}
                    onChange={(e) => {
                      const slot = slotsById[selectedSlotId];
                      if (!slot || isWaistSlot(slot)) return;
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      wheelTargetDegRef.current = v;
                      setManikinJointAngleDeg(slot.attachment.toJointId, v);
                    }}
                    className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    title="Unified rotation slider"
                  />
                  <div className="text-[10px] font-mono text-[#444] w-12 text-right tabular-nums">
                    {selectedAngleDeg.toFixed(0)}°
                  </div>
                </div>
              )}

              {selectedAngleDeg !== null && (
                <div className="mt-2 grid grid-cols-4 gap-1 w-full">
                  {(
                    [
                      { label: '-10', delta: -10 },
                      { label: '-1', delta: -1 },
                      { label: '+1', delta: 1 },
                      { label: '+10', delta: 10 },
                    ] as const
                  ).map(({ label, delta }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => nudgeAngle(delta)}
                      className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white"
                      title={`Nudge ${label}°`}
                    >
                      {label}°
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3">
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void uploadMaskForSlot(selectedSlotId, file);
                  e.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
              >
                <Upload size={12} />
                Upload / Replace
              </button>
            </div>
          </>
        )}
      </div>

      <div className="mb-3 p-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Clavicle Clamp</div>
        <button
          type="button"
          onClick={() =>
            setStateWithHistory('toggle_clavicle_constraint', (prev) => ({
              ...prev,
              clavicleConstraintEnabled: !prev.clavicleConstraintEnabled,
            }))
          }
          className={`px-2 py-1 rounded text-[10px] font-bold ${
            state.clavicleConstraintEnabled ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
          }`}
          title="Limit clavicle joint rotation range"
        >
          {state.clavicleConstraintEnabled ? 'On' : 'Off'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-1 max-h-[240px] overflow-y-auto pr-1">
        {MANIKIN_SLOT_ORDER.map((slotId) => {
          const slot = slotsById[slotId];
          const selected = selectedSlotId === slotId;
          const hasMask = Boolean(slot?.assetId);
          const waist = slot ? isWaistSlot(slot) : slotId === 'waist';
          const connKey = slot ? canonicalConnKey(slot.attachment.fromJointId, slot.attachment.toJointId) : null;
          const followDegRaw = connKey ? state.connectionOverrides[connKey]?.fkFollowDeg : undefined;
          const legacyFkMode = connKey ? state.connectionOverrides[connKey]?.fkMode : undefined;
          const followDeg =
            typeof followDegRaw === 'number' && Number.isFinite(followDegRaw)
              ? followDegRaw
              : legacyFkMode === 'stretch'
                ? 1
                : legacyFkMode === 'bend'
                  ? -1
                  : 0;
          const fkSign = Math.sign(followDeg);

          return (
            <div
              key={slotId}
              className={`flex items-center justify-between gap-2 p-2 rounded-md border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white/50 ${
                selected ? 'bg-white/10 border-white/10' : 'bg-white/5 border-white/5 hover:bg-white/10'
              }`}
              onClick={() => selectSlot(slotId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectSlot(slotId);
                }
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-1.5 h-1.5 rounded-full ${hasMask ? 'bg-[#00ff88]' : 'bg-[#444]'}`} />
                <div className="text-xs font-medium truncate">{slot?.name ?? slotId}</div>
              </div>

              {!waist && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectSlot(slotId);
                      setFkModeForSlot(slotId, 'stretch');
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-bold ${
                      fkSign > 0 ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                    }`}
                    title="Stretch (follow parent +deg)"
                  >
                    S
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectSlot(slotId);
                      setFkModeForSlot(slotId, 'bend');
                    }}
                    className={`px-2 py-1 rounded text-[10px] font-bold ${
                      fkSign < 0 ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                    }`}
                    title="Bend (follow parent -deg)"
                  >
                    B
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Poses</div>
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666] select-none">
              <input
                type="checkbox"
                checked={poseToPoseEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setPoseToPoseEnabled(on);
                  if (!on) {
                    setPoseAIndex(null);
                    setPoseBIndex(null);
                  }
                }}
                className="accent-white"
              />
              Pose-to-Pose
            </label>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onAddPose}
              className="py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
              title="Add current pose"
            >
              Add Pose
            </button>
            <button
              type="button"
              disabled={selectedPoseIndex === null}
              onClick={() => {
                if (selectedPoseIndex === null) return;
                onUpdatePose(selectedPoseIndex);
              }}
              className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                selectedPoseIndex === null ? 'bg-[#181818] text-[#444] cursor-not-allowed' : 'bg-[#222] hover:bg-[#333]'
              }`}
              title="Update the selected pose with the current pose"
            >
              Update Pose
            </button>
          </div>

          {poseSnapshots.length === 0 ? (
            <div className="mt-2 text-[10px] text-[#444]">No poses yet.</div>
          ) : (
            <div className="mt-2 space-y-1 max-h-[180px] overflow-y-auto pr-1">
              {poseSnapshots.map((p, i) => {
                const selected = selectedPoseIndex === i;
                const isA = poseAIndex === i;
                const isB = poseBIndex === i;
                return (
                  <button
                    key={`pose:${i}`}
                    type="button"
                    onClick={() => {
                      setSelectedPoseIndex(i);
                      onApplyPose(i);
                    }}
                    className={`w-full flex items-center justify-between gap-2 p-2 rounded-md border transition-colors ${
                      selected ? 'bg-white/10 border-white/10' : 'bg-white/5 border-white/5 hover:bg-white/10'
                    }`}
                    title="Apply pose"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="text-[10px] font-mono text-[#bbb]">Pose {poseSnapshots.length - i}</div>
                      {poseToPoseEnabled && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPoseAIndex(i);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isA ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                            }`}
                            title="Set as A"
                          >
                            A
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPoseBIndex(i);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isB ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                            }`}
                            title="Set as B"
                          >
                            B
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-[9px] font-mono text-[#444] shrink-0 tabular-nums">
                      {p.timestamp ? new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {poseToPoseEnabled && poseAIndex !== null && poseBIndex !== null && poseSnapshots[poseAIndex] && poseSnapshots[poseBIndex] && (
            <div className="mt-3 p-2 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Blend</div>
                <div className="text-[10px] font-mono text-[#444] tabular-nums">{Math.round(poseBlendT * 100)}%</div>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={poseBlendT}
                onChange={(e) => {
                  const t = clamp(Number(e.target.value), 0, 1);
                  setPoseBlendT(t);
                  const a = poseSnapshots[poseAIndex]!;
                  const b = poseSnapshots[poseBIndex]!;
                  const pa = capturePoseSnapshot(a.joints, 'preview');
                  const pb = capturePoseSnapshot(b.joints, 'preview');
                  const blended = interpolatePoseSnapshots(pa, pb, t, INITIAL_JOINTS, { stretchEnabled: state.stretchEnabled });
                  setStateNoHistory((prev) => ({ ...prev, joints: applyPoseSnapshotToJoints(prev.joints, blended) }));
                }}
                className="w-full mt-2 accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                title="Blend between Pose A and Pose B"
              />
              <button
                type="button"
                onClick={() => {
                  const a = poseSnapshots[poseAIndex]!;
                  const b = poseSnapshots[poseBIndex]!;
                  const pa = capturePoseSnapshot(a.joints, 'preview');
                  const pb = capturePoseSnapshot(b.joints, 'preview');
                  const blended = interpolatePoseSnapshots(pa, pb, poseBlendT, INITIAL_JOINTS, { stretchEnabled: state.stretchEnabled });
                  setStateWithHistory('pose_blend_commit', (prev) => ({ ...prev, joints: applyPoseSnapshotToJoints(prev.joints, blended) }));
                }}
                className="w-full mt-2 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
                title="Commit the current blend as a single undo step"
              >
                Commit Blend
              </button>
            </div>
          )}
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Selector</div>
            <div className="flex bg-[#222] rounded-md p-0.5">
              {(['mask', 'bone'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSelectorTab(t)}
                  className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                    selectorTab === t ? 'bg-white text-black' : 'text-[#666] hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Piece</div>
            <select
              value={selectedSlotId}
              onChange={(e) => selectSlot(e.target.value as ManikinSlotId)}
              className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
            >
              {MANIKIN_SLOT_ORDER.map((id) => (
                <option key={`sel:${id}`} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          {selectorTab === 'mask' && selectedSlot && (
            <div className="mt-3 space-y-2">
              <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
                <span className="uppercase tracking-widest">Link Waist+Torso</span>
                <input
                  type="checkbox"
                  checked={linkWaistToTorso}
                  onChange={(e) => {
                    const next = Boolean(e.target.checked);
                    setStateWithHistory('cutout_rig:link_waist_to_torso', (prev) => ({
                      ...prev,
                      cutoutRig: { ...(prev.cutoutRig ?? { linkWaistToTorso: false }), linkWaistToTorso: next },
                    }));
                  }}
                  className="accent-white"
                  title="When enabled, the waist piece reuses the torso's rotation around the navel seam."
                />
              </label>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Mask Size</div>
              <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
                <span className="uppercase tracking-widest">Scale</span>
                <input
                  type="range"
                  min={0.01}
                  max={2}
                  step={0.01}
                  value={selectedSlot.scale}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setStateNoHistory((prev) => {
                      const slot = prev.cutoutSlots[selectedSlotId];
                      if (!slot) return prev;
                      return {
                        ...prev,
                        cutoutSlots: { ...prev.cutoutSlots, [selectedSlotId]: { ...slot, scale: clamp(v, 0.01, 20) } },
                      };
                    });
                  }}
                  className="flex-1 accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                  title="Mask scale"
                />
                <input
                  type="number"
                  step={0.01}
                  value={selectedSlot.scale}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setStateNoHistory((prev) => {
                      const slot = prev.cutoutSlots[selectedSlotId];
                      if (!slot) return prev;
                      return {
                        ...prev,
                        cutoutSlots: { ...prev.cutoutSlots, [selectedSlotId]: { ...slot, scale: clamp(v, 0.01, 20) } },
                      };
                    });
                  }}
                  className="w-20 px-2 py-1 rounded bg-[#111] border border-white/10 text-[10px] font-mono text-white"
                />
              </label>
              <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
                <span className="uppercase tracking-widest">Length</span>
                <input
                  type="range"
                  min={0.05}
                  max={3}
                  step={0.01}
                  value={selectedSlot.lengthScale}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setStateNoHistory((prev) => {
                      const slot = prev.cutoutSlots[selectedSlotId];
                      if (!slot) return prev;
                      return {
                        ...prev,
                        cutoutSlots: { ...prev.cutoutSlots, [selectedSlotId]: { ...slot, lengthScale: clamp(v, 0.05, 10) } },
                      };
                    });
                  }}
                  className="flex-1 accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                  title="Mask length scale"
                />
                <input
                  type="number"
                  step={0.01}
                  value={selectedSlot.lengthScale}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setStateNoHistory((prev) => {
                      const slot = prev.cutoutSlots[selectedSlotId];
                      if (!slot) return prev;
                      return {
                        ...prev,
                        cutoutSlots: { ...prev.cutoutSlots, [selectedSlotId]: { ...slot, lengthScale: clamp(v, 0.05, 10) } },
                      };
                    });
                  }}
                  className="w-20 px-2 py-1 rounded bg-[#111] border border-white/10 text-[10px] font-mono text-white"
                />
              </label>
            </div>
          )}

          {selectorTab === 'bone' && selectedSlotConnKey && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Bone</div>
                <button
                  type="button"
                  onClick={() => setSelectedConnectionKey(selectedSlotConnKey)}
                  className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest bg-[#222] hover:bg-[#333]"
                  title="Select this bone on the canvas"
                >
                  Select
                </button>
              </div>
              <div className="text-[10px] text-[#444] font-mono truncate" title={selectedSlotConnKey}>
                {selectedSlotConnKey}
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Shape</div>
                <select
                  value={state.connectionOverrides[selectedSlotConnKey]?.shape ?? 'auto'}
                  onChange={(e) => {
                    const nextShape = e.target.value;
                    setStateNoHistory((prev) => {
                      const nextOverrides = { ...(prev.connectionOverrides ?? {}) };
                      const existing = (nextOverrides[selectedSlotConnKey] ?? {}) as Record<string, unknown>;
                      if (nextShape === 'auto') {
                        const cleaned = { ...existing };
                        delete (cleaned as any).shape;
                        if (Object.keys(cleaned).length === 0) delete nextOverrides[selectedSlotConnKey];
                        else nextOverrides[selectedSlotConnKey] = cleaned as any;
                      } else {
                        nextOverrides[selectedSlotConnKey] = { ...existing, shape: nextShape } as any;
                      }
                      return { ...prev, connectionOverrides: nextOverrides as any };
                    });
                  }}
                  className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
                >
                  <option value="auto">Auto</option>
                  <option value="standard">Standard</option>
                  <option value="bone">Bone</option>
                  <option value="capsule">Capsule</option>
                  <option value="muscle">Muscle</option>
                  <option value="tapered">Tapered</option>
                  <option value="cylinder">Cylinder</option>
                  <option value="diamond">Diamond</option>
                  <option value="ribbon">Ribbon</option>
                  <option value="wire">Wire</option>
                  <option value="wireframe">Wireframe</option>
                </select>
              </div>

              <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
                <span className="uppercase tracking-widest">Size</span>
                <input
                  type="range"
                  min={0.25}
                  max={4}
                  step={0.05}
                  value={state.connectionOverrides[selectedSlotConnKey]?.shapeScale ?? 1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setStateNoHistory((prev) => {
                      const nextOverrides = { ...(prev.connectionOverrides ?? {}) };
                      const existing = (nextOverrides[selectedSlotConnKey] ?? {}) as Record<string, unknown>;
                      const nextScale = clamp(v, 0.25, 4);
                      if (Math.abs(nextScale - 1) < 1e-9) {
                        const cleaned = { ...existing };
                        delete (cleaned as any).shapeScale;
                        if (Object.keys(cleaned).length === 0) delete nextOverrides[selectedSlotConnKey];
                        else nextOverrides[selectedSlotConnKey] = cleaned as any;
                      } else {
                        nextOverrides[selectedSlotConnKey] = { ...existing, shapeScale: nextScale } as any;
                      }
                      return { ...prev, connectionOverrides: nextOverrides as any };
                    });
                  }}
                  className="flex-1 accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                  title="Bone render size"
                />
                <input
                  type="number"
                  step={0.05}
                  value={state.connectionOverrides[selectedSlotConnKey]?.shapeScale ?? 1}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    setStateNoHistory((prev) => {
                      const nextOverrides = { ...(prev.connectionOverrides ?? {}) };
                      const existing = (nextOverrides[selectedSlotConnKey] ?? {}) as Record<string, unknown>;
                      const nextScale = clamp(v, 0.25, 4);
                      if (Math.abs(nextScale - 1) < 1e-9) {
                        const cleaned = { ...existing };
                        delete (cleaned as any).shapeScale;
                        if (Object.keys(cleaned).length === 0) delete nextOverrides[selectedSlotConnKey];
                        else nextOverrides[selectedSlotConnKey] = cleaned as any;
                      } else {
                        nextOverrides[selectedSlotConnKey] = { ...existing, shapeScale: nextScale } as any;
                      }
                      return { ...prev, connectionOverrides: nextOverrides as any };
                    });
                  }}
                  className="w-20 px-2 py-1 rounded bg-[#111] border border-white/10 text-[10px] font-mono text-white"
                  title="Render size multiplier for this bone shape"
                />
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
