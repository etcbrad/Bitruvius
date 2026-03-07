import React, { useCallback, useMemo, useState } from 'react';

import type { ControlMode, SkeletonState, SheetPalette, SheetSegment } from '../engine/types';
import { canonicalConnKey } from '../app/connectionKey';
import { INITIAL_JOINTS } from '../engine/model';
import { applyPoseSnapshotToJoints, capturePoseSnapshot, interpolatePoseSnapshots } from '../engine/timeline';

import { CollapsibleSection } from './CollapsibleSection';
import { DetailsWidget } from './DetailsWidget';

export const MANIKIN_SLOT_ORDER = [
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

  selectedJointId: string | null;
  setSelectedJointId: (id: string | null) => void;
  selectedConnectionKey: string | null;
  setSelectedConnectionKey: (key: string | null) => void;
  maskJointId: string;
  setMaskJointId: (id: string) => void;

  setManikinJointAngleDeg: (rootRotateJointId: string, angleDeg: number) => void;

  currentControlMode: ControlMode;
  onControlModeChange: (mode: ControlMode) => void;

  uploadHeadMaskFile: (file: File) => Promise<void>;
  uploadJointMaskFile: (file: File, jointId: string) => Promise<void>;

  poseSnapshots: PoseSnapshot[];
  selectedPoseIndex: number | null;
  setSelectedPoseIndex: (index: number | null) => void;
  onAddPose: () => void;
  onUpdatePose: (index: number) => void;
  onApplyPose: (index: number) => void;
  sheetPalette: SheetPalette;
  updateSheetPalette: (patch: Partial<SheetPalette>) => void;
  assignSegmentToSlot: (segment: SheetSegment, slotId?: string) => void;
  onOpenCutoutBuilder: () => void;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const ManikinConsole: React.FC<ManikinConsoleProps> = ({
  state,
  setStateNoHistory,
  setStateWithHistory,
  selectedJointId,
  setSelectedJointId,
  selectedConnectionKey,
  setSelectedConnectionKey,
  maskJointId,
  setMaskJointId,
  setManikinJointAngleDeg,
  currentControlMode,
  onControlModeChange,
  uploadHeadMaskFile,
  uploadJointMaskFile,
  poseSnapshots,
  selectedPoseIndex,
  setSelectedPoseIndex,
  onAddPose,
  onUpdatePose,
  onApplyPose,
  sheetPalette,
  updateSheetPalette,
  assignSegmentToSlot,
  onOpenCutoutBuilder,
}) => {
  const [selectedSlotId, setSelectedSlotId] = useState<ManikinSlotId>('torso');
  const [poseToPoseEnabled, setPoseToPoseEnabled] = useState(false);
  const [poseAIndex, setPoseAIndex] = useState<number | null>(null);
  const [poseBIndex, setPoseBIndex] = useState<number | null>(null);
  const [poseBlendT, setPoseBlendT] = useState(0);

  const slotsById = state.cutoutSlots;

  const selectSlot = useCallback(
    (slotId: ManikinSlotId) => {
      const slot = slotsById[slotId];
      setSelectedSlotId(slotId);
      if (!slot) return;
      const { fromJointId, toJointId } = slot.attachment;
      setSelectedJointId(toJointId);
      setSelectedConnectionKey(canonicalConnKey(fromJointId, toJointId));
      setMaskJointId(toJointId);
      updateSheetPalette({ targetSlotId: slotId });
    },
    [setMaskJointId, setSelectedConnectionKey, setSelectedJointId, slotsById, updateSheetPalette],
  );

  const selectedSheetSegment = useMemo(
    () => sheetPalette.segments.find((segment) => segment.id === sheetPalette.selectedSegmentId) ?? null,
    [sheetPalette.segments, sheetPalette.selectedSegmentId],
  );

  const assignSelectedSegment = useCallback(() => {
    if (!selectedSheetSegment) return;
    assignSegmentToSlot(selectedSheetSegment, selectedSlotId);
  }, [assignSegmentToSlot, selectedSheetSegment, selectedSlotId]);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Manikin</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenCutoutBuilder}
            className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10 hover:border-white/50 hover:text-white transition"
          >
            Cutout Builder
          </button>
          <div className="text-[10px] text-[#444]">FK</div>
        </div>
      </div>

      <div className="space-y-3">
        <CollapsibleSection title="Clavicle Clamp" storageKey="btv:manikin:section:clavicle" defaultOpen>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] text-[#bbb]">Limit clavicle joint rotation range to keep shoulders readable.</div>
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
        </CollapsibleSection>

        <CollapsibleSection title="Pieces" storageKey="btv:manikin:section:pieces" defaultOpen>
          <div className="grid grid-cols-1 gap-1 max-h-[240px] overflow-y-auto pr-1">
            {MANIKIN_SLOT_ORDER.map((slotId) => {
              const slot = slotsById[slotId];
              const selected = selectedSlotId === slotId;
              const hasMask = Boolean(slot?.assetId);
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
                </div>
              );
            })}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Sheet Assignments" storageKey="btv:manikin:section:sheets">
          {sheetPalette.segments.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/50">
                <span>{sheetPalette.name || 'Current Cutout Sheet'}</span>
                <span className="text-[9px] text-white/30">
                  {sheetPalette.dims ? `${sheetPalette.dims.width}×${sheetPalette.dims.height}` : 'dims unknown'}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
                {sheetPalette.previewSrc ? (
                  <img
                    src={sheetPalette.previewSrc}
                    alt={sheetPalette.name || 'Cutout sheet'}
                    className="h-36 w-full rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-36 w-full items-center justify-center text-[10px] text-white/40">
                    Sheet preview unavailable
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-white/40">
                <span>Segments</span>
                <span className="text-white/30">{sheetPalette.segments.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 max-h-[160px] overflow-y-auto pr-1">
                {sheetPalette.segments.map((segment) => {
                  const isSelected = sheetPalette.selectedSegmentId === segment.id;
                  return (
                    <button
                      key={segment.id}
                      type="button"
                      onClick={() => updateSheetPalette({ selectedSegmentId: segment.id })}
                      className={`h-16 rounded-lg border transition-colors focus:outline-none ${
                        isSelected ? 'border-[#F27D26]' : 'border-white/10 hover:border-white/40'
                      }`}
                    >
                      <img src={segment.thumbnail} alt={segment.id} className="h-full w-full object-contain" />
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={assignSelectedSegment}
                disabled={!selectedSheetSegment}
                className="w-full rounded-full bg-[#F27D26] px-3 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-black disabled:opacity-40"
              >
                Pre-assign to {selectedSlotId.replace(/_/g, ' ')}
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-white/40">
              Load a sheet in the Cutout Builder to preview segments and pre-assign them to joints here.
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Poses"
          storageKey="btv:manikin:section:poses"
          defaultOpen
          headerRight={
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
          }
        >
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
                      {p.timestamp
                        ? new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : '—'}
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
        </CollapsibleSection>

        <CollapsibleSection title="Details" storageKey="btv:manikin:section:details" defaultOpen>
          <div className="mt-2 p-2 rounded-lg bg-[#111]/40 border border-white/10">
              <DetailsWidget
                state={state}
                setStateWithHistory={setStateWithHistory}
                selectedJointId={selectedJointId}
                setSelectedJointId={setSelectedJointId}
                selectedConnectionKey={selectedConnectionKey}
                setSelectedConnectionKey={setSelectedConnectionKey}
                maskJointId={maskJointId}
                setMaskJointId={setMaskJointId}
                setJointAngleDeg={setManikinJointAngleDeg}
                currentControlMode={currentControlMode}
                onControlModeChange={onControlModeChange}
                uploadHeadMaskFile={uploadHeadMaskFile}
                uploadJointMaskFile={uploadJointMaskFile}
                pieceOrder={MANIKIN_SLOT_ORDER as unknown as string[]}
                selectedPieceId={selectedSlotId}
                setSelectedPieceId={(id) => {
                  if ((MANIKIN_SLOT_ORDER as readonly string[]).includes(id)) selectSlot(id as ManikinSlotId);
                }}
                sheetPalette={sheetPalette}
                updateSheetPalette={updateSheetPalette}
                assignSegmentToSlot={assignSegmentToSlot}
              />
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
};

export const ManikinGlobalPanel: React.FC = () => {
  return (
    <div className="p-4 text-center text-white/60">
      <div className="text-lg font-semibold mb-2">Global Settings</div>
      <div className="text-sm">Global panel functionality coming soon...</div>
    </div>
  );
};
