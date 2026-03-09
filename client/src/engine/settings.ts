import { LOOK_MODE_ID_SET, type LookModeId } from './lookModes';
import { INITIAL_JOINTS } from './model';
import { createDefaultCutoutSlots } from './cutouts';
import { computeFootTouchdownYWorld, computeGroundPivotWorld, computeTouchdownYWorld } from './rooting';
import type { ControlMode, Joint, JointMask, Point, SkeletonState, ReferenceLayer, HeadMask, TextOverlay, CutoutAsset, CutoutSlot, ViewPreset, ArmViewMode, SheetPalette, SheetSegment } from './types';
import { DEFAULT_BALANCED_NECK_CONFIG, type BalancedNeckConfig } from './balancedNeck';
import {
  DEFAULT_PROCEDURAL_BITRUVIAN_GAIT,
  DEFAULT_PROCEDURAL_BITRUVIAN_IDLE,
  DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS,
  type IdleSettings,
  type PhysicsControls,
  type WalkingEngineGait,
} from './bitruvian/types';
import type { TransitionIssue, TransitionResult } from '@/lib/transitionIssues';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isFiniteVector = (value: unknown): value is Point =>
  !!(value && typeof value === 'object' && 
  typeof (value as any).x === 'number' && Number.isFinite((value as any).x) &&
  typeof (value as any).y === 'number' && Number.isFinite((value as any).y));

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const ALLOWED_SHAPES = new Set([
  'bone',
  'cylinder',
  'diamond',
  'muscle',
  'tapered',
  'trapezoid_inverted',
  'wire',
  'tendon',
  'wireframe',
]);

const CONTROL_MODE_SET = new Set<ControlMode>(['Cardboard', 'Rubberband', 'IK', 'JointDrag']);

const MASK_BLEND_MODE_SET = new Set([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

const safeNumber = (value: unknown, fallback = 0) => (isFiniteNumber(value) ? value : fallback);

const safePoint = (value: unknown, fallback: Point): Point => {
  if (!value || typeof value !== 'object') return { ...fallback };
  const v = value as { x?: unknown; y?: unknown };
  return { x: safeNumber(v.x, fallback.x), y: safeNumber(v.y, fallback.y) };
};

const safePointClamped = (
  value: unknown,
  fallback: Point,
  range: { min: number; max: number },
): Point => {
  const p = safePoint(value, fallback);
  return {
    x: clamp(p.x, range.min, range.max),
    y: clamp(p.y, range.min, range.max),
  };
};

const PROCGEN_GAIT_RANGE: Record<keyof WalkingEngineGait, { min: number; max: number }> = {
  stride: { min: 0, max: 2 },
  intensity: { min: 0, max: 2 },
  gravity: { min: 0, max: 1 },
  hover_height: { min: 0, max: 1 },
  hip_sway: { min: 0, max: 1.5 },
  waist_twist: { min: 0, max: 1.5 },
  torso_swivel: { min: 0, max: 1.5 },
  arm_swing: { min: 0, max: 2 },
  arm_spread: { min: 0, max: 1 },
  elbow_bend: { min: 0, max: 1.5 },
  elbowFlexibility: { min: 0, max: 1 },
  foot_roll: { min: 0, max: 1 },
  kick_up_force: { min: 0, max: 1 },
  head_spin: { min: -1, max: 1 },
  lean: { min: -1, max: 1 },
};

const sanitizeRelatedJoints = (value: unknown, fallback: string[]): string[] => {
  if (!Array.isArray(value)) return fallback;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id) continue;
    if (!(id in INITIAL_JOINTS)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 12) break;
  }
  return out;
};

const sanitizeJointMask = (raw: unknown, base: JointMask): JointMask => {
  if (!raw || typeof raw !== 'object') return base;
  const mask = raw as Partial<JointMask>;
  const mode = mask.mode === 'cutout' || mask.mode === 'rubberhose' || mask.mode === 'roto' ? mask.mode : base.mode;
  const src = typeof mask.src === 'string' ? mask.src : base.src;
  const blendMode =
    typeof (mask as any).blendMode === 'string' && MASK_BLEND_MODE_SET.has((mask as any).blendMode)
      ? ((mask as any).blendMode as any)
      : base.blendMode;
  return {
    src,
    visible: typeof mask.visible === 'boolean' ? mask.visible : Boolean(src),
    opacity: isFiniteNumber(mask.opacity) ? clamp(mask.opacity, 0, 1) : base.opacity,
    scale: isFiniteNumber(mask.scale) ? clamp(mask.scale, 0.01, 80) : base.scale,
    offsetX: isFiniteNumber(mask.offsetX) ? clamp(mask.offsetX, -5000, 5000) : base.offsetX,
    offsetY: isFiniteNumber(mask.offsetY) ? clamp(mask.offsetY, -5000, 5000) : base.offsetY,
    rotation: isFiniteNumber(mask.rotation) ? clamp(mask.rotation, -360, 360) : base.rotation,
    anchorX: isFiniteNumber(mask.anchorX) ? clamp(mask.anchorX, 0, 1) : base.anchorX,
    anchorY: isFiniteNumber(mask.anchorY) ? clamp(mask.anchorY, 0, 1) : base.anchorY,
    mode,
    lengthScale: isFiniteNumber(mask.lengthScale) ? clamp(mask.lengthScale, 0.05, 10) : base.lengthScale,
    volumePreserve: typeof mask.volumePreserve === 'boolean' ? mask.volumePreserve : base.volumePreserve,
    stretchX: isFiniteNumber(mask.stretchX) ? clamp(mask.stretchX, 0.1, 10) : base.stretchX,
    stretchY: isFiniteNumber(mask.stretchY) ? clamp(mask.stretchY, 0.1, 10) : base.stretchY,
    skewX: isFiniteNumber(mask.skewX) ? clamp(mask.skewX, -45, 45) : base.skewX,
    skewY: isFiniteNumber(mask.skewY) ? clamp(mask.skewY, -45, 45) : base.skewY,
    blendMode,
    blurPx: isFiniteNumber((mask as any).blurPx) ? clamp((mask as any).blurPx, 0, 60) : base.blurPx,
    brightness: isFiniteNumber((mask as any).brightness) ? clamp((mask as any).brightness, 0, 3) : base.brightness,
    contrast: isFiniteNumber((mask as any).contrast) ? clamp((mask as any).contrast, 0, 3) : base.contrast,
    saturation: isFiniteNumber((mask as any).saturation) ? clamp((mask as any).saturation, 0, 5) : base.saturation,
    hueRotate: isFiniteNumber((mask as any).hueRotate) ? clamp((mask as any).hueRotate, -360, 360) : base.hueRotate,
    grayscale: isFiniteNumber((mask as any).grayscale) ? clamp((mask as any).grayscale, 0, 1) : base.grayscale,
    sepia: isFiniteNumber((mask as any).sepia) ? clamp((mask as any).sepia, 0, 1) : base.sepia,
    invert: isFiniteNumber((mask as any).invert) ? clamp((mask as any).invert, 0, 1) : base.invert,
    pixelate: isFiniteNumber((mask as any).pixelate) ? clamp((mask as any).pixelate, 0, 64) : base.pixelate,
    relatedJoints: sanitizeRelatedJoints(mask.relatedJoints, base.relatedJoints),
  };
};

const makeDefaultJointMasks = (): Record<string, JointMask> => {
  const out: Record<string, JointMask> = {};
  for (const id of Object.keys(INITIAL_JOINTS)) {
    out[id] = { 
      src: null, 
      visible: false, 
      opacity: 1.0, 
      scale: 0.25, 
      offsetX: 0, 
      offsetY: 0, 
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      mode: 'cutout',
      lengthScale: 1.0,
      volumePreserve: false,
      stretchX: 1.0,
      stretchY: 1.0,
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
    };
  }
  return out;
};

const sanitizeReferenceLayer = (raw: unknown, base: ReferenceLayer): ReferenceLayer => {
  if (!raw || typeof raw !== 'object') return base;
  const layer = raw as Partial<ReferenceLayer>;
  const fitMode = layer.fitMode === 'contain' || layer.fitMode === 'cover' || 
                  layer.fitMode === 'fill' || layer.fitMode === 'none' 
                  ? layer.fitMode : base.fitMode;
  const mediaType = layer.mediaType === 'video' || layer.mediaType === 'image' || layer.mediaType === 'sequence' ? layer.mediaType : base.mediaType;

  const rawSeq = (layer as any).sequence;
  const sequence =
    rawSeq && typeof rawSeq === 'object'
      ? {
          id: typeof rawSeq.id === 'string' ? rawSeq.id : '',
          kind: rawSeq.kind === 'gif' || rawSeq.kind === 'zip' ? rawSeq.kind : 'zip',
          frameCount: isFiniteNumber(rawSeq.frameCount) ? clamp(Math.floor(rawSeq.frameCount), 0, 200_000) : 0,
          fps: isFiniteNumber(rawSeq.fps) ? clamp(Math.floor(rawSeq.fps), 1, 60) : 24,
        }
      : null;
  
  return {
    src: typeof layer.src === 'string' ? layer.src : base.src,
    visible: typeof layer.visible === 'boolean' ? layer.visible : base.visible,
    opacity: isFiniteNumber(layer.opacity) ? clamp(layer.opacity, 0, 1) : base.opacity,
    x: safeNumber(layer.x, base.x),
    y: safeNumber(layer.y, base.y),
    scale: isFiniteNumber(layer.scale) ? clamp(layer.scale, 0.01, 20) : base.scale,
    rotation: isFiniteNumber(layer.rotation) ? layer.rotation : base.rotation,
    fitMode,
    mediaType,
    videoStart: isFiniteNumber(layer.videoStart) ? clamp(layer.videoStart, 0, 60 * 60) : base.videoStart,
    videoRate: isFiniteNumber(layer.videoRate) ? clamp(layer.videoRate, 0.05, 4) : base.videoRate,
    sequence: sequence && sequence.id && sequence.frameCount > 0 ? sequence : null,
  };
};

const sanitizeTextOverlays = (raw: unknown, frameCount: number): TextOverlay[] => {
  if (!Array.isArray(raw)) return [];
  const out: TextOverlay[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const o = item as Partial<TextOverlay> & Record<string, unknown>;
    const kind = o.kind === 'intertitle' || o.kind === 'title' ? o.kind : 'title';
    const align = o.align === 'left' || o.align === 'right' || o.align === 'center' ? o.align : 'center';
    const startFrame = isFiniteNumber(o.startFrame) ? clamp(Math.floor(o.startFrame), 0, frameCount - 1) : 0;
    const endFrame = isFiniteNumber(o.endFrame) ? clamp(Math.floor(o.endFrame), startFrame, frameCount - 1) : frameCount - 1;
    const fontSize = isFiniteNumber(o.fontSize) ? clamp(o.fontSize, 8, 160) : kind === 'intertitle' ? 48 : 32;
    const id = typeof o.id === 'string' && o.id.trim() ? o.id : `overlay_${i}`;
    out.push({
      id,
      kind,
      text: typeof o.text === 'string' ? o.text : '',
      visible: typeof o.visible === 'boolean' ? o.visible : true,
      startFrame,
      endFrame,
      fontSize,
      color: typeof o.color === 'string' && o.color.trim() ? o.color : '#ffffff',
      align,
      x: isFiniteNumber(o.x) ? o.x : undefined,
      y: isFiniteNumber(o.y) ? o.y : undefined,
      rotation: isFiniteNumber(o.rotation) ? o.rotation : 0,
      bgSrc: typeof (o as any).bgSrc === 'string' ? ((o as any).bgSrc as string) : null,
      bgOpacity: isFiniteNumber((o as any).bgOpacity) ? clamp((o as any).bgOpacity as number, 0, 1) : 1,
    });
  }
  return out;
};

const sanitizeConnectionOverrides = (rawValue: unknown): SkeletonState['connectionOverrides'] => {
  const out: SkeletonState['connectionOverrides'] = {};
  if (!rawValue || typeof rawValue !== 'object') return out;
  const raw = rawValue as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    const v = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
    if (!v) continue;
    
    const next: SkeletonState['connectionOverrides'][string] = {
      stretchMode: undefined,
      shape: undefined,
      shapeScale: undefined,
      fkMode: undefined,
      fkFollowDeg: undefined,
      mergeToJointId: undefined,
      hidden: undefined,
    };
    
    if (typeof v.shape === 'string' && ALLOWED_SHAPES.has(v.shape)) {
      next.shape = v.shape;
    }
    
    if (typeof v.stretchMode === 'string' && 
        (v.stretchMode === 'rigid' || v.stretchMode === 'elastic' || v.stretchMode === 'stretch')) {
      next.stretchMode = v.stretchMode;
    }
    
    if (typeof v.fkMode === 'string' && 
        (v.fkMode === 'stretch' || v.fkMode === 'bend')) {
      next.fkMode = v.fkMode;
    }
    
    if (typeof v.fkFollowDeg === 'number') {
      next.fkFollowDeg = v.fkFollowDeg;
    }
    
    if (typeof v.mergeToJointId === 'string') {
      next.mergeToJointId = v.mergeToJointId;
    }
    
    if (typeof v.hidden === 'boolean') {
      next.hidden = v.hidden;
    }
    
    out[key] = { ...(out[key] || {}), ...next };
  }
  return out;
};

const sanitizeHipLock = (rawValue: unknown, base: SkeletonState['hipLock']): SkeletonState['hipLock'] => {
  if (!rawValue || typeof rawValue !== 'object') return base;
  const raw = rawValue as Record<string, unknown>;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled;
  const extendCompressEnabled =
    typeof raw.extendCompressEnabled === 'boolean' ? raw.extendCompressEnabled : base.extendCompressEnabled;
  const restLen = isFiniteNumber(raw.restLen) ? clamp(raw.restLen, 0.1, 100) : base.restLen;
  const minScale = isFiniteNumber(raw.minScale) ? clamp(raw.minScale, 0.1, 10) : base.minScale;
  const maxScale = isFiniteNumber(raw.maxScale) ? clamp(raw.maxScale, 0.1, 10) : base.maxScale;
  const fkEnabled = typeof raw.fkEnabled === 'boolean' ? raw.fkEnabled : base.fkEnabled;
  const fkLengthScale = isFiniteNumber(raw.fkLengthScale) ? clamp(raw.fkLengthScale, 0.1, 10) : base.fkLengthScale;
  const walkModeEnabled = typeof raw.walkModeEnabled === 'boolean' ? raw.walkModeEnabled : base.walkModeEnabled;
  const walkAmount = isFiniteNumber(raw.walkAmount) ? clamp(raw.walkAmount, 0, 10) : base.walkAmount;
  const pelvisBiasEnabled = typeof raw.pelvisBiasEnabled === 'boolean' ? raw.pelvisBiasEnabled : base.pelvisBiasEnabled;
  const pelvisBiasSide =
    raw.pelvisBiasSide === 'above' || raw.pelvisBiasSide === 'below' ? raw.pelvisBiasSide : base.pelvisBiasSide;
  const pelvisBiasAmount = isFiniteNumber(raw.pelvisBiasAmount) ? clamp(raw.pelvisBiasAmount, 0, 10) : base.pelvisBiasAmount;
  return {
    enabled,
    extendCompressEnabled,
    restLen,
    minScale: Math.min(minScale, maxScale),
    maxScale: Math.max(minScale, maxScale),
    fkEnabled,
    fkLengthScale,
    walkModeEnabled,
    walkAmount,
    pelvisBiasEnabled,
    pelvisBiasSide,
    pelvisBiasAmount,
  };
};

const sanitizeTorsoDiamond = (rawValue: unknown, base: SkeletonState['torsoDiamond']): SkeletonState['torsoDiamond'] => {
  if (!rawValue || typeof rawValue !== 'object') return base;
  const raw = rawValue as Record<string, unknown>;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled;
  const dynamic = typeof raw.dynamic === 'boolean' ? raw.dynamic : base.dynamic;
  const restEdgesRaw = raw.restEdges;
  let restEdges: Record<string, number> | undefined = base.restEdges;
  if (restEdgesRaw && typeof restEdgesRaw === 'object') {
    const r = restEdgesRaw as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) {
      if (!isFiniteNumber(v)) continue;
      out[k] = clamp(v, 0.1, 100);
    }
    restEdges = Object.keys(out).length ? out : undefined;
  }
  return { enabled, dynamic, restEdges };
};

const sanitizeCollarLock = (rawValue: unknown, base: SkeletonState['collarLock']): SkeletonState['collarLock'] => {
  if (!rawValue || typeof rawValue !== 'object') return base;
  const raw = rawValue as Record<string, unknown>;
  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled;
  const extendCompressEnabled =
    typeof raw.extendCompressEnabled === 'boolean' ? raw.extendCompressEnabled : base.extendCompressEnabled;
  const restLen = isFiniteNumber(raw.restLen) ? clamp(raw.restLen, 0.1, 100) : base.restLen;
  const minScale = isFiniteNumber(raw.minScale) ? clamp(raw.minScale, 0.1, 10) : base.minScale;
  const maxScale = isFiniteNumber(raw.maxScale) ? clamp(raw.maxScale, 0.1, 10) : base.maxScale;
  return {
    enabled,
    extendCompressEnabled,
    restLen,
    minScale: Math.min(minScale, maxScale),
    maxScale: Math.max(minScale, maxScale),
  };
};

const sanitizeBalancedNeck = (rawValue: unknown, base: BalancedNeckConfig): BalancedNeckConfig => {
  if (!rawValue || typeof rawValue !== 'object') return base;
  const raw = rawValue as Record<string, unknown>;

  const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled;
  const clavicleInfluence = isFiniteNumber(raw.clavicleInfluence) ? clamp(raw.clavicleInfluence, 0, 1) : base.clavicleInfluence;
  const torsoInfluence = isFiniteNumber(raw.torsoInfluence) ? clamp(raw.torsoInfluence, 0, 1) : base.torsoInfluence;
  const followStrength = isFiniteNumber(raw.followStrength) ? clamp(raw.followStrength, 0, 1) : base.followStrength;
  const smoothingFactor = isFiniteNumber(raw.smoothingFactor) ? clamp(raw.smoothingFactor, 0, 1) : base.smoothingFactor;

  const rawRot =
    raw.rotationInheritance && typeof raw.rotationInheritance === 'object'
      ? (raw.rotationInheritance as Record<string, unknown>)
      : null;

  const rotationInheritance: BalancedNeckConfig['rotationInheritance'] = {
    enabled: typeof rawRot?.enabled === 'boolean' ? (rawRot.enabled as boolean) : base.rotationInheritance.enabled,
    torsoInfluence: isFiniteNumber(rawRot?.torsoInfluence)
      ? clamp(rawRot!.torsoInfluence as number, 0, 1)
      : base.rotationInheritance.torsoInfluence,
    lagFactor: isFiniteNumber(rawRot?.lagFactor) ? clamp(rawRot!.lagFactor as number, 0, 1) : base.rotationInheritance.lagFactor,
  };

  return {
    enabled,
    clavicleInfluence,
    torsoInfluence,
    followStrength,
    smoothingFactor,
    rotationInheritance,
  };
};

const sanitizeBoneStyle = (rawValue: unknown, base: SkeletonState['boneStyle']): SkeletonState['boneStyle'] => {
  if (!rawValue || typeof rawValue !== 'object') return base;
  const raw = rawValue as Record<string, unknown>;
  const hueT = isFiniteNumber(raw.hueT) ? clamp(raw.hueT, 0, 1) : base.hueT;
  const lightness = isFiniteNumber(raw.lightness) ? clamp(raw.lightness, -1, 1) : base.lightness;
  return { hueT, lightness };
};

const sanitizeHeadMask = (raw: unknown, base: HeadMask): HeadMask => {
  if (!raw || typeof raw !== 'object') return base;
  const mask = raw as Partial<HeadMask>;
  const mode = mask.mode === 'cutout' || mask.mode === 'rubberhose' || mask.mode === 'roto' ? mask.mode : base.mode;
  const src = typeof mask.src === 'string' ? mask.src : base.src;
  const blendMode =
    typeof (mask as any).blendMode === 'string' && MASK_BLEND_MODE_SET.has((mask as any).blendMode)
      ? ((mask as any).blendMode as any)
      : base.blendMode;
  
  return {
    src,
    visible: typeof mask.visible === 'boolean' ? mask.visible : Boolean(src),
    opacity: isFiniteNumber(mask.opacity) ? clamp(mask.opacity, 0, 1) : base.opacity,
    scale: isFiniteNumber(mask.scale) ? clamp(mask.scale, 0.01, 80) : base.scale,
    offsetX: isFiniteNumber(mask.offsetX) ? clamp(mask.offsetX, -5000, 5000) : base.offsetX,
    offsetY: isFiniteNumber(mask.offsetY) ? clamp(mask.offsetY, -5000, 5000) : base.offsetY,
    rotation: isFiniteNumber(mask.rotation) ? clamp(mask.rotation, -360, 360) : base.rotation,
    anchorX: isFiniteNumber(mask.anchorX) ? clamp(mask.anchorX, 0, 1) : base.anchorX,
    anchorY: isFiniteNumber(mask.anchorY) ? clamp(mask.anchorY, 0, 1) : base.anchorY,
    mode,
    lengthScale: isFiniteNumber(mask.lengthScale) ? clamp(mask.lengthScale, 0.05, 10) : base.lengthScale,
    volumePreserve: typeof mask.volumePreserve === 'boolean' ? mask.volumePreserve : base.volumePreserve,
    stretchX: isFiniteNumber(mask.stretchX) ? clamp(mask.stretchX, 0.1, 10) : base.stretchX,
    stretchY: isFiniteNumber(mask.stretchY) ? clamp(mask.stretchY, 0.1, 10) : base.stretchY,
    skewX: isFiniteNumber(mask.skewX) ? clamp(mask.skewX, -45, 45) : base.skewX,
    skewY: isFiniteNumber(mask.skewY) ? clamp(mask.skewY, -45, 45) : base.skewY,
    blendMode,
    blurPx: isFiniteNumber((mask as any).blurPx) ? clamp((mask as any).blurPx, 0, 60) : base.blurPx,
    brightness: isFiniteNumber((mask as any).brightness) ? clamp((mask as any).brightness, 0, 3) : base.brightness,
    contrast: isFiniteNumber((mask as any).contrast) ? clamp((mask as any).contrast, 0, 3) : base.contrast,
    saturation: isFiniteNumber((mask as any).saturation) ? clamp((mask as any).saturation, 0, 5) : base.saturation,
    hueRotate: isFiniteNumber((mask as any).hueRotate) ? clamp((mask as any).hueRotate, -360, 360) : base.hueRotate,
    grayscale: isFiniteNumber((mask as any).grayscale) ? clamp((mask as any).grayscale, 0, 1) : base.grayscale,
    sepia: isFiniteNumber((mask as any).sepia) ? clamp((mask as any).sepia, 0, 1) : base.sepia,
    invert: isFiniteNumber((mask as any).invert) ? clamp((mask as any).invert, 0, 1) : base.invert,
    pixelate: isFiniteNumber((mask as any).pixelate) ? clamp((mask as any).pixelate, 0, 64) : base.pixelate,
    relatedJoints: sanitizeRelatedJoints(mask.relatedJoints, base.relatedJoints),
  };
};

export const sanitizeJoints = (rawJoints: unknown): Record<string, Joint> => {
  const raw = rawJoints && typeof rawJoints === 'object' ? (rawJoints as Record<string, Partial<Joint>>) : {};
  const next: Record<string, Joint> = {};
  const hasSavedRoot = Boolean(raw.root && typeof raw.root === 'object');
  const hasSavedNavel = Boolean(raw.navel && typeof raw.navel === 'object');

  const legacyWorldOffsets = (() => {
    if (hasSavedRoot) return null;
    if (!hasSavedNavel) return null;
    const savedNavel = raw.navel as Partial<Joint> | undefined;
    if (!savedNavel) return null;
    return {
      currentOffset: safePoint(savedNavel.currentOffset, INITIAL_JOINTS.navel.currentOffset),
      targetOffset: safePoint(savedNavel.targetOffset, INITIAL_JOINTS.navel.targetOffset),
      previewOffset: safePoint(savedNavel.previewOffset ?? savedNavel.targetOffset, INITIAL_JOINTS.navel.previewOffset),
    };
  })();

  for (const id of Object.keys(INITIAL_JOINTS)) {
    const base = INITIAL_JOINTS[id];
    const saved = raw[id] as Partial<Joint> | undefined;
    if (id === 'root' && legacyWorldOffsets) {
      next[id] = {
        ...base,
        currentOffset: legacyWorldOffsets.currentOffset,
        targetOffset: legacyWorldOffsets.targetOffset,
        previewOffset: legacyWorldOffsets.previewOffset,
        rotation: isFiniteNumber(saved?.rotation) ? saved.rotation : (base.rotation ?? 0),
      };
      continue;
    }
    if (id === 'navel' && legacyWorldOffsets) {
      next[id] = {
        ...base,
        currentOffset: { ...base.currentOffset },
        targetOffset: { ...base.targetOffset },
        previewOffset: { ...base.previewOffset },
        rotation: isFiniteNumber(saved?.rotation) ? saved.rotation : (base.rotation ?? 0),
      };
      continue;
    }
    next[id] = {
      ...base,
      currentOffset: safePoint(saved?.currentOffset, base.currentOffset),
      targetOffset: safePoint(saved?.targetOffset, base.targetOffset),
      previewOffset: safePoint(saved?.previewOffset ?? saved?.targetOffset, base.previewOffset),
      rotation: isFiniteNumber(saved?.rotation) ? saved.rotation : (base.rotation ?? 0),
    };
  }
  return next;
};

export const makeDefaultState = (): SkeletonState => {
  const joints = sanitizeJoints(null);
  const defaultSlots = createDefaultCutoutSlots();
  const groundRootTarget = computeGroundPivotWorld(joints, INITIAL_JOINTS, 'preview');
  const canonicalConnKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const defaultConnectionOverrides: SkeletonState['connectionOverrides'] = {};

  const setFkFollowDeg = (a: string, b: string, fkFollowDeg: number) => {
    const key = canonicalConnKey(a, b);
    defaultConnectionOverrides[key] = { ...(defaultConnectionOverrides[key] ?? {}), fkFollowDeg };
  };

  const setHidden = (a: string, b: string) => {
    const key = canonicalConnKey(a, b);
    defaultConnectionOverrides[key] = { ...(defaultConnectionOverrides[key] ?? {}), hidden: true };
  };

  // Hide skull connections by default for clean head shape

  // Default FK follow: collar acts as shoulder socket. Rotating collar rotates neck/head and both arms.
  // Simplified shoulder mechanics - direct connections for accordion compression
  const COLLAR_SOCKET_FOLLOW_DEG = 90;
  setFkFollowDeg('collar', 'l_clavicle', COLLAR_SOCKET_FOLLOW_DEG);
  setFkFollowDeg('l_clavicle', 'l_bicep', COLLAR_SOCKET_FOLLOW_DEG); // Direct: left clavicle -> left bicep
  setFkFollowDeg('l_bicep', 'l_elbow', COLLAR_SOCKET_FOLLOW_DEG);
  setFkFollowDeg('collar', 'r_clavicle', COLLAR_SOCKET_FOLLOW_DEG);
  setFkFollowDeg('r_clavicle', 'r_bicep', COLLAR_SOCKET_FOLLOW_DEG); // Direct: right clavicle -> right bicep
  setFkFollowDeg('r_bicep', 'r_elbow', COLLAR_SOCKET_FOLLOW_DEG);
  setFkFollowDeg('l_elbow', 'l_wrist', COLLAR_SOCKET_FOLLOW_DEG);
  setFkFollowDeg('r_elbow', 'r_wrist', COLLAR_SOCKET_FOLLOW_DEG);
  setFkFollowDeg('l_wrist', 'l_fingertip', COLLAR_SOCKET_FOLLOW_DEG);
  setFkFollowDeg('r_wrist', 'r_fingertip', COLLAR_SOCKET_FOLLOW_DEG);
  
  // Create default views (Front, Side, Back, 3/4)
  const defaultViews = [
    {
      id: 'front',
      name: 'Front',
      pose: { joints: Object.fromEntries(Object.entries(INITIAL_JOINTS).map(([id, joint]) => [id, joint.previewOffset])) },
      slotOverrides: {},
      camera: { viewScale: 1.0, viewOffset: { x: 0, y: 0 } },
    },
    {
      id: 'side', 
      name: 'Side',
      pose: { joints: Object.fromEntries(Object.entries(INITIAL_JOINTS).map(([id, joint]) => [id, joint.previewOffset])) },
      slotOverrides: {},
      camera: { viewScale: 1.0, viewOffset: { x: 0, y: 0 } },
    },
    {
      id: 'back',
      name: 'Back', 
      pose: { joints: Object.fromEntries(Object.entries(INITIAL_JOINTS).map(([id, joint]) => [id, joint.previewOffset])) },
      slotOverrides: {},
      camera: { viewScale: 1.0, viewOffset: { x: 0, y: 0 } },
    },
    {
      id: 'three_quarters',
      name: '3/4',
      pose: { joints: Object.fromEntries(Object.entries(INITIAL_JOINTS).map(([id, joint]) => [id, joint.previewOffset])) },
      slotOverrides: {},
      camera: { viewScale: 1.0, viewOffset: { x: 0, y: 0 } },
    },
  ];

  return {
    joints,
    activeModel: 'humanoid',
    mirroring: true,
    bendEnabled: false, // Default: no auto-bend (rigid)
    stretchEnabled: false, // Ensure stretching is disabled by default
	    leadEnabled: true,
      clavicleConstraintEnabled: false,
	    hardStop: true, // Enable hard stops for rigid joint limits
      shapeshiftingEnabled: false,
      torsoDiamond: { enabled: false, dynamic: false },
      torsoNavelScale: 1.0,
	    physicsRigidity: 0, // 0..1 macro slider (0=rigid)
	    // Default: FK-first with a single planted foot for stability.
	    activeRoots: ['r_ankle'],
	    deactivatedJoints: new Set<string>(),
	    groundRootTarget,
	    footPlungerEnabled: false,
	    showJoints: true,
    jointsOverMasks: false,
    lookMode: 'default',
    armViewMode: '2D',
    controlMode: 'Cardboard', // FK-heavy default
	    rigidity: 'cardboard', // Most rigid setting by default
	    snappiness: 1.0, // Maximum snappiness for crisp rigid movement
    ikSensitivity: 0.3, // Default to fluid clay-like behavior (0.3 = smooth but responsive)
    viewScale: 1.0,
    viewOffset: { x: 0, y: 0 },
    procgen: {
      enabled: false,
      mode: 'walk_in_place',
      strength: 1,
      seed: 1,
      neutralPose: null,
      bake: { cycleFrames: 48, keyframeStep: 4 },
      options: { inPlace: true, groundingEnabled: true, pauseWhileDragging: true, groundPlaneY: 13, groundPlaneVisible: true },
      gait: { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT },
      gaitEnabled: {},
      physics: { ...DEFAULT_PROCEDURAL_BITRUVIAN_PHYSICS },
      idle: { ...DEFAULT_PROCEDURAL_BITRUVIAN_IDLE },
    },
    timeline: {
      enabled: true,
      clip: {
        frameCount: 120,
        fps: 24,
        easing: 'linear',
        keyframes: [],
      },
      onionSkin: {
        enabled: false,
        past: 0,
        future: 0,
      },
    },
    scene: {
      background: {
        src: null,
        visible: false,
        opacity: 1.0,
        x: 0,
        y: 0,
        scale: 1.0,
        rotation: 0,
        fitMode: 'contain',
        mediaType: 'image',
        videoStart: 0,
        videoRate: 1,
        sequence: null,
      },
      foreground: {
        src: null,
        visible: false,
        opacity: 0.5,
        x: 0,
        y: 0,
        scale: 1.0,
        rotation: 0,
        fitMode: 'contain',
        mediaType: 'image',
        videoStart: 0,
        videoRate: 1,
        sequence: null,
      },
      headMask: {
        src: null,
        visible: false,
        opacity: 1.0,
        scale: 1.0,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        mode: 'cutout',
        lengthScale: 1.0,
        volumePreserve: false,
        stretchX: 1.0,
        stretchY: 1.0,
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
      },
      jointMasks: makeDefaultJointMasks(),
      textOverlays: [],
    },
    assets: {},
    cutoutSlots: defaultSlots,
    sheetPalette: {
      sheetId: null,
      name: '',
      dims: null,
      segments: [],
      selectedSegmentId: null,
      targetSlotId: null,
      previewSrc: null,
    },
    cutoutRig: { linkWaistToTorso: false, linkJointsToMasks: false },
    views: defaultViews,
    activeViewId: 'front',
    boneStyle: { hueT: 0, lightness: 0 },
	    hipLock: {
	      enabled: false,
	      extendCompressEnabled: false,
	      restLen: undefined,
      minScale: 1,
      maxScale: 1,
      fkEnabled: false,
      fkLengthScale: 1,
      walkModeEnabled: false,
      walkAmount: 0.75,
      pelvisBiasEnabled: false,
      pelvisBiasSide: 'below',
      pelvisBiasAmount: 1,
	    },
	    collarLock: { enabled: false, extendCompressEnabled: false, restLen: undefined, minScale: 1, maxScale: 1 },
	    balancedNeck: DEFAULT_BALANCED_NECK_CONFIG,
	    connectionOverrides: defaultConnectionOverrides,
	    cutoutEditor: {
	      mode: 'layout',
	      nodes: {},
	      selectedNodeId: null,
	      selectedAnchorId: null,
	      showAnchors: true,
	      showConnections: true,
	      snapToAnchors: true,
	      gridSize: 20,
	      viewTransform: { x: 0, y: 0, scale: 1 },
	    },
	    cutoutSheets: {},
	  };
	};

// Migration utilities for backward compatibility
const migrateLegacyMasksToCutouts = (rawScene: any, base: SkeletonState): { assets: Record<string, CutoutAsset>, cutoutSlots: Record<string, CutoutSlot> } => {
  const assets: Record<string, CutoutAsset> = {};
  const cutoutSlots: Record<string, CutoutSlot> = {};
  let assetIndex = 0;

  // Migrate headMask if it has an image
  if (rawScene?.headMask?.src) {
    const headMask = rawScene.headMask;
    const assetId = `migrated_head_${Date.now()}`;
    assets[assetId] = {
      id: assetId,
      name: 'Head (migrated)',
      kind: 'image',
      image: {
        src: headMask.src,
        naturalWidth: 100, // Default size, will be updated when loaded
        naturalHeight: 100,
      },
    };

    cutoutSlots['head'] = {
      id: 'head',
      name: 'head',
      attachment: {
        type: 'bone',
        fromJointId: 'collar',
        toJointId: 'collar',
      },
      assetId,
      visible: headMask.visible ?? true,
      opacity: headMask.opacity ?? 1.0,
      zIndex: 100,
      mode: headMask.mode ?? 'cutout',
      scale: headMask.scale ?? 1.0,
      lengthScale: headMask.lengthScale ?? 1.0,
      volumePreserve: headMask.volumePreserve ?? false,
      offsetX: headMask.offsetX ?? 0,
      offsetY: headMask.offsetY ?? 0,
      rotation: headMask.rotation ?? 0,
      anchorX: headMask.anchorX ?? 0.5,
      anchorY: headMask.anchorY ?? 0.5,
    };
  }

  // Migrate jointMasks
  if (rawScene?.jointMasks && typeof rawScene.jointMasks === 'object') {
    for (const [jointId, jointMask] of Object.entries(rawScene.jointMasks as Record<string, any>)) {
      if (jointMask?.src) {
        const assetId = `migrated_${jointId}_${Date.now()}_${assetIndex++}`;
        assets[assetId] = {
          id: assetId,
          name: `${jointId} (migrated)`,
          kind: 'image',
          image: {
            src: jointMask.src,
            naturalWidth: 100,
            naturalHeight: 100,
          },
        };

        // Find parent joint for bone attachment
        const joint = INITIAL_JOINTS[jointId];
        const fromJointId = joint?.parent || 'navel';
        
        cutoutSlots[jointId] = {
          id: jointId,
          name: jointId,
          attachment: {
            type: 'bone',
            fromJointId,
            toJointId: jointId,
          },
          assetId,
          visible: jointMask.visible ?? true,
          opacity: jointMask.opacity ?? 1.0,
          zIndex: 50,
          mode: jointMask.mode ?? 'cutout',
          scale: jointMask.scale ?? 0.25,
          lengthScale: jointMask.lengthScale ?? 1.0,
          volumePreserve: jointMask.volumePreserve ?? false,
          offsetX: jointMask.offsetX ?? 0,
          offsetY: jointMask.offsetY ?? 0,
          rotation: jointMask.rotation ?? 0,
          anchorX: jointMask.anchorX ?? 0.5,
          anchorY: jointMask.anchorY ?? 0.5,
        };
      }
    }
  }

  return { assets, cutoutSlots };
};

export const sanitizeStateWithReport = (rawState: unknown): TransitionResult<SkeletonState> => {
  const base = makeDefaultState();
  const issues: TransitionIssue[] = [];
  if (!rawState || typeof rawState !== 'object') return { state: base, issues };
  const raw = rawState as Partial<SkeletonState> & { [key: string]: unknown };

  const rawLookMode = typeof (raw as any).lookMode === 'string' ? ((raw as any).lookMode as string) : null;
  const rawLegacyViewMode = typeof (raw as any).viewMode === 'string' ? ((raw as any).viewMode as string) : null;
  const rawArmViewMode = typeof (raw as any).armViewMode === 'string' ? ((raw as any).armViewMode as string) : null;

  let lookMode: LookModeId = base.lookMode;
  let armViewMode: ArmViewMode = base.armViewMode;
  let forceLegacy3DRigid = false;

  // Validate armViewMode
  if (rawArmViewMode && ['2D', '3D', 'hybrid'].includes(rawArmViewMode)) {
    armViewMode = rawArmViewMode as ArmViewMode;
  }
  if (rawLookMode && LOOK_MODE_ID_SET.has(rawLookMode as LookModeId)) {
    lookMode = rawLookMode as LookModeId;
  } else if (rawLegacyViewMode) {
    if (LOOK_MODE_ID_SET.has(rawLegacyViewMode as LookModeId)) {
      lookMode = rawLegacyViewMode as LookModeId;
      issues.push({
        severity: 'info',
        title: 'Migrated legacy viewMode',
        detail: `Loaded legacy field "viewMode"="${rawLegacyViewMode}" into "lookMode".`,
        autoFixedFields: ['look.lookMode'],
      });
    } else if (rawLegacyViewMode === '2D') {
      lookMode = 'default';
      issues.push({
        severity: 'info',
        title: 'Migrated legacy 2D viewMode',
        detail: 'Legacy "viewMode=2D" is now a Look+Simulation split; using lookMode=default.',
        autoFixedFields: ['look.lookMode'],
      });
    } else if (rawLegacyViewMode === '3D') {
      lookMode = 'default';
      forceLegacy3DRigid = true;
      issues.push({
        severity: 'info',
        title: 'Migrated legacy 3D viewMode',
        detail: 'Legacy "viewMode=3D" is now a Look+Simulation split; using lookMode=default and rigid FK simulation defaults.',
        autoFixedFields: [
          'look.lookMode',
          'simulation.physicsRigidity',
          'simulation.rigidity',
          'simulation.controlMode',
          'simulation.bendEnabled',
          'simulation.stretchEnabled',
          'simulation.hardStop',
        ],
      });
    }
  }

  const rawControlMode = typeof (raw as any).controlMode === 'string' ? ((raw as any).controlMode as string) : null;
  const normalizedControlMode =
    rawControlMode === 'FK' ? 'Cardboard' : rawControlMode === 'Hybrid' ? 'IK' : rawControlMode;
  const controlMode =
    typeof normalizedControlMode === 'string' && CONTROL_MODE_SET.has(normalizedControlMode as ControlMode)
      ? (normalizedControlMode as ControlMode)
      : base.controlMode;

  const snappiness = isFiniteNumber(raw.snappiness) ? clamp(raw.snappiness, 0.05, 1.0) : base.snappiness;
  const ikSensitivity = isFiniteNumber(raw.ikSensitivity) ? clamp(raw.ikSensitivity, 0.0, 1.0) : base.ikSensitivity;
  const rawViewScale = (raw as any).viewScale;
  const viewScale = isFiniteNumber(rawViewScale) ? clamp(rawViewScale, 0.1, 10.0) : base.viewScale;
  if (rawViewScale !== undefined && viewScale !== rawViewScale) {
    issues.push({
      severity: 'info',
      title: 'Normalized camera zoom',
      detail: 'Loaded viewScale was invalid/out of range and was normalized.',
      autoFixedFields: ['camera.viewScale'],
    });
  }

  const viewOffset = safePointClamped(raw.viewOffset, base.viewOffset, { min: -50_000, max: 50_000 });
  if (
    raw.viewOffset !== undefined &&
    (!raw.viewOffset ||
      typeof raw.viewOffset !== 'object' ||
      (raw.viewOffset as any).x !== viewOffset.x ||
      (raw.viewOffset as any).y !== viewOffset.y)
  ) {
    issues.push({
      severity: 'info',
      title: 'Normalized camera pan',
      detail: 'Loaded viewOffset was invalid/out of range and was normalized.',
      autoFixedFields: ['camera.viewOffset'],
    });
  }
  const rigidity = (raw.rigidity === 'cardboard' || raw.rigidity === 'rubberhose' || raw.rigidity === 'realistic') ? raw.rigidity : base.rigidity;
  const physicsRigidity = isFiniteNumber((raw as any).physicsRigidity)
    ? clamp((raw as any).physicsRigidity as number, 0, 1)
    : base.physicsRigidity;

  const rawRoots = Array.isArray((raw as any).activeRoots)
    ? (raw as any).activeRoots
    : Array.isArray((raw as any).activePins)
      ? (raw as any).activePins
      : null;

  const activeRoots = Array.isArray(rawRoots)
    ? Array.from(new Set(rawRoots.filter((id): id is string => typeof id === 'string' && id in INITIAL_JOINTS)))
    : base.activeRoots;

  const rawTimeline =
    raw.timeline && typeof raw.timeline === 'object' ? (raw.timeline as unknown as Record<string, unknown>) : null;
  const rawClip =
    rawTimeline && rawTimeline.clip && typeof rawTimeline.clip === 'object'
      ? (rawTimeline.clip as Record<string, unknown>)
      : null;

  const frameCount = isFiniteNumber(rawClip?.frameCount)
    ? clamp(Math.floor(rawClip!.frameCount), 2, 600)
    : base.timeline.clip.frameCount;
  const fps = isFiniteNumber(rawClip?.fps) ? clamp(Math.floor(rawClip!.fps), 1, 60) : base.timeline.clip.fps;
  const easing =
    rawClip?.easing === 'linear' || rawClip?.easing === 'easeInOut' ? rawClip.easing : base.timeline.clip.easing;

  const sanitizePose = (poseRaw: unknown) => {
    if (!poseRaw || typeof poseRaw !== 'object') return null;
    const rawPose = poseRaw as { joints?: unknown };
    if (!rawPose.joints || typeof rawPose.joints !== 'object') return null;
    const rawJoints = rawPose.joints as Record<string, unknown>;
    const next: Record<string, Point> = {};
    for (const id of Object.keys(INITIAL_JOINTS)) {
      next[id] = safePoint(rawJoints[id], INITIAL_JOINTS[id].previewOffset);
    }
    return { joints: next };
  };

  const hipLock = sanitizeHipLock((raw as any).hipLock, base.hipLock);
  const collarLock = sanitizeCollarLock((raw as any).collarLock, base.collarLock);
  const torsoDiamond = sanitizeTorsoDiamond((raw as any).torsoDiamond, base.torsoDiamond);
  const balancedNeck = sanitizeBalancedNeck((raw as any).balancedNeck, base.balancedNeck);

  const rawKeyframes = Array.isArray(rawClip?.keyframes) ? rawClip!.keyframes : [];
  const keyframeByFrame = new Map<number, { frame: number; pose: { joints: Record<string, Point> } }>();
  for (const item of rawKeyframes) {
    if (!item || typeof item !== 'object') continue;
    const rawItem = item as { frame?: unknown; pose?: unknown };
    if (!isFiniteNumber(rawItem.frame)) continue;
    const frame = Math.floor(rawItem.frame);
    if (frame < 0 || frame >= frameCount) continue;
    const pose = sanitizePose(rawItem.pose);
    if (!pose) continue;
    keyframeByFrame.set(frame, { frame, pose });
  }
  const keyframes = Array.from(keyframeByFrame.values()).sort((a, b) => a.frame - b.frame);

  const rawOnion =
    rawTimeline && rawTimeline.onionSkin && typeof rawTimeline.onionSkin === 'object'
      ? (rawTimeline.onionSkin as Record<string, unknown>)
      : null;

  const rawScene = raw.scene && typeof raw.scene === 'object' ? (raw.scene as unknown as Record<string, unknown>) : null;
  const rawJointMasks =
    rawScene?.jointMasks && typeof rawScene.jointMasks === 'object'
      ? (rawScene.jointMasks as Record<string, unknown>)
      : {};
  const jointMasks: Record<string, JointMask> = {};
  for (const id of Object.keys(INITIAL_JOINTS)) {
    jointMasks[id] = sanitizeJointMask(rawJointMasks[id], base.scene.jointMasks[id]);
  }
  const textOverlays = sanitizeTextOverlays(rawScene?.textOverlays, frameCount);
  
  // Handle cutout system migration and sanitization
  let assets = base.assets;
  let cutoutSlots = base.cutoutSlots;
  let cutoutRig = base.cutoutRig ?? { linkWaistToTorso: false, linkJointsToMasks: false };
  let views = base.views;
  let activeViewId = base.activeViewId;

  // If we have legacy data but no new cutout data, migrate it
  const hasLegacyData = (rawScene as any)?.headMask?.src || ((rawScene as any)?.jointMasks && Object.values((rawScene as any).jointMasks as Record<string, any>).some((mask: any) => mask?.src));
  const hasNewCutoutData = raw.assets || raw.cutoutSlots;

  if (hasLegacyData && !hasNewCutoutData) {
    const migrated = migrateLegacyMasksToCutouts(rawScene, base);
    assets = migrated.assets;
    cutoutSlots = migrated.cutoutSlots;
  } else {
    // Sanitize existing cutout data
    assets = typeof raw.assets === 'object' && raw.assets !== null ? raw.assets as Record<string, CutoutAsset> : base.assets;
    cutoutSlots = typeof raw.cutoutSlots === 'object' && raw.cutoutSlots !== null ? raw.cutoutSlots as Record<string, CutoutSlot> : base.cutoutSlots;
  }

  // Normalize legacy slot ids into simplified masks where safe.
  const normalizeCutoutSlots = (slots: Record<string, CutoutSlot>): Record<string, CutoutSlot> => {
    const sourceUpper = (slots as any).spine_upper as CutoutSlot | undefined;
    const sourceNeck = (slots as any).spine_neck as CutoutSlot | undefined;
    const hasCollar = Boolean((slots as any).collar);

    let next: Record<string, CutoutSlot> = slots;
    let migratedUpper = false;
    let migratedNeck = false;

    const maybeAdoptIntoCollar = (source: CutoutSlot | undefined, isUpper: boolean) => {
      if (!source) return;
      if (hasCollar) return;
      if (isUpper) {
        migratedUpper = true;
      } else {
        migratedNeck = true;
      }
      next = {
        ...next,
        collar: {
          ...source,
          id: 'collar',
          name: 'Collar',
          attachment: { type: 'bone', fromJointId: 'sternum', toJointId: 'collar' },
          originJointId: typeof source.originJointId === 'string' ? source.originJointId : 'sternum',
          anchorY: Number.isFinite(source.anchorY) ? source.anchorY : 1,
          zIndex: Number.isFinite(source.zIndex) ? source.zIndex : 75,
        },
      };
    };

    maybeAdoptIntoCollar(sourceUpper, true);
    if (!migratedUpper) maybeAdoptIntoCollar(sourceNeck, false);

    // Remove legacy slots only when empty or explicitly migrated (to avoid data loss).
    if ((sourceUpper && migratedUpper) || (sourceUpper && !sourceUpper.assetId && !sourceUpper.visible)) {
      const copy = { ...next } as any;
      delete copy.spine_upper;
      next = copy;
    }
    if ((sourceNeck && migratedNeck) || (sourceNeck && !sourceNeck.assetId && !sourceNeck.visible)) {
      const copy = { ...next } as any;
      delete copy.spine_neck;
      next = copy;
    }

    return next;
  };

  cutoutSlots = normalizeCutoutSlots(cutoutSlots);

  const rawCutoutRig = (raw as any).cutoutRig;
  if (rawCutoutRig && typeof rawCutoutRig === 'object') {
    cutoutRig = {
      linkWaistToTorso:
        typeof (rawCutoutRig as any).linkWaistToTorso === 'boolean'
          ? (rawCutoutRig as any).linkWaistToTorso
          : (base.cutoutRig?.linkWaistToTorso ?? false),
      linkJointsToMasks:
        typeof (rawCutoutRig as any).linkJointsToMasks === 'boolean'
          ? (rawCutoutRig as any).linkJointsToMasks
          : (base.cutoutRig?.linkJointsToMasks ?? false),
    };
  }

  // Sanitize views
  if (Array.isArray(raw.views)) {
    const filtered = raw.views.filter((view): view is ViewPreset => {
      return view && typeof view === 'object' && 
             typeof view.id === 'string' && 
             typeof view.name === 'string' &&
             view.pose && typeof view.pose === 'object' &&
             view.pose.joints && typeof view.pose.joints === 'object';
    });
    // Expand pose joint maps to include all known joints, so older saves don't "forget" new joints.
    views = filtered.map((view) => {
      const rawPoseJoints = (view.pose?.joints ?? {}) as Record<string, unknown>;
      const expandedPoseJoints: Record<string, Point> = {};
      for (const id of Object.keys(INITIAL_JOINTS)) {
        expandedPoseJoints[id] = safePoint(rawPoseJoints[id], INITIAL_JOINTS[id].previewOffset);
      }
      return { ...view, pose: { ...view.pose, joints: expandedPoseJoints } };
    });
  }

  activeViewId = typeof raw.activeViewId === 'string' && raw.activeViewId && views.some(v => v.id === raw.activeViewId) 
    ? raw.activeViewId 
    : (views.length > 0 ? views[0].id : '');

  const bendEnabled = typeof raw.bendEnabled === 'boolean' ? raw.bendEnabled : base.bendEnabled;
  const stretchEnabled = typeof raw.stretchEnabled === 'boolean' ? raw.stretchEnabled : base.stretchEnabled;
  const hardStop = typeof raw.hardStop === 'boolean' ? raw.hardStop : base.hardStop;

  const finalControlMode = forceLegacy3DRigid ? 'Cardboard' : controlMode;
  const finalRigidity = forceLegacy3DRigid ? 'cardboard' : rigidity;
  const finalPhysicsRigidity = forceLegacy3DRigid ? 0 : physicsRigidity;
  const finalBendEnabled = forceLegacy3DRigid ? false : bendEnabled;
  const finalStretchEnabled = forceLegacy3DRigid ? false : stretchEnabled;
  const finalHardStop = forceLegacy3DRigid ? true : hardStop;

  const rawProcgen =
    (raw as any).procgen && typeof (raw as any).procgen === 'object'
      ? ((raw as any).procgen as Record<string, unknown>)
      : null;

  const procgen = (() => {
    const safeMode = (value: unknown) =>
      value === 'walk_in_place' || value === 'run_in_place' || value === 'idle' ? value : null;
    const safeIdlePinnedFeet = (value: unknown) =>
      value === 'left' || value === 'right' || value === 'both' || value === 'none' ? value : null;

    const enabled = typeof rawProcgen?.enabled === 'boolean' ? (rawProcgen.enabled as boolean) : base.procgen.enabled;
    const mode = safeMode(rawProcgen?.mode) ?? base.procgen.mode;
    const strength = isFiniteNumber(rawProcgen?.strength) ? clamp(rawProcgen!.strength as number, 0, 3) : base.procgen.strength;
    const seedRaw = isFiniteNumber(rawProcgen?.seed) ? Math.floor(rawProcgen!.seed as number) : base.procgen.seed;
    const seed = clamp(seedRaw, 1, 0x7fffffff);

    const neutralPose = sanitizePose((rawProcgen as any)?.neutralPose) ?? base.procgen.neutralPose;

    const rawBake = rawProcgen?.bake && typeof rawProcgen.bake === 'object' ? (rawProcgen.bake as any) : null;
    const bakeCycleFrames = isFiniteNumber(rawBake?.cycleFrames)
      ? clamp(Math.floor(rawBake.cycleFrames), 2, 600)
      : base.procgen.bake.cycleFrames;
    const bakeKeyframeStep = isFiniteNumber(rawBake?.keyframeStep)
      ? clamp(Math.floor(rawBake.keyframeStep), 1, 120)
      : base.procgen.bake.keyframeStep;

    const rawOptions =
      rawProcgen?.options && typeof rawProcgen.options === 'object' ? (rawProcgen.options as any) : null;
    const options = {
      inPlace: typeof rawOptions?.inPlace === 'boolean' ? (rawOptions.inPlace as boolean) : base.procgen.options.inPlace,
      groundingEnabled:
        typeof rawOptions?.groundingEnabled === 'boolean'
          ? (rawOptions.groundingEnabled as boolean)
          : base.procgen.options.groundingEnabled,
      pauseWhileDragging:
        typeof rawOptions?.pauseWhileDragging === 'boolean'
          ? (rawOptions.pauseWhileDragging as boolean)
          : base.procgen.options.pauseWhileDragging,
      groundPlaneY: isFiniteNumber(rawOptions?.groundPlaneY)
        ? clamp(rawOptions.groundPlaneY as number, -200, 200)
        : base.procgen.options.groundPlaneY,
      groundPlaneVisible:
        typeof rawOptions?.groundPlaneVisible === 'boolean'
          ? (rawOptions.groundPlaneVisible as boolean)
          : base.procgen.options.groundPlaneVisible,
    };

    const gait = (() => {
      const rawGait = rawProcgen?.gait && typeof rawProcgen.gait === 'object' ? (rawProcgen.gait as any) : {};
      const next: WalkingEngineGait = { ...base.procgen.gait };
      (Object.keys(base.procgen.gait) as (keyof WalkingEngineGait)[]).forEach((key) => {
        const v = rawGait[key];
        if (!isFiniteNumber(v)) return;
        const r = PROCGEN_GAIT_RANGE[key];
        next[key] = clamp(v as number, r.min, r.max);
      });
      return next;
    })();

    const gaitEnabled = (() => {
      const rawGE =
        rawProcgen?.gaitEnabled && typeof rawProcgen.gaitEnabled === 'object' ? (rawProcgen.gaitEnabled as any) : {};
      const out: Partial<Record<keyof WalkingEngineGait, boolean>> = {};
      (Object.keys(base.procgen.gait) as (keyof WalkingEngineGait)[]).forEach((key) => {
        const v = rawGE[key];
        if (typeof v !== 'boolean') return;
        out[key] = v as boolean;
      });
      return out;
    })();

    const physics = (() => {
      const rawPhysics =
        rawProcgen?.physics && typeof rawProcgen.physics === 'object' ? (rawProcgen.physics as any) : null;
      const next: PhysicsControls = { ...base.procgen.physics };
      if (isFiniteNumber(rawPhysics?.jointElasticity)) {
        next.jointElasticity = clamp(rawPhysics.jointElasticity, 0, 1);
      }
      if (isFiniteNumber(rawPhysics?.stabilization)) {
        next.stabilization = clamp(rawPhysics.stabilization, 0, 1);
      }
      return next;
    })();

    const idle = (() => {
      const rawIdle = rawProcgen?.idle && typeof rawProcgen.idle === 'object' ? (rawProcgen.idle as any) : null;
      const next: IdleSettings = { ...base.procgen.idle };
      if (isFiniteNumber(rawIdle?.transitionSpeed)) next.transitionSpeed = clamp(rawIdle.transitionSpeed, 0, 1);
      if (isFiniteNumber(rawIdle?.breathing)) next.breathing = clamp(rawIdle.breathing, 0, 1);
      if (isFiniteNumber(rawIdle?.weightShift)) next.weightShift = clamp(rawIdle.weightShift, 0, 1);
      if (isFiniteNumber(rawIdle?.posture)) next.posture = clamp(rawIdle.posture, -1, 1);
      if (isFiniteNumber(rawIdle?.tension)) next.tension = clamp(rawIdle.tension, 0, 1);
      if (isFiniteNumber(rawIdle?.gazeSway)) next.gazeSway = clamp(rawIdle.gazeSway, 0, 1);
      if (isFiniteNumber(rawIdle?.fidgetFrequency)) next.fidgetFrequency = clamp(rawIdle.fidgetFrequency, 0, 1);
      next.idlePinnedFeet = safeIdlePinnedFeet(rawIdle?.idlePinnedFeet) ?? base.procgen.idle.idlePinnedFeet;
      return next;
    })();

    return {
      enabled,
      mode,
      strength,
      seed,
      neutralPose,
      bake: { cycleFrames: bakeCycleFrames, keyframeStep: bakeKeyframeStep },
      options,
      gait,
      gaitEnabled,
      physics,
      idle,
    };
  })();

  const joints = sanitizeJoints(raw.joints);

  const rawFootPlungerEnabled = (raw as any).footPlungerEnabled;
  const footPlungerEnabled =
    typeof rawFootPlungerEnabled === 'boolean' ? rawFootPlungerEnabled : base.footPlungerEnabled;

  let groundRootTarget = safePointClamped((raw as any).groundRootTarget, base.groundRootTarget, {
    min: -50_000,
    max: 50_000,
  });

  // Migration: older saves used ankle-touchdown as the ground line; newer grounding treats the foot
  // (toe/ankle) as the touchdown. Shift the ground target once so the character doesn't jump on load.
  if (rawFootPlungerEnabled === undefined && (raw as any).groundRootTarget !== undefined) {
    const ankleTouchdownY = computeTouchdownYWorld(joints, INITIAL_JOINTS, 'preview');
    const footTouchdownY = computeFootTouchdownYWorld(joints, INITIAL_JOINTS, 'preview');
    const deltaY = footTouchdownY - ankleTouchdownY;
    if (Number.isFinite(deltaY) && Math.abs(deltaY) > 1e-6) {
      groundRootTarget = { x: groundRootTarget.x, y: clamp(groundRootTarget.y + deltaY, -50_000, 50_000) };
      issues.push({
        severity: 'info',
        title: 'Updated ground line for toe contact',
        detail: 'Migrated groundRootTarget.y to keep the character in place while switching to toe/ankle touchdown grounding.',
        autoFixedFields: ['grounding.groundRootTarget'],
      });
    }
  }

  const sanitizeSheetPalette = (rawPalette: unknown): SheetPalette => {
    const fallback = base.sheetPalette;
    if (!rawPalette || typeof rawPalette !== 'object') return fallback;
    const obj = rawPalette as Partial<SheetPalette>;
    const dims =
      obj.dims && Number.isFinite(obj.dims.width) && Number.isFinite(obj.dims.height)
        ? { width: clamp(obj.dims.width, 1, 8192), height: clamp(obj.dims.height, 1, 8192) }
        : fallback.dims;
    const segments = Array.isArray(obj.segments)
      ? obj.segments
          .filter(
            (seg): seg is SheetSegment =>
              Boolean(seg) &&
              typeof seg === 'object' &&
              typeof seg.id === 'string' &&
              seg.bounds !== undefined &&
              typeof seg.bounds.x === 'number' &&
              typeof seg.bounds.y === 'number' &&
              typeof seg.bounds.width === 'number' &&
              typeof seg.bounds.height === 'number' &&
              Number.isFinite(seg.area) &&
              typeof seg.thumbnail === 'string',
          )
          .map((seg) => ({
            id: seg.id,
            bounds: {
              x: seg.bounds.x,
              y: seg.bounds.y,
              width: Math.max(1, seg.bounds.width),
              height: Math.max(1, seg.bounds.height),
            },
            area: Math.max(1, seg.area),
            thumbnail: seg.thumbnail,
          }))
      : fallback.segments;
    const previewSrc = typeof obj.previewSrc === 'string' && obj.previewSrc.length > 0 ? obj.previewSrc : fallback.previewSrc;

    return {
      sheetId: typeof obj.sheetId === 'string' ? obj.sheetId : fallback.sheetId,
      name: typeof obj.name === 'string' ? obj.name : fallback.name,
      dims,
      segments,
      selectedSegmentId: typeof obj.selectedSegmentId === 'string' ? obj.selectedSegmentId : fallback.selectedSegmentId,
      targetSlotId: typeof obj.targetSlotId === 'string' ? obj.targetSlotId : fallback.targetSlotId,
      previewSrc,
    };
  };

  const state: SkeletonState = {
	    joints,
	    activeModel: (raw as any).activeModel === 'slenderbit' ? 'slenderbit' : 'humanoid',
	    mirroring: typeof raw.mirroring === 'boolean' ? raw.mirroring : base.mirroring,
	    bendEnabled: finalBendEnabled,
	    stretchEnabled: finalStretchEnabled,
	    leadEnabled: typeof raw.leadEnabled === 'boolean' ? raw.leadEnabled : base.leadEnabled,
      clavicleConstraintEnabled:
        typeof (raw as any).clavicleConstraintEnabled === 'boolean'
          ? (raw as any).clavicleConstraintEnabled
          : base.clavicleConstraintEnabled,
	    hardStop: finalHardStop,
      shapeshiftingEnabled:
        typeof (raw as any).shapeshiftingEnabled === 'boolean'
          ? (raw as any).shapeshiftingEnabled
          : base.shapeshiftingEnabled,
      torsoDiamond,
      torsoNavelScale: isFiniteNumber((raw as any).torsoNavelScale)
        ? clamp((raw as any).torsoNavelScale as number, 0.5, 2.0)
        : base.torsoNavelScale,
	    physicsRigidity: finalPhysicsRigidity,
	    activeRoots,
	    deactivatedJoints: raw.deactivatedJoints instanceof Set ? raw.deactivatedJoints : base.deactivatedJoints,
	    groundRootTarget,
    footPlungerEnabled,
    showJoints: typeof raw.showJoints === 'boolean' ? raw.showJoints : base.showJoints,
    jointsOverMasks: typeof raw.jointsOverMasks === 'boolean' ? raw.jointsOverMasks : base.jointsOverMasks,
    lookMode,
    armViewMode,
    controlMode: finalControlMode,
    rigidity: finalRigidity,
    snappiness,
    ikSensitivity,
    procgen,
    timeline: {
      enabled: typeof rawTimeline?.enabled === 'boolean' ? rawTimeline.enabled : base.timeline.enabled,
      clip: {
        frameCount,
        fps,
        easing,
        keyframes,
      },
      onionSkin: {
        enabled: typeof rawOnion?.enabled === 'boolean' ? (rawOnion.enabled as boolean) : base.timeline.onionSkin.enabled,
        past: isFiniteNumber(rawOnion?.past) ? clamp(Math.floor(rawOnion!.past as number), 0, 12) : base.timeline.onionSkin.past,
        future: isFiniteNumber(rawOnion?.future) ? clamp(Math.floor(rawOnion!.future as number), 0, 12) : base.timeline.onionSkin.future,
      },
    },
    scene: {
      background: sanitizeReferenceLayer(rawScene?.background, base.scene.background),
      foreground: sanitizeReferenceLayer(rawScene?.foreground, base.scene.foreground),
      headMask: sanitizeHeadMask(rawScene?.headMask, base.scene.headMask),
      jointMasks,
      textOverlays,
    },
    assets,
    cutoutSlots,
    sheetPalette: sanitizeSheetPalette((raw as any).sheetPalette ?? base.sheetPalette),
    cutoutRig,
    views,
    activeViewId,
    boneStyle: sanitizeBoneStyle((raw as any).boneStyle, base.boneStyle),
    hipLock,
    collarLock,
    balancedNeck,
    connectionOverrides: sanitizeConnectionOverrides((raw as any).connectionOverrides),
    cutoutEditor: (raw as any).cutoutEditor ?? base.cutoutEditor,
    cutoutSheets: (raw as any).cutoutSheets ?? base.cutoutSheets,
    viewScale,
    viewOffset,
  };
  return { state, issues };
};

export const sanitizeState = (rawState: unknown): SkeletonState => {
  return sanitizeStateWithReport(rawState).state;
};
