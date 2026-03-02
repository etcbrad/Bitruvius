import { viewModes, type ViewModeId } from '../viewModes';
import { clamp } from '../utils';
import { INITIAL_JOINTS } from './model';
import { createDefaultCutoutSlots } from './cutouts';
import type { ControlMode, Joint, JointMask, Point, SkeletonState, ReferenceLayer, HeadMask, TextOverlay, CutoutAsset, CutoutSlot, ViewPreset } from './types';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const safeNumber = (value: unknown, fallback = 0) => (isFiniteNumber(value) ? value : fallback);

const safePoint = (value: unknown, fallback: Point): Point => {
  if (!value || typeof value !== 'object') return { ...fallback };
  const v = value as { x?: unknown; y?: unknown };
  return { x: safeNumber(v.x, fallback.x), y: safeNumber(v.y, fallback.y) };
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
  return {
    src: typeof mask.src === 'string' ? mask.src : base.src,
    visible: typeof mask.visible === 'boolean' ? mask.visible : base.visible,
    opacity: isFiniteNumber(mask.opacity) ? clamp(mask.opacity, 0, 1) : base.opacity,
    scale: isFiniteNumber(mask.scale) ? clamp(mask.scale, 0.01, 20) : base.scale,
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
  const mediaType = layer.mediaType === 'video' || layer.mediaType === 'image' ? layer.mediaType : base.mediaType;
  
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
    });
  }
  return out;
};

const sanitizeHeadMask = (raw: unknown, base: HeadMask): HeadMask => {
  if (!raw || typeof raw !== 'object') return base;
  const mask = raw as Partial<HeadMask>;
  const mode = mask.mode === 'cutout' || mask.mode === 'rubberhose' || mask.mode === 'roto' ? mask.mode : base.mode;
  
  return {
    src: typeof mask.src === 'string' ? mask.src : base.src,
    visible: typeof mask.visible === 'boolean' ? mask.visible : base.visible,
    opacity: isFiniteNumber(mask.opacity) ? clamp(mask.opacity, 0, 1) : base.opacity,
    scale: isFiniteNumber(mask.scale) ? clamp(mask.scale, 0.01, 20) : base.scale,
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
  };
};

const VIEW_MODE_ID_SET = new Set<ViewModeId>(viewModes.map((m) => m.id));
const CONTROL_MODE_SET = new Set<ControlMode>(['FK', 'IK', 'Hybrid', 'JointDrag']);

export const sanitizeJoints = (rawJoints: unknown): Record<string, Joint> => {
  const raw = rawJoints && typeof rawJoints === 'object' ? (rawJoints as Record<string, Partial<Joint>>) : {};
  const next: Record<string, Joint> = {};
  for (const id of Object.keys(INITIAL_JOINTS)) {
    const base = INITIAL_JOINTS[id];
    const saved = raw[id] as Partial<Joint> | undefined;
    next[id] = {
      ...base,
      currentOffset: safePoint(saved?.currentOffset, base.currentOffset),
      targetOffset: safePoint(saved?.targetOffset, base.targetOffset),
      previewOffset: safePoint(saved?.previewOffset ?? saved?.targetOffset, base.previewOffset),
    };
  }
  return next;
};

export const makeDefaultState = (): SkeletonState => {
  const joints = sanitizeJoints(null);
  const defaultSlots = createDefaultCutoutSlots();
  
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
    mirroring: true,
    bendEnabled: false, // Disable bending for pure rigid FK
    stretchEnabled: false, // Ensure stretching is disabled by default
    leadEnabled: true,
    hardStop: true, // Enable hard stops for rigid joint limits
    activePins: ['navel'],
    showJoints: true,
    jointsOverMasks: false,
    viewMode: '2D',
    controlMode: 'FK', // Default to FK mode for rigid behavior
    rigidity: 'cardboard', // Most rigid setting by default
    physicsMode: '2D',
    snappiness: 1.0, // Maximum snappiness for crisp rigid movement
    viewScale: 1.0,
    viewOffset: { x: 0, y: 0 },
    timeline: {
      enabled: false,
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
      },
      jointMasks: makeDefaultJointMasks(),
      textOverlays: [],
    },
    assets: {},
    cutoutSlots: defaultSlots,
    views: defaultViews,
    activeViewId: 'front',
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
        fromJointId: 'neck_base',
        toJointId: 'head',
      },
      assetId,
      visible: headMask.visible ?? false,
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
          visible: jointMask.visible ?? false,
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

export const sanitizeState = (rawState: unknown): SkeletonState => {
  const base = makeDefaultState();
  if (!rawState || typeof rawState !== 'object') return base;
  const raw = rawState as Partial<SkeletonState> & { [key: string]: unknown };

  const viewMode =
    typeof raw.viewMode === 'string' && VIEW_MODE_ID_SET.has(raw.viewMode as ViewModeId)
      ? (raw.viewMode as ViewModeId)
      : base.viewMode;

  const controlMode =
    typeof raw.controlMode === 'string' && CONTROL_MODE_SET.has(raw.controlMode as ControlMode)
      ? (raw.controlMode as ControlMode)
      : base.controlMode;

  const snappiness = isFiniteNumber(raw.snappiness) ? clamp(raw.snappiness, 0.05, 1.0) : base.snappiness;
  const viewScale = isFiniteNumber(raw.viewScale) ? clamp(raw.viewScale, 0.1, 10.0) : base.viewScale;
  const viewOffset = safePoint(raw.viewOffset, base.viewOffset);
  const rigidity = (raw.rigidity === 'cardboard' || raw.rigidity === 'rubberhose' || raw.rigidity === 'realistic') ? raw.rigidity : base.rigidity;
  const physicsMode = (raw.physicsMode === '2D' || raw.physicsMode === '3D') ? raw.physicsMode : base.physicsMode;

  const activePins = Array.isArray(raw.activePins)
    ? Array.from(
        new Set(raw.activePins.filter((id): id is string => typeof id === 'string' && id in INITIAL_JOINTS))
      )
    : base.activePins;

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

  // Sanitize views
  if (Array.isArray(raw.views)) {
    views = raw.views.filter((view): view is ViewPreset => {
      return view && typeof view === 'object' && 
             typeof view.id === 'string' && 
             typeof view.name === 'string' &&
             view.pose && typeof view.pose === 'object' &&
             view.pose.joints && typeof view.pose.joints === 'object';
    });
  }

  activeViewId = typeof raw.activeViewId === 'string' && raw.activeViewId && views.some(v => v.id === raw.activeViewId) 
    ? raw.activeViewId 
    : (views.length > 0 ? views[0].id : '');

  return {
    joints: sanitizeJoints(raw.joints),
    mirroring: typeof raw.mirroring === 'boolean' ? raw.mirroring : base.mirroring,
    bendEnabled: typeof raw.bendEnabled === 'boolean' ? raw.bendEnabled : base.bendEnabled,
    stretchEnabled: typeof raw.stretchEnabled === 'boolean' ? raw.stretchEnabled : base.stretchEnabled,
    leadEnabled: typeof raw.leadEnabled === 'boolean' ? raw.leadEnabled : base.leadEnabled,
    hardStop: typeof raw.hardStop === 'boolean' ? raw.hardStop : base.hardStop,
    activePins,
    showJoints: typeof raw.showJoints === 'boolean' ? raw.showJoints : base.showJoints,
    jointsOverMasks: typeof raw.jointsOverMasks === 'boolean' ? raw.jointsOverMasks : base.jointsOverMasks,
    viewMode,
    controlMode,
    rigidity,
    physicsMode,
    snappiness,
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
    views,
    activeViewId,
    viewScale,
    viewOffset,
  };
};
