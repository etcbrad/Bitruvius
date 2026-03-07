import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import type { SheetPalette, SheetSegment, SkeletonState } from '@/engine/types';
import { segmentSheetFromFile } from '@/app/sheetParser';
import { MANIKIN_SLOT_ORDER } from './ManikinConsole';

enum BuilderStep {
  UPLOAD = 'upload',
  ARRANGE = 'arrange',
  RIG = 'rig',
}

type RigJoint = {
  id: string;
  name: string;
  x: number;
  y: number;
};

type RigBone = {
  id: string;
  startJointId: string;
  endJointId: string;
};

type CutoutRigBuilderProps = {
  open: boolean;
  onClose: () => void;
  sheetPalette: SheetPalette;
  updateSheetPalette: (patch: Partial<SheetPalette>) => void;
  assignSegmentToSlot: (segment: SheetSegment, slotId?: string) => void;
  setStateWithHistory: (actionId: string, update: (prev: SkeletonState) => SkeletonState) => void;
  state: SkeletonState;
};

type SegmentDetailPanelProps = {
  segment: SheetSegment | null;
  label: string;
  onLabelChange: (value: string) => void;
  slotOptions: { id: string; label: string }[];
  targetSlotId: string | null;
  onTargetSlotChange: (slotId: string) => void;
  onAssign: (slotId: string | undefined) => void;
};

const SegmentDetailPanel: React.FC<SegmentDetailPanelProps> = ({
  segment,
  label,
  onLabelChange,
  slotOptions,
  targetSlotId,
  onTargetSlotChange,
  onAssign,
}) => {
  if (!segment) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5 text-[10px] text-white/50">
        Select a segment from the library to edit its label or assign it directly to a slot.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/40">
        <span>Piece console</span>
        <span className="text-[9px] text-white/40">#{segment.area}</span>
      </div>
      <div className="h-36 w-full rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center p-2">
        <img src={segment.thumbnail} alt="Selected segment" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-[0.4em] text-white/40">Label</label>
        <input
          type="text"
          value={label}
          onChange={(event) => onLabelChange(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#F27D26]"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-[0.4em] text-white/40">Assign to slot</label>
        <select
          value={targetSlotId ?? ''}
          onChange={(event) => onTargetSlotChange(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 focus:outline-none focus:border-[#F27D26]"
        >
          <option value="">— pick slot —</option>
          {slotOptions.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.label}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[9px] text-white/40">
        Dimensions: {segment.bounds.width}×{segment.bounds.height} px
      </div>
      <button
        type="button"
        onClick={() => onAssign(targetSlotId || undefined)}
        disabled={!targetSlotId}
        className="w-full rounded-full bg-[#F27D26] px-3 py-2 text-[10px] font-black uppercase tracking-[0.3em] text-black disabled:opacity-40"
      >
        Assign
      </button>
    </div>
  );
};

const RIG_STAGE_SIZE = 360;
const stepOrder = [BuilderStep.UPLOAD, BuilderStep.ARRANGE, BuilderStep.RIG];

export const CutoutRigBuilder: React.FC<CutoutRigBuilderProps> = ({
  open,
  onClose,
  sheetPalette,
  updateSheetPalette,
  assignSegmentToSlot,
  setStateWithHistory,
  state,
}) => {
  const [step, setStep] = useState<BuilderStep>(BuilderStep.UPLOAD);
  const [sheetPreview, setSheetPreview] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string>('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [segmentThreshold, setSegmentThreshold] = useState(160);
  const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null);
  const [rigJoints, setRigJoints] = useState<RigJoint[]>([]);
  const [rigBones, setRigBones] = useState<RigBone[]>([]);
  const [activeJointId, setActiveJointId] = useState<string | null>(null);
  const sheetInputRef = useRef<HTMLInputElement | null>(null);
  const [segmentBrightness, setSegmentBrightness] = useState<Record<string, number>>({});
  const [segmentLabels, setSegmentLabels] = useState<Record<string, string>>({});
  const [segmentFeather, setSegmentFeather] = useState(2);
  const [edgeTolerance, setEdgeTolerance] = useState(20);

  const selectedSegmentId = sheetPalette.selectedSegmentId;
  const selectedSegment = useMemo(
    () => sheetPalette.segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [sheetPalette.segments, selectedSegmentId],
  );

  const assignedSlots = useMemo(
    () => Object.entries(state.cutoutSlots).filter(([, slot]) => Boolean(slot.assetId)),
    [state.cutoutSlots],
  );

  const resetRig = useCallback(() => {
    setRigJoints([]);
    setRigBones([]);
    setActiveJointId(null);
  }, []);

  const handleSegmentLabelChange = useCallback((segmentId: string, value: string) => {
    setSegmentLabels((prev) => ({ ...prev, [segmentId]: value }));
  }, []);

  useEffect(() => {
    if (!selectedSegment) return;
    setSegmentLabels((prev) => {
      if (prev[selectedSegment.id]) return prev;
      return { ...prev, [selectedSegment.id]: `Piece ${selectedSegment.area}` };
    });
  }, [selectedSegment]);

  const getSegmentBackdropStyle = useCallback(
    (segmentId: string): React.CSSProperties => {
      const brightness = segmentBrightness[segmentId];
      const isDarkSegment = brightness == null || brightness < 140;
      return {
        backgroundColor: isDarkSegment ? 'rgba(255, 255, 255, 0.92)' : 'rgba(6, 6, 6, 0.9)',
        borderColor: isDarkSegment ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)',
        color: isDarkSegment ? '#080808' : '#f5f5f5',
      };
    },
    [segmentBrightness],
  );

  useEffect(() => {
    let isMounted = true;
    const missingSegments = sheetPalette.segments.filter((segment) => !(segment.id in segmentBrightness));
    if (missingSegments.length === 0) return;

    const estimateBrightness = (segment: SheetSegment): Promise<number> =>
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = segment.thumbnail;
        const sample = () => {
          const canvas = document.createElement('canvas');
          const size = 32;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(127);
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          let total = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            total += 0.299 * r + 0.587 * g + 0.114 * b;
          }
          resolve(total / (data.length / 4));
        };

        if (img.complete) {
          sample();
        } else {
          img.onload = sample;
          img.onerror = () => resolve(127);
        }
      });

    const hydrateBrightness = async () => {
      const updates: Record<string, number> = {};
      for (const segment of missingSegments) {
        const brightness = await estimateBrightness(segment);
        if (!isMounted) return;
        updates[segment.id] = brightness;
      }
      if (isMounted) {
        setSegmentBrightness((prev) => ({ ...prev, ...updates }));
      }
    };

    void hydrateBrightness();
    return () => {
      isMounted = false;
    };
  }, [segmentBrightness, sheetPalette.segments]);

  const handleSheetUpload = useCallback(
    async (file: File) => {
      setSheetError(null);
      setSheetLoading(true);
      try {
        const result = await segmentSheetFromFile(file, {
          threshold: segmentThreshold,
          featherRadius: segmentFeather,
          edgeTolerance,
        });
        setSheetPreview(result.src);
        setSheetName(result.name ?? file.name);
        updateSheetPalette({
          sheetId: result.name ?? file.name,
          name: result.name ?? file.name,
          dims: { width: result.width, height: result.height },
          segments: result.segments,
          selectedSegmentId: null,
          targetSlotId: null,
          previewSrc: result.src,
        });
        setStep(BuilderStep.ARRANGE);
      } catch (err) {
        setSheetError(err instanceof Error ? err.message : 'Failed to parse sheet.');
      } finally {
        setSheetLoading(false);
      }
    },
    [segmentThreshold, segmentFeather, edgeTolerance, updateSheetPalette],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      void handleSheetUpload(file);
      event.target.value = '';
    },
    [handleSheetUpload],
  );

  const handleSegmentClick = useCallback(
    (segment: SheetSegment) => {
      updateSheetPalette({ selectedSegmentId: segment.id });
    },
    [updateSheetPalette],
  );

  const handleSegmentDragStart = useCallback((segmentId: string, event: React.DragEvent<HTMLButtonElement>) => {
    event.dataTransfer?.setData('segment', segmentId);
    setDraggingSegmentId(segmentId);
    event.dataTransfer?.setDragImage(event.currentTarget, 20, 20);
  }, []);

  const handleSegmentDragEnd = useCallback(() => {
    setDraggingSegmentId(null);
  }, []);

  const handleSlotDrop = useCallback(
    (slotId: string) => (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const segmentId = event.dataTransfer?.getData('segment');
      if (!segmentId) return;
      const segment = sheetPalette.segments.find((s) => s.id === segmentId);
      if (!segment) return;
      assignSegmentToSlot(segment, slotId);
      updateSheetPalette({ selectedSegmentId: segmentId, targetSlotId: slotId });
    },
    [assignSegmentToSlot, sheetPalette.segments, updateSheetPalette],
  );

  const handleSlotDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleRigStageClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const scaleX = RIG_STAGE_SIZE / rect.width;
      const scaleY = RIG_STAGE_SIZE / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      const nextJoint: RigJoint = {
        id: `joint-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        name: `Joint ${rigJoints.length + 1}`,
        x,
        y,
      };
      setRigJoints((prev) => [...prev, nextJoint]);
      if (activeJointId) {
        setRigBones((prev) => [
          ...prev,
          { id: `bone-${nextJoint.id}`, startJointId: activeJointId, endJointId: nextJoint.id },
        ]);
      }
      setActiveJointId(nextJoint.id);
    },
    [activeJointId, rigJoints.length],
  );

  const buildRigidModel = useCallback(() => {
    setStateWithHistory('cutout_builder:build_rig', (prev) => ({
      ...prev,
      cutoutRig: {
        ...(prev.cutoutRig ?? { linkWaistToTorso: false, linkJointsToMasks: false }),
        linkJointsToMasks: true,
        linkWaistToTorso: true,
      },
      physicsRigidity: 0,
      rigidity: 'cardboard',
    }));
    onClose();
  }, [onClose, setStateWithHistory]);

  const currentIndex = stepOrder.indexOf(step);
  const canGoForward = useMemo(() => {
    if (step === BuilderStep.UPLOAD) return sheetPalette.segments.length > 0;
    if (step === BuilderStep.ARRANGE) return assignedSlots.length > 0;
    if (step === BuilderStep.RIG) return rigBones.length > 0;
    return true;
  }, [assignedSlots.length, rigBones.length, sheetPalette.segments.length, step]);

  const handleNext = useCallback(() => {
    if (step === BuilderStep.RIG) {
      onClose();
      return;
    }
    const next = stepOrder[Math.min(currentIndex + 1, stepOrder.length - 1)];
    setStep(next);
  }, [currentIndex, onClose, step]);

  const handlePrev = useCallback(() => {
    if (currentIndex <= 0) return;
    setStep(stepOrder[currentIndex - 1]);
  }, [currentIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70">
      <div className="relative w-full max-w-[1100px] max-h-[calc(100vh-48px)] overflow-hidden rounded-2xl border border-white/10 bg-[#040404] shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-[#666]">Cutout Rig Builder</div>
            <div className="text-2xl font-bold">Feed a sheet → assets → rigid bones</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full border border-white/10 text-white/80 hover:text-white hover:border-white/30"
            aria-label="Close cutout builder"
          >
            <X size={16} />
          </button>
        </header>

        <div className="flex flex-wrap gap-2 border-b border-white/5 px-6 py-3">
          {stepOrder.map((value, idx) => (
            <button
              key={value}
              type="button"
              onClick={() => setStep(value)}
              className={`px-4 py-2 text-[10px] uppercase tracking-[0.3em] rounded-full transition-all focus:outline-none ${
                step === value
                  ? 'bg-white text-black font-bold'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {`${String(idx + 1).padStart(2, '0')} ${value}`}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 overflow-y-auto">
          {step === BuilderStep.UPLOAD && (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-center">
                  <p className="text-sm text-white/60">
                    Upload a cutout sheet, then let the parser separate the silhouettes into assignable assets.
                  </p>
                  <button
                    type="button"
                    onClick={() => sheetInputRef.current?.click()}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-white text-black px-6 py-3 text-[10px] font-bold uppercase tracking-[0.4em]"
                  >
                    Select Sheet
                  </button>
                  <input
                    type="file"
                    ref={sheetInputRef}
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Threshold</label>
                  <input
                    type="range"
                    min={30}
                    max={230}
                    value={segmentThreshold}
                    onChange={(e) => setSegmentThreshold(Number(e.target.value))}
                    className="w-full accent-white"
                  />
                  <div className="text-[12px] text-white/60">{segmentThreshold}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Feather</label>
                  <input
                    type="range"
                    min={0}
                    max={6}
                    value={segmentFeather}
                    onChange={(e) => setSegmentFeather(Number(e.target.value))}
                    className="w-full accent-white"
                  />
                  <div className="text-[12px] text-white/60">{segmentFeather} px</div>
                  <p className="text-[8px] uppercase tracking-[0.3em] text-white/30">
                    Blur the mask edge to hide halos from anti-aliasing.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-[0.3em] text-white/60">Edge tolerance</label>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    value={edgeTolerance}
                    onChange={(e) => setEdgeTolerance(Number(e.target.value))}
                    className="w-full accent-white"
                  />
                  <div className="text-[12px] text-white/60">{edgeTolerance} lum</div>
                  <p className="text-[8px] uppercase tracking-[0.3em] text-white/30">
                    Allow slightly brighter border pixels when they touch the silhouette.
                  </p>
                </div>
                {sheetLoading && <div className="text-[12px] text-[#F27D26]">Parsing sheet...</div>}
                {sheetError && <div className="text-[12px] text-[#FF6B6B]">{sheetError}</div>}
              </div>
              <div className="rounded-2xl border border-white/10 p-4 bg-[#0f0f0f] min-h-[220px] flex flex-col gap-3">
                <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">Preview</div>
                {sheetPreview ? (
                  <img
                    src={sheetPreview}
                    alt="Sheet preview"
                    className="h-48 w-full rounded-xl object-contain border border-white/10"
                  />
                ) : (
                  <div className="flex-1 rounded-xl border border-dashed border-white/10 bg-white/5 text-[10px] uppercase tracking-[0.3em] text-white/30 flex items-center justify-center">
                    waiting for sheet
                  </div>
                )}
                {sheetName && <div className="text-[10px] text-white/60">{sheetName}</div>}
              </div>
            </div>
          )}

          {step === BuilderStep.ARRANGE && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/50">
                      <span>Slot map</span>
                      <span>Drop a segment onto a slot</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {MANIKIN_SLOT_ORDER.map((slotId) => {
                        const slot = state.cutoutSlots[slotId];
                        const asset = slot?.assetId ? state.assets[slot.assetId] : null;
                        return (
                          <div
                            key={slotId}
                            onDragOver={handleSlotDragOver}
                            onDrop={handleSlotDrop(slotId)}
                            className="min-h-[100px] relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">{slot.name}</div>
                            {asset?.image?.src ? (
                              <img
                                src={asset.image.src}
                                alt={asset.name}
                                className="h-14 w-full rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex-1 rounded-lg border border-dashed border-white/10" />
                            )}
                            <div className="text-[9px] text-white/60">Target joint: {slot.attachment.toJointId}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/50">
                      <span>All pieces</span>
                      <span className="text-[9px] text-white/40">{sheetPalette.segments.length} fragments</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-[360px] pr-2">
                      {sheetPalette.segments.map((segment) => {
                        const isSelected = segment.id === selectedSegmentId;
                        const label = segmentLabels[segment.id] ?? `Piece ${segment.area}`;
                        const backdropStyle = getSegmentBackdropStyle(segment.id);
                        return (
                          <button
                            key={segment.id}
                            type="button"
                            draggable
                            onDragStart={(event) => handleSegmentDragStart(segment.id, event)}
                            onDragEnd={handleSegmentDragEnd}
                            onClick={() => handleSegmentClick(segment)}
                            className={`group flex flex-col gap-2 rounded-2xl border px-2 py-2 text-left transition-all ${
                              isSelected ? 'border-white bg-white/10' : 'border-white/10 hover:border-white/40'
                            }`}
                          >
                            <div
                              className="h-24 w-full rounded-xl border border-transparent overflow-hidden flex items-center justify-center"
                              style={{
                                ...backdropStyle,
                                padding: '0.35rem',
                              }}
                            >
                              <img
                                src={segment.thumbnail}
                                aria-hidden
                                alt=""
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                            <div className="text-[9px] font-bold text-white/80 truncate">{label}</div>
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-white/40">
                              <span>Area {segment.area}</span>
                              <span>
                                {segment.bounds.width}×{segment.bounds.height}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">
                      Assigned slots: {assignedSlots.length}
                    </div>
                    <div className="space-y-2 pt-3">
                      <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">Segment names</div>
                      <div className="space-y-2 max-h-[120px] overflow-y-auto pr-1">
                        {sheetPalette.segments.map((segment) => {
                          const label = segmentLabels[segment.id] ?? `Piece ${segment.area}`;
                          const isActive = segment.id === selectedSegmentId;
                          return (
                            <button
                              key={`name-${segment.id}`}
                              type="button"
                              onClick={() => handleSegmentClick(segment)}
                              className={`flex items-center gap-2 w-full rounded-lg border px-2 py-1 text-left text-[9px] transition-all ${
                                isActive ? 'border-white bg-white/10' : 'border-white/10 hover:border-white/40'
                              }`}
                            >
                              <img
                                src={segment.thumbnail}
                                alt={label}
                                className="h-8 w-8 rounded border border-white/10 object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <span className="flex-1 truncate text-white/80">{label}</span>
                              <span className="text-[8px] uppercase tracking-[0.2em] text-white/40">
                                #{segment.id.slice(-4)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                <SegmentDetailPanel
                  segment={selectedSegment}
                  label={selectedSegment ? segmentLabels[selectedSegment.id] ?? `Piece ${selectedSegment.area}` : ''}
                  onLabelChange={(value) => selectedSegment && handleSegmentLabelChange(selectedSegment.id, value)}
                  slotOptions={MANIKIN_SLOT_ORDER.map((slotId) => ({
                    id: slotId,
                    label: state.cutoutSlots[slotId]?.name ?? slotId,
                  }))}
                  targetSlotId={sheetPalette.targetSlotId ?? null}
                  onTargetSlotChange={(slotId) => updateSheetPalette({ targetSlotId: slotId || null })}
                  onAssign={(slotId) => {
                    if (!selectedSegment) return;
                    assignSegmentToSlot(selectedSegment, slotId || undefined);
                    updateSheetPalette({ selectedSegmentId: selectedSegment.id, targetSlotId: slotId || null });
                  }}
                />
              </div>
            </div>
          )}
          {step === BuilderStep.RIG && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-white/50">
                <span>Joint rig</span>
                <button
                  type="button"
                  onClick={resetRig}
                  className="px-3 py-1 rounded-full border border-white/10 text-[9px] uppercase tracking-[0.3em]"
                >
                  Reset
                </button>
              </div>
              <div
                onClick={handleRigStageClick}
                className="relative mx-auto h-[320px] w-full max-w-2xl rounded-2xl border border-white/10 bg-white/5"
                style={{
                  minHeight: RIG_STAGE_SIZE,
                }}
              >
                <svg viewBox={`0 0 ${RIG_STAGE_SIZE} ${RIG_STAGE_SIZE}`} className="absolute inset-0 h-full w-full">
                  <line
                    x1={0}
                    y1={RIG_STAGE_SIZE / 2}
                    x2={RIG_STAGE_SIZE}
                    y2={RIG_STAGE_SIZE / 2}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={1}
                  />
                  <line
                    x1={RIG_STAGE_SIZE / 2}
                    y1={0}
                    x2={RIG_STAGE_SIZE / 2}
                    y2={RIG_STAGE_SIZE}
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth={1}
                  />
                  {rigBones.map((bone) => {
                    const from = rigJoints.find((joint) => joint.id === bone.startJointId);
                    const to = rigJoints.find((joint) => joint.id === bone.endJointId);
                    if (!from || !to) return null;
                    return (
                      <line
                        key={bone.id}
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="rgba(242,125,38,0.6)"
                        strokeWidth={3}
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {rigJoints.map((joint) => (
                    <circle
                      key={joint.id}
                      cx={joint.x}
                      cy={joint.y}
                      r={6}
                      fill={joint.id === activeJointId ? '#F27D26' : '#ffffff'}
                      stroke="#000"
                      strokeWidth={2}
                      onClick={(event) => {
                        event.stopPropagation();
                        setActiveJointId(joint.id);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                </svg>
              </div>
              <div className="grid grid-cols-2 gap-4 text-[10px] text-white/60">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">Joints</div>
                  <ul className="mt-2 space-y-1 text-[11px]">
                    {rigJoints.length === 0 && <li className="text-white/30">Click to add joints.</li>}
                    {rigJoints.map((joint) => (
                      <li key={joint.id} className={`flex items-center justify-between rounded-lg px-2 py-1 ${joint.id === activeJointId ? 'bg-white/10' : ''}`}>
                        <span>{joint.name}</span>
                        <span className="text-[9px] text-white/40">{joint.x.toFixed(0)}, {joint.y.toFixed(0)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.3em] text-white/40">Bones</div>
                  <ul className="mt-2 space-y-1 text-[11px]">
                    {rigBones.length === 0 && <li className="text-white/30">Bones appear as you connect joints.</li>}
    {rigBones.map((bone) => (
      <li key={bone.id} className="flex items-center justify-between rounded-lg px-2 py-1 bg-white/5">
        <span>
          {bone.startJointId.split('-')[0]} → {bone.endJointId.split('-')[0]}
        </span>
        <span className="text-[9px] text-white/40">{bone.id.slice(-4)}</span>
      </li>
    ))}
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={buildRigidModel}
                className="w-full rounded-2xl bg-[#F27D26] px-4 py-3 text-[11px] font-black uppercase tracking-[0.4em] text-black shadow-[0_0_30px_rgba(242,125,38,0.4)]"
              >
                Build Rigid Bone Model
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/5 px-6 py-4">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentIndex <= 0}
            className="rounded-full border border-white/20 px-4 py-2 text-[9px] uppercase tracking-[0.3em] text-white/60 disabled:opacity-30"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoForward}
            className="rounded-full bg-white px-6 py-2 text-[9px] font-bold uppercase tracking-[0.3em] text-black disabled:opacity-40"
          >
            {step === BuilderStep.RIG ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};
