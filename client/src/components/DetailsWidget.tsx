import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Upload, X } from 'lucide-react';

import type {
  ControlMode,
  CutoutAsset,
  CutoutSlot,
  JointMask,
  SkeletonState,
  SheetPalette,
  SheetSegment,
} from '@/engine/types';
import { canonicalConnKey } from '@/app/connectionKey';
import { CONNECTIONS, INITIAL_JOINTS } from '@/engine/model';
import { getWorldPosition, toAngleDeg } from '@/engine/kinematics';
import { processMaskImageFileToDataUrl } from '@/app/maskImageProcessing';
import { toggleJointDeactivation } from '@/engine/jointDeactivation';
import { clamp } from '@/utils';

import { DEFAULT_SHEETS } from '@/app/sheetLibrary';
import {
  segmentSheetFromDataUrl,
  segmentSheetFromFile,
  segmentSheetFromUrl,
} from '@/app/sheetParser';
import { ValueWheelControl } from '@/components/ValueWheelControl';

type DetailsTab = 'mask' | 'joint' | 'bone' | 'shape';
type MaskTargetType = 'piece' | 'joint' | 'head';

type MaskWheelParam = 'scale' | 'opacity' | 'stretchX' | 'stretchY' | 'skewX' | 'skewY' | 'anchorX' | 'anchorY' | 'volumePreserve';

type Props = {
  state: SkeletonState;
  setStateWithHistory: (actionId: string, update: (prev: SkeletonState) => SkeletonState) => void;

  selectedJointId: string | null;
  setSelectedJointId: (id: string | null) => void;
  selectedConnectionKey: string | null;
  setSelectedConnectionKey: (key: string | null) => void;

  maskJointId: string;
  setMaskJointId: (id: string) => void;

  setJointAngleDeg: (jointId: string, angleDeg: number) => void;

  currentControlMode: ControlMode;
  onControlModeChange: (mode: ControlMode) => void;

  uploadHeadMaskFile: (file: File) => Promise<void>;
  uploadJointMaskFile: (file: File, jointId: string) => Promise<void>;

  // Optional: force a stable piece order in FK mode.
  pieceOrder?: string[];
  selectedPieceId?: string;
  setSelectedPieceId?: (id: string) => void;

  // UI-only mask edit controls (for canvas transform interactions).
  maskEditArmed?: boolean;
  setMaskEditArmed?: (next: boolean) => void;
  maskDragMode?:
    | 'move'
    | 'widen'
    | 'expand'
    | 'shrink'
    | 'rotate'
    | 'scale'
    | 'stretch'
    | 'skew'
    | 'anchor';
  setMaskDragMode?: (next: NonNullable<Props['maskDragMode']>) => void;
  sheetPalette: SheetPalette;
  updateSheetPalette: (patch: Partial<SheetPalette>) => void;
  assignSegmentToSlot: (segment: SheetSegment, slotId?: string) => void;
};

const CONTROL_MODES: ControlMode[] = ['Cardboard', 'Rubberband', 'IK', 'JointDrag'];
const CONTROL_MODE_LABELS: Record<ControlMode, string> = {
  Cardboard: 'Rigid',
  Rubberband: 'Elastic',
  IK: 'Root',
  JointDrag: 'Direct',
};

const MASK_PARAM_LABELS: Record<MaskWheelParam, string> = {
  scale: 'Scale',
  opacity: 'Opacity',
  stretchX: 'StretchX',
  stretchY: 'StretchY',
  skewX: 'SkewX',
  skewY: 'SkewY',
  anchorX: 'AnchorX',
  anchorY: 'AnchorY',
  volumePreserve: 'Auto Size',
};

const SLIDER_STEPS = 1200;

type WheelMeta = {
  min: number;
  max: number;
  step: number;
  mode: 'linear' | 'log';
  fmt: (v: number) => string;
  disabled: boolean;
};

const valueToNormalized = (value: number, meta: WheelMeta) => {
  if (meta.max <= meta.min) return 0;
  const clamped = clamp(value, meta.min, meta.max);
  if (meta.mode === 'log') {
    const logMin = Math.log(meta.min);
    const logMax = Math.log(meta.max);
    if (!Number.isFinite(logMin) || !Number.isFinite(logMax) || logMax <= logMin) return 0;
    const logVal = Math.log(Math.max(clamped, meta.min));
    return (logVal - logMin) / (logMax - logMin);
  }
  return (clamped - meta.min) / (meta.max - meta.min);
};

const normalizedToValue = (normalized: number, meta: WheelMeta) => {
  const t = clamp(normalized, 0, 1);
  if (meta.mode === 'log') {
    const logMin = Math.log(meta.min);
    const logMax = Math.log(meta.max);
    if (!Number.isFinite(logMin) || !Number.isFinite(logMax) || logMax <= logMin) {
      return meta.min;
    }
    return Math.exp(logMin + (logMax - logMin) * t);
  }
  return meta.min + (meta.max - meta.min) * t;
};

const toDeg180 = (deg: number) => ((deg % 360) + 540) % 360 - 180;

export const DetailsWidget: React.FC<Props> = ({
  state,
  setStateWithHistory,
  selectedJointId,
  setSelectedJointId,
  selectedConnectionKey,
  setSelectedConnectionKey,
  maskJointId,
  setMaskJointId,
  setJointAngleDeg,
  currentControlMode,
  onControlModeChange,
  uploadHeadMaskFile,
  uploadJointMaskFile,
  pieceOrder,
  selectedPieceId,
  setSelectedPieceId,
  maskEditArmed,
  setMaskEditArmed,
  maskDragMode,
  setMaskDragMode,
  sheetPalette,
  updateSheetPalette,
  assignSegmentToSlot,
}) => {
  const [tab, setTab] = useState<DetailsTab>('mask');
  const [maskTargetType, setMaskTargetType] = useState<MaskTargetType>('piece');
  const [pieceIdInternal, setPieceIdInternal] = useState<string>(() => (pieceOrder?.[0] ?? Object.keys(state.cutoutSlots)[0] ?? ''));
  const [wheelParamByTarget, setWheelParamByTarget] = useState<Record<MaskTargetType, MaskWheelParam>>({
    piece: 'scale',
    joint: 'scale',
    head: 'scale',
  });

  const pieceInputRef = useRef<HTMLInputElement | null>(null);
  const jointInputRef = useRef<HTMLInputElement | null>(null);
  const headInputRef = useRef<HTMLInputElement | null>(null);
  const sheetFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const pieces = useMemo(() => {
    const ids = pieceOrder?.length ? pieceOrder : Object.keys(state.cutoutSlots);
    return ids
      .map((id) => state.cutoutSlots[id])
      .filter(Boolean)
      .map((slot) => ({
        id: slot.id,
        label: slot.name || slot.id,
        hasMask: Boolean(slot.assetId),
        slot,
      }));
  }, [pieceOrder, state.cutoutSlots]);

  const effectivePieceId = useMemo(() => {
    const raw = selectedPieceId ?? pieceIdInternal;
    if (raw && state.cutoutSlots[raw]) return raw;
    const fallback = pieces[0]?.id ?? '';
    return fallback;
  }, [pieceIdInternal, pieces, selectedPieceId, state.cutoutSlots]);

  const selectedPiece = effectivePieceId ? state.cutoutSlots[effectivePieceId] ?? null : null;

  const effectiveJointId = useMemo(() => {
    const id = selectedJointId && state.joints[selectedJointId] ? selectedJointId : null;
    if (id) return id;
    if (maskJointId && state.joints[maskJointId]) return maskJointId;
    return Object.keys(state.joints)[0] ?? null;
  }, [maskJointId, selectedJointId, state.joints]);

  const toggleSelectedJointLock = useCallback(() => {
    if (!effectiveJointId) return;
    setStateWithHistory(`details_joint_lock:${effectiveJointId}`, (prev) => toggleJointDeactivation(prev, effectiveJointId));
  }, [effectiveJointId, setStateWithHistory]);

  const setSelectionFromPiece = useCallback(
    (slot: CutoutSlot) => {
      const toId = slot.attachment.toJointId;
      const fromId = slot.attachment.fromJointId;
      setSelectedJointId(toId);
      setMaskJointId(toId);
      setSelectedConnectionKey(canonicalConnKey(fromId, toId));
    },
    [setMaskJointId, setSelectedConnectionKey, setSelectedJointId],
  );

  const setPiece = useCallback(
    (id: string) => {
      if (setSelectedPieceId) setSelectedPieceId(id);
      else setPieceIdInternal(id);
      const slot = state.cutoutSlots[id];
      if (slot) setSelectionFromPiece(slot);
      updateSheetPalette({ targetSlotId: id });
    },
    [setSelectedPieceId, setSelectionFromPiece, state.cutoutSlots, updateSheetPalette],
  );

  const setPaletteFromResult = useCallback(
    (
      result: { segments: SheetSegment[]; width: number; height: number },
      info: { id: string; name: string },
    ) => {
      updateSheetPalette({
        sheetId: info.id,
        name: info.name,
        dims: { width: result.width, height: result.height },
        segments: result.segments,
        selectedSegmentId: null,
      });
    },
    [updateSheetPalette],
  );

  const handleLoadDefaultSheet = useCallback(
    async (sheet: (typeof DEFAULT_SHEETS)[number]) => {
      setSheetLoading(true);
      setSheetError(null);
      try {
        const result = await segmentSheetFromUrl(sheet.src);
        setPaletteFromResult(result, { id: sheet.id, name: sheet.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load sheet';
        setSheetError(message);
      } finally {
        setSheetLoading(false);
      }
    },
    [setPaletteFromResult],
  );

  const handleSheetFileInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setSheetLoading(true);
      setSheetError(null);
      try {
        const result = await segmentSheetFromFile(file);
        setPaletteFromResult(result, { id: file.name, name: file.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to parse sheet file';
        setSheetError(message);
      } finally {
        setSheetLoading(false);
        if (event.target) event.target.value = '';
      }
    },
    [setPaletteFromResult],
  );

  const maskWheelParam = wheelParamByTarget[maskTargetType];
  const setMaskWheelParam = useCallback(
    (p: MaskWheelParam) =>
      setWheelParamByTarget((prev) => ({
        ...prev,
        [maskTargetType]: p,
      })),
    [maskTargetType],
  );

  const getPieceAsset = useCallback(
    (slot: CutoutSlot): CutoutAsset | null => {
      if (!slot.assetId) return null;
      const asset = state.assets[slot.assetId];
      if (!asset || asset.kind !== 'image') return null;
      return asset;
    },
    [state.assets],
  );

  const uploadMaskForSlot = useCallback(
    async (slotId: string, file: File) => {
      const slot = state.cutoutSlots[slotId];
      if (!slot) return;
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

      setStateWithHistory(`details_piece_mask_upload:${slotId}`, (prev) => {
        const existingSlot = prev.cutoutSlots[slotId];
        if (!existingSlot) return prev;

        const hadAsset = Boolean(existingSlot.assetId);
        let nextSlot: CutoutSlot = { ...existingSlot, assetId, visible: true };

        if (!hadAsset) {
          const fromPos = getWorldPosition(existingSlot.attachment.fromJointId, prev.joints, INITIAL_JOINTS);
          const toPos = getWorldPosition(existingSlot.attachment.toJointId, prev.joints, INITIAL_JOINTS);
          const boneLenPx = Math.max(1, Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y) * 20);

          const headLenPx = Math.max(1, 1.0 * 20);
          const w = Math.max(1, processed.width);
          const h = Math.max(1, processed.height);
          const aspect = h / w;
          const mode: CutoutSlot['mode'] = aspect >= 1.15 ? 'rubberhose' : 'cutout';

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
          cutoutSlots: { ...prev.cutoutSlots, [slotId]: nextSlot },
        };
      });
    },
    [setStateWithHistory, state.cutoutSlots],
  );

  const maskTarget = useMemo(() => {
    if (maskTargetType === 'piece') {
      const slot = selectedPiece;
      const asset = slot ? getPieceAsset(slot) : null;
      return {
        kind: 'piece' as const,
        id: slot?.id ?? '',
        label: slot?.name ?? slot?.id ?? '—',
        hasSrc: Boolean(asset?.image?.src),
        visible: Boolean(slot?.visible),
        previewSrc: asset?.image?.src ?? null,
      };
    }

    if (maskTargetType === 'head') {
      const m = state.scene.headMask;
      return {
        kind: 'head' as const,
        id: 'head',
        label: 'Head',
        hasSrc: Boolean(m?.src),
        visible: Boolean(m?.visible),
        previewSrc: m?.src ?? null,
      };
    }

    const m = state.scene.jointMasks[maskJointId];
    return {
      kind: 'joint' as const,
      id: maskJointId,
      label: maskJointId,
      hasSrc: Boolean(m?.src),
      visible: Boolean(m?.visible),
      previewSrc: m?.src ?? null,
    };
  }, [getPieceAsset, maskJointId, maskTargetType, selectedPiece, state.scene.headMask, state.scene.jointMasks]);

  const toggleJointsAboveMasks = useCallback(() => {
    setStateWithHistory('toggle_joints_over_masks', (prev) => ({ ...prev, jointsOverMasks: !prev.jointsOverMasks }));
  }, [setStateWithHistory]);

  const setMaskRotationDeg = useCallback(
    (deg: number) => {
      const v = toDeg180(deg);
      if (maskTargetType === 'piece' && selectedPiece) {
        setStateWithHistory(`details_piece_rotation:${selectedPiece.id}`, (prev) => {
          const slot = prev.cutoutSlots[selectedPiece.id];
          if (!slot) return prev;
          return { ...prev, cutoutSlots: { ...prev.cutoutSlots, [selectedPiece.id]: { ...slot, rotation: v } } };
        });
        return;
      }
      if (maskTargetType === 'head') {
        setStateWithHistory('details_head_mask_rotation', (prev) => ({
          ...prev,
          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), rotation: v } },
        }));
        return;
      }
      const jointId = maskJointId;
      setStateWithHistory(`details_joint_mask_rotation:${jointId}`, (prev) => {
        const base = prev.scene.jointMasks[jointId] ?? ({ src: null, visible: false } as any);
        return {
          ...prev,
          scene: {
            ...prev.scene,
            jointMasks: { ...prev.scene.jointMasks, [jointId]: { ...base, rotation: v, visible: true } },
          },
        };
      });
    },
    [maskJointId, maskTargetType, selectedPiece, setStateWithHistory],
  );

  const rotationDeg = useMemo(() => {
    if (maskTargetType === 'piece' && selectedPiece) return selectedPiece.rotation ?? 0;
    if (maskTargetType === 'head') return state.scene.headMask?.rotation ?? 0;
    return state.scene.jointMasks[maskJointId]?.rotation ?? 0;
  }, [maskJointId, maskTargetType, selectedPiece, state.scene.headMask, state.scene.jointMasks]);

  const setMaskParam = useCallback(
    (param: MaskWheelParam, next: number) => {
      const jointId = maskJointId;
      if (maskTargetType === 'piece' && selectedPiece) {
        setStateWithHistory(`details_piece_param:${selectedPiece.id}:${param}`, (prev) => {
          const slot = prev.cutoutSlots[selectedPiece.id];
          if (!slot) return prev;
          const updates: Partial<CutoutSlot> = {};
          if (param === 'scale' || param === 'stretchX') updates.scale = next;
          else if (param === 'opacity') updates.opacity = next;
          else if (param === 'stretchY') updates.lengthScale = next;
          else if (param === 'anchorX') updates.anchorX = next;
          else if (param === 'anchorY') updates.anchorY = next;
          else if (param === 'volumePreserve') updates.volumePreserve = Boolean(next);
          // Skew params not supported on CutoutSlot (disabled in UI).
          return { ...prev, cutoutSlots: { ...prev.cutoutSlots, [selectedPiece.id]: { ...slot, ...updates } } };
        });
        return;
      }

      if (maskTargetType === 'head') {
        setStateWithHistory(`details_head_mask_param:${param}`, (prev) => ({
          ...prev,
          scene: { ...prev.scene, headMask: { ...(prev.scene.headMask || {}), [param]: next } as any },
        }));
        return;
      }

      setStateWithHistory(`details_joint_mask_param:${jointId}:${param}`, (prev) => {
        const base = prev.scene.jointMasks[jointId] ?? ({ src: null, visible: false } as any);
        return {
          ...prev,
          scene: { ...prev.scene, jointMasks: { ...prev.scene.jointMasks, [jointId]: { ...base, [param]: next } } },
        };
      });
    },
    [maskJointId, maskTargetType, selectedPiece, setStateWithHistory],
  );

  const getMaskParamValue = useMemo(() => {
    const jointMask = state.scene.jointMasks[maskJointId];
    const headMask = state.scene.headMask;
    const piece = selectedPiece;

    return (param: MaskWheelParam): number => {
      if (maskTargetType === 'piece' && piece) {
        if (param === 'scale') return piece.scale ?? 1;
        if (param === 'opacity') return piece.opacity ?? 1;
        if (param === 'stretchX') return piece.scale ?? 1;
        if (param === 'stretchY') return piece.lengthScale ?? 1;
        if (param === 'anchorX') return piece.anchorX ?? 0.5;
        if (param === 'anchorY') return piece.anchorY ?? 0.5;
        if (param === 'volumePreserve') return piece.volumePreserve ? 1 : 0;
        if (param === 'skewX' || param === 'skewY') return 0;
        return 0;
      }

      const m = maskTargetType === 'head' ? (headMask as any) : (jointMask as any);
      const v = m?.[param];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (param === 'scale') return 1;
      if (param === 'opacity') return 1;
      if (param === 'stretchX') return 1;
      if (param === 'stretchY') return 1;
      if (param === 'anchorX') return 0.5;
      if (param === 'anchorY') return 0.5;
      if (param === 'volumePreserve') return 0;
      return 0;
    };
  }, [maskJointId, maskTargetType, selectedPiece, state.scene.headMask, state.scene.jointMasks]);

  const maskParamValue = getMaskParamValue(maskWheelParam);

  const baseParamMeta = useMemo<WheelMeta>(() => {
    const disabledSkew = maskTargetType === 'piece';
    const isSkew = maskWheelParam === 'skewX' || maskWheelParam === 'skewY';
    const disabled = disabledSkew && isSkew;

    const meta = (() => {
      switch (maskWheelParam) {
        case 'scale':
          return { min: 0.01, max: 20, step: 0.01, mode: 'log' as const, fmt: (v: number) => `${v.toFixed(2)}×` };
        case 'opacity':
          return { min: 0, max: 1, step: 0.01, mode: 'linear' as const, fmt: (v: number) => `${Math.round(v * 100)}%` };
        case 'stretchX':
          return { min: 0.1, max: 3, step: 0.01, mode: 'log' as const, fmt: (v: number) => `${v.toFixed(2)}×` };
        case 'stretchY':
          return { min: 0.1, max: 3, step: 0.01, mode: 'log' as const, fmt: (v: number) => `${v.toFixed(2)}×` };
        case 'skewX':
          return { min: -45, max: 45, step: 1, mode: 'linear' as const, fmt: (v: number) => `${Math.round(v)}°` };
        case 'skewY':
          return { min: -45, max: 45, step: 1, mode: 'linear' as const, fmt: (v: number) => `${Math.round(v)}°` };
        case 'anchorX':
          return { min: 0, max: 1, step: 0.01, mode: 'linear' as const, fmt: (v: number) => v.toFixed(2) };
        case 'anchorY':
          return { min: 0, max: 1, step: 0.01, mode: 'linear' as const, fmt: (v: number) => v.toFixed(2) };
        case 'volumePreserve':
          return { min: 0, max: 1, step: 1, mode: 'linear' as const, fmt: (v: number) => v ? 'ON' : 'OFF' };
        default:
          return { min: 0, max: 1, step: 0.01, mode: 'linear' as const, fmt: (v: number) => String(v) };
      }
    })();

    return { ...meta, disabled };
  }, [maskTargetType, maskWheelParam]);

  const [paramRangeOverrides, setParamRangeOverrides] = useState<Record<MaskWheelParam, { min?: number; max?: number }>>(
    {} as Record<MaskWheelParam, { min?: number; max?: number }>,
  );

  const activeParamMeta = useMemo<WheelMeta>(() => {
    const overrides = paramRangeOverrides[maskWheelParam];
    let min = typeof overrides?.min === 'number' && Number.isFinite(overrides.min) ? overrides.min : baseParamMeta.min;
    let max = typeof overrides?.max === 'number' && Number.isFinite(overrides.max) ? overrides.max : baseParamMeta.max;

    if (max <= min) {
      max = min + Math.max(baseParamMeta.step, 1e-4);
    }

    if (baseParamMeta.mode === 'log') {
      if (min <= 0) min = Math.max(baseParamMeta.step, 1e-4);
      if (max <= min) max = min * 2;
    }

    return { ...baseParamMeta, min, max };
  }, [baseParamMeta, maskWheelParam, paramRangeOverrides]);

  const [valueField, setValueField] = useState(() => String(maskParamValue));
  useEffect(() => {
    setValueField(String(maskParamValue));
  }, [maskParamValue]);

  const [rangeFieldStrings, setRangeFieldStrings] = useState<Record<MaskWheelParam, { min: string; max: string }>>(
    {} as Record<MaskWheelParam, { min: string; max: string }>,
  );

  useEffect(() => {
    setRangeFieldStrings((prev) => {
      const target = { min: String(activeParamMeta.min), max: String(activeParamMeta.max) };
      const current = prev[maskWheelParam];
      if (current?.min === target.min && current?.max === target.max) return prev;
      return { ...prev, [maskWheelParam]: target };
    });
  }, [maskWheelParam, activeParamMeta.max, activeParamMeta.min]);

  const handleValueFieldChange = useCallback((raw: string) => {
    setValueField(raw);
  }, []);

  const commitValueField = useCallback(() => {
    const parsed = Number(valueField);
    if (Number.isFinite(parsed)) {
      setMaskParam(maskWheelParam, parsed);
      return;
    }
    setValueField(String(maskParamValue));
  }, [maskParamValue, maskWheelParam, setMaskParam, valueField]);

  const handleRangeFieldChange = useCallback(
    (field: 'min' | 'max', raw: string) => {
      setRangeFieldStrings((prev) => {
        const entry = prev[maskWheelParam] ?? { min: '', max: '' };
        return { ...prev, [maskWheelParam]: { ...entry, [field]: raw } };
      });
    },
    [maskWheelParam],
  );

  const commitRangeField = useCallback(
    (field: 'min' | 'max') => {
      const raw = rangeFieldStrings[maskWheelParam]?.[field] ?? String(activeParamMeta[field]);
      const trimmed = raw.trim();
      const parsedValue = trimmed === '' ? undefined : Number(trimmed);
      setParamRangeOverrides((prev) => {
        const existing = prev[maskWheelParam] ?? {};
        const next = { ...existing };
        if (parsedValue === undefined || !Number.isFinite(parsedValue)) {
          delete next[field];
        } else {
          next[field] = parsedValue;
        }

        if (next.min === undefined && next.max === undefined) {
          const copy = { ...prev };
          delete copy[maskWheelParam];
          return copy;
        }
        return { ...prev, [maskWheelParam]: next };
      });
    },
    [activeParamMeta, maskWheelParam, rangeFieldStrings],
  );

  const setMaskOffset = useCallback(
    (axis: 'x' | 'y', next: number) => {
      const jointId = maskJointId;
      if (maskTargetType === 'piece' && selectedPiece) {
        setStateWithHistory(`details_piece_offset:${selectedPiece.id}:${axis}`, (prev) => {
          const slot = prev.cutoutSlots[selectedPiece.id];
          if (!slot) return prev;
          const updates = axis === 'x' ? { offsetX: next } : { offsetY: next };
          return { ...prev, cutoutSlots: { ...prev.cutoutSlots, [selectedPiece.id]: { ...slot, ...updates } } };
        });
        return;
      }

      if (maskTargetType === 'head') {
        setStateWithHistory(`details_head_mask_offset_${axis}`, (prev) => ({
          ...prev,
          scene: {
            ...prev.scene,
            headMask: { ...(prev.scene.headMask || {}), [axis === 'x' ? 'offsetX' : 'offsetY']: next },
          },
        }));
        return;
      }

      setStateWithHistory(`details_joint_mask_offset_${axis}:${jointId}`, (prev) => {
        const base = prev.scene.jointMasks[jointId] ?? ({ src: null, visible: false } as any);
        return {
          ...prev,
          scene: {
            ...prev.scene,
            jointMasks: {
              ...prev.scene.jointMasks,
              [jointId]: { ...base, [axis === 'x' ? 'offsetX' : 'offsetY']: next },
            },
          },
        };
      });
    },
    [maskJointId, maskTargetType, selectedPiece, setStateWithHistory],
  );

  const offset = useMemo(() => {
    if (maskTargetType === 'piece' && selectedPiece) return { x: selectedPiece.offsetX ?? 0, y: selectedPiece.offsetY ?? 0 };
    if (maskTargetType === 'head') return { x: state.scene.headMask?.offsetX ?? 0, y: state.scene.headMask?.offsetY ?? 0 };
    const m = state.scene.jointMasks[maskJointId];
    return { x: m?.offsetX ?? 0, y: m?.offsetY ?? 0 };
  }, [maskJointId, maskTargetType, selectedPiece, state.scene.headMask, state.scene.jointMasks]);

  const clearMask = useCallback(() => {
    if (maskTargetType === 'piece' && selectedPiece) {
      setStateWithHistory(`details_piece_mask_clear:${selectedPiece.id}`, (prev) => {
        const slot = prev.cutoutSlots[selectedPiece.id];
        if (!slot) return prev;
        return {
          ...prev,
          cutoutSlots: { ...prev.cutoutSlots, [selectedPiece.id]: { ...slot, assetId: null, visible: false } },
        };
      });
      return;
    }
    if (maskTargetType === 'head') {
      setStateWithHistory('details_head_mask_clear', (prev) => ({
        ...prev,
        scene: { ...prev.scene, headMask: { ...prev.scene.headMask, src: null, visible: false } },
      }));
      return;
    }
    const jointId = maskJointId;
    setStateWithHistory(`details_joint_mask_clear:${jointId}`, (prev) => {
      const base = prev.scene.jointMasks[jointId];
      if (!base) return prev;
      return {
        ...prev,
        scene: { ...prev.scene, jointMasks: { ...prev.scene.jointMasks, [jointId]: { ...base, src: null, visible: false } } },
      };
    });
  }, [maskJointId, maskTargetType, selectedPiece, setStateWithHistory]);

  const linkWaistToTorso = useMemo(() => Boolean(state.cutoutRig?.linkWaistToTorso), [state.cutoutRig]);
  const toggleLinkWaistToTorso = useCallback(() => {
    setStateWithHistory('cutout_rig:link_waist_to_torso', (prev) => {
      const next = !Boolean(prev.cutoutRig?.linkWaistToTorso);
      return {
        ...prev,
        cutoutRig: { ...(prev.cutoutRig ?? { linkWaistToTorso: false, linkJointsToMasks: false }), linkWaistToTorso: next },
      };
    });
  }, [setStateWithHistory]);

  const linkJointsToMasks = useMemo(() => Boolean(state.cutoutRig?.linkJointsToMasks), [state.cutoutRig]);
  const toggleLinkJointsToMasks = useCallback(() => {
    setStateWithHistory('cutout_rig:link_joints_to_masks', (prev) => {
      const next = !Boolean(prev.cutoutRig?.linkJointsToMasks);
      return {
        ...prev,
        cutoutRig: { ...(prev.cutoutRig ?? { linkWaistToTorso: false, linkJointsToMasks: false }), linkJointsToMasks: next },
      };
    });
  }, [setStateWithHistory]);

  const toggleMaskVisible = useCallback(() => {
    if (maskTargetType === 'piece' && selectedPiece) {
      setStateWithHistory(`details_piece_mask_visible:${selectedPiece.id}`, (prev) => {
        const slot = prev.cutoutSlots[selectedPiece.id];
        if (!slot) return prev;
        return { ...prev, cutoutSlots: { ...prev.cutoutSlots, [selectedPiece.id]: { ...slot, visible: !slot.visible } } };
      });
      return;
    }
    if (maskTargetType === 'head') {
      setStateWithHistory('details_head_mask_visible', (prev) => ({
        ...prev,
        scene: { ...prev.scene, headMask: { ...prev.scene.headMask, visible: !prev.scene.headMask.visible } },
      }));
      return;
    }
    const jointId = maskJointId;
    setStateWithHistory(`details_joint_mask_visible:${jointId}`, (prev) => {
      const base = prev.scene.jointMasks[jointId];
      if (!base) return prev;
      return {
        ...prev,
        scene: {
          ...prev.scene,
          jointMasks: { ...prev.scene.jointMasks, [jointId]: { ...base, visible: !base.visible } },
        },
      };
    });
  }, [maskJointId, maskTargetType, selectedPiece, setStateWithHistory]);

  const rigidIkAssist = useMemo(() => state.controlMode === 'IK' && state.stretchEnabled === false, [state.controlMode, state.stretchEnabled]);
  const toggleRigidIkAssist = useCallback(() => {
    setStateWithHistory('details_rigid_ik_assist', (prev) => {
      if (prev.controlMode === 'IK' && prev.stretchEnabled === false) {
        return { ...prev, stretchEnabled: true };
      }
      return { ...prev, controlMode: 'IK', stretchEnabled: false };
    });
  }, [setStateWithHistory]);

  const allConnKeys = useMemo(() => {
    // Prefer existing overrides/selection; otherwise enumerate from CONNECTIONS-ish implied structure: parent relations.
    const keys = new Set<string>();
    for (const slot of Object.values(state.cutoutSlots)) {
      keys.add(canonicalConnKey(slot.attachment.fromJointId, slot.attachment.toJointId));
    }
    for (const [id, j] of Object.entries(state.joints)) {
      if (!j?.parent) continue;
      keys.add(canonicalConnKey(j.parent, id));
    }
    return Array.from(keys).sort();
  }, [state.cutoutSlots, state.joints]);

  const setFkFollowDegForConn = useCallback(
    (connKey: string, followDeg: number) => {
      if (!Number.isFinite(followDeg) || Math.abs(followDeg) > 360) return;
      setStateWithHistory(`details_fk_follow_deg:${connKey}`, (prev) => {
        const existing = prev.connectionOverrides?.[connKey];
        const nextOverrides = { ...(prev.connectionOverrides ?? {}) } as any;
        const next = { ...(existing ?? {}) } as any;
        if (Math.abs(followDeg) < 1e-9) delete next.fkFollowDeg;
        else next.fkFollowDeg = followDeg;
        if ('fkMode' in next) delete next.fkMode;
        if (Object.keys(next).length === 0) delete nextOverrides[connKey];
        else nextOverrides[connKey] = next;
        return { ...prev, connectionOverrides: nextOverrides };
      });
    },
    [setStateWithHistory],
  );

  const setFkModeForConn = useCallback(
    (connKey: string, desired: 'stretch' | 'bend') => {
      setStateWithHistory(`details_fk_mode:${connKey}:${desired}`, (prev) => {
        const existing = prev.connectionOverrides?.[connKey];
        const currentFollowDeg = existing?.fkFollowDeg;
        const currentSign = typeof currentFollowDeg === 'number' && Number.isFinite(currentFollowDeg) ? Math.sign(currentFollowDeg) : 0;
        const desiredSign = desired === 'stretch' ? 1 : -1;
        const nextOverrides = { ...(prev.connectionOverrides ?? {}) } as any;
        const next = { ...(existing ?? {}) } as any;
        const nextFollowDeg = currentSign === desiredSign ? 0 : desiredSign * 1;
        if (nextFollowDeg === 0) delete next.fkFollowDeg;
        else next.fkFollowDeg = nextFollowDeg;
        if ('fkMode' in next) delete next.fkMode;
        if (Object.keys(next).length === 0) delete nextOverrides[connKey];
        else nextOverrides[connKey] = next;
        return { ...prev, connectionOverrides: nextOverrides };
      });
    },
    [setStateWithHistory],
  );

  const selectedFkFollowDeg = useMemo(() => {
    if (!selectedConnectionKey) return 0;
    const override = state.connectionOverrides?.[selectedConnectionKey];
    const raw = override?.fkFollowDeg;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    return override?.fkMode === 'stretch' ? 1 : override?.fkMode === 'bend' ? -1 : 0;
  }, [selectedConnectionKey, state.connectionOverrides]);

  const setConnOverrideField = useCallback(
    (connKey: string, field: string, value: unknown) => {
      setStateWithHistory(`details_conn_override:${connKey}:${field}`, (prev) => {
        const nextOverrides = { ...(prev.connectionOverrides ?? {}) } as any;
        const existing = (nextOverrides[connKey] ?? {}) as any;
        const next = { ...existing };
        if (value === undefined || value === null || value === '') {
          delete next[field];
        } else {
          next[field] = value;
        }
        if (Object.keys(next).length === 0) delete nextOverrides[connKey];
        else nextOverrides[connKey] = next;
        return { ...prev, connectionOverrides: nextOverrides };
      });
    },
    [setStateWithHistory],
  );

  const selectedConn = useMemo(() => {
    if (!selectedConnectionKey) return null;
    const [a, b] = selectedConnectionKey.split(':');
    return CONNECTIONS.find((c) => canonicalConnKey(c.from, c.to) === canonicalConnKey(a, b)) ?? null;
  }, [selectedConnectionKey]);

  return (
    <div className="space-y-3">
      <div className="flex bg-[#222] rounded-md p-0.5 gap-0.5">
        {(['mask', 'joint', 'bone', 'shape'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 px-2 rounded text-[10px] font-bold uppercase transition-all ${
              tab === t ? 'bg-white text-black' : 'text-[#666] hover:text-white hover:bg-[#333]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'mask' && (
        <div className="space-y-3">
          <div className="flex bg-[#111]/40 border border-white/10 rounded-lg p-1 gap-1">
            {(['piece', 'joint', 'head'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMaskTargetType(t)}
                className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                  maskTargetType === t ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-[#666]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {maskTargetType === 'piece' && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Piece</div>
              <select
                multiple={false}
                value={effectivePieceId}
                onChange={(e) => setPiece(e.target.value)}
                className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
              >
                {pieces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {maskTargetType === 'joint' && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Joint</div>
              <select
                multiple={false}
                value={maskJointId}
                onChange={(e) => {
                  const id = e.target.value;
                  setMaskJointId(id);
                  setSelectedJointId(id);
                }}
                className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
              >
                {Object.keys(state.joints).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Asset</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleMaskVisible}
                  className="p-1 rounded bg-[#222] hover:bg-[#333] text-white"
                  title={maskTarget.visible ? 'Hide' : 'Show'}
                  disabled={!maskTarget.hasSrc}
                >
                  {maskTarget.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button
                  type="button"
                  onClick={clearMask}
                  className="p-1 rounded bg-[#222] hover:bg-[#333] text-white"
                  title="Clear"
                  disabled={!maskTarget.hasSrc}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (maskTargetType === 'piece') pieceInputRef.current?.click();
                  else if (maskTargetType === 'joint') jointInputRef.current?.click();
                  else headInputRef.current?.click();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase transition-all"
              >
                <Upload size={12} />
                {maskTarget.hasSrc ? 'Replace' : 'Upload'}
              </button>
              <div className="text-[10px] font-mono text-[#444] tabular-nums shrink-0">{maskTarget.hasSrc ? 'SET' : '—'}</div>
            </div>

            <input
              ref={pieceInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!file || !selectedPiece) return;
                void uploadMaskForSlot(selectedPiece.id, file);
              }}
            />
            <input
              ref={jointInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!file) return;
                void uploadJointMaskFile(file, maskJointId);
              }}
            />
            <input
              ref={headInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = '';
                if (!file) return;
                void uploadHeadMaskFile(file);
              }}
            />
          </div>

          <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
            <span className="uppercase tracking-widest">Joints Above Masks</span>
            <input
              type="checkbox"
              checked={Boolean(state.jointsOverMasks)}
              onChange={toggleJointsAboveMasks}
              className="accent-white"
              title="Draw joints above masks"
            />
          </label>

          {maskTargetType === 'piece' && (
            <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
              <span className="uppercase tracking-widest">Link Waist+Torso</span>
              <input
                type="checkbox"
                checked={linkWaistToTorso}
                onChange={toggleLinkWaistToTorso}
                className="accent-white"
                title="When enabled, the waist piece reuses the torso's rotation around the navel seam."
              />
            </label>
          )}

          {maskTargetType === 'piece' && (
            <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
              <span className="uppercase tracking-widest">Link Joints→Masks</span>
              <input
                type="checkbox"
                checked={linkJointsToMasks}
                onChange={toggleLinkJointsToMasks}
                className="accent-white"
                title="When enabled, mask pieces stay rigid and joints follow their transform instead of deforming the mask."
              />
            </label>
          )}

          {typeof maskEditArmed === 'boolean' && setMaskEditArmed && (
            <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
              <span className="uppercase tracking-widest">Mask Edit</span>
              <input
                type="checkbox"
                checked={maskEditArmed}
                onChange={(e) => setMaskEditArmed(Boolean(e.target.checked))}
                className="accent-white"
                title="Enable on-canvas mask dragging"
              />
            </label>
          )}

          {maskEditArmed && maskDragMode && setMaskDragMode && (
            <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Drag Mode</div>
              <select
                value={maskDragMode}
                onChange={(e) => setMaskDragMode(e.target.value as any)}
                className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
              >
                {(['move', 'rotate', 'scale', 'stretch', 'skew', 'anchor', 'widen', 'expand', 'shrink'] as const).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">Transform</div>
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-2">
              <ValueWheelControl
                label={MASK_PARAM_LABELS[maskWheelParam]}
                value={maskParamValue}
                min={activeParamMeta.min}
                max={activeParamMeta.max}
                step={activeParamMeta.step}
                mode={activeParamMeta.mode}
                sensitivity={1}
                onChange={(v) => setMaskParam(maskWheelParam, v)}
                disabled={!maskTarget.hasSrc || activeParamMeta.disabled}
                formatValue={activeParamMeta.fmt}
              />
              <div className="text-[9px] text-[#555]">Shift = fine</div>
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap gap-1 justify-center max-w-[190px]">
                {(
                  [
                    'scale',
                    'opacity',
                    'stretchX',
                    'stretchY',
                    'skewX',
                    'skewY',
                    'anchorX',
                    'anchorY',
                    'volumePreserve',
                  ] as const
                ).map((p) => {
                  const isSkew = p === 'skewX' || p === 'skewY';
                  const disabled = maskTargetType === 'piece' && isSkew;
                  const active = maskWheelParam === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      disabled={disabled}
                      onClick={() => setMaskWheelParam(p)}
                      className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${
                        disabled
                          ? 'bg-[#181818] text-[#444] cursor-not-allowed'
                          : active
                            ? 'bg-white text-black'
                            : 'bg-[#222] hover:bg-[#333] text-[#666]'
                      }`}
                      title={disabled ? 'Not supported on Piece masks yet' : MASK_PARAM_LABELS[p]}
                    >
                      {MASK_PARAM_LABELS[p]}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3 rounded-xl border border-white/10 bg-[#111]/40 p-3">
                <input
                  type="range"
                  min={0}
                  max={SLIDER_STEPS}
                  step={1}
                  value={Math.round(valueToNormalized(maskParamValue, activeParamMeta) * SLIDER_STEPS)}
                  onChange={(e) => {
                    const normalized = Number(e.target.value) / SLIDER_STEPS;
                    const next = normalizedToValue(normalized, activeParamMeta);
                    setMaskParam(maskWheelParam, next);
                  }}
                  className="w-full h-2 cursor-pointer appearance-none rounded-full bg-[#333] accent-white disabled:opacity-40"
                  disabled={!maskTarget.hasSrc || activeParamMeta.disabled}
                  aria-label={`${MASK_PARAM_LABELS[maskWheelParam]} slider`}
                />
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-widest text-[#999]">
                  <label className="flex flex-col min-w-[80px] text-[9px] uppercase tracking-normal text-[#bbb]">
                    Value
                    <input
                      type="number"
                      value={valueField}
                      onChange={(e) => handleValueFieldChange(e.target.value)}
                      onBlur={commitValueField}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitValueField();
                          e.currentTarget.blur();
                        }
                      }}
                      disabled={!maskTarget.hasSrc || activeParamMeta.disabled}
                      className="h-9 rounded bg-[#222] px-2 text-[11px] font-mono text-white outline-none transition focus:border focus:border-white/30 disabled:cursor-not-allowed"
                      step={activeParamMeta.step}
                    />
                  </label>
                  <label className="flex flex-col min-w-[80px] text-[9px] uppercase tracking-normal text-[#bbb]">
                    Min
                    <input
                      type="number"
                      value={rangeFieldStrings[maskWheelParam]?.min ?? String(activeParamMeta.min)}
                      onChange={(e) => handleRangeFieldChange('min', e.target.value)}
                      onBlur={() => commitRangeField('min')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitRangeField('min');
                          e.currentTarget.blur();
                        }
                      }}
                      disabled={!maskTarget.hasSrc || activeParamMeta.disabled}
                      className="h-9 rounded bg-[#222] px-2 text-[11px] font-mono text-white outline-none transition focus:border focus:border-white/30 disabled:cursor-not-allowed"
                      step={0.01}
                    />
                  </label>
                  <label className="flex flex-col min-w-[80px] text-[9px] uppercase tracking-normal text-[#bbb]">
                    Max
                    <input
                      type="number"
                      value={rangeFieldStrings[maskWheelParam]?.max ?? String(activeParamMeta.max)}
                      onChange={(e) => handleRangeFieldChange('max', e.target.value)}
                      onBlur={() => commitRangeField('max')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitRangeField('max');
                          e.currentTarget.blur();
                        }
                      }}
                      disabled={!maskTarget.hasSrc || activeParamMeta.disabled}
                      className="h-9 rounded bg-[#222] px-2 text-[11px] font-mono text-white outline-none transition focus:border focus:border-white/30 disabled:cursor-not-allowed"
                      step={0.01}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">Position</div>
            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y'] as const).map((axis) => (
                <div key={axis} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-[#666]">
                    <span>{axis.toUpperCase()}</span>
                    <span className="font-mono text-[#555]">{Math.round(axis === 'x' ? offset.x : offset.y)}px</span>
                  </div>
                  <input
                    type="number"
                    value={axis === 'x' ? offset.x : offset.y}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setMaskOffset(axis, v);
                    }}
                    className="w-full px-2 py-1 bg-[#222] rounded text-[10px] font-mono"
                    disabled={!maskTarget.hasSrc}
                  />
                  <div className="grid grid-cols-4 gap-1">
                    {([-10, -1, 1, 10] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        disabled={!maskTarget.hasSrc}
                        onClick={() => setMaskOffset(axis, (axis === 'x' ? offset.x : offset.y) + d)}
                        className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white disabled:opacity-40"
                        title={`Nudge ${d}px`}
                      >
                        {d > 0 ? `+${d}` : `${d}`}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'joint' && (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Joint</div>
            <select
              multiple={false}
              value={effectiveJointId ?? ''}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedJointId(id);
                setMaskJointId(id);
              }}
              className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
            >
              {Object.keys(state.joints).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>

          <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">Transform</div>
            {(() => {
              const jid = effectiveJointId;
              const j = jid ? state.joints[jid] : null;
              const currentAngle = j ? toDeg180(toAngleDeg(j.previewOffset)) : 0;
              return (
                <>
            <ValueWheelControl
              label="Angle"
              value={currentAngle}
              min={-180}
              max={180}
              step={1}
              mode="linear"
              sensitivity={1}
              onChange={(v) => {
                if (!effectiveJointId) return;
                setJointAngleDeg(effectiveJointId, v);
              }}
              disabled={!effectiveJointId}
              formatValue={(v) => `${Math.round(v)}°`}
            />
            <div className="mt-2 grid grid-cols-4 gap-1">
              {([-10, -1, 1, 10] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={!effectiveJointId}
                  onClick={() => {
                    if (!effectiveJointId) return;
                    const next = toDeg180(currentAngle + d);
                    setJointAngleDeg(effectiveJointId, next);
                  }}
                  className="py-1 rounded bg-[#222] hover:bg-[#333] text-[10px] font-mono font-bold text-white disabled:opacity-40"
                  title={`Nudge ${d}°`}
                >
                  {d > 0 ? `+${d}` : `${d}`}°
                </button>
              ))}
            </div>
                </>
              );
            })()}
          </div>

          <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Mode</div>
            <div className="grid grid-cols-2 gap-1">
              {CONTROL_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onControlModeChange(mode)}
                  className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                    currentControlMode === mode ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-[#666]'
                  }`}
                >
                  {CONTROL_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
              <span className="uppercase tracking-widest">Rigid IK Assist</span>
              <input
                type="checkbox"
                checked={rigidIkAssist}
                onChange={toggleRigidIkAssist}
                className="accent-white"
                title="Preset: IK mode + stretch disabled (no new solver)"
              />
            </label>
            <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
              <span className="uppercase tracking-widest">Joint Lock</span>
              <input
                type="checkbox"
                checked={Boolean(effectiveJointId && state.deactivatedJoints.has(effectiveJointId))}
                onChange={toggleSelectedJointLock}
                className="accent-white"
                title="Keep this joint perfectly straight (deactivated)"
              />
            </label>
          </div>
        </div>
      )}

      {(tab === 'bone' || tab === 'shape') && (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Bone (Connection)</div>
            <select
              multiple={false}
              value={selectedConnectionKey ?? ''}
              onChange={(e) => {
                const key = e.target.value;
                setSelectedConnectionKey(key || null);
              }}
              className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
            >
              <option value="">None</option>
              {allConnKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {!selectedConnectionKey ? (
            <div className="text-[10px] text-[#444]">Select a bone/connection.</div>
          ) : tab === 'bone' ? (
            <div className="space-y-3">
              <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Stretch</div>
                <div className="grid grid-cols-4 gap-1">
                  {(
                    [
                      { id: 'auto' as const, label: 'Auto' },
                      { id: 'rigid' as const, label: 'Rigid' },
                      { id: 'elastic' as const, label: 'Elastic' },
                      { id: 'stretch' as const, label: 'Stretch' },
                    ] as const
                  ).map((m) => {
                    const override = (state.connectionOverrides as any)?.[selectedConnectionKey]?.stretchMode as
                      | 'rigid'
                      | 'elastic'
                      | 'stretch'
                      | undefined;
                    const active = (m.id === 'auto' && override == null) || override === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setConnOverrideField(
                            selectedConnectionKey,
                            'stretchMode',
                            m.id === 'auto' ? undefined : (m.id as any),
                          )
                        }
                        className={`px-2 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                          active ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-[#666]'
                        }`}
                        title={
                          m.id === 'auto'
                            ? `Use model default (${selectedConn?.stretchMode ?? 'rigid'})`
                            : `Override: ${m.id}`
                        }
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-2">FK Link</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] text-[#bbb] uppercase tracking-widest">Mode</div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFkModeForConn(selectedConnectionKey, 'stretch')}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        Math.sign(selectedFkFollowDeg) > 0 ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                      }`}
                      title="Stretch (follow parent +deg)"
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={() => setFkModeForConn(selectedConnectionKey, 'bend')}
                      className={`px-2 py-1 rounded text-[10px] font-bold ${
                        Math.sign(selectedFkFollowDeg) < 0 ? 'bg-white text-black' : 'bg-[#222] hover:bg-[#333] text-white'
                      }`}
                      title="Bend (follow parent -deg)"
                    >
                      B
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] text-[#bbb] uppercase tracking-widest">Follow (deg)</div>
                  <input
                    type="number"
                    value={selectedFkFollowDeg}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      setFkFollowDegForConn(selectedConnectionKey, clamp(v, -360, 360));
                    }}
                    className="w-24 px-2 py-1 rounded bg-[#111] border border-white/10 text-[10px] font-mono text-white"
                  />
                </div>
              </div>

              <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Render</div>
                <label className="text-[10px] text-[#bbb] flex items-center justify-between gap-2">
                  <span className="uppercase tracking-widest">Hide</span>
                  <input
                    type="checkbox"
                    checked={Boolean((state.connectionOverrides as any)?.[selectedConnectionKey]?.hide)}
                    onChange={(e) => setConnOverrideField(selectedConnectionKey, 'hide', e.target.checked ? true : undefined)}
                    className="accent-white"
                  />
                </label>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#666]">Merge To</span>
                    <span className="text-[#555] font-mono">
                      {(state.connectionOverrides as any)?.[selectedConnectionKey]?.mergeToJointId ?? '—'}
                    </span>
                  </div>
                  <select
                    multiple={false}
                    value={(state.connectionOverrides as any)?.[selectedConnectionKey]?.mergeToJointId ?? ''}
                    onChange={(e) => {
                      const next = e.target.value.trim();
                      setConnOverrideField(selectedConnectionKey, 'mergeToJointId', next || undefined);
                    }}
                    className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
                  >
                    <option value="">None</option>
                    {Object.keys(state.joints).map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <div className="text-[10px] text-[#444] italic">
                    Render-only: draws this bone to the chosen joint (use with Hide on intermediate bones).
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-2 rounded-lg bg-[#111]/40 border border-white/10 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Shape</div>
                <select
                  multiple={false}
                  value={(state.connectionOverrides as any)?.[selectedConnectionKey]?.shape ?? 'auto'}
                  onChange={(e) => {
                    const nextShape = e.target.value;
                    setConnOverrideField(selectedConnectionKey, 'shape', nextShape === 'auto' ? undefined : nextShape);
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

                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] text-[#bbb] uppercase tracking-widest">Size</div>
                  <input
                    type="number"
                    step={0.05}
                    value={(state.connectionOverrides as any)?.[selectedConnectionKey]?.shapeScale ?? 1}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      const next = clamp(v, 0.25, 4);
                      setConnOverrideField(selectedConnectionKey, 'shapeScale', Math.abs(next - 1) < 1e-9 ? undefined : next);
                    }}
                    className="w-24 px-2 py-1 rounded bg-[#111] border border-white/10 text-[10px] font-mono text-white"
                    title="Render size multiplier"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-3 rounded-xl bg-[#111]/40 border border-white/10 space-y-3 text-[10px]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-[#777]">Sheet Palette</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void sheetFileInputRef.current?.click()}
              className="px-2 py-1 rounded-full border border-white/10 text-[9px] uppercase tracking-[0.2em]"
            >
              Import Sheet
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_SHEETS.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              onClick={() => void handleLoadDefaultSheet(sheet)}
              className="px-2 py-1 rounded-full border border-white/10 text-[9px] uppercase tracking-[0.2em]"
            >
              {sheet.name}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between text-[9px] text-[#666] uppercase tracking-[0.2em]">
          <span>{sheetPalette.name || 'No sheet loaded'}</span>
          <span>{sheetPalette.dims ? `${sheetPalette.dims.width}×${sheetPalette.dims.height}` : '—'}</span>
        </div>
        {sheetLoading ? (
          <div className="text-[9px] text-[#999]">Parsing sheet...</div>
        ) : sheetError ? (
          <div className="text-[9px] text-[#f88]">{sheetError}</div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto">
          {sheetPalette.segments.map((segment) => {
            const selected = sheetPalette.selectedSegmentId === segment.id;
            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => updateSheetPalette({ selectedSegmentId: segment.id })}
                className={`flex flex-col gap-2 p-2 rounded-lg border text-left bg-[#111] ${
                  selected ? 'border-white/70' : 'border-white/10'
                }`}
              >
                <img
                  src={segment.thumbnail}
                  alt={`Segment ${segment.id}`}
                  className="w-full h-20 object-cover rounded"
                />
                <div className="flex items-center justify-between text-[8px] text-[#777] uppercase tracking-[0.2em]">
                  <span>Area {segment.area}</span>
                  <span>{segment.bounds.width}×{segment.bounds.height}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      assignSegmentToSlot(segment, effectivePieceId);
                    }}
                    className="flex-1 py-1 rounded bg-[#222] text-[8px] font-bold uppercase tracking-widest"
                  >
                    Assign to {effectivePieceId ? 'piece' : 'slot'}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      assignSegmentToSlot(segment);
                    }}
                    className="flex-1 py-1 rounded border border-white/10 text-[8px] font-bold uppercase tracking-widest"
                  >
                    Auto
                  </button>
                </div>
              </button>
            );
          })}
        </div>
        {sheetPalette.segments.length === 0 && (
          <div className="text-[9px] text-[#555] uppercase tracking-[0.2em]">Load a sheet to extract silhouettes</div>
        )}
        <input
          ref={sheetFileInputRef}
          type="file"
          accept="image/*,.svg"
          className="hidden"
          onChange={handleSheetFileInput}
        />
        <div className="text-[9px] text-[#444] uppercase tracking-[0.3em]">
          Target slot: {sheetPalette.targetSlotId ?? 'None'}
        </div>
      </div>
    </div>
  );
};
