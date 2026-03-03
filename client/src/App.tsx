import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Slider } from "@/components/ui/slider";
import { SystemGrid } from "@/components/SystemGrid";
import JSZip from 'jszip';
import { 
  Activity, 
  RotateCcw, 
  RotateCw,
  Maximize2, 
  Move, 
  Download,
  Upload,
  Anchor,
  Layers,
  Settings2,
  ChevronRight,
  ChevronLeft,
  Trash2,
  Terminal,
  Minus,
  X,
  Grid,
  Sparkles,
  Power,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import { EnginePoseSnapshot, Joint, Point, SkeletonState, ControlMode, Connection } from './engine/types';
import { LOOK_MODES, type LookModeId } from './engine/lookModes';
import { throttle, normA, d2r, r2d, clamp, lerp } from './utils';
import { applyBalanceDragToState, applyDragToState } from './engine/interaction';
import { fromAngleDeg, getWorldPosition, getWorldPositionFromOffsets, toAngleDeg, vectorLength } from './engine/kinematics';
import { HistoryController } from './engine/history';
import { deserializeEngineState, serializeEngineState } from './engine/serialization';
import { downloadSvg } from './engine/export/svg';
import { downloadPngFromSvg } from './engine/export/png';
import { exportAsWebm } from './engine/export/video';
import { applyPoseSnapshotToJoints, capturePoseSnapshot, sampleClipPose } from './engine/timeline';
import {
  bakeRecordingIntoTimeline,
  buildRecordingFrames,
  detectMovedJointIds,
  simplifyRecordingFrames,
  type DragRecordingSession,
} from './engine/autoPoseCapture';
import { makeDefaultState, sanitizeStateWithReport, sanitizeJoints } from './engine/settings';
import { CONNECTIONS, INITIAL_JOINTS } from './engine/model';
import { applyGroundRootCorrectionToJoints, computeCogWorld } from './engine/rooting';
import { shouldRunPosePhysics, stepPosePhysics } from './engine/physics/posePhysics';
import { bakeProcgenLoop, createProcgenRuntime, resetProcgenRuntime, stepProcgenPose, type ProcgenRuntime } from './engine/procedural';
import { applyPhysicsMode, getPhysicsBlendMode, createRigidStartPoint } from './engine/physics-config';
import { reconcileSkeletonState } from './engine/reconcileSkeletonState';
import { syncLegacyMasksToCutouts } from './engine/legacyMaskSync';
import { createViewPreset, deleteView, getActiveView, switchToView, updateViewFromCurrentState } from './engine/views';
import { TransitionWarningDialog, getTransitionWarningsDisabled } from './components/TransitionWarningDialog';
import {
  ViewSwitchDialog,
  getViewSwitchDefaultChoice,
  getViewSwitchPromptDisabled,
  type ViewSwitchChoice,
} from './components/ViewSwitchDialog';
import { AtomicUnitsControl } from './components/AtomicUnitsControl';
import { HelpTip } from './components/HelpTip';
import { ProcgenWidget } from './components/ProcgenWidget';
import { RotationWheelControl } from '@/components/RotationWheelControl';
import { JointMaskWidget, type MaskDragMode } from '@/components/JointMaskWidget';
import { CutoutRelationshipVisualizer } from '@/components/CutoutRelationshipVisualizer';
import type { TransitionIssue } from '@/lib/transitionIssues';

const LOCAL_STORAGE_KEY = 'bitruvius_state';
const IMAGE_CACHE_KEY = 'bitruvius_image_cache';
const BACKGROUND_COLOR_KEY = 'bitruvius_background_color';
const POSE_TRACE_KEY = 'bitruvius_pose_trace_enabled';
const BUILD_ID = 'Bitruvius';
const DND_WIDGET_MIME = 'text/bitruvius-widget';

const BONE_PALETTE = {
  violet: '#2b0057',
  magenta: '#ff2bbd',
} as const;

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const h = hex.trim().replace(/^#/, '');
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return null;
  return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number): string => {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
};

const mixHex = (a: string, b: string, t: number): string => {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return a;
  const tt = clamp(t, 0, 1);
  return rgbToHex(
    lerp(ra.r, rb.r, tt),
    lerp(ra.g, rb.g, tt),
    lerp(ra.b, rb.b, tt),
  );
};

const applyLightness = (hex: string, lightness: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const l = clamp(lightness, -1, 1);
  const target = l >= 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  const t = Math.abs(l);
  return rgbToHex(
    lerp(rgb.r, target.r, t),
    lerp(rgb.g, target.g, t),
    lerp(rgb.b, target.b, t),
  );
};

const rgbCss = (hex: string, alpha = 1): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const a = clamp(alpha, 0, 1);
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${a})`;
};

const getBoneHex = (boneStyle: SkeletonState['boneStyle'] | null | undefined): string => {
  const hueT = clamp(boneStyle?.hueT ?? 0, 0, 1);
  const lightness = clamp(boneStyle?.lightness ?? 0, -1, 1);
  return applyLightness(mixHex(BONE_PALETTE.violet, BONE_PALETTE.magenta, hueT), lightness);
};

type ReferenceVideoMeta = { duration: number; width: number; height: number };
type ReferenceSequenceKind = 'gif' | 'zip';
type ReferenceSequenceData = {
  id: string;
  kind: ReferenceSequenceKind;
  frames: any[];
  width: number;
  height: number;
  fps: number;
};

const fitModeToObjectFit = (fitMode: string): React.CSSProperties['objectFit'] => {
  if (fitMode === 'cover') return 'cover';
  if (fitMode === 'fill') return 'fill';
  if (fitMode === 'none') return 'none';
  return 'contain';
};

const drawWithFitMode = (
  ctx: CanvasRenderingContext2D,
  source: any,
  destW: number,
  destH: number,
  fitMode: string,
) => {
  const sw = Number(source?.videoWidth || source?.naturalWidth || source?.displayWidth || source?.codedWidth || source?.width || 0) || 0;
  const sh = Number(source?.videoHeight || source?.naturalHeight || source?.displayHeight || source?.codedHeight || source?.height || 0) || 0;
  if (!sw || !sh || !destW || !destH) return;

  ctx.clearRect(0, 0, destW, destH);

  if (fitMode === 'fill') {
    ctx.drawImage(source, 0, 0, destW, destH);
    return;
  }

  if (fitMode === 'none') {
    ctx.drawImage(source, 0, 0, sw, sh);
    return;
  }

  const scale = fitMode === 'cover' ? Math.max(destW / sw, destH / sh) : Math.min(destW / sw, destH / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (destW - dw) / 2;
  const dy = (destH - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
};

const setVideoTimeSafe = (video: HTMLVideoElement, desiredTime: number) => {
  if (!Number.isFinite(desiredTime)) return;
  const duration = Number.isFinite(video.duration) ? video.duration : null;
  const safeTime = duration !== null ? clamp(desiredTime, 0, Math.max(0, duration - 0.001)) : Math.max(0, desiredTime);
  try {
    if (Math.abs((video.currentTime || 0) - safeTime) > 1 / 240) {
      video.currentTime = safeTime;
    }
  } catch {
    // Seeking can fail if metadata isn't loaded yet; ignore and retry on next effect/event.
  }
};

const SyncedReferenceVideo = React.forwardRef<
  HTMLVideoElement,
  {
    src: string;
    desiredTime: number;
    playing: boolean;
    playbackRate: number;
    objectFit: React.CSSProperties['objectFit'];
    onMeta?: (meta: ReferenceVideoMeta) => void;
  }
>(({ src, desiredTime, playing, playbackRate, objectFit, onMeta }, ref) => {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const lastDesiredRef = useRef<number>(Number.NaN);

  React.useImperativeHandle(ref, () => innerRef.current as HTMLVideoElement);

  useEffect(() => {
    const video = innerRef.current;
    if (!video) return;
    video.playbackRate = Number.isFinite(playbackRate) ? playbackRate : 1;
  }, [playbackRate]);

  useEffect(() => {
    const video = innerRef.current;
    if (!video) return;

    if (!playing) {
      video.pause();
      setVideoTimeSafe(video, desiredTime);
      lastDesiredRef.current = desiredTime;
      return;
    }

    // When entering play, align start time then allow natural playback.
    const drift = Math.abs((video.currentTime || 0) - desiredTime);
    const jumped = !Number.isFinite(lastDesiredRef.current) || Math.abs(lastDesiredRef.current - desiredTime) > 0.25;
    if (jumped || drift > 0.15) setVideoTimeSafe(video, desiredTime);
    lastDesiredRef.current = desiredTime;

    const p = video.play();
    if (p && typeof (p as Promise<void>).catch === 'function') {
      (p as Promise<void>).catch(() => {
        // Autoplay policies / decode hiccups; ignore.
      });
    }
  }, [desiredTime, playing]);

  return (
    <video
      ref={innerRef}
      src={src}
      muted
      playsInline
      preload="auto"
      onLoadedMetadata={(e) => {
        const video = e.currentTarget;
        onMeta?.({
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          width: video.videoWidth || 0,
          height: video.videoHeight || 0,
        });
        setVideoTimeSafe(video, desiredTime);
      }}
      style={{
        width: '100%',
        height: '100%',
        objectFit,
      }}
    />
	  );
	});

const SyncedReferenceSequenceCanvas = ({
  sequence,
  desiredTime,
  playing,
  fitMode,
}: {
  sequence: ReferenceSequenceData | null;
  desiredTime: number;
  playing: boolean;
  fitMode: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!sequence || !sequence.frames.length) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const frameCount = sequence.frames.length;
    const fps = Math.max(1, Math.floor(sequence.fps || 24));
    const t = Math.max(0, desiredTime);
    const rawIndex = Math.floor(t * fps);
    const frameIndex = sequence.kind === 'gif' ? ((rawIndex % frameCount) + frameCount) % frameCount : clamp(rawIndex, 0, frameCount - 1);
    const frame = sequence.frames[frameIndex];
    if (!frame) return;

    drawWithFitMode(ctx, frame, canvas.width, canvas.height, fitMode);

    if (playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        // Trigger a re-draw during play so changes in desiredTime are reflected smoothly.
        // The actual desiredTime is driven by React state; this is a cheap fallback.
        drawWithFitMode(ctx, frame, canvas.width, canvas.height, fitMode);
      });
    }
  }, [desiredTime, fitMode, playing, sequence]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

// Image cache utilities for persisting uploads
const convertBlobUrlToBase64 = async (blobUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Failed to convert blob URL to base64:', error);
    return null;
  }
};

const cacheImageFromUrl = async (url: string, cacheKey: string): Promise<void> => {
  if (!url || !url.startsWith('blob:')) return;
  
  try {
    const base64 = await convertBlobUrlToBase64(url);
    if (base64) {
      const cache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}');
      cache[cacheKey] = base64;
      localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (error) {
    console.warn('Failed to cache image:', error);
  }
};

const restoreImageFromCache = (cacheKey: string): string | null => {
  try {
    const cache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}');
    const base64 = cache[cacheKey];
    return base64 || null;
  } catch (error) {
    console.warn('Failed to restore image from cache:', error);
    return null;
  }
};

// Clean up old cache entries to prevent localStorage bloat
const cleanupImageCache = () => {
  try {
    const cache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}');
    const currentCacheKeys = new Set([
      'background',
      'foreground', 
      'head_mask',
      ...Object.keys(INITIAL_JOINTS).map(id => `joint_mask_${id}`)
    ]);
    
    // Remove entries that are no longer needed
    let hasChanges = false;
    for (const key of Object.keys(cache)) {
      if (!currentCacheKeys.has(key)) {
        delete cache[key];
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (error) {
    console.warn('Failed to cleanup image cache:', error);
  }
};

type SidebarTab = 'character' | 'physics' | 'animation' | 'global';

type WidgetId =
  | 'tools'
  | 'edit'
  | 'joint_hierarchy'
  | 'joint_masks'
  | 'cutout_relationships'
  | 'bone_inspector'
  | 'rig_controls'
  | 'responsiveness'
  | 'atomic_units'
  | 'animation'
  | 'procgen'
  | 'camera'
  | 'look'
  | 'views'
  | 'pixel_fonts'
  | 'background'
  | 'scene'
  | 'project'
  | 'export'
  | 'pose_capture'
  | 'console';

type WidgetMode = 'docked' | 'floating';

type FloatingWidget = {
  id: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
};

const isWidgetId = (value: unknown): value is WidgetId => {
  return (
    value === 'tools' ||
    value === 'edit' ||
    value === 'joint_hierarchy' ||
    value === 'joint_masks' ||
    value === 'cutout_relationships' ||
    value === 'bone_inspector' ||
    value === 'rig_controls' ||
    value === 'responsiveness' ||
    value === 'atomic_units' ||
    value === 'animation' ||
    value === 'procgen' ||
    value === 'camera' ||
    value === 'look' ||
    value === 'views' ||
    value === 'pixel_fonts' ||
    value === 'background' ||
    value === 'scene' ||
    value === 'project' ||
    value === 'export' ||
    value === 'pose_capture' ||
    value === 'console'
  );
};

const WIDGETS: Record<
  WidgetId,
  {
    title: string;
    tabGroup: SidebarTab | null;
    isGlobal: boolean;
    docs: React.ReactNode;
    defaultFloatSize: { w: number; h: number };
    minFloatSize: { w: number; h: number };
  }
> = {
  tools: {
    title: 'Tools',
    tabGroup: 'character',
    isGlobal: false,
    docs: (
      <div className="space-y-2">
        <div className="text-[11px] text-[#ddd]">
          Widgets live in the side console by default to keep the canvas clean.
        </div>
        <ul className="list-disc pl-4 text-[11px] text-[#bbb] space-y-1">
          <li>Click a widget to activate it here.</li>
          <li>Drag a widget onto the canvas to pop it out.</li>
          <li>Drag a widget back onto the sidebar to dock it.</li>
        </ul>
      </div>
    ),
    defaultFloatSize: { w: 360, h: 240 },
    minFloatSize: { w: 260, h: 160 },
  },
  edit: {
    title: 'Edit',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Undo/redo and editor utilities.</div>,
    defaultFloatSize: { w: 360, h: 190 },
    minFloatSize: { w: 260, h: 160 },
  },
  joint_hierarchy: {
    title: 'Joint Hierarchy',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Quick navigation through joints and bones.</div>,
    defaultFloatSize: { w: 360, h: 540 },
    minFloatSize: { w: 280, h: 240 },
  },
  joint_masks: {
    title: 'Masks',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Edit cutout masks and masking behavior.</div>,
    defaultFloatSize: { w: 360, h: 420 },
    minFloatSize: { w: 280, h: 240 },
  },
  cutout_relationships: {
    title: 'Cutout Relationships',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Visualize and debug cutout overlaps and ordering.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 320, h: 240 },
  },
  bone_inspector: {
    title: 'Rig Inspector',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Inspect bones, joints, and stretch behavior.</div>,
    defaultFloatSize: { w: 360, h: 300 },
    minFloatSize: { w: 300, h: 200 },
  },
  rig_controls: {
    title: 'Rig Controls',
    tabGroup: 'physics',
    isGlobal: false,
    docs: (
      <div className="space-y-2 text-[11px] text-[#bbb]">
        <div>
          Use <span className="font-bold text-white">Rigidity</span> to choose how stiff the rig behaves overall.
        </div>
        <div>
          <span className="font-bold text-white">Control mode</span> changes how dragging works (rigid vs elastic vs pinned posing).
        </div>
      </div>
    ),
    defaultFloatSize: { w: 420, h: 520 },
    minFloatSize: { w: 320, h: 260 },
  },
  responsiveness: {
    title: 'Responsiveness',
    tabGroup: 'physics',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Fine-tune smoothing, damping, and feel.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 320, h: 240 },
  },
  atomic_units: {
    title: 'Advanced Controls',
    tabGroup: 'physics',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Low-level rig settings and debugging utilities.</div>,
    defaultFloatSize: { w: 420, h: 560 },
    minFloatSize: { w: 320, h: 260 },
  },
  animation: {
    title: 'Animation',
    tabGroup: 'animation',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Timeline and keyframe tools.</div>,
    defaultFloatSize: { w: 420, h: 340 },
    minFloatSize: { w: 320, h: 240 },
  },
  procgen: {
    title: 'Auto Motion',
    tabGroup: 'animation',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Procedural motion and loop baking.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 320, h: 240 },
  },
  camera: {
    title: 'Camera',
    tabGroup: 'animation',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Viewport and export framing controls.</div>,
    defaultFloatSize: { w: 320, h: 220 },
    minFloatSize: { w: 260, h: 180 },
  },
  look: {
    title: 'Look',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Display style and look presets.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 320, h: 240 },
  },
  views: {
    title: 'Views',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Save and switch camera / view presets.</div>,
    defaultFloatSize: { w: 420, h: 520 },
    minFloatSize: { w: 320, h: 260 },
  },
  pixel_fonts: {
    title: 'Pixel Fonts',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Choose the UI title font style.</div>,
    defaultFloatSize: { w: 420, h: 260 },
    minFloatSize: { w: 320, h: 220 },
  },
  background: {
    title: 'Background',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Canvas background color and defaults.</div>,
    defaultFloatSize: { w: 420, h: 320 },
    minFloatSize: { w: 320, h: 240 },
  },
  scene: {
    title: 'Scene',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Reference layers, titles, and scene overlays.</div>,
    defaultFloatSize: { w: 520, h: 640 },
    minFloatSize: { w: 360, h: 280 },
  },
  project: {
    title: 'Project',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Save and open project files.</div>,
    defaultFloatSize: { w: 420, h: 260 },
    minFloatSize: { w: 320, h: 220 },
  },
  export: {
    title: 'Export',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Export SVG/PNG/WebM outputs.</div>,
    defaultFloatSize: { w: 420, h: 280 },
    minFloatSize: { w: 320, h: 220 },
  },
  pose_capture: {
    title: 'Pose Capture',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Capture pose snapshots and bake recordings.</div>,
    defaultFloatSize: { w: 520, h: 560 },
    minFloatSize: { w: 360, h: 260 },
  },
  console: {
    title: 'Console',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Engine and workflow logs.</div>,
    defaultFloatSize: { w: 520, h: 340 },
    minFloatSize: { w: 340, h: 220 },
  },
};

const WIDGET_TAB_ORDER: Record<SidebarTab, WidgetId[]> = {
  character: ['tools', 'edit', 'joint_hierarchy', 'joint_masks', 'cutout_relationships', 'bone_inspector'],
  physics: ['rig_controls', 'responsiveness', 'atomic_units'],
  animation: ['animation', 'procgen', 'camera'],
  global: [],
};

const WIDGET_GLOBAL_ORDER: WidgetId[] = [
  'look',
  'views',
  'pixel_fonts',
  'background',
  'scene',
  'project',
  'export',
  'pose_capture',
  'console',
];

WIDGET_TAB_ORDER.global = WIDGET_GLOBAL_ORDER;

type RigTrack = 'body' | 'arms';
type RigSide = 'front' | 'back'; // front=right, back=left
type RigStage = 'joint' | 'bone' | 'mask';

type RigFocus = {
  track: RigTrack;
  index: number;
  side: RigSide;
  stage: RigStage;
};

const canonicalConnKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

type ConsoleLogLevel = 'info' | 'warning' | 'error' | 'success';

type ConsoleLogEntry = {
  id: string;
  ts: number;
  level: ConsoleLogLevel;
  message: string;
  data?: unknown;
};

type GridRingsBackgroundData = {
  schema: string;
  vitruvian: {
    plot: {
      bounds: { minX: number; maxX: number; minY: number; maxY: number };
      lines: Array<{ kind: 'line'; family: string; key: string; x1: number; y1: number; x2: number; y2: number }>;
      circles: Array<{ kind: 'circle'; family: string; key: string; cx: number; cy: number; r: number }>;
    };
  };
  background?: {
    defaultMode?: { kind: 'solid'; fillStyle: string };
    lotteMode?: { kind: string };
  };
};

type GridOverlayTransform = {
  characterCenterX: number;
  characterCenterY: number;
  pxPerUnit: number;
  headLenPx: number;
  fingerLenPx: number;
  vmin: number;
};

export default function App() {
  const initialSanitizeIssuesRef = useRef<TransitionIssue[] | null>(null);

  const [state, setState] = useState<SkeletonState>(() => {
    // Clear any saved state to start with clean T-pose
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (error) {
      // Ignore storage errors
    }
    return makeDefaultState();
  });

  useEffect(() => {
    console.log(`[bitruvius] build=${BUILD_ID}`);
    cleanupImageCache(); // Clean up old cache entries
  }, []);

  const activeRootsKey = state.activeRoots.join('|');
  useEffect(() => {
    const active = new Set(state.activeRoots);
    const next = { ...pinTargetsRef.current };
    let changed = false;

    for (const id of state.activeRoots) {
      if (!next[id]) {
        next[id] = getWorldPosition(id, state.joints, INITIAL_JOINTS, 'preview');
        changed = true;
      }
    }

    for (const id of Object.keys(next)) {
      if (!active.has(id)) {
        delete next[id];
        changed = true;
      }
    }

    if (changed) pinTargetsRef.current = next;
  }, [activeRootsKey]);

  useEffect(() => {
    if (shouldRunPosePhysics(state)) return;
    dragTargetRef.current = null;
    hingeSignsRef.current = {};
  }, [state.controlMode, state.stretchEnabled, state.bendEnabled]);

  const historyCtrlRef = useRef(new HistoryController<SkeletonState>({ limit: 120 }));
  const canUndo = historyCtrlRef.current.canUndo();
  const canRedo = historyCtrlRef.current.canRedo();

  type PoseSnapshot = Omit<SkeletonState, 'timeline'> & { timestamp?: number };
  const [poseSnapshots, setPoseSnapshots] = useState<PoseSnapshot[]>([]);
  const [selectedPoseIndices, setSelectedPoseIndices] = useState<number[]>([]);

  const [autoPoseCaptureEnabled, setAutoPoseCaptureEnabled] = useState(false);
  const [autoPoseCaptureFps, setAutoPoseCaptureFps] = useState(24);
  const [autoPoseCaptureOverlayWeight, setAutoPoseCaptureOverlayWeight] = useState(0.5);
  const [autoPoseCaptureMovedThreshold, setAutoPoseCaptureMovedThreshold] = useState(0.002);
  const [autoPoseCaptureMaxFrames, setAutoPoseCaptureMaxFrames] = useState(120);
  const [autoPoseCaptureSimplifyEnabled, setAutoPoseCaptureSimplifyEnabled] = useState(true);
  const [autoPoseCaptureSimplifyEpsilon, setAutoPoseCaptureSimplifyEpsilon] = useState(0.001);

  const autoPoseRecordingRef = useRef<DragRecordingSession | null>(null);
  const autoPoseRecordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (autoPoseRecordingTimerRef.current) {
        clearInterval(autoPoseRecordingTimerRef.current);
        autoPoseRecordingTimerRef.current = null;
      }
      autoPoseRecordingRef.current = null;
    };
  }, []);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingIdLiveRef = useRef<string | null>(null);
  const effectiveDraggingIdLiveRef = useRef<string | null>(null);
  const [groundRootDragging, setGroundRootDragging] = useState(false);
  const groundRootDraggingLiveRef = useRef(false);
  const [rootLeverDraggingId, setRootLeverDraggingId] = useState<string | null>(null);
  const rootLeverDraggingLiveRef = useRef<string | null>(null);
  const rootDragKindLiveRef = useRef<'none' | 'root_target' | 'root_lever'>('none');
  const pinWorldRef = useRef<Record<string, Point> | null>(null);
  const dragTargetRef = useRef<{ id: string; target: Point } | null>(null);
  const pinTargetsRef = useRef<Record<string, Point>>({});
  const hingeSignsRef = useRef<Record<string, number>>({});
  const rubberbandAnchorPinRef = useRef<{ id: string; target: Point } | null>(null);
  const physicsHandshakeRef = useRef<{ key: string; blend: number }>({ key: '', blend: 1 });
  
  // Rubberband mode state
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const [rubberbandPose, setRubberbandPose] = useState<SkeletonState | null>(null);
  const dragStartTimeRef = useRef<number>(0);
  const [maskEditArmed, setMaskEditArmed] = useState(false);
  const [maskDragMode, setMaskDragMode] = useState<MaskDragMode>('move');
  const [maskDragging, setMaskDragging] = useState<null | {
    jointId: string;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
    startRotation: number;
    startScale: number;
    startStretchX: number;
    startStretchY: number;
    startSkewX: number;
    startSkewY: number;
    startAnchorX: number;
    startAnchorY: number;
    mode: MaskDragMode;
  }>(null);
  const maskDraggingLiveRef = useRef(false);
  const [groundPlaneDragging, setGroundPlaneDragging] = useState<null | {
    startMouseWorldY: number;
    startPlaneY: number;
  }>(null);
  const groundPlaneDraggingLiveRef = useRef(false);
  const [maskJointId, setMaskJointId] = useState<string>(() => (INITIAL_JOINTS.navel ? 'navel' : (Object.keys(INITIAL_JOINTS).find((id) => id !== 'root') ?? 'navel')));
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [selectedConnectionKey, setSelectedConnectionKey] = useState<string | null>(null);
  const [rigFocus, setRigFocus] = useState<RigFocus>({ track: 'body', index: 0, side: 'front', stage: 'joint' });
  const [timelineFrame, setTimelineFrame] = useState(0);
  const timelineFrameRef = useRef(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const timelinePinTargetsRef = useRef<Record<string, Point> | null>(null);
  const timelinePinTargetsKeyRef = useRef<string>('');
  const procgenRuntimeRef = useRef<ProcgenRuntime | null>(null);
  const procgenNeutralFallbackRef = useRef<EnginePoseSnapshot | null>(null);
  const [poseTracingEnabled, setPoseTracingEnabled] = useState(() => localStorage.getItem(POSE_TRACE_KEY) === '1');
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const fgVideoRef = useRef<HTMLVideoElement | null>(null);
  const [bgVideoMeta, setBgVideoMeta] = useState<ReferenceVideoMeta | null>(null);
  const [fgVideoMeta, setFgVideoMeta] = useState<ReferenceVideoMeta | null>(null);
  const referenceSequencesRef = useRef<Map<string, ReferenceSequenceData>>(new Map());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('character');
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorHudRef = useRef<HTMLDivElement | null>(null);
  const cursorReticleRef = useRef<HTMLDivElement | null>(null);
  const cursorLabelRef = useRef<HTMLDivElement | null>(null);
  const cursorTargetRef = useRef<HTMLDivElement | null>(null);
  const precisionAnchorRef = useRef<null | { raw: Point; applied: Point }>(null);
  const lastEffectiveMouseWorldRef = useRef<Point | null>(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [gridRingsBgData, setGridRingsBgData] = useState<GridRingsBackgroundData | null>(null);
          const [gridRingsEnabled, setGridRingsEnabled] = useState(true);
          const [gridOverlayEnabled, setGridOverlayEnabled] = useState(true);
          const [backlightEnabled, setBacklightEnabled] = useState(false);
          const [debugOverlayEnabled, setDebugOverlayEnabled] = useState(false);
          const [freezeGridCalibration, setFreezeGridCalibration] = useState(false);
          const gridTransformFrozenRef = useRef<{
            characterCenterX: number;
            characterCenterY: number;
            pxPerUnit: number;
            headLenPx: number;
            fingerLenPx: number;
            vmin: number;
          } | null>(null);
          const gridTransformBaselineRef = useRef<{ x: number; y: number } | null>(null);
          const [debugGridStats, setDebugGridStats] = useState<{
            canvasW: number;
            canvasH: number;
            viewScale: number;
            viewOffsetX: number;
            viewOffsetY: number;
            gridCenterX: number | null;
            gridCenterY: number | null;
            pxPerUnit: number | null;
            driftX: number | null;
            driftY: number | null;
            maxAbsDriftX: number;
            maxAbsDriftY: number;
          }>(() => ({
            canvasW: 0,
            canvasH: 0,
            viewScale: 1,
            viewOffsetX: 0,
            viewOffsetY: 0,
            gridCenterX: null,
            gridCenterY: null,
            pxPerUnit: null,
            driftX: null,
            driftY: null,
            maxAbsDriftX: 0,
            maxAbsDriftY: 0,
          }));
          const [backgroundColor, setBackgroundColor] = useState(() => {
    // Load saved background color or use faded paper default
    const saved = localStorage.getItem(BACKGROUND_COLOR_KEY);
    return saved || '#fff3d1'; // Faded paper yellowish default
  });

  const stateLiveRef = useRef(state);
  stateLiveRef.current = state;

  const resolveEffectiveManipulationId = useCallback((clickedId: string): string => {
    if (clickedId !== 'navel') return clickedId;
    const live = stateLiveRef.current;
    if (live.joints.sternum || INITIAL_JOINTS.sternum) return 'sternum';
    return clickedId;
  }, []);

  useEffect(() => {
    if (state.activeRoots.length > 0) return;
    setState((prev) => {
      if (prev.activeRoots.length > 0) return prev;
      const corrected = applyGroundRootCorrectionToJoints({
        joints: prev.joints,
        baseJoints: INITIAL_JOINTS,
        activeRoots: prev.activeRoots,
        groundRootTarget: prev.groundRootTarget,
      });
      if (corrected === prev.joints) return prev;
      return { ...prev, joints: corrected };
    });
  }, [state.activeRoots.length, state.groundRootTarget.x, state.groundRootTarget.y, state.joints]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as any).render_game_to_text = () => {
      const s: SkeletonState = stateLiveRef.current;
      const jointIds = ['navel', 'sternum', 'head', 'l_hip', 'r_hip', 'l_knee', 'r_knee', 'l_ankle', 'r_ankle'] as const;
      const joints: Record<string, { x: number; y: number }> = {};
      let nanCount = 0;
      for (const id of jointIds) {
        const j = s.joints[id];
        const p = j?.currentOffset ?? j?.previewOffset;
        const x = Number(p?.x);
        const y = Number(p?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) nanCount += 1;
        joints[id] = { x, y };
      }
      return JSON.stringify(
        {
          showJoints: s.showJoints,
          procgen: {
            enabled: s.procgen.enabled,
            mode: s.procgen.mode,
            strength: s.procgen.strength,
            seed: s.procgen.seed,
            cycleFrames: s.procgen.bake.cycleFrames,
            options: s.procgen.options,
          },
          view: { scale: s.viewScale, offset: s.viewOffset },
          nanCount,
          joints,
        },
        null,
        2,
      );
    };
    return () => {
      delete (window as any).render_game_to_text;
    };
  }, []);

  useEffect(() => {
    const isFullFluid = getPhysicsBlendMode(state) === 'fluid';
    if (!state.timeline.enabled || !isFullFluid) {
      timelinePinTargetsRef.current = null;
      timelinePinTargetsKeyRef.current = '';
      return;
    }

    const clip = state.timeline.clip;
    const keyframes = Array.isArray(clip.keyframes) ? clip.keyframes : [];
    const sig = `${state.activeRoots.join(',')}|${state.stretchEnabled ? 'S1' : 'S0'}|${clip.frameCount}|${
      clip.fps
    }|${clip.easing}|${keyframes.map((k) => k.frame).join(',')}`;

    if (timelinePinTargetsRef.current && timelinePinTargetsKeyRef.current === sig) return;

    const pose0 =
      sampleClipPose(clip, 0, INITIAL_JOINTS, { stretchEnabled: state.stretchEnabled }) ??
      capturePoseSnapshot(INITIAL_JOINTS, 'preview');

    const targets = state.activeRoots.reduce<Record<string, Point>>((acc, rootId) => {
      acc[rootId] = getWorldPositionFromOffsets(rootId, pose0.joints, INITIAL_JOINTS);
      return acc;
    }, {});

    timelinePinTargetsRef.current = targets;
    timelinePinTargetsKeyRef.current = sig;
  }, [
    state.activeRoots,
    state.physicsRigidity,
    state.stretchEnabled,
    state.timeline.clip.easing,
    state.timeline.clip.fps,
    state.timeline.clip.frameCount,
    state.timeline.clip.keyframes,
    state.timeline.enabled,
  ]);

  useEffect(() => {
    try {
      localStorage.setItem(POSE_TRACE_KEY, poseTracingEnabled ? '1' : '0');
    } catch {
      // Ignore storage errors.
    }
  }, [poseTracingEnabled]);

  const timelineFpsLive = Math.max(1, Math.floor(state.timeline.clip?.fps || 24));
  const bgVideoDesiredTime =
    (state.scene.background.mediaType === 'video' || state.scene.background.mediaType === 'sequence')
      ? state.scene.background.videoStart +
        (state.timeline.enabled ? (timelineFrame / timelineFpsLive) * state.scene.background.videoRate : 0)
      : 0;
  const fgVideoDesiredTime =
    (state.scene.foreground.mediaType === 'video' || state.scene.foreground.mediaType === 'sequence')
      ? state.scene.foreground.videoStart +
        (state.timeline.enabled ? (timelineFrame / timelineFpsLive) * state.scene.foreground.videoRate : 0)
      : 0;
  
  const [titleFont, setTitleFont] = useState('pixel-mono');
  
  const titleFontClassMap = {
    'pixel-mono': 'font-pixel-mono',
    'pixel-retro': 'font-pixel-retro', 
    'pixel-terminal': 'font-pixel-terminal',
    'pixel-tech': 'font-pixel-tech',
    'pixel-clean': 'font-pixel-clean',
    'pixel-display': 'font-pixel-display',
    'pixel-calligraphy': 'font-pixel-calligraphy',
    'pixel-brush': 'font-pixel-brush',
    'pixel-elegant': 'font-pixel-elegant',
  };

  const [floatingWidgets, setFloatingWidgets] = useState<FloatingWidget[]>([]);
  const [activeWidgetId, setActiveWidgetId] = useState<WidgetId>('tools');
  const [widgetDragging, setWidgetDragging] = useState<null | {
    id: WidgetId;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  }>(null);

  const [widgetResizing, setWidgetResizing] = useState<null | {
    id: WidgetId;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
  }>(null);

  const widgetSnapGridPx = 16;
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [activeLogLevels, setActiveLogLevels] = useState<Set<ConsoleLogLevel>>(
    () => new Set<ConsoleLogLevel>(['info', 'warning', 'error', 'success']),
  );
  const floatingWidgetIds = useMemo(() => new Set<WidgetId>(floatingWidgets.map((w) => w.id)), [floatingWidgets]);
  const [widgetPortalTargets, setWidgetPortalTargets] = useState<Partial<Record<WidgetId, HTMLDivElement | null>>>({});

  const registerWidgetPortalTarget = useCallback((id: WidgetId, el: HTMLDivElement | null) => {
    setWidgetPortalTargets((prev) => {
      if (prev[id] === el) return prev;
      return { ...prev, [id]: el };
    });
  }, []);

  useEffect(() => {
    const tabWidgets = WIDGET_TAB_ORDER[sidebarTab];
    const desired = tabWidgets[0] ?? 'tools';
    if (WIDGETS[activeWidgetId]?.tabGroup !== sidebarTab) {
      setActiveWidgetId(desired);
    }
  }, [sidebarTab, activeWidgetId]);

  const addConsoleLog = useCallback((level: ConsoleLogLevel, message: string, data?: unknown) => {
    const id = Math.random().toString(36).slice(2, 10);
    setConsoleLogs((prev) => [
      ...prev.slice(-199),
      {
        id,
        ts: Date.now(),
        level,
        message,
        data,
      },
    ]);
  }, []);

  const filteredConsoleLogs = consoleLogs.filter((log) => activeLogLevels.has(log.level));

  const disposeSequenceData = useCallback((seq: ReferenceSequenceData) => {
    for (const frame of seq.frames) {
      try {
        if (frame && typeof frame.close === 'function') frame.close();
      } catch {
        // Ignore.
      }
    }
  }, []);

  const dropReferenceSequence = useCallback(
    (id: string) => {
      const existing = referenceSequencesRef.current.get(id);
      if (!existing) return;
      disposeSequenceData(existing);
      referenceSequencesRef.current.delete(id);
    },
    [disposeSequenceData],
  );

  const loadGifSequence = useCallback(
    async (file: File, fps: number): Promise<ReferenceSequenceData> => {
      const id = `gif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ImageDecoderCtor = (globalThis as any).ImageDecoder as any;
      if (!ImageDecoderCtor) {
        throw new Error('Animated GIF decoding requires ImageDecoder (Chromium).');
      }

      const data = await file.arrayBuffer();
      const decoder = new ImageDecoderCtor({ data, type: file.type || 'image/gif' });
      if (decoder.tracks?.ready) await decoder.tracks.ready;

      const frameCountRaw = decoder.tracks?.selectedTrack?.frameCount ?? 1;
      const frameCount = clamp(Math.floor(frameCountRaw), 1, 5000);
      const frames: any[] = [];

      for (let i = 0; i < frameCount; i += 1) {
        const result = await decoder.decode({ frameIndex: i });
        const image = result?.image;
        if (image) frames.push(image);
      }

      const first = frames[0];
      const width = Number(first?.displayWidth || first?.codedWidth || first?.width || 0) || 0;
      const height = Number(first?.displayHeight || first?.codedHeight || first?.height || 0) || 0;

      return {
        id,
        kind: 'gif',
        frames,
        width,
        height,
        fps: clamp(Math.floor(fps), 1, 60),
      };
    },
    [],
  );

  const loadZipSequence = useCallback(
    async (file: File, fps: number): Promise<ReferenceSequenceData> => {
      const id = `zip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const zip = await JSZip.loadAsync(file);

      const files = Object.values(zip.files)
        .filter((f) => !f.dir)
        .map((f) => f.name)
        .filter((name) => {
          const lower = name.toLowerCase();
          return (
            lower.endsWith('.png') ||
            lower.endsWith('.jpg') ||
            lower.endsWith('.jpeg') ||
            lower.endsWith('.webp') ||
            lower.endsWith('.gif')
          );
        })
        .sort((a, b) => a.localeCompare(b));

      if (files.length === 0) throw new Error('ZIP contains no supported images (.png/.jpg/.webp/.gif).');

      const maxFrames = 10_000;
      if (files.length > maxFrames) {
        addConsoleLog('warning', `ZIP has ${files.length} frames; only loading first ${maxFrames}.`);
      }

      const selected = files.slice(0, maxFrames);
      const frames: any[] = [];
      let width = 0;
      let height = 0;

      for (let i = 0; i < selected.length; i += 1) {
        const name = selected[i]!;
        const entry = zip.file(name);
        if (!entry) continue;
        const blob = await entry.async('blob');
        const bitmap = await createImageBitmap(blob);
        if (!width || !height) {
          width = bitmap.width || 0;
          height = bitmap.height || 0;
        }
        frames.push(bitmap);
      }

      return {
        id,
        kind: 'zip',
        frames,
        width,
        height,
        fps: clamp(Math.floor(fps), 1, 60),
      };
    },
    [addConsoleLog],
  );

  const loadReferenceSequenceFromFile = useCallback(
    async (file: File, fps: number): Promise<ReferenceSequenceData> => {
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const isZip =
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed' ||
        file.name.toLowerCase().endsWith('.zip');
      if (isGif) return loadGifSequence(file, fps);
      if (isZip) return loadZipSequence(file, fps);
      throw new Error('Unsupported sequence type (expected .gif or .zip).');
    },
    [loadGifSequence, loadZipSequence],
  );

  const snapToGrid = useCallback(
    (v: number, gridPx: number) => {
      const g = Math.max(1, Math.floor(gridPx));
      return Math.round(v / g) * g;
    },
    [],
  );

  const focusFloatingWidget = useCallback((id: WidgetId) => {
    setFloatingWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx < 0) return prev;
      const next = prev.slice();
      const w = next[idx]!;
      next.splice(idx, 1);
      next.push(w);
      return next;
    });
  }, []);

  const activateWidget = useCallback(
    (id: WidgetId) => {
      setSidebarOpen(true);
      const tab = WIDGETS[id].tabGroup;
      if (tab) setSidebarTab(tab);

      const isFloating = floatingWidgets.some((w) => w.id === id);
      setActiveWidgetId(id);
      if (isFloating) {
        setFloatingWidgets((prev) => {
          const idx = prev.findIndex((w) => w.id === id);
          if (idx < 0) return prev;
          const next = prev.slice();
          const w = next[idx]!;
          next.splice(idx, 1);
          next.push({ ...w, minimized: false });
          return next;
        });
        return;
      }
    },
    [floatingWidgets],
  );

  const popOutWidget = useCallback(
    (id: WidgetId, clientX: number, clientY: number) => {
      const tab = WIDGETS[id].tabGroup;
      if (tab) setSidebarTab(tab);
      setActiveWidgetId(id);

      const rect = canvasRef.current?.getBoundingClientRect();
      const localX = rect ? clientX - rect.left : clientX;
      const localY = rect ? clientY - rect.top : clientY;
      const { w, h } = WIDGETS[id].defaultFloatSize;

      setFloatingWidgets((prev) => {
        const idx = prev.findIndex((fw) => fw.id === id);
        if (idx >= 0) {
          const existing = prev[idx]!;
          const next = prev.slice();
          next.splice(idx, 1);
          next.push({ ...existing, minimized: false });
          return next;
        }

        const x = Math.max(12, Math.round(localX - w * 0.5));
        const y = Math.max(12, Math.round(localY - 18));
        return [
          ...prev,
          {
            id,
            minimized: false,
            w: snapToGrid(w, widgetSnapGridPx),
            h: snapToGrid(h, widgetSnapGridPx),
            x: snapToGrid(x, widgetSnapGridPx),
            y: snapToGrid(y, widgetSnapGridPx),
          },
        ];
      });
    },
    [snapToGrid, widgetSnapGridPx],
  );

  const dockWidget = useCallback((id: WidgetId) => {
    setSidebarOpen(true);
    const tab = WIDGETS[id].tabGroup;
    if (tab) setSidebarTab(tab);
    setActiveWidgetId(id);
    setFloatingWidgets((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const focusJointId = useCallback((focus: RigFocus): string => {
    if (focus.track === 'body') {
      switch (focus.index) {
        case 0:
          return 'head';
        case 1:
          return 'collar';
        case 2:
          return 'navel';
        case 3:
          return focus.side === 'front' ? 'r_hip' : 'l_hip';
        case 4:
          return focus.side === 'front' ? 'r_knee' : 'l_knee';
        case 5:
          return focus.side === 'front' ? 'r_ankle' : 'l_ankle';
        case 6:
          return focus.side === 'front' ? 'r_toe' : 'l_toe';
        default:
          return 'head';
      }
    }

    // arms
    switch (focus.index) {
      case 0:
        return focus.side === 'front' ? 'r_shoulder' : 'l_shoulder';
      case 1:
        return focus.side === 'front' ? 'r_elbow' : 'l_elbow';
      case 2:
        return focus.side === 'front' ? 'r_wrist' : 'l_wrist';
      case 3:
        return focus.side === 'front' ? 'r_fingertip' : 'l_fingertip';
      default:
        return focus.side === 'front' ? 'r_shoulder' : 'l_shoulder';
    }
  }, []);

  const focusBoneKeyForJointId = useCallback((jointId: string, joints: SkeletonState['joints']): string | null => {
    if (jointId === 'navel' && joints.sternum) return canonicalConnKey('navel', 'sternum');
    const parentId = joints[jointId]?.parent ?? null;
    if (!parentId) return null;
    return canonicalConnKey(parentId, jointId);
  }, []);

  const syncRigFocusFromJointId = useCallback((jointId: string) => {
    const isRight = jointId.startsWith('r_');
    const isLeft = jointId.startsWith('l_');
    const side: RigSide | null = isRight ? 'front' : isLeft ? 'back' : null;

    const bodyIndex = (() => {
      if (jointId === 'head') return 0;
      if (jointId === 'collar') return 1;
      if (jointId === 'navel') return 2;
      if (jointId.endsWith('_hip')) return 3;
      if (jointId.endsWith('_knee')) return 4;
      if (jointId.endsWith('_ankle')) return 5;
      if (jointId.endsWith('_toe')) return 6;
      return null;
    })();

    const armsIndex = (() => {
      if (jointId.endsWith('_shoulder')) return 0;
      if (jointId.endsWith('_elbow')) return 1;
      if (jointId.endsWith('_wrist')) return 2;
      if (jointId.endsWith('_fingertip')) return 3;
      return null;
    })();

    setRigFocus((prev) => {
      if (bodyIndex !== null) {
        return {
          ...prev,
          track: 'body',
          index: bodyIndex,
          side: side ?? prev.side,
        };
      }
      if (armsIndex !== null && side) {
        return {
          ...prev,
          track: 'arms',
          index: armsIndex,
          side,
        };
      }
      return prev;
    });
  }, []);

  const getCanvasCenterClient = useCallback((): { x: number; y: number } => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    return { x, y };
  }, []);

  const applyRigFocus = useCallback((focus: RigFocus) => {
    const live = stateLiveRef.current;
    const jointId = focusJointId(focus);
    if (!(jointId in live.joints)) return;

    setSelectedJointId(jointId);
    setMaskJointId(jointId);
    setSelectedConnectionKey(focusBoneKeyForJointId(jointId, live.joints));

    if (focus.stage === 'joint') {
      if (!live.showJoints) {
        setState((prev) => (prev.showJoints ? prev : { ...prev, showJoints: true }));
      }
      return;
    }

    if (focus.stage === 'bone') {
      activateWidget('bone_inspector');
      return;
    }

    activateWidget('joint_masks');
  }, [activateWidget, focusBoneKeyForJointId, focusJointId, setState]);

  useEffect(() => {
    applyRigFocus(rigFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!widgetDragging) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - widgetDragging.startClientX;
      const dy = e.clientY - widgetDragging.startClientY;
      const rawX = widgetDragging.startX + dx;
      const rawY = widgetDragging.startY + dy;
      const x = e.altKey ? rawX : snapToGrid(rawX, widgetSnapGridPx);
      const y = e.altKey ? rawY : snapToGrid(rawY, widgetSnapGridPx);
      setFloatingWidgets((prev) =>
        prev.map((w) =>
          w.id === widgetDragging.id
            ? {
                ...w,
                x,
                y,
              }
            : w,
        ),
      );
    };

    const onUp = () => setWidgetDragging(null);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [snapToGrid, widgetDragging, widgetSnapGridPx]);

  useEffect(() => {
    if (!widgetResizing) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - widgetResizing.startClientX;
      const dy = e.clientY - widgetResizing.startClientY;
      const rawW = widgetResizing.startW + dx;
      const rawH = widgetResizing.startH + dy;

      const min = WIDGETS[widgetResizing.id].minFloatSize;
      const clampedW = Math.max(min.w, rawW);
      const clampedH = Math.max(min.h, rawH);
      const w = e.altKey ? clampedW : snapToGrid(clampedW, widgetSnapGridPx);
      const h = e.altKey ? clampedH : snapToGrid(clampedH, widgetSnapGridPx);

      setFloatingWidgets((prev) =>
        prev.map((fw) => (fw.id === widgetResizing.id ? { ...fw, w, h } : fw)),
      );
    };

    const onUp = () => setWidgetResizing(null);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [snapToGrid, widgetResizing, widgetSnapGridPx]);

  // Save background color to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(BACKGROUND_COLOR_KEY, backgroundColor);
  }, [backgroundColor]);

  // Handle Nosferatu mode styling - only set background if user hasn't changed it
  useEffect(() => {
    if (state.lookMode === 'nosferatu') {
      // Only change to black if user is still using the default background
      const savedColor = localStorage.getItem(BACKGROUND_COLOR_KEY);
      if (!savedColor || savedColor === '#fff3d1') {
        setBackgroundColor('#000000');
      }
    }
    // Note: We don't reset the background when leaving nosferatu mode to preserve user choice
  }, [state.lookMode]);

  const setStateWithHistory = useCallback(
    (actionId: string, update: (prev: SkeletonState) => SkeletonState) => {
      setState((prev) => {
        const proposed = update(prev);
        if (Object.is(proposed, prev)) return prev;
        const next = syncLegacyMasksToCutouts(proposed);
        if (!Object.is(next, prev)) {
          historyCtrlRef.current.pushUndo(actionId, prev);
        }
        return next;
      });
    },
    [],
  );

  const captureProcgenNeutralFromCurrent = useCallback(() => {
    setTimelinePlaying(false);
    setStateWithHistory('procgen:setNeutralFromCurrent', (prev) => ({
      ...prev,
      procgen: { ...prev.procgen, neutralPose: capturePoseSnapshot(prev.joints, 'preview') },
    }));
  }, [setStateWithHistory]);

  const resetProcgenNeutralToTPose = useCallback(() => {
    setTimelinePlaying(false);
    setStateWithHistory('procgen:setNeutralToTPose', (prev) => ({
      ...prev,
      procgen: { ...prev.procgen, neutralPose: capturePoseSnapshot(INITIAL_JOINTS, 'preview') },
    }));
  }, [setStateWithHistory]);

  const resetProcgenPhase = useCallback(() => {
    const seed = Math.max(1, Math.floor(stateLiveRef.current.procgen.seed || 1));
    if (!procgenRuntimeRef.current) {
      procgenRuntimeRef.current = createProcgenRuntime(seed);
    } else {
      resetProcgenRuntime(procgenRuntimeRef.current, seed);
    }
  }, []);

  const requestProcgenBake = useCallback(() => {
    setTimelinePlaying(false);
    timelineFrameRef.current = 0;
    setTimelineFrame(0);

    setStateWithHistory('procgen:bakeloop', (prev) => {
      const frameCount = clamp(Math.floor(prev.procgen.bake.cycleFrames), 2, 600);
      const fps = Math.max(1, Math.floor(prev.timeline.clip.fps || 24));
      const neutral = prev.procgen.neutralPose ?? capturePoseSnapshot(prev.joints, 'preview');

      const keyframes = bakeProcgenLoop({
        neutral,
        fps,
        frameCount,
        strength: prev.procgen.strength,
        seed: prev.procgen.seed,
        mode: prev.procgen.mode,
        gait: prev.procgen.gait,
        gaitEnabled: prev.procgen.gaitEnabled,
        physics: prev.procgen.physics,
        idle: prev.procgen.idle,
        options: prev.procgen.options,
        keyframeStep: prev.procgen.bake.keyframeStep,
      });

      const firstPose = keyframes[0]?.pose ?? neutral;
      return {
        ...prev,
        procgen: { ...prev.procgen, enabled: false },
        joints: applyPoseSnapshotToJoints(prev.joints, firstPose),
        timeline: {
          ...prev.timeline,
          enabled: true,
          clip: {
            ...prev.timeline.clip,
            frameCount,
            keyframes,
          },
        },
      };
    });
  }, [setStateWithHistory]);

  const pendingTransitionIssuesRef = useRef<TransitionIssue[] | null>(null);
  const [transitionWarningOpen, setTransitionWarningOpen] = useState(false);
  const [transitionWarningIssues, setTransitionWarningIssues] = useState<TransitionIssue[]>([]);

  const [viewSwitchOpen, setViewSwitchOpen] = useState(false);
  const [viewSwitchToId, setViewSwitchToId] = useState<string | null>(null);

  useEffect(() => {
    if (!initialSanitizeIssuesRef.current || initialSanitizeIssuesRef.current.length === 0) return;
    pendingTransitionIssuesRef.current = initialSanitizeIssuesRef.current;
    initialSanitizeIssuesRef.current = null;
  }, []);

  const applyEngineTransition = useCallback(
    (
      actionId: string,
      update: (prev: SkeletonState) => SkeletonState,
      opts: { pushHistory?: boolean } = {},
    ) => {
      setState((prev) => {
        const proposed = update(prev);
        if (Object.is(proposed, prev)) return prev;

        const requested = new Set<string>();
        if (prev.lookMode !== proposed.lookMode) requested.add('look.lookMode');
        if ((prev.physicsRigidity ?? 0) !== (proposed.physicsRigidity ?? 0)) requested.add('simulation.physicsRigidity');
        if (prev.activeViewId !== proposed.activeViewId) requested.add('view.activeViewId');
        if (prev.showJoints !== proposed.showJoints) requested.add('render.showJoints');
        if (prev.jointsOverMasks !== proposed.jointsOverMasks) requested.add('render.jointsOverMasks');

        const reconciled = reconcileSkeletonState(proposed);
        const annotated = reconciled.issues.map((issue) => {
          const warning = issue.autoFixedFields.some((f) => requested.has(f));
          return { ...issue, severity: warning ? 'warning' : 'info' } as TransitionIssue;
        });

        if (annotated.length > 0) pendingTransitionIssuesRef.current = annotated;

        const next = reconciled.state;
        const push = opts.pushHistory !== false;
        if (push && !Object.is(next, prev)) {
          historyCtrlRef.current.pushUndo(actionId, prev);
        }
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const pending = pendingTransitionIssuesRef.current;
    if (!pending || pending.length === 0) return;
    pendingTransitionIssuesRef.current = null;

    for (const issue of pending) {
      addConsoleLog(issue.severity === 'warning' ? 'warning' : 'info', issue.title + ': ' + issue.detail);
    }

    const warnings = pending.filter((i) => i.severity === 'warning');
    if (warnings.length > 0 && !getTransitionWarningsDisabled()) {
      setTransitionWarningIssues(warnings);
      setTransitionWarningOpen(true);
    }
  }, [addConsoleLog, state]);

  const performViewSwitch = useCallback(
    (viewId: string, choice: ViewSwitchChoice, saveCurrent: boolean) => {
      applyEngineTransition(
        'switch_view',
        (prev) => {
          const base = saveCurrent && prev.activeViewId ? updateViewFromCurrentState(prev, prev.activeViewId) : prev;
          const opts =
            choice === 'camera_reference_only'
              ? { applyPose: false, applyCamera: true, applyReference: true }
              : { applyPose: true, applyCamera: true, applyReference: true };
          return switchToView(base, viewId, opts);
        },
        { pushHistory: true },
      );
    },
    [applyEngineTransition],
  );

  const requestViewSwitch = useCallback(
    (viewId: string) => {
      const live = stateLiveRef.current;
      if (viewId === live.activeViewId) return;
      const toView = live.views.find((v) => v.id === viewId);
      if (!toView) return;

      const currentPose = capturePoseSnapshot(live.joints, 'preview');
      const poseDiffers = (a: typeof currentPose, b: typeof currentPose) => {
        for (const k of Object.keys(a.joints)) {
          const pa = a.joints[k];
          const pb = b.joints[k];
          if (!pb) return true;
          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          if (dx * dx + dy * dy > 1e-10) return true;
        }
        for (const k of Object.keys(b.joints)) {
          if (!(k in a.joints)) return true;
        }
        return false;
      };

      const cameraDiffers =
        (toView.camera?.viewScale ?? live.viewScale) !== live.viewScale ||
        (toView.camera?.viewOffset?.x ?? live.viewOffset.x) !== live.viewOffset.x ||
        (toView.camera?.viewOffset?.y ?? live.viewOffset.y) !== live.viewOffset.y;

      const refKey = (layer: any) =>
        JSON.stringify({
          src: layer?.src ?? null,
          visible: Boolean(layer?.visible),
          opacity: Number(layer?.opacity ?? 1),
          x: Number(layer?.x ?? 0),
          y: Number(layer?.y ?? 0),
          scale: Number(layer?.scale ?? 1),
          rotation: Number(layer?.rotation ?? 0),
          fitMode: layer?.fitMode ?? 'contain',
          mediaType: layer?.mediaType ?? 'image',
          videoStart: Number(layer?.videoStart ?? 0),
          videoRate: Number(layer?.videoRate ?? 1),
          sequenceId: layer?.sequence?.id ?? null,
        });

      const referenceDiffers =
        refKey({ ...live.scene.background, ...(toView.reference?.background || {}) }) !== refKey(live.scene.background) ||
        refKey({ ...live.scene.foreground, ...(toView.reference?.foreground || {}) }) !== refKey(live.scene.foreground);

      const poseWouldChange = poseDiffers(currentPose, toView.pose);

      const activeView = getActiveView(live);
      const unsaved =
        activeView &&
        (poseDiffers(currentPose, activeView.pose) ||
          (activeView.camera?.viewScale ?? live.viewScale) !== live.viewScale ||
          (activeView.camera?.viewOffset?.x ?? live.viewOffset.x) !== live.viewOffset.x ||
          (activeView.camera?.viewOffset?.y ?? live.viewOffset.y) !== live.viewOffset.y ||
          refKey({ ...live.scene.background }) !== refKey({ ...live.scene.background, ...(activeView.reference?.background || {}) }) ||
          refKey({ ...live.scene.foreground }) !== refKey({ ...live.scene.foreground, ...(activeView.reference?.foreground || {}) }));

      const shouldPrompt = Boolean(poseWouldChange || cameraDiffers || referenceDiffers || unsaved);

      if (getViewSwitchPromptDisabled() || !shouldPrompt) {
        performViewSwitch(viewId, getViewSwitchDefaultChoice(), false);
        return;
      }

      setViewSwitchToId(viewId);
      setViewSwitchOpen(true);
    },
    [performViewSwitch],
  );

  const applyFluidHandshake = useCallback((prev: SkeletonState, next: SkeletonState): SkeletonState => {
    const settingsChanged =
      prev.controlMode !== next.controlMode ||
      prev.rigidity !== next.rigidity ||
      Boolean(prev.stretchEnabled) !== Boolean(next.stretchEnabled) ||
      Boolean(prev.bendEnabled) !== Boolean(next.bendEnabled) ||
      Boolean(prev.hardStop) !== Boolean(next.hardStop) ||
      (prev.physicsRigidity ?? 0) !== (next.physicsRigidity ?? 0);

    if (!settingsChanged) return next;

    // Freeze the current visible pose as the new baseline so the next movement uses the new
    // settings without snapping the rig immediately.
    const currentPose = capturePoseSnapshot(prev.joints, 'current');
    return { ...next, joints: applyPoseSnapshotToJoints(next.joints, currentPose) };
  }, []);

  const setStateNoHistory = useCallback((update: (prev: SkeletonState) => SkeletonState) => {
    setState((prev) => update(prev));
  }, []);

  const beginHistoryAction = useCallback(
    (actionId: string) => {
      historyCtrlRef.current.beginAction(actionId, state);
    },
    [state],
  );

  const commitHistoryAction = useCallback(() => {
    setState((prev) => {
      const changed = historyCtrlRef.current.commitAction(prev);
      return changed ? { ...prev } : prev;
    });
  }, []);

  const downloadStateJson = useCallback(() => {
    const json = serializeEngineState(state, { pretty: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `bitruvius-state-${timestamp}.json`;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    addConsoleLog('success', `State exported: ${filename}`);
  }, [addConsoleLog, state]);

  const importStateFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = deserializeEngineState(text);
        if (parsed.ok === false) {
          alert(`Import failed: ${parsed.error}`);
          return;
        }
        const sanitized = sanitizeStateWithReport(parsed.rawState);
        const reconciled = reconcileSkeletonState(sanitized.state);
        const issues = [...sanitized.issues, ...reconciled.issues].map((i) => ({ ...i, severity: 'info' as const }));
        if (issues.length > 0) pendingTransitionIssuesRef.current = issues;
        setStateWithHistory('import_state', () => reconciled.state);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        alert(`Import failed: ${message}`);
      }
    },
    [setStateWithHistory],
  );

  const exportSvg = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (!canvasSize.width || !canvasSize.height) return;
    downloadSvg(svg, {
      width: canvasSize.width,
      height: canvasSize.height,
      backgroundColor,
    });
  }, [backgroundColor, canvasSize.height, canvasSize.width]);

  const exportPng = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    if (!canvasSize.width || !canvasSize.height) return;
    try {
      await downloadPngFromSvg(svg, {
        width: canvasSize.width,
        height: canvasSize.height,
        backgroundColor,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Export failed: ${message}`);
    }
  }, [backgroundColor, canvasSize.height, canvasSize.width]);

  const exportVideo = useCallback(async () => {
    if (!canvasSize.width || !canvasSize.height) return;
    if (!state.timeline.enabled) {
      alert('Timeline must be enabled to export video');
      return;
    }
    if (state.scene.background.mediaType === 'sequence' || state.scene.foreground.mediaType === 'sequence') {
      alert('Video export does not support GIF/ZIP sequences yet. Please use a real video file for reference layers, or turn off sequence reference layers before exporting.');
      return;
    }

    try {
      setTimelinePlaying(false);
	      await exportAsWebm({
	        width: canvasSize.width,
	        height: canvasSize.height,
	        backgroundColor,
	        fps: state.timeline.clip.fps,
	        scale: 1,
	        timeline: state.timeline,
	        baseJoints: INITIAL_JOINTS,
	        connections: CONNECTIONS,
	        scene: state.scene,
	        activeRoots: state.activeRoots,
	        stretchEnabled: state.stretchEnabled,
	        fallbackPose: capturePoseSnapshot(state.joints, 'preview'),
	      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(`Video export failed: ${message}`);
    }
	  }, [
	    backgroundColor,
	    canvasSize.height,
	    canvasSize.width,
	    state.activeRoots,
	    state.scene,
	    state.stretchEnabled,
	    state.timeline,
	    state.joints,
	  ]);

  const uploadMaskFile = useCallback(
    async (file: File) => {
      try {
        const url = URL.createObjectURL(file);
        setStateWithHistory('upload_mask', (prev) => ({
          ...prev,
          scene: {
            ...prev.scene,
            headMask: {
              ...prev.scene.headMask,
              src: url,
              visible: true,
            },
          },
        }));
        
        // Cache the image for persistence
        await cacheImageFromUrl(url, 'head_mask');
        
        addConsoleLog('success', `Mask uploaded: ${file.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        alert(`Mask upload failed: ${message}`);
        addConsoleLog('error', `Mask upload failed: ${message}`);
      }
    },
    [addConsoleLog, setStateWithHistory],
  );

  useEffect(() => {
    // Clear selections only when indices become invalid (pose removed or length decreased)
    setSelectedPoseIndices(prev => prev.filter(i => i < poseSnapshots.length));
  }, [poseSnapshots]);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const uploadJointMaskFile = useCallback(
    async (file: File, jointId: string) => {
      try {
        const url = URL.createObjectURL(file);
        
        // Auto-center by setting offset to 0 and anchor to 0.5
        setStateWithHistory(`upload_joint_mask:${jointId}`, (prev) => ({
          ...prev,
          scene: {
            ...prev.scene,
            jointMasks: {
              ...prev.scene.jointMasks,
              [jointId]: {
                ...prev.scene.jointMasks[jointId],
                src: url,
                visible: true,
                offsetX: 0,
                offsetY: 0,
                anchorX: 0.5,
                anchorY: 0.5,
              },
            },
          },
        }));
        
        // Cache the image for persistence
        await cacheImageFromUrl(url, `joint_mask_${jointId}`);
        
        addConsoleLog('success', `Mask uploaded for ${jointId}: ${file.name}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        alert(`Mask upload failed: ${message}`);
        addConsoleLog('error', `Mask upload failed: ${message}`);
      }
    },
    [addConsoleLog, setStateWithHistory],
  );

  const copyJointMaskTo = useCallback(
    (sourceJointId: string, targetJointId: string) => {
      const sourceMask = state.scene.jointMasks[sourceJointId];
      if (!sourceMask?.src) {
        addConsoleLog('error', `No mask found on ${sourceJointId} to copy`);
        return;
      }

      setStateWithHistory(`copy_joint_mask:${sourceJointId}->${targetJointId}`, (prev) => ({
        ...prev,
        scene: {
          ...prev.scene,
          jointMasks: {
            ...prev.scene.jointMasks,
            [targetJointId]: {
              ...prev.scene.jointMasks[targetJointId],
              ...sourceMask,
              src: sourceMask.src,
              visible: true,
              relatedJoints: (sourceMask.relatedJoints || []).filter(
                (id) => id && id !== targetJointId && id in prev.joints,
              ),
            },
          },
        },
      }));
      
      // Cache the copied mask for persistence
      cacheImageFromUrl(sourceMask.src, `joint_mask_${targetJointId}`);
      
      addConsoleLog('success', `Mask copied from ${sourceJointId} to ${targetJointId}`);
    },
    [addConsoleLog, setStateWithHistory, state.scene.jointMasks, state.joints],
  );

  const handleCopyMaskChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetJointId = e.target.value;
    if (targetJointId) {
      copyJointMaskTo(maskJointId, targetJointId);
      e.target.value = '';
    }
  }, [copyJointMaskTo, maskJointId]);

  const undo = useCallback(() => {
    setTimelinePlaying(false);
    setDraggingId(null);
    setState((prev) => historyCtrlRef.current.undo(prev));
    addConsoleLog('info', 'Undo');
  }, [addConsoleLog]);

  const redo = useCallback(() => {
    setTimelinePlaying(false);
    setDraggingId(null);
    setState((prev) => historyCtrlRef.current.redo(prev));
    addConsoleLog('info', 'Redo');
  }, [addConsoleLog]);

  const jumpToAdjacentKeyframe = useCallback(
    (direction: -1 | 1) => {
      if (!state.timeline.enabled) return;
      const frameCount = Math.max(1, Math.floor(state.timeline.clip.frameCount));
      const keyframes = Array.isArray(state.timeline.clip.keyframes) ? state.timeline.clip.keyframes : [];
      if (keyframes.length === 0) return;

      const keys = keyframes
        .map((k) => k.frame)
        .filter((f) => Number.isFinite(f))
        .map((f) => clamp(Math.floor(f), 0, frameCount - 1))
        .sort((a, b) => a - b);

      if (keys.length === 0) return;

      setTimelinePlaying(false);
      const current = clamp(timelineFrameRef.current, 0, frameCount - 1);

      let next = current;
      if (direction < 0) {
        const prevKeys = keys.filter((f) => f < current);
        next = prevKeys.length ? prevKeys[prevKeys.length - 1] : keys[0]!;
      } else {
        const nextKeys = keys.filter((f) => f > current);
        next = nextKeys.length ? nextKeys[0]! : keys[keys.length - 1]!;
      }

      timelineFrameRef.current = next;
      setTimelineFrame(next);
    },
    [state.timeline.enabled, state.timeline.clip.frameCount, state.timeline.clip.keyframes],
  );

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if (key === 'y') {
          e.preventDefault();
          redo();
          return;
        }
        return;
      }

      // Non-modifier shortcuts.
      if (key === 'tab') {
        e.preventDefault();
        const backwards = e.shiftKey;
        const next: RigFocus = (() => {
          if (!backwards) {
            if (rigFocus.track === 'body') {
              if (rigFocus.index < 6) return { ...rigFocus, index: rigFocus.index + 1 };
              return { ...rigFocus, track: 'arms', index: 0 };
            }
            if (rigFocus.index < 3) return { ...rigFocus, index: rigFocus.index + 1 };
            return { ...rigFocus, track: 'body', index: 0 };
          }

          // backwards
          if (rigFocus.track === 'body') {
            if (rigFocus.index > 0) return { ...rigFocus, index: rigFocus.index - 1 };
            return { ...rigFocus, track: 'arms', index: 3 };
          }
          if (rigFocus.index > 0) return { ...rigFocus, index: rigFocus.index - 1 };
          return { ...rigFocus, track: 'body', index: 6 };
        })();
        setRigFocus(next);
        applyRigFocus(next);
        return;
      }

      if (key === '1') {
        e.preventDefault();
        const next: RigFocus = { ...rigFocus, side: rigFocus.side === 'front' ? 'back' : 'front' };
        setRigFocus(next);
        applyRigFocus(next);
        return;
      }

      if (key === '0' || key === '2' || key === '3') {
        e.preventDefault();
        const stage: RigStage = key === '0' ? 'joint' : key === '2' ? 'bone' : 'mask';
        const next: RigFocus = { ...rigFocus, stage };
        setRigFocus(next);
        applyRigFocus(next);
        return;
      }

      if (key === 'b') {
        e.preventDefault();
        setStateWithHistory('toggle_bend_shortcut', (prev) =>
          applyFluidHandshake(prev, { ...prev, bendEnabled: !prev.bendEnabled }),
        );
        return;
      }
      if (key === 's') {
        e.preventDefault();
        setStateWithHistory('toggle_stretch_shortcut', (prev) =>
          applyFluidHandshake(prev, { ...prev, stretchEnabled: !prev.stretchEnabled }),
        );
        return;
      }
      if (key === 'm') {
        e.preventDefault();
        setStateWithHistory('toggle_mirroring_shortcut', (prev) => ({ ...prev, mirroring: !prev.mirroring }));
        return;
      }
      if (key === 'l') {
        e.preventDefault();
        setStateWithHistory('toggle_lead_shortcut', (prev) => ({ ...prev, leadEnabled: !prev.leadEnabled }));
        return;
      }
      if (key === 'a') {
        e.preventDefault();
        setTimelinePlaying(false);
        setStateWithHistory('procgen:shortcut_cycle', (prev) => {
          const recommendedCycleFrames = {
            walk_in_place: 48,
            run_in_place: 32,
            idle: 120,
          } as const;

          const next = (() => {
            if (!prev.procgen.enabled) return { enabled: true, mode: 'walk_in_place' as const };
            if (prev.procgen.mode === 'walk_in_place') return { enabled: true, mode: 'run_in_place' as const };
            if (prev.procgen.mode === 'run_in_place') return { enabled: true, mode: 'idle' as const };
            return { enabled: false, mode: prev.procgen.mode };
          })();

          return {
            ...prev,
            showJoints: next.enabled ? true : prev.showJoints,
            procgen: {
              ...prev.procgen,
              enabled: next.enabled,
              mode: next.mode,
              neutralPose: next.enabled
                ? (prev.procgen.neutralPose ?? capturePoseSnapshot(prev.joints, 'preview'))
                : prev.procgen.neutralPose,
              bake: {
                ...prev.procgen.bake,
                cycleFrames: next.enabled
                  ? (recommendedCycleFrames[next.mode] ?? prev.procgen.bake.cycleFrames)
                  : prev.procgen.bake.cycleFrames,
              },
            },
          };
        });
        return;
      }
      if (key === 'o') {
        e.preventDefault();
        if (!state.timeline.enabled) return;
        setTimelinePlaying(false);
        setStateWithHistory('toggle_onion_shortcut', (prev) => ({
          ...prev,
          timeline: {
            ...prev.timeline,
            onionSkin: { ...prev.timeline.onionSkin, enabled: !prev.timeline.onionSkin.enabled },
          },
        }));
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        setPoseTracingEnabled((prev) => !prev);
        return;
      }
      if (key === '[') {
        if (!state.timeline.enabled) return;
        e.preventDefault();
        jumpToAdjacentKeyframe(-1);
        return;
      }
      if (key === ']') {
        if (!state.timeline.enabled) return;
        e.preventDefault();
        jumpToAdjacentKeyframe(1);
        return;
      }
      if (e.key === ' ') {
        // Space toggles play/pause when timeline is enabled.
        if (!state.timeline.enabled) return;
        e.preventDefault();
        if (timelinePlaying) {
          setTimelinePlaying(false);
        } else {
          timelineFrameRef.current = timelineFrame;
          setTimelinePlaying(true);
        }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!state.timeline.enabled) return;
        e.preventDefault();
        if (poseTracingEnabled && e.shiftKey) {
          jumpToAdjacentKeyframe(e.key === 'ArrowLeft' ? -1 : 1);
          return;
        }
        setTimelinePlaying(false);
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        const maxFrame = Math.max(0, state.timeline.clip.frameCount - 1);
        const nextFrame = clamp(timelineFrameRef.current + delta, 0, maxFrame);
        timelineFrameRef.current = nextFrame;
        setTimelineFrame(nextFrame);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    applyRigFocus,
    applyFluidHandshake,
    jumpToAdjacentKeyframe,
    poseTracingEnabled,
    redo,
    rigFocus,
    state.timeline.clip.frameCount,
    state.timeline.enabled,
    setStateWithHistory,
    setRigFocus,
    timelineFrame,
    timelinePlaying,
    undo,
  ]);

  useEffect(() => {
    timelineFrameRef.current = timelineFrame;
  }, [timelineFrame]);

  useEffect(() => {
    if (!state.timeline.enabled) {
      setTimelinePlaying(false);
    }
  }, [state.timeline.enabled]);

  useEffect(() => {
    if (!state.procgen.enabled) return;
    if (!timelinePlaying) return;
    setTimelinePlaying(false);
  }, [state.procgen.enabled, timelinePlaying]);

  useEffect(() => {
    const maxFrame = Math.max(0, state.timeline.clip.frameCount - 1);
    setTimelineFrame((f) => clamp(f, 0, maxFrame));
  }, [state.timeline.clip.frameCount]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        setCanvasSize({
          width: newW,
          height: newH
        });
        
        // Auto-recenter if way out of bounds
        setState(prev => {
          const limitX = newW * 2;
          const limitY = newH * 2;
          if (Math.abs(prev.viewOffset.x) > limitX || Math.abs(prev.viewOffset.y) > limitY) {
            return { ...prev, viewOffset: { x: 0, y: 0 } };
          }
          return prev;
        });
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = true;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const spaceDownRef = useRef(false);
  const lastMousePosRef = useRef<Point | null>(null);

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (e.buttons === 4 || (e.buttons === 1 && spaceDownRef.current)) {
      if (lastMousePosRef.current) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        setState(prev => ({
          ...prev,
          viewOffset: {
            x: prev.viewOffset.x + dx,
            y: prev.viewOffset.y + dy
          }
        }));
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else {
      lastMousePosRef.current = null;
      handleMouseMove(e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/grid_rings_background.json')
      .then(r => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setGridRingsBgData(data);
      })
      .catch(() => {
        if (cancelled) return;
        setGridRingsBgData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const computedGridOverlayTransform = useMemo(() => {
    if (!canvasSize.width || !canvasSize.height) return null;

    const scale = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const vmin = Math.min(canvasSize.width, canvasSize.height);

    // Calibrate against the *starting pose* so the grid stays static while the figure moves.
    const headWorld = getWorldPosition('head', INITIAL_JOINTS, INITIAL_JOINTS, 'current');
    const lAnkleWorld = getWorldPosition('l_ankle', INITIAL_JOINTS, INITIAL_JOINTS, 'current');
    const rAnkleWorld = getWorldPosition('r_ankle', INITIAL_JOINTS, INITIAL_JOINTS, 'current');

    const headX = headWorld.x * scale + centerX;
    const headY = headWorld.y * scale + centerY;
    const lAnkleX = lAnkleWorld.x * scale + centerX;
    const lAnkleY = lAnkleWorld.y * scale + centerY;
    const rAnkleX = rAnkleWorld.x * scale + centerX;
    const rAnkleY = rAnkleWorld.y * scale + centerY;

    const crownY = headY;
    const groundY = Math.max(lAnkleY, rAnkleY);
    const figureHeightPx = Math.max(1, groundY - crownY);

    const anklesAvgX = (lAnkleX + rAnkleX) / 2;
    const characterCenterX = (headX + anklesAvgX) / 2;
    const characterCenterY = (crownY + groundY) / 2;

    // Keep the outermost reach ring inside the view (if we have ring metadata).
    const maxRingR = Math.max(...(gridRingsBgData?.vitruvian.plot.circles ?? []).map((c) => c.r), 0.55);
    const fitRingsPxPerUnit = maxRingR > 0 ? (vmin / 2) / maxRingR : 0;
    const calibratedPxPerUnit = figureHeightPx; // grid totalHeight is 1
    const pxPerUnit =
      fitRingsPxPerUnit > 0 ? Math.min(calibratedPxPerUnit, fitRingsPxPerUnit) : calibratedPxPerUnit;

    const headLenUnits = 0.125;
    const headLenPx = pxPerUnit * headLenUnits;
    const fingerLenPx = headLenPx / 8;

    return {
      characterCenterX,
      characterCenterY,
      pxPerUnit,
      headLenPx,
      fingerLenPx,
      vmin,
    };
  }, [canvasSize.height, canvasSize.width, gridRingsBgData]);

  useEffect(() => {
    if (!freezeGridCalibration) {
      gridTransformFrozenRef.current = null;
      return;
    }
    if (!gridTransformFrozenRef.current && computedGridOverlayTransform) {
      gridTransformFrozenRef.current = computedGridOverlayTransform;
      gridTransformBaselineRef.current = {
        x: computedGridOverlayTransform.characterCenterX,
        y: computedGridOverlayTransform.characterCenterY,
      };
      setDebugGridStats((prev) => ({ ...prev, maxAbsDriftX: 0, maxAbsDriftY: 0 }));
    }
  }, [freezeGridCalibration, computedGridOverlayTransform]);

  const gridOverlayTransform = freezeGridCalibration
    ? gridTransformFrozenRef.current ?? computedGridOverlayTransform
    : computedGridOverlayTransform;

  useEffect(() => {
    if (!debugOverlayEnabled) return;
    const id = window.setInterval(() => {
      const t = gridOverlayTransform;
      const centerX = t?.characterCenterX ?? null;
      const centerY = t?.characterCenterY ?? null;
      const pxPerUnit = t?.pxPerUnit ?? null;

      if (!gridTransformBaselineRef.current && centerX != null && centerY != null) {
        gridTransformBaselineRef.current = { x: centerX, y: centerY };
      }
      const baseline = gridTransformBaselineRef.current;
      const driftX = baseline && centerX != null ? centerX - baseline.x : null;
      const driftY = baseline && centerY != null ? centerY - baseline.y : null;

      setDebugGridStats((prev) => {
        const nextMaxAbsDriftX = driftX == null ? prev.maxAbsDriftX : Math.max(prev.maxAbsDriftX, Math.abs(driftX));
        const nextMaxAbsDriftY = driftY == null ? prev.maxAbsDriftY : Math.max(prev.maxAbsDriftY, Math.abs(driftY));
        return {
          ...prev,
          canvasW: canvasSize.width,
          canvasH: canvasSize.height,
          viewScale: stateLiveRef.current.viewScale,
          viewOffsetX: stateLiveRef.current.viewOffset.x,
          viewOffsetY: stateLiveRef.current.viewOffset.y,
          gridCenterX: centerX,
          gridCenterY: centerY,
          pxPerUnit,
          driftX,
          driftY,
          maxAbsDriftX: nextMaxAbsDriftX,
          maxAbsDriftY: nextMaxAbsDriftY,
        };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [debugOverlayEnabled, gridOverlayTransform, canvasSize.height, canvasSize.width]);

  const resetGridDriftBaseline = useCallback(() => {
    const t = gridOverlayTransform;
    if (!t) return;
    gridTransformBaselineRef.current = { x: t.characterCenterX, y: t.characterCenterY };
    setDebugGridStats((prev) => ({ ...prev, maxAbsDriftX: 0, maxAbsDriftY: 0 }));
  }, [gridOverlayTransform]);

  // Animation Loop: Exponential Decay for Smooth Motion
  useEffect(() => {
    let frameId: number;
    let last = performance.now();
    const update = () => {
      setState(prev => {
	        const now = performance.now();
	        const dt = Math.max(0, (now - last) / 1000);
	        last = now;

	        const drag = dragTargetRef.current;
	        const isDirectManipulation =
            Boolean(draggingIdLiveRef.current) || maskDraggingLiveRef.current || groundPlaneDraggingLiveRef.current;
	        const isRigidDragMode = prev.controlMode === 'Cardboard' && !prev.stretchEnabled;
	        const allowPosePhysics = !prev.timeline.enabled || prev.procgen.enabled || isDirectManipulation || Boolean(drag);
	        const physicsActive = shouldRunPosePhysics(prev) && allowPosePhysics && (Boolean(drag) || prev.activeRoots.length > 0);

        const applyPoseSnapshotToPreviewOffsetsOnly = (
          joints: Record<string, Joint>,
          pose: EnginePoseSnapshot,
        ): Record<string, Joint> => {
          const next: Record<string, Joint> = { ...joints };
          for (const id of Object.keys(INITIAL_JOINTS)) {
            const j = next[id] ?? INITIAL_JOINTS[id]!;
            const off = pose.joints[id] ?? j.previewOffset;
            next[id] = { ...j, previewOffset: off };
          }
          return next;
        };

        let procgenPreviewApplied = false;
        let jointsForFrame: Record<string, Joint> = prev.joints;
        if (prev.procgen.enabled) {
          const shouldPause = prev.procgen.options.pauseWhileDragging && isDirectManipulation;

          if (!shouldPause) {
            if (!procgenRuntimeRef.current || procgenRuntimeRef.current.seed !== prev.procgen.seed) {
              procgenRuntimeRef.current = createProcgenRuntime(prev.procgen.seed);
            }

            if (prev.procgen.neutralPose) {
              procgenNeutralFallbackRef.current = null;
            } else if (!procgenNeutralFallbackRef.current) {
              procgenNeutralFallbackRef.current = capturePoseSnapshot(prev.joints, 'preview');
            }

            const neutral = prev.procgen.neutralPose ?? procgenNeutralFallbackRef.current ?? capturePoseSnapshot(prev.joints, 'preview');
            const snapshot = stepProcgenPose({
              runtime: procgenRuntimeRef.current,
              mode: prev.procgen.mode,
              neutral,
              dtSec: dt,
              cycleFrames: prev.procgen.bake.cycleFrames,
              strength: prev.procgen.strength,
              gait: prev.procgen.gait,
              gaitEnabled: prev.procgen.gaitEnabled,
              physics: prev.procgen.physics,
              idle: prev.procgen.idle,
              options: prev.procgen.options,
            });

            jointsForFrame = applyPoseSnapshotToPreviewOffsetsOnly(prev.joints, snapshot);
            procgenPreviewApplied = true;
          }
        } else {
          procgenRuntimeRef.current = null;
          procgenNeutralFallbackRef.current = null;
        }
        
        // Exclude balance joints from physics when they're being dragged to prevent tension/jitter.
        // Note: Navel drags proxy to sternum (handled via `drag.id`).
        const sternumIsDragged = drag?.id === 'sternum';
        const collarIsDragged = drag?.id === 'collar';

        if (physicsActive && !sternumIsDragged && !collarIsDragged) {
          const handshakeKey = [
            prev.controlMode,
            prev.rigidity,
            prev.stretchEnabled ? 'S1' : 'S0',
            prev.bendEnabled ? 'B1' : 'B0',
            prev.hardStop ? 'H1' : 'H0',
            String(Math.round((prev.physicsRigidity ?? 0) * 100)),
          ].join('|');
          if (physicsHandshakeRef.current.key !== handshakeKey) {
            physicsHandshakeRef.current.key = handshakeKey;
            physicsHandshakeRef.current.blend = 0;
            hingeSignsRef.current = {};
          }

	          const pinTargets = pinTargetsRef.current;
	          const activePinTargets: Record<string, Point> = {};
	          for (const id of prev.activeRoots) {
	            const t = pinTargets[id];
	            if (t) activePinTargets[id] = t;
	          }

          const rubberbandAnchor = rubberbandAnchorPinRef.current;
          const activeRoots =
            rubberbandAnchor && rubberbandAnchor.id in prev.joints
              ? Array.from(new Set([...prev.activeRoots, rubberbandAnchor.id]))
              : prev.activeRoots;
	          if (rubberbandAnchor && rubberbandAnchor.id in prev.joints) {
	            activePinTargets[rubberbandAnchor.id] = rubberbandAnchor.target;
	          }

	          const dragInput = drag && drag.id in prev.joints ? drag : null;
	          const dragIsPinned = Boolean(dragInput && prev.activeRoots.includes(dragInput.id));
	          if (dragIsPinned && dragInput) {
	            activePinTargets[dragInput.id] = dragInput.target;
	          }

	          const result = stepPosePhysics({
	            joints: jointsForFrame,
	            activeRoots,
	            rootTargets: activePinTargets,
	            drag: dragIsPinned ? null : dragInput,
	            connectionOverrides: prev.connectionOverrides,
	            options: {
	              dt: isRigidDragMode ? Math.min(dt, 1 / 60) : dt,
	              iterations: isRigidDragMode ? 28 : 16,
	              damping: isRigidDragMode ? 0.18 : 0.12,
	              wireCompliance: 0.0015,
	              rigidity: prev.rigidity,
	              hardStop: prev.hardStop,
	              // Auto-bend is great for settle/idle, but it can fight cursor-locked FK drags and create jitter.
	              autoBend: prev.bendEnabled && !(isRigidDragMode && isDirectManipulation),
	              hingeSigns: hingeSignsRef.current,
	              stretchEnabled: prev.stretchEnabled,
	            },
	          });
          hingeSignsRef.current = result.hingeSigns;

          // Blend physics results in over a short ramp when settings change, so toggling
          // stretch/bend/rigidity doesn't hard-pop the current pose.
          const transitionSec = prev.rigidity === 'cardboard' ? 0.08 : 0.14;
          if (isDirectManipulation || drag) {
            physicsHandshakeRef.current.blend = 1;
          } else {
            const inc = transitionSec > 1e-6 ? dt / transitionSec : 1;
            physicsHandshakeRef.current.blend = clamp(physicsHandshakeRef.current.blend + inc, 0, 1);
          }
          const t = clamp(physicsHandshakeRef.current.blend, 0, 1);
          if (t >= 0.999) return { ...prev, joints: result.joints };

          const blended: Record<string, Joint> = { ...jointsForFrame };
          for (const id of Object.keys(result.joints)) {
            const before = jointsForFrame[id] ?? result.joints[id]!;
            const after = result.joints[id]!;
            const off = {
              x: lerp(before.previewOffset.x, after.previewOffset.x, t),
              y: lerp(before.previewOffset.y, after.previewOffset.y, t),
            };
            blended[id] = { ...after, previewOffset: off, targetOffset: off, currentOffset: off };
          }

          return { ...prev, joints: blended };
        }

        const nextJoints = { ...jointsForFrame };
        let changed = false;

        // While the user is actively dragging (joint or mask), the rig should
        // track the cursor exactly (no smoothing/lead lag).
        // Convert snappiness into a stable per-frame alpha.
        // - When snappiness=1, snaps immediately.
        // - When snappiness is small, follows smoothly; dt keeps it consistent across FPS.
        const sn = clamp(prev.snappiness, 0.05, 1.0);
        const alpha = isDirectManipulation ? 1 : 1 - Math.pow(1 - sn, dt * 60);

        Object.keys(nextJoints).forEach(id => {
          const joint = nextJoints[id];

          // 1) Preview -> Target (Lead)
          const nextTarget = prev.leadEnabled && !isDirectManipulation
            ? {
                x: joint.targetOffset.x + (joint.previewOffset.x - joint.targetOffset.x) * alpha,
                y: joint.targetOffset.y + (joint.previewOffset.y - joint.targetOffset.y) * alpha,
              }
            : { ...joint.previewOffset };

          // 2) Target -> Current (Mesh/Reality)
          const nextCurrent = {
            x: joint.currentOffset.x + (nextTarget.x - joint.currentOffset.x) * alpha,
            y: joint.currentOffset.y + (nextTarget.y - joint.currentOffset.y) * alpha,
          };

          const tdX = nextTarget.x - joint.targetOffset.x;
          const tdY = nextTarget.y - joint.targetOffset.y;
          const cdX = nextCurrent.x - joint.currentOffset.x;
          const cdY = nextCurrent.y - joint.currentOffset.y;
          if (Math.abs(tdX) > 0.0001 || Math.abs(tdY) > 0.0001 || Math.abs(cdX) > 0.0001 || Math.abs(cdY) > 0.0001) {
            nextJoints[id] = {
              ...joint,
              targetOffset: nextTarget,
              currentOffset: nextCurrent,
            };
            changed = true;
          }
        });

        if (changed || procgenPreviewApplied) return { ...prev, joints: nextJoints };
        return prev;
      });
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const pickRubberbandAnchorId = useCallback((dragId: string): string | null => {
    if (dragId === 'head') return 'neck_base';
    if (dragId === 'l_wrist' || dragId === 'l_fingertip') return 'l_shoulder';
    if (dragId === 'r_wrist' || dragId === 'r_fingertip') return 'r_shoulder';
    if (dragId === 'l_ankle') return 'l_hip';
    if (dragId === 'r_ankle') return 'r_hip';
    return state.joints[dragId]?.parent ?? null;
  }, [state.joints]);

  useEffect(() => {
    if (state.procgen.enabled) return;
    if (!state.timeline.enabled) return;
    if (!timelinePlaying) return;

    let rafId = 0;
    let last = performance.now();
    let acc = 0;

    const fps = Math.max(1, Math.floor(state.timeline.clip.fps));
    const frameCount = Math.max(1, Math.floor(state.timeline.clip.frameCount));
    const frameStep = 1 / fps;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      acc += dt;

      let advance = 0;
      while (acc >= frameStep) {
        acc -= frameStep;
        advance += 1;
        if (advance >= 5) {
          // Prevent huge catch-up spikes (tab backgrounding, etc.).
          acc = 0;
          break;
        }
      }

      if (advance > 0) {
        const nextFrame = (timelineFrameRef.current + advance) % frameCount;
        timelineFrameRef.current = nextFrame;
        setTimelineFrame(nextFrame);
        setState((prev) => {
          const pose = sampleClipPose(prev.timeline.clip, nextFrame, INITIAL_JOINTS, {
            stretchEnabled: prev.stretchEnabled,
          });
          if (!pose) return prev;

          const isFullFluid = getPhysicsBlendMode(prev) === 'fluid';
          if (!isFullFluid || prev.activeRoots.length === 0) {
            return { ...prev, joints: applyPoseSnapshotToJoints(prev.joints, pose) };
          }

          const seeded = applyPoseSnapshotToJoints(prev.joints, pose);
          const rootTargets =
            timelinePinTargetsRef.current ??
            (() => {
              const pose0 =
                sampleClipPose(prev.timeline.clip, 0, INITIAL_JOINTS, { stretchEnabled: prev.stretchEnabled }) ??
                capturePoseSnapshot(INITIAL_JOINTS, 'preview');
              return prev.activeRoots.reduce<Record<string, Point>>((acc, rootId) => {
                acc[rootId] = getWorldPositionFromOffsets(rootId, pose0.joints, INITIAL_JOINTS);
                return acc;
              }, {});
            })();
	          const projected = stepPosePhysics({
	            joints: seeded,
	            baseJoints: INITIAL_JOINTS,
	            activeRoots: prev.activeRoots,
	            rootTargets,
	            drag: null,
	            connectionOverrides: prev.connectionOverrides,
	            options: {
	              dt: 1 / 60,
	              iterations: 22,
	              damping: 0.12,
	              wireCompliance: 0.0015,
	              rigidity: prev.rigidity,
	              hardStop: prev.hardStop,
	              autoBend: prev.bendEnabled,
	              stretchEnabled: prev.stretchEnabled,
	            },
	          }).joints;

          return { ...prev, joints: projected };
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    state.procgen.enabled,
    state.timeline.enabled,
    state.timeline.clip.easing,
    state.timeline.clip.fps,
    state.timeline.clip.frameCount,
    state.timeline.clip.keyframes,
    timelinePlaying,
  ]);

  useEffect(() => {
    if (state.procgen.enabled) return;
    if (!state.timeline.enabled) return;
    if (timelinePlaying) return;
    setState((prev) => {
      const pose = sampleClipPose(prev.timeline.clip, timelineFrame, INITIAL_JOINTS, { stretchEnabled: prev.stretchEnabled });
      if (!pose) return prev;

      const isFullFluid = getPhysicsBlendMode(prev) === 'fluid';
      if (!isFullFluid || prev.activeRoots.length === 0) {
        return { ...prev, joints: applyPoseSnapshotToJoints(prev.joints, pose) };
      }

      const seeded = applyPoseSnapshotToJoints(prev.joints, pose);
      const rootTargets =
        timelinePinTargetsRef.current ??
        (() => {
          const pose0 =
            sampleClipPose(prev.timeline.clip, 0, INITIAL_JOINTS, { stretchEnabled: prev.stretchEnabled }) ??
            capturePoseSnapshot(INITIAL_JOINTS, 'preview');
          return prev.activeRoots.reduce<Record<string, Point>>((acc, rootId) => {
            acc[rootId] = getWorldPositionFromOffsets(rootId, pose0.joints, INITIAL_JOINTS);
            return acc;
          }, {});
        })();
	      const projected = stepPosePhysics({
	        joints: seeded,
	        baseJoints: INITIAL_JOINTS,
	        activeRoots: prev.activeRoots,
	        rootTargets,
	        drag: null,
	        connectionOverrides: prev.connectionOverrides,
	        options: {
	          dt: 1 / 60,
	          iterations: 22,
	          damping: 0.12,
	          wireCompliance: 0.0015,
	          rigidity: prev.rigidity,
	          hardStop: prev.hardStop,
	          autoBend: prev.bendEnabled,
	          stretchEnabled: prev.stretchEnabled,
	        },
	      }).joints;

      return { ...prev, joints: projected };
    });
  }, [state.procgen.enabled, state.timeline.enabled, state.timeline.clip, timelineFrame, timelinePlaying]);

  const handleMouseDown = (id: string) => (e: React.MouseEvent) => {
    if (e.detail === 3) {
      e.stopPropagation();
      toggleRoot(id);
      return;
    }

    e.stopPropagation();
    setTimelinePlaying(false);
    setSelectedJointId(id);
    setMaskJointId(id);
    setSelectedConnectionKey(focusBoneKeyForJointId(id, state.joints));
    syncRigFocusFromJointId(id);
    historyCtrlRef.current.beginAction(`drag:${id}`, state);
    draggingIdLiveRef.current = id;
    effectiveDraggingIdLiveRef.current = resolveEffectiveManipulationId(id);
    const isRooted = state.activeRoots.includes(effectiveDraggingIdLiveRef.current);
    rootDragKindLiveRef.current = isRooted && e.ctrlKey ? 'root_target' : 'none';
    setGroundRootDragging(false);
    groundRootDraggingLiveRef.current = false;
    precisionAnchorRef.current = null;
    lastEffectiveMouseWorldRef.current = getWorldPosition(
      effectiveDraggingIdLiveRef.current,
      state.joints,
      INITIAL_JOINTS,
      'preview',
    );

    if (autoPoseCaptureEnabled) {
      if (autoPoseRecordingTimerRef.current) {
        clearInterval(autoPoseRecordingTimerRef.current);
        autoPoseRecordingTimerRef.current = null;
      }

      const fps = clamp(Math.floor(autoPoseCaptureFps), 1, 60);
      const startMs = performance.now();
      const startFrame = state.timeline.enabled ? clamp(timelineFrame, 0, Math.max(0, state.timeline.clip.frameCount - 1)) : 0;
      const basePose = capturePoseSnapshot(state.joints, 'preview');
      const session: DragRecordingSession = {
        draggingId: id,
        startMs,
        startFrame,
        fps,
        basePose,
        samples: [{ tMs: startMs, pose: basePose }],
        movedJointIds: new Set<string>(),
      };

      autoPoseRecordingRef.current = session;

      const movedThreshold = clamp(autoPoseCaptureMovedThreshold, 0, 0.1);
      const maxFramesPerDrag = clamp(Math.floor(autoPoseCaptureMaxFrames), 2, 600);

      autoPoseRecordingTimerRef.current = setInterval(() => {
        const active = autoPoseRecordingRef.current;
        if (!active || active.draggingId !== id) return;

        const now = performance.now();
        const dt = Math.max(0, (now - active.startMs) / 1000);
        const offset = Math.round(dt * active.fps);
        const maxOffset = maxFramesPerDrag - 1;

        const pose = capturePoseSnapshot(stateLiveRef.current.joints, 'preview');

        if (offset >= maxOffset) {
          // Capture a last sample at the max frame, then stop sampling.
          const lastTMs = active.startMs + (maxOffset / active.fps) * 1000;
          active.samples.push({ tMs: lastTMs, pose });
          const moved = detectMovedJointIds(active.basePose, pose, movedThreshold);
          moved.forEach((jid) => active.movedJointIds.add(jid));

          if (autoPoseRecordingTimerRef.current) {
            clearInterval(autoPoseRecordingTimerRef.current);
            autoPoseRecordingTimerRef.current = null;
          }
          return;
        }

        active.samples.push({ tMs: now, pose });
        const moved = detectMovedJointIds(active.basePose, pose, movedThreshold);
        moved.forEach((jid) => active.movedJointIds.add(jid));
      }, Math.max(16, Math.floor(1000 / fps)));
    }
    
    // Start long press timer for rubberband mode
    if (state.controlMode === 'Rubberband') {
      rubberbandAnchorPinRef.current = null;
      dragStartTimeRef.current = Date.now();
      setIsLongPress(false);
      
      // Clear any existing timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      
      const timer = setTimeout(() => {
        setIsLongPress(true);
        const anchorId = pickRubberbandAnchorId(effectiveDraggingIdLiveRef.current ?? id);
        if (anchorId && state.joints[anchorId]) {
          rubberbandAnchorPinRef.current = {
            id: anchorId,
            target: getWorldPosition(anchorId, state.joints, INITIAL_JOINTS, 'preview'),
          };
        }
        // Store current pose for rubberband stretching (deep clone)
        setRubberbandPose(JSON.parse(JSON.stringify(state)));
      }, 500); // 500ms for long press
      
      longPressTimerRef.current = timer;
      setLongPressTimer(timer);
    }
    
    const effectiveId = effectiveDraggingIdLiveRef.current ?? id;
    const excludeFromPhysicsDrag = effectiveId === 'sternum' || effectiveId === 'collar';
    if (shouldRunPosePhysics(state) && !excludeFromPhysicsDrag && (!isRooted || rootDragKindLiveRef.current === 'root_target')) {
      dragTargetRef.current = { id: effectiveId, target: getWorldPosition(effectiveId, state.joints, INITIAL_JOINTS, 'preview') };
    }

    pinWorldRef.current =
      state.activeRoots.length === 0
        ? null
        : state.activeRoots.reduce<Record<string, Point>>((acc, rootId) => {
            acc[rootId] = pinTargetsRef.current[rootId] ?? getWorldPosition(rootId, state.joints, INITIAL_JOINTS, 'preview');
            return acc;
          }, {});
    setDraggingId(id);
  };

  const handleGroundRootMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state.activeRoots.length > 0) return;
    setTimelinePlaying(false);
    setSelectedJointId(null);
    historyCtrlRef.current.beginAction('drag:ground_root', state);
    setDraggingId(null);
    draggingIdLiveRef.current = null;
    effectiveDraggingIdLiveRef.current = null;
    setGroundRootDragging(true);
    groundRootDraggingLiveRef.current = true;
    precisionAnchorRef.current = null;
    lastEffectiveMouseWorldRef.current = state.groundRootTarget;
  };

  const handleRootLeverMouseDown = (rootId: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!state.activeRoots.includes(rootId)) return;
    if (!state.joints[rootId]?.parent) return;
    setTimelinePlaying(false);
    setSelectedJointId(rootId);
    historyCtrlRef.current.beginAction(`root_lever:${rootId}`, state);
    setDraggingId(null);
    draggingIdLiveRef.current = null;
    effectiveDraggingIdLiveRef.current = null;
    setGroundRootDragging(false);
    groundRootDraggingLiveRef.current = false;
    setRootLeverDraggingId(rootId);
    rootLeverDraggingLiveRef.current = rootId;
    rootDragKindLiveRef.current = 'root_lever';
    precisionAnchorRef.current = null;
    lastEffectiveMouseWorldRef.current = pinTargetsRef.current[rootId] ?? getWorldPosition(rootId, state.joints, INITIAL_JOINTS, 'preview');
  };

  const handleMaskMouseDown = (jointId: string) => (e: React.MouseEvent) => {
    if (!maskEditArmed) return;
    e.stopPropagation();
    setTimelinePlaying(false);
    setSelectedJointId(jointId);
    setMaskJointId(jointId);
    setSelectedConnectionKey(focusBoneKeyForJointId(jointId, state.joints));
    syncRigFocusFromJointId(jointId);
    const mask = state.scene.jointMasks[jointId];
    if (!mask?.src || !mask.visible) return;
    historyCtrlRef.current.beginAction(`mask_drag:${jointId}`, state);
    maskDraggingLiveRef.current = true;
    setMaskDragging({
      jointId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOffsetX: mask.offsetX ?? 0,
      startOffsetY: mask.offsetY ?? 0,
      startRotation: mask.rotation ?? 0,
      startScale: mask.scale ?? 1,
      startStretchX: mask.stretchX ?? 1,
      startStretchY: mask.stretchY ?? 1,
      startSkewX: mask.skewX ?? 0,
      startSkewY: mask.skewY ?? 0,
      startAnchorX: mask.anchorX ?? 0.5,
      startAnchorY: mask.anchorY ?? 0.5,
      mode: maskDragMode,
    });
  };

  const WORLD_PX_SCALE = 20;
  const PRECISION_DRAG_SCALE = 0.2; // hold Alt for 20% drag sensitivity

  const getMouseCanvasPx = (clientX: number, clientY: number): Point | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const getMouseWorld = (clientX: number, clientY: number): Point => {
    const p = getMouseCanvasPx(clientX, clientY);
    if (!p) return { x: 0, y: 0 };

    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const transformedX = (p.x - state.viewOffset.x) / state.viewScale;
    const transformedY = (p.y - state.viewOffset.y) / state.viewScale;

    return {
      x: (transformedX - centerX) / WORLD_PX_SCALE,
      y: (transformedY - centerY) / WORLD_PX_SCALE,
    };
  };

  const worldToCanvasPx = (world: Point): Point => {
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const baseX = world.x * WORLD_PX_SCALE + centerX;
    const baseY = world.y * WORLD_PX_SCALE + centerY;
    return {
      x: baseX * state.viewScale + state.viewOffset.x,
      y: baseY * state.viewScale + state.viewOffset.y,
    };
  };

  const hideCursorHud = () => {
    if (cursorHudRef.current) cursorHudRef.current.style.opacity = '0';
    if (cursorTargetRef.current) cursorTargetRef.current.style.opacity = '0';
  };

  const updateCursorHud = (args: {
    clientX: number;
    clientY: number;
    rawWorld: Point;
    effectiveWorld: Point;
    altKey: boolean;
    shiftKey: boolean;
    showTarget: boolean;
  }) => {
    const hud = cursorHudRef.current;
    const reticle = cursorReticleRef.current;
    const label = cursorLabelRef.current;
    const target = cursorTargetRef.current;
    if (!hud || !reticle || !label || !target) return;

    const canvasPos = getMouseCanvasPx(args.clientX, args.clientY);
    if (!canvasPos || !Number.isFinite(canvasPos.x) || !Number.isFinite(canvasPos.y)) return;

    const color = args.altKey && args.shiftKey
      ? 'rgba(179, 102, 255, 0.95)'
      : args.altKey
        ? 'rgba(51, 211, 255, 0.95)'
        : args.shiftKey
          ? 'rgba(255, 136, 0, 0.95)'
          : 'rgba(255, 255, 255, 0.92)';

    const glow = args.altKey && args.shiftKey
      ? 'rgba(179, 102, 255, 0.24)'
      : args.altKey
        ? 'rgba(51, 211, 255, 0.26)'
        : args.shiftKey
          ? 'rgba(255, 136, 0, 0.24)'
          : 'rgba(255, 255, 255, 0.22)';

    hud.style.opacity = '1';

    reticle.style.left = `${canvasPos.x}px`;
    reticle.style.top = `${canvasPos.y}px`;
    reticle.style.setProperty('--cursor-color', color);
    reticle.style.setProperty('--cursor-glow', glow);

    label.style.left = `${canvasPos.x}px`;
    label.style.top = `${canvasPos.y}px`;

    const rawTxt = `${args.rawWorld.x.toFixed(3)}, ${args.rawWorld.y.toFixed(3)}`;
    const effTxt = `${args.effectiveWorld.x.toFixed(3)}, ${args.effectiveWorld.y.toFixed(3)}`;
    const modeParts: string[] = [];
    if (args.altKey) modeParts.push(`PREC ${PRECISION_DRAG_SCALE}x`);
    if (args.shiftKey) modeParts.push(`SNAP 1px`);
    label.textContent = args.showTarget ? `W ${rawTxt}  T ${effTxt}${modeParts.length ? `  ${modeParts.join('  ')}` : ''}` : `W ${rawTxt}${modeParts.length ? `  ${modeParts.join('  ')}` : ''}`;

    target.style.setProperty('--cursor-color', color);
    target.style.setProperty('--cursor-glow', glow);

    if (args.showTarget) {
      const t = worldToCanvasPx(args.effectiveWorld);
      if (Number.isFinite(t.x) && Number.isFinite(t.y)) {
        target.style.left = `${t.x}px`;
        target.style.top = `${t.y}px`;
        target.style.opacity = '1';
      } else {
        target.style.opacity = '0';
      }
    } else {
      target.style.opacity = '0';
    }
  };

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const mouseWorldRaw = getMouseWorld(e.clientX, e.clientY);

        // Enhanced cursor HUD (kept out of React render loop for performance)
        updateCursorHud({
          clientX: e.clientX,
          clientY: e.clientY,
          rawWorld: mouseWorldRaw,
          effectiveWorld: mouseWorldRaw,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          showTarget: false,
        });

        if (groundPlaneDragging) {
          groundPlaneDraggingLiveRef.current = true;
          const dyWorld = mouseWorldRaw.y - groundPlaneDragging.startMouseWorldY;
          const nextY = clamp(groundPlaneDragging.startPlaneY + dyWorld, -200, 200);
          setState((prev) => ({
            ...prev,
            procgen: {
              ...prev.procgen,
              options: {
                ...prev.procgen.options,
                groundPlaneY: nextY,
              },
            },
          }));
          return;
        }

        if (maskDragging) {
          maskDraggingLiveRef.current = true;
          let dx = e.clientX - maskDragging.startClientX;
          let dy = e.clientY - maskDragging.startClientY;
          if (e.altKey) {
            dx *= PRECISION_DRAG_SCALE;
            dy *= PRECISION_DRAG_SCALE;
          }
          if (e.shiftKey) {
            dx = Math.round(dx);
            dy = Math.round(dy);
          }
          const jointId = maskDragging.jointId;
          setState((prev) => {
            const mask = prev.scene.jointMasks[jointId];
            if (!mask) return prev;
            // `offsetX/offsetY` are stored in *screen pixels* so mask movement feels consistent
            // regardless of the current zoom (`viewScale` is applied to the whole SVG group).
            const next = (() => {
              switch (maskDragging.mode) {
                case 'move': {
                  return {
                    offsetX: Number.isFinite(maskDragging.startOffsetX + dx) ? maskDragging.startOffsetX + dx : 0,
                    offsetY: Number.isFinite(maskDragging.startOffsetY + dy) ? maskDragging.startOffsetY + dy : 0,
                  };
                }
                case 'rotate': {
                  const nextRotation = maskDragging.startRotation + dx * 0.5;
                  return { rotation: Math.max(-360, Math.min(360, nextRotation)) };
                }
                case 'scale': {
                  const factor = 1 + dy / 200;
                  const nextScale = maskDragging.startScale * factor;
                  return { scale: Math.max(0.01, Math.min(20, nextScale)) };
                }
                case 'stretch': {
                  const fx = 1 + dx / 200;
                  const fy = 1 + dy / 200;
                  return {
                    stretchX: Math.max(0.1, Math.min(10, maskDragging.startStretchX * fx)),
                    stretchY: Math.max(0.1, Math.min(10, maskDragging.startStretchY * fy)),
                  };
                }
                case 'skew': {
                  const nextSkewX = maskDragging.startSkewX + dx * 0.1;
                  const nextSkewY = maskDragging.startSkewY + dy * 0.1;
                  return {
                    skewX: Math.max(-45, Math.min(45, nextSkewX)),
                    skewY: Math.max(-45, Math.min(45, nextSkewY)),
                  };
                }
                case 'anchor': {
                  const nextAnchorX = maskDragging.startAnchorX + dx / 300;
                  const nextAnchorY = maskDragging.startAnchorY + dy / 300;
                  return {
                    anchorX: Math.max(0, Math.min(1, nextAnchorX)),
                    anchorY: Math.max(0, Math.min(1, nextAnchorY)),
                  };
                }
              }
            })();
            return {
              ...prev,
              scene: {
                ...prev.scene,
                jointMasks: {
                  ...prev.scene.jointMasks,
                  [jointId]: {
                    ...mask,
                    ...next,
                  },
                },
              },
            };
          });
          return;
        }

        if (rootLeverDraggingId) {
          const snapWorld = (v: number, step: number) => Math.round(v / step) * step;
          const effectiveWorld = (() => {
            let next = mouseWorldRaw;
            if (e.altKey) {
              const anchor =
                precisionAnchorRef.current ??
                (() => {
                  const a = { raw: mouseWorldRaw, applied: lastEffectiveMouseWorldRef.current ?? mouseWorldRaw };
                  precisionAnchorRef.current = a;
                  return a;
                })();
              const dx = (mouseWorldRaw.x - anchor.raw.x) * PRECISION_DRAG_SCALE;
              const dy = (mouseWorldRaw.y - anchor.raw.y) * PRECISION_DRAG_SCALE;
              next = { x: anchor.applied.x + dx, y: anchor.applied.y + dy };
            }
            if (e.shiftKey) {
              const step = 1 / (WORLD_PX_SCALE * Math.max(1e-6, state.viewScale));
              next = { x: snapWorld(next.x, step), y: snapWorld(next.y, step) };
            }

            lastEffectiveMouseWorldRef.current = next;
            return next;
          })();

          updateCursorHud({
            clientX: e.clientX,
            clientY: e.clientY,
            rawWorld: mouseWorldRaw,
            effectiveWorld,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            showTarget: Boolean(e.altKey || e.shiftKey),
          });

          const leverId = rootLeverDraggingId;
          setState((prev) => {
            const joint = prev.joints[leverId];
            if (!joint?.parent) return prev;
            const rootWorld =
              pinTargetsRef.current[leverId] ?? getWorldPosition(leverId, prev.joints, INITIAL_JOINTS, 'preview');
            const dx = effectiveWorld.x - rootWorld.x;
            const dy = effectiveWorld.y - rootWorld.y;
            const mag = Math.hypot(dx, dy);
            if (!Number.isFinite(mag) || mag < 1e-6) return prev;
            const nx = dx / mag;
            const ny = dy / mag;

            const len = vectorLength(prev.stretchEnabled ? joint.previewOffset : joint.baseOffset) || vectorLength(joint.previewOffset);
            if (!Number.isFinite(len) || len < 1e-6) return prev;

            // Lever rotates the bone around the rooted joint: parent ends up in the direction of the lever.
            const nextOffset = { x: -nx * len, y: -ny * len };
            const nextJoints = { ...prev.joints };
            nextJoints[leverId] = { ...joint, previewOffset: nextOffset, targetOffset: nextOffset, currentOffset: nextOffset };
            return { ...prev, joints: nextJoints };
          });
          return;
        }

        if (groundRootDragging) {
          const snapWorld = (v: number, step: number) => Math.round(v / step) * step;
          const effectiveWorld = (() => {
            let next = mouseWorldRaw;
            if (e.altKey) {
              const anchor =
                precisionAnchorRef.current ??
                (() => {
                  const a = { raw: mouseWorldRaw, applied: lastEffectiveMouseWorldRef.current ?? mouseWorldRaw };
                  precisionAnchorRef.current = a;
                  return a;
                })();
              const dx = (mouseWorldRaw.x - anchor.raw.x) * PRECISION_DRAG_SCALE;
              const dy = (mouseWorldRaw.y - anchor.raw.y) * PRECISION_DRAG_SCALE;
              next = { x: anchor.applied.x + dx, y: anchor.applied.y + dy };
            }
            if (e.shiftKey) {
              const step = 1 / (WORLD_PX_SCALE * Math.max(1e-6, state.viewScale));
              next = { x: snapWorld(next.x, step), y: snapWorld(next.y, step) };
            }

            lastEffectiveMouseWorldRef.current = next;
            return next;
          })();

          updateCursorHud({
            clientX: e.clientX,
            clientY: e.clientY,
            rawWorld: mouseWorldRaw,
            effectiveWorld,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            showTarget: Boolean(e.altKey || e.shiftKey),
          });

          setState((prev) => {
            if (prev.activeRoots.length > 0) return prev;
            const nextTarget = { x: effectiveWorld.x, y: effectiveWorld.y };
            const corrected = applyGroundRootCorrectionToJoints({
              joints: prev.joints,
              baseJoints: INITIAL_JOINTS,
              activeRoots: prev.activeRoots,
              groundRootTarget: nextTarget,
            });
            if (corrected === prev.joints && prev.groundRootTarget.x === nextTarget.x && prev.groundRootTarget.y === nextTarget.y) {
              return prev;
            }
            return { ...prev, groundRootTarget: nextTarget, joints: corrected };
          });
          return;
        }

        if (!draggingId) return;
        draggingIdLiveRef.current = draggingId;

        const snapWorld = (v: number, step: number) => Math.round(v / step) * step;
        const effectiveWorld = (() => {
          let next = mouseWorldRaw;
          if (e.altKey) {
            const anchor =
              precisionAnchorRef.current ??
              (() => {
                const a = { raw: mouseWorldRaw, applied: lastEffectiveMouseWorldRef.current ?? mouseWorldRaw };
                precisionAnchorRef.current = a;
                return a;
              })();
            next = {
              x: anchor.applied.x + (mouseWorldRaw.x - anchor.raw.x) * PRECISION_DRAG_SCALE,
              y: anchor.applied.y + (mouseWorldRaw.y - anchor.raw.y) * PRECISION_DRAG_SCALE,
            };
          } else {
            precisionAnchorRef.current = null;
          }

          if (e.shiftKey) {
            const step = 1 / (WORLD_PX_SCALE * Math.max(1e-6, state.viewScale));
            next = { x: snapWorld(next.x, step), y: snapWorld(next.y, step) };
          }

          lastEffectiveMouseWorldRef.current = next;
          return next;
        })();

        updateCursorHud({
          clientX: e.clientX,
          clientY: e.clientY,
          rawWorld: mouseWorldRaw,
          effectiveWorld,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          showTarget: Boolean(e.altKey || e.shiftKey),
        });

        const mouseX = effectiveWorld.x;
        const mouseY = effectiveWorld.y;

        const effectiveId = effectiveDraggingIdLiveRef.current ?? draggingId;

        const isRooted = state.activeRoots.includes(effectiveId);
        if (isRooted && rootDragKindLiveRef.current !== 'root_target') {
          setState((prev) => {
            const joint = prev.joints[effectiveId];
            if (!joint?.parent) return prev;
            const rootWorld =
              pinTargetsRef.current[effectiveId] ?? getWorldPosition(effectiveId, prev.joints, INITIAL_JOINTS, 'preview');
            const dx = mouseX - rootWorld.x;
            const dy = mouseY - rootWorld.y;
            const mag = Math.hypot(dx, dy);
            if (!Number.isFinite(mag) || mag < 1e-6) return prev;
            const nx = dx / mag;
            const ny = dy / mag;

            const len = vectorLength(prev.stretchEnabled ? joint.previewOffset : joint.baseOffset) || vectorLength(joint.previewOffset);
            if (!Number.isFinite(len) || len < 1e-6) return prev;

            const nextOffset = { x: -nx * len, y: -ny * len };
            const nextJoints = { ...prev.joints };
            nextJoints[effectiveId] = { ...joint, previewOffset: nextOffset, targetOffset: nextOffset, currentOffset: nextOffset };
            return { ...prev, joints: nextJoints };
          });
          return;
        }

        const pinWorld = pinWorldRef.current;
        const hasRootedFeet = Boolean(pinWorld && (pinWorld.l_ankle || pinWorld.r_ankle));
	        const isBalanceHandle =
	          effectiveId === 'head' ||
	          effectiveId === 'neck_base' ||
	          effectiveId === 'sternum' ||
	          effectiveId === 'navel' ||
	          effectiveId === 'l_hip' ||
	          effectiveId === 'r_hip';

        if (hasRootedFeet && isBalanceHandle && pinWorld) {
          setState((prev) => applyBalanceDragToState(prev, effectiveId, { x: mouseX, y: mouseY }, pinWorld));
          return;
        }

        const excludeFromPhysicsDrag = effectiveId === 'sternum' || effectiveId === 'collar';
        if (shouldRunPosePhysics(state) && !excludeFromPhysicsDrag) {
          dragTargetRef.current = { id: effectiveId, target: { x: mouseX, y: mouseY } };
          return;
        }

        setState((prev) => applyDragToState(prev, effectiveId, { x: mouseX, y: mouseY }));
      },
      [draggingId, groundRootDragging, maskDragging, rootLeverDraggingId, state.activeRoots, state.stretchEnabled, state.viewScale, state.viewOffset, canvasSize],
    );

  const handleMouseUp = () => {
    // Clear long press timer
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (groundPlaneDragging) {
      setGroundPlaneDragging(null);
      groundPlaneDraggingLiveRef.current = false;
      commitHistoryAction();
      return;
    }

    precisionAnchorRef.current = null;
    lastEffectiveMouseWorldRef.current = null;
    if (cursorTargetRef.current) cursorTargetRef.current.style.opacity = '0';

    const finalizedRecording = autoPoseRecordingRef.current;
    if (autoPoseRecordingTimerRef.current) {
      clearInterval(autoPoseRecordingTimerRef.current);
      autoPoseRecordingTimerRef.current = null;
    }
    autoPoseRecordingRef.current = null;

    let recordingFrames = finalizedRecording
      ? buildRecordingFrames(finalizedRecording, { maxFramesPerDrag: autoPoseCaptureMaxFrames })
      : [];
    if (finalizedRecording && autoPoseCaptureSimplifyEnabled) {
      recordingFrames = simplifyRecordingFrames(
        recordingFrames,
        finalizedRecording.movedJointIds,
        clamp(autoPoseCaptureSimplifyEpsilon, 0, 0.1),
      );
    }
    const endFrameToJump =
      finalizedRecording && recordingFrames.length ? recordingFrames[recordingFrames.length - 1]!.frame : null;

    // If a rooted joint was explicitly root-dragged, update its root target so it "sticks" on release.
    const effectiveId = draggingId ? (effectiveDraggingIdLiveRef.current ?? draggingId) : null;
    if (effectiveId && state.activeRoots.includes(effectiveId) && rootDragKindLiveRef.current === 'root_target') {
      const drag = dragTargetRef.current;
      const nextTarget =
        drag && drag.id === effectiveId ? drag.target : getWorldPosition(effectiveId, state.joints, INITIAL_JOINTS, 'preview');
      pinTargetsRef.current = { ...pinTargetsRef.current, [effectiveId]: nextTarget };
    }
    
    // Handle rubberband snap behavior
    if (state.controlMode === 'Rubberband' && isLongPress && rubberbandPose) {
      // Snap to next pose or restore based on timeline
      if (state.timeline.enabled) {
        // If timeline is active, advance to next frame
        const maxFrame = Math.max(0, state.timeline.clip.frameCount - 1);
        const nextFrame = Math.min(timelineFrameRef.current + 1, maxFrame);
        setTimelineFrame(nextFrame);
      } else {
        // Otherwise restore the rubberband pose
        setStateWithHistory('rubberband_snap', (prev) => ({
          ...prev,
          joints: rubberbandPose.joints,
        }));
      }
    }
    
    // Reset rubberband state
    setIsLongPress(false);
    setRubberbandPose(null);
    rubberbandAnchorPinRef.current = null;
    
    if (maskDragging) {
      setMaskDragging(null);
      setMaskEditArmed(false);
    }

    setGroundRootDragging(false);
    groundRootDraggingLiveRef.current = false;
    setRootLeverDraggingId(null);
    rootLeverDraggingLiveRef.current = null;
    rootDragKindLiveRef.current = 'none';
    draggingIdLiveRef.current = null;
    effectiveDraggingIdLiveRef.current = null;
    pinWorldRef.current = null;
    dragTargetRef.current = null;
    setDraggingId(null);
    setState((prev) => {
      let next = prev;
      if (finalizedRecording && recordingFrames.length && finalizedRecording.movedJointIds.size) {
        next = bakeRecordingIntoTimeline(
          next,
          recordingFrames,
          finalizedRecording.movedJointIds,
          finalizedRecording.basePose,
          autoPoseCaptureOverlayWeight,
        ).nextState;
      }
      const changed = historyCtrlRef.current.commitAction(next);
      return changed ? { ...next } : next;
    });

    if (endFrameToJump !== null && finalizedRecording?.movedJointIds.size) {
      setTimelinePlaying(false);
      timelineFrameRef.current = endFrameToJump;
      setTimelineFrame(endFrameToJump);
    }
  };

  const setJointAngleDeg = useCallback((jointId: string, angleDeg: number) => {
    setState((prev) => {
      const joint = prev.joints[jointId];
      if (!joint || !joint.parent) return prev;

      const baseLen = vectorLength(joint.baseOffset);
      const currentLen = vectorLength(joint.previewOffset);
      const len = prev.stretchEnabled ? (currentLen || baseLen) : (baseLen || currentLen);
      if (!len) return prev;

      const nextOffset = fromAngleDeg(angleDeg, len);
      const nextJoints = { ...prev.joints };
      nextJoints[jointId] = {
        ...joint,
        previewOffset: nextOffset,
        targetOffset: nextOffset,
        currentOffset: nextOffset,
      };

      if (prev.mirroring && joint.mirrorId && nextJoints[joint.mirrorId]) {
        const mirror = nextJoints[joint.mirrorId];
        const mirroredOffset = { x: -nextOffset.x, y: nextOffset.y };
        nextJoints[joint.mirrorId] = {
          ...mirror,
          previewOffset: mirroredOffset,
          targetOffset: mirroredOffset,
          currentOffset: mirroredOffset,
        };
      }

      return { ...prev, joints: nextJoints };
    });
  }, []);

  const applyTimelineFrame = useCallback(
    (frameRaw: number) => {
      setTimelinePlaying(false);
      const maxFrame = Math.max(0, state.timeline.clip.frameCount - 1);
      const frame = clamp(Math.floor(frameRaw), 0, maxFrame);
      timelineFrameRef.current = frame;
      setTimelineFrame(frame);
    },
    [state.timeline.clip.frameCount],
  );

  const fitTimelineToBackgroundVideo = useCallback(() => {
    if (!state.scene.background.src) {
      alert('Set a background reference first.');
      return;
    }

    setTimelinePlaying(false);
    timelineFrameRef.current = 0;
    setTimelineFrame(0);

    setStateWithHistory('timeline_fit_to_bg_ref', (prev) => {
      const maxFrames = 600;
      const videoRate = clamp(prev.scene.background.videoRate, 0.05, 4);

      const resolveDurationSeconds = (): number => {
        if (prev.scene.background.mediaType === 'video') {
          const duration = bgVideoMeta?.duration ?? 0;
          return Number.isFinite(duration) ? duration : 0;
        }
        if (prev.scene.background.mediaType === 'sequence') {
          const id = prev.scene.background.sequence?.id;
          const seq = id ? referenceSequencesRef.current.get(id) : null;
          if (!seq) return 0;
          const fps = clamp(Math.floor(seq.fps || 24), 1, 60);
          return seq.frames.length / fps;
        }
        return 0;
      };

      const durationSeconds = resolveDurationSeconds();
      if (!durationSeconds) {
        alert('Background reference metadata not loaded yet. Try toggling the background visibility or Pose Trace on/off.');
        return prev;
      }

      const baseFps =
        prev.scene.background.mediaType === 'sequence'
          ? clamp(Math.floor(prev.scene.background.sequence?.fps || prev.timeline.clip.fps || 24), 1, 60)
          : clamp(Math.floor(prev.timeline.clip.fps || 24), 1, 60);

      const startSeconds = clamp(prev.scene.background.videoStart, 0, Math.max(0, durationSeconds));
      const totalTimelineSeconds = Math.max(0, (durationSeconds - startSeconds) / Math.max(0.0001, videoRate));

      let fps = baseFps;
      let frameCount = Math.ceil(totalTimelineSeconds * fps);

      if (frameCount > maxFrames) {
        fps = clamp(Math.floor(maxFrames / Math.max(0.001, totalTimelineSeconds)), 1, 60);
        frameCount = Math.ceil(totalTimelineSeconds * fps);
      }

      frameCount = clamp(frameCount, 2, maxFrames);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          enabled: true,
          clip: {
            ...prev.timeline.clip,
            fps,
            frameCount,
            keyframes: prev.timeline.clip.keyframes.filter((k) => k.frame < frameCount),
          },
        },
      };
    });
  }, [
    bgVideoMeta?.duration,
    setStateWithHistory,
    state.scene.background.src,
  ]);

  const setKeyframeHere = useCallback(() => {
    setTimelinePlaying(false);
    setStateWithHistory('timeline_set_keyframe', (prev) => {
      const frameCount = Math.max(1, Math.floor(prev.timeline.clip.frameCount));
      const frame = clamp(timelineFrame, 0, frameCount - 1);
      const pose = capturePoseSnapshot(prev.joints, 'preview');

      const keyframes = prev.timeline.clip.keyframes.filter((k) => k.frame !== frame);
      keyframes.push({ frame, pose });
      keyframes.sort((a, b) => a.frame - b.frame);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          clip: {
            ...prev.timeline.clip,
            keyframes,
          },
        },
      };
    });
  }, [setStateWithHistory, timelineFrame]);

  const deleteKeyframeHere = useCallback(() => {
    setTimelinePlaying(false);
    setStateWithHistory('timeline_delete_keyframe', (prev) => {
      const frameCount = Math.max(1, Math.floor(prev.timeline.clip.frameCount));
      const frame = clamp(timelineFrame, 0, frameCount - 1);
      const keyframes = prev.timeline.clip.keyframes.filter((k) => k.frame !== frame);
      if (keyframes.length === prev.timeline.clip.keyframes.length) return prev;
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          clip: {
            ...prev.timeline.clip,
            keyframes,
          },
        },
      };
    });
  }, [setStateWithHistory, timelineFrame]);

  const sendPoseToTimeline = useCallback((poseSnapshot: PoseSnapshot, targetFrame?: number) => {
    setStateWithHistory('send_pose_to_timeline', (prev) => {
      const frameCount = Math.max(1, Math.floor(prev.timeline.clip.frameCount));
      const frame = targetFrame !== undefined ? clamp(targetFrame, 0, frameCount - 1) : timelineFrame;
      const pose = capturePoseSnapshot(poseSnapshot.joints, 'preview');

      const keyframes = prev.timeline.clip.keyframes.filter((k) => k.frame !== frame);
      keyframes.push({ frame, pose });
      keyframes.sort((a, b) => a.frame - b.frame);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          enabled: true,
          clip: {
            ...prev.timeline.clip,
            keyframes,
          },
        },
      };
    });
  }, [setStateWithHistory, state.timeline.enabled, timelineFrame]);

  const interpolateSelectedPoses = useCallback(() => {
    if (selectedPoseIndices.length < 2) return;
    
    const selectedPoses = selectedPoseIndices.map(i => poseSnapshots[i]).filter(Boolean);
    if (selectedPoses.length < 2) return;

    setStateWithHistory('interpolate_selected_poses', (prev) => {
      const spacing = 10;
      const baseFrameCount = clamp(Math.floor(prev.timeline.clip.frameCount || 120), 2, 600);
      const startFrame = prev.timeline.enabled ? clamp(timelineFrame, 0, baseFrameCount - 1) : 0;
      const endFrame = clamp(startFrame + (selectedPoses.length - 1) * spacing, 0, 599);
      const nextFrameCount = clamp(Math.max(baseFrameCount, endFrame + 1), 2, 600);
      
      if (!prev.timeline.enabled) {
        return {
          ...prev,
          timeline: {
            ...prev.timeline,
            enabled: true,
            clip: {
              ...prev.timeline.clip,
              frameCount: nextFrameCount,
              keyframes: selectedPoses.map((pose, index) => ({
                frame: index * spacing,
                pose: capturePoseSnapshot(pose.joints, 'preview'),
              })),
            },
          },
        };
      }

      const newKeyByFrame = new Map<number, { frame: number; pose: ReturnType<typeof capturePoseSnapshot> }>();
      for (let i = 0; i < selectedPoses.length; i += 1) {
        const frame = clamp(startFrame + i * spacing, 0, nextFrameCount - 1);
        newKeyByFrame.set(frame, { frame, pose: capturePoseSnapshot(selectedPoses[i]!.joints, 'preview') });
      }
      const newFrames = new Set(newKeyByFrame.keys());
      const mergedKeyframes = (prev.timeline.clip.keyframes ?? [])
        .filter((k) => !newFrames.has(k.frame))
        .concat(Array.from(newKeyByFrame.values()))
        .sort((a, b) => a.frame - b.frame);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          clip: {
            ...prev.timeline.clip,
            frameCount: nextFrameCount,
            keyframes: mergedKeyframes,
          },
        },
      };
    });

    setSelectedPoseIndices([]);
  }, [selectedPoseIndices, poseSnapshots, setStateWithHistory, timelineFrame]);

  const togglePoseSelection = useCallback((index: number) => {
    setSelectedPoseIndices(prev => {
      if (prev.includes(index)) {
        return prev.filter(i => i !== index);
      } else {
        return [...prev, index].sort((a, b) => a - b);
      }
    });
  }, []);

  const resetSkeleton = () => {
    // Clear long press timer on reset
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setIsLongPress(false);
    setRubberbandPose(null);
    
    pinTargetsRef.current = {};
    rubberbandAnchorPinRef.current = null;
    hingeSignsRef.current = {};
    const nextJoints = sanitizeJoints(null);
    setStateWithHistory('reset_engine', (prev) => ({
      ...prev,
      joints: nextJoints,
      activeRoots: [],
      groundRootTarget: computeCogWorld(nextJoints, INITIAL_JOINTS),
      viewScale: 1.0,
      viewOffset: { x: 0, y: 0 },
    }));
  };

  const toggleRoot = (id: string) => {
    if (state.activeRoots.includes(id)) {
      const next = { ...pinTargetsRef.current };
      delete next[id];
      pinTargetsRef.current = next;
    } else {
      pinTargetsRef.current = {
        ...pinTargetsRef.current,
        [id]: getWorldPosition(id, state.joints, INITIAL_JOINTS, 'preview'),
      };
    }
    setStateWithHistory('toggle_root', (prev) => ({
      ...prev,
      activeRoots: prev.activeRoots.includes(id)
        ? prev.activeRoots.filter((p) => p !== id)
        : [...prev.activeRoots, id],
    }));
  };

  const activeLook = LOOK_MODES.find((m) => m.id === state.lookMode) ?? LOOK_MODES[0]!;
  const pixelSnapPx = activeLook.pixelSnapPx ?? 0;
  const snapPx = (v: number) => (pixelSnapPx > 0 ? Math.round(v / pixelSnapPx) * pixelSnapPx : v);
  const isNosferatuLook = state.lookMode === 'nosferatu';
  const isSkeletalLook = state.lookMode === 'skeletal';

  const renderConnection = (conn: Connection) => {
    const fromJoint = state.joints[conn.from];
    const toJoint = state.joints[conn.to];
    if (!fromJoint || !toJoint) return null;

    const start = getWorldPosition(conn.from, state.joints, INITIAL_JOINTS);
    const end = getWorldPosition(conn.to, state.joints, INITIAL_JOINTS);

    // Use raw engine units, the <g> transform handles the rest
    const scale = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const x1 = snapPx(start.x * scale + centerX);
    const y1 = snapPx(start.y * scale + centerY);
    const x2 = snapPx(end.x * scale + centerX);
    const y2 = snapPx(end.y * scale + centerY);

    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Styling based on connection type
    const boneHex = getBoneHex(state.boneStyle);
    let strokeColor = boneHex;
    let strokeWidth = 4;
    let opacity = 0.9;
    let dashArray = "";
    const connKey = canonicalConnKey(conn.from, conn.to);
    const override = state.connectionOverrides?.[connKey];
    const isSelectedConn = selectedConnectionKey === connKey;

    if (conn.type === 'soft_limit') {
      strokeWidth = 2;
      opacity = 0.6;
      dashArray = "2 2";
    } else if (conn.type === 'structural_link') {
      strokeWidth = 1;
      opacity = 0.3;
      strokeColor = rgbCss(boneHex, 0.55);
    }

    if (isSelectedConn) {
      strokeColor = '#00ff88';
      opacity = 1.0;
      strokeWidth = Math.max(strokeWidth, 4) + 2;
      dashArray = '';
    }

    const renderShape = () => {
      const shape = override?.shape || conn.shape || 'standard';
      const fillColor = isNosferatuLook ? '#ffffff' : strokeColor;
      const lineColor = isNosferatuLook ? '#ffffff' : strokeColor;
      const shapeOpacity = isNosferatuLook ? Math.max(opacity, 0.85) : opacity;
      
      switch (shape) {
        case 'bone':
          return (
            <g transform={`translate(${x1}, ${y1}) rotate(${angle})`} style={{ opacity: shapeOpacity }}>
              <rect x="0" y="-3.5" width={len} height="7" rx="3.5" ry="3.5" fill={fillColor} />
              <circle cx="0" cy="0" r="5.5" fill={fillColor} />
              <circle cx={len} cy="0" r="5.5" fill={fillColor} />
            </g>
          );
        case 'muscle':
          return (
            <path
              d={`
                M 0,0
                Q ${len * 0.5}, -15 ${len}, 0
                Q ${len * 0.5}, 15 0, 0
                Z
              `}
              fill={fillColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity: shapeOpacity }}
            />
          );
        case 'capsule':
          return (
            <rect
              x="0"
              y="-4"
              width={len}
              height="8"
              rx="4"
              ry="4"
              fill={fillColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity: shapeOpacity }}
            />
          );
        case 'diamond':
          return (
            <polygon
              points={`0,0 ${len * 0.5},-7 ${len},0 ${len * 0.5},7`}
              fill={fillColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity: shapeOpacity }}
            />
          );
        case 'ribbon':
          return (
            <path
              d={`
                M 0,-5
                C ${len * 0.25}, -10, ${len * 0.75}, 0, ${len}, -5
                L ${len}, 5
                C ${len * 0.75}, 0, ${len * 0.25}, 10, 0, 5
                Z
              `}
              fill={fillColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity: shapeOpacity }}
            />
          );
        case 'tapered':
          return (
             <path
              d={`
                M 0,-4
                L ${len}, -1
                L ${len}, 1
                L 0, 4
                Z
              `}
              fill={fillColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity: shapeOpacity }}
            />
          );
        case 'cylinder':
           return (
            <rect
              x="0" y="-4" width={len} height="8"
              fill={fillColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity: shapeOpacity }}
            />
          );
        case 'wire':
          return (
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={lineColor}
              strokeWidth="2"
              style={{ opacity: shapeOpacity }}
            />
          );
        case 'wireframe':
          return (
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isNosferatuLook ? '#ffffff' : '#00ff00'}
              strokeWidth={isNosferatuLook ? '1' : '0.5'}
              style={{ opacity: isNosferatuLook ? shapeOpacity : 0.6 }}
            />
          );
        case 'standard':
        default:
          return (
            <path
              d={`
                M 0,-5 
                L ${len * 0.2},-2 
                L ${len * 0.8},-2 
                L ${len},-5 
                L ${len},5 
                L ${len * 0.8},2 
                L ${len * 0.2},2 
                L 0,5 
                Z
              `}
              fill={fillColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity: shapeOpacity }}
            />
          );
      }
    };

    return (
      <g key={`conn-${conn.from}-${conn.to}`}>
        {/* Main Connection Shape */}
        {renderShape()}
      </g>
    );
  };

  const renderJoint = (id: string) => {
    const joint = state.joints[id];
    const pos = getWorldPosition(id, state.joints, INITIAL_JOINTS);
    const isLotte = state.lookMode === 'lotte';
    const isRoot = !joint.parent;
    const isSelected = selectedJointId === id;

    // `root` is a technical joint (world translation); keep it invisible.
    if (id === 'root') return null;
    
    // Convert sacrum and ribs to x markers instead of joints
    const isSacrum = id === 'sacrum';
    const isRib = id.includes('rib');
    
    // Don't render sacrum as a joint anymore - it's now an x marker
    if (isSacrum) return null;
    
    // Don't render ribs as joints anymore - they're now x markers
    if (isRib) return null;

    const scale = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const x = pos.x * scale + centerX;
    const y = pos.y * scale + centerY;

    const sx = snapPx(x);
    const sy = snapPx(y);

    if (isNaN(sx) || isNaN(sy)) return null;

    const isNipple = id.includes('nipple');

    if (isNipple) return null;

    const isNosferatu = isNosferatuLook;
    const fillColor = isNosferatu
      ? '#ffffff'
      : isLotte
        ? '#000000'
        : isRoot
          ? 'white'
          : state.activeRoots.includes(id)
            ? '#00ff88'
            : state.controlMode === 'Rubberband' && isLongPress
              ? '#ff4444'
              : 'var(--accent)';
    const strokeColor = isNosferatu
      ? '#ffffff'
      : isLotte
        ? '#000000'
        : isSelected
          ? 'rgba(255, 255, 255, 0.9)'
          : state.controlMode === 'Rubberband' && isLongPress
            ? 'rgba(255, 68, 68, 0.8)'
            : 'var(--bg)';

    const glowStrength = clamp(state.physicsRigidity ?? 0, 0, 1);
    const baseGlow = isNosferatu ? 0 : glowStrength * 0.35;
    const selectedGlow = isSelected ? 0.18 : 0;
    const pinnedGlow = state.activeRoots.includes(id) ? 0.22 : 0;
    const glowOpacity = clamp(baseGlow + selectedGlow + pinnedGlow, 0, 0.75);

    return (
      <g key={`joint-${id}`}>
        {glowOpacity > 0.001 && (
          <circle
            cx={sx}
            cy={sy}
            r={isRoot ? 14 : 10}
            fill="rgb(125 255 170 / 1)"
            opacity={glowOpacity}
            filter="url(#joint-soft-glow)"
            pointerEvents="none"
            style={{ mixBlendMode: 'screen' }}
          />
        )}
        <circle
          cx={sx} cy={sy} r={isRoot ? 6 : (draggingId === id ? 6 : 4)}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 3 : 2}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown(id)}
        />
      </g>
    );
  };

  const renderXMarker = (id: string, color: string = "#00ff88") => {
    const pos = getWorldPosition(id, state.joints, INITIAL_JOINTS);
    const scale = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const x = pos.x * scale + centerX;
    const y = pos.y * scale + centerY;

    const sx = snapPx(x);
    const sy = snapPx(y);

    if (isNaN(sx) || isNaN(sy)) return null;

    const size = 8;
    return (
      <g key={`x-marker-${id}`}>
        <line x1={sx - size} y1={sy - size} x2={sx + size} y2={sy + size} stroke={color} strokeWidth="2" />
        <line x1={sx + size} y1={sy - size} x2={sx - size} y2={sy + size} stroke={color} strokeWidth="2" />
      </g>
    );
  };

  const renderGroundRootHandle = () => {
    if (state.activeRoots.length > 0) return null;
    if (!Number.isFinite(state.groundRootTarget.x) || !Number.isFinite(state.groundRootTarget.y)) return null;

    const scale = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const x = state.groundRootTarget.x * scale + centerX;
    const y = state.groundRootTarget.y * scale + centerY;
    const sx = snapPx(x);
    const sy = snapPx(y);
    if (isNaN(sx) || isNaN(sy)) return null;

    return (
      <g key="ground-root-handle">
        <circle
          cx={sx}
          cy={sy}
          r={10}
          fill="rgba(255, 255, 255, 0.06)"
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth={2}
          className="cursor-grab active:cursor-grabbing"
          onMouseDown={handleGroundRootMouseDown}
        />
        <line x1={sx - 8} y1={sy} x2={sx + 8} y2={sy} stroke="rgba(255, 255, 255, 0.55)" strokeWidth={2} pointerEvents="none" />
        <line x1={sx} y1={sy - 8} x2={sx} y2={sy + 8} stroke="rgba(255, 255, 255, 0.55)" strokeWidth={2} pointerEvents="none" />
      </g>
    );
  };

  const renderProcgenGroundPlane = () => {
    if (!state.procgen.enabled) return null;
    if (!state.procgen.options.groundPlaneVisible) return null;
    if (!canvasSize.width || !canvasSize.height) return null;

    const scale = WORLD_PX_SCALE;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const y = snapPx(state.procgen.options.groundPlaneY * scale + centerY);
    if (!Number.isFinite(y)) return null;

    const x1 = snapPx(centerX - canvasSize.width * 2);
    const x2 = snapPx(centerX + canvasSize.width * 2);

    const handleDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setTimelinePlaying(false);
      beginHistoryAction('procgen:ground_plane_drag');
      const mouseWorld = getMouseWorld(e.clientX, e.clientY);
      groundPlaneDraggingLiveRef.current = true;
      setGroundPlaneDragging({
        startMouseWorldY: mouseWorld.y,
        startPlaneY: stateLiveRef.current.procgen.options.groundPlaneY,
      });
    };

    return (
      <g key="procgen-ground-plane" opacity={0.9}>
        <line
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          stroke="rgba(0,0,0,0)"
          strokeWidth={14}
          className="cursor-ns-resize"
          onMouseDown={handleDown}
        />
        <line
          x1={x1}
          y1={y}
          x2={x2}
          y2={y}
          stroke="rgba(255, 255, 255, 0.25)"
          strokeWidth={1}
          strokeDasharray="6 6"
          pointerEvents="none"
        />
        <text
          x={snapPx(x1 + 12)}
          y={snapPx(y - 8)}
          fontSize={10}
          fill="rgba(255, 255, 255, 0.45)"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace"
          pointerEvents="none"
        >
          GROUND
        </text>
      </g>
    );
  };

  const cutoutsLayer = (() => {
    if (isSkeletalLook) return null;
    if (!canvasSize.width || !canvasSize.height) return null;

    const pxPerUnit = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const activeView = getActiveView(state);
    const overrideFor = (slotId: string) => activeView?.slotOverrides?.[slotId];
    const effectiveVisible = (slotId: string, baseVisible: boolean) =>
      overrideFor(slotId)?.visible !== undefined ? Boolean(overrideFor(slotId)?.visible) : baseVisible;
    const effectiveZIndex = (slotId: string, fallbackZ: number) => {
      const baseZ = state.cutoutSlots[slotId]?.zIndex ?? fallbackZ;
      const ov = overrideFor(slotId)?.zIndex;
      return ov !== undefined ? ov : baseZ;
    };

    const headPos = getWorldPosition('head', state.joints, INITIAL_JOINTS);
    const neckBasePos = getWorldPosition('neck_base', state.joints, INITIAL_JOINTS);
    const headLenUnits = Math.hypot(headPos.x - neckBasePos.x, headPos.y - neckBasePos.y);
    const headLenPx = Math.max(1, headLenUnits * pxPerUnit);

    const jointItems = Object.entries(state.scene.jointMasks)
      .flatMap(([jointId, mask]) => {
        if (!mask?.src) return [];
        if (!(jointId in state.joints)) return [];
        if (!effectiveVisible(jointId, Boolean(mask.visible))) return [];
        return [
          {
            kind: 'joint' as const,
            slotId: jointId,
            zIndex: effectiveZIndex(jointId, 50),
            mask,
          },
        ];
      });

    const headItem = (() => {
      const mask = state.scene.headMask;
      if (!mask?.src) return null;
      if (!effectiveVisible('head', Boolean(mask.visible))) return null;
      return {
        kind: 'head' as const,
        slotId: 'head',
        zIndex: effectiveZIndex('head', 100),
        mask,
      };
    })();

    const items = [...jointItems, ...(headItem ? [headItem] : [])].sort((a, b) => a.zIndex - b.zIndex);

    return items.map((item) => {
      if (item.kind === 'head') {
        const mask = item.mask;

        const headX = headPos.x * pxPerUnit + centerX;
        const headY = headPos.y * pxPerUnit + centerY;
        if (isNaN(headX) || isNaN(headY)) return null;

        const dx = headPos.x - neckBasePos.x;
        const dy = headPos.y - neckBasePos.y;
        const baseAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        const mode = mask.mode || 'cutout';
        const finalAngle = (mode === 'roto' ? 0 : baseAngle) + (mask.rotation || 0);

        const thicknessPx = headLenPx * Math.max(0.01, mask.scale);
        let width = thicknessPx;
        let height = thicknessPx;
        let anchorWorldX = headX;
        let anchorWorldY = headY;

        if (mode === 'rubberhose') {
          const boneLenPx = Math.max(1, Math.hypot(dx, dy) * pxPerUnit);
          anchorWorldX = ((headPos.x + neckBasePos.x) / 2) * pxPerUnit + centerX;
          anchorWorldY = ((headPos.y + neckBasePos.y) / 2) * pxPerUnit + centerY;
          height = Math.max(1, boneLenPx * Math.max(0.05, mask.lengthScale || 1));
          if (mask.volumePreserve) {
            width = clamp((thicknessPx * thicknessPx) / height, thicknessPx * 0.15, thicknessPx * 4);
          }
        }

        const originX = snapPx(anchorWorldX + mask.offsetX / state.viewScale);
        const originY = snapPx(anchorWorldY + mask.offsetY / state.viewScale);
        const x = snapPx(originX - mask.anchorX * width);
        const y = snapPx(originY - mask.anchorY * height);

        return (
          <image
            key="head-mask"
            href={mask.src ?? undefined}
            x={x}
            y={y}
            width={width}
            height={height}
            opacity={mask.opacity}
            style={{
              transformOrigin: `${originX}px ${originY}px`,
              transform: `rotate(${finalAngle}deg) skewX(${mask.skewX ?? 0}deg) skewY(${mask.skewY ?? 0}deg) scale(${mask.stretchX ?? 1}, ${mask.stretchY ?? 1})`,
              pointerEvents: 'none',
            }}
          />
        );
      }

      const jointId = item.slotId;
      const mask = item.mask;

      const jointPos = getWorldPosition(jointId, state.joints, INITIAL_JOINTS);
      const relatedIds = (mask.relatedJoints || []).filter((id) => id !== jointId && id in state.joints);
      const driverId = relatedIds[0] ?? null;
      const secondaryIds = relatedIds.slice(1);

      // Relationship joints semantics:
      // - 1st entry (driver) acts like a custom "parent" for direction/length.
      // - remaining entries affect anchor placement via centroid (useful for torso/hip clusters).
      const driverPos = driverId ? getWorldPosition(driverId, state.joints, INITIAL_JOINTS) : null;
      const secondaryCentroid = (() => {
        if (!secondaryIds.length) return null;
        let sx = 0;
        let sy = 0;
        for (const id of secondaryIds) {
          const p = getWorldPosition(id, state.joints, INITIAL_JOINTS);
          sx += p.x;
          sy += p.y;
        }
        return { x: sx / secondaryIds.length, y: sy / secondaryIds.length };
      })();

      const anchorUnits = (() => {
        if (secondaryCentroid) {
          return { x: (jointPos.x + secondaryCentroid.x) / 2, y: (jointPos.y + secondaryCentroid.y) / 2 };
        }
        if (driverPos) {
          return { x: (jointPos.x + driverPos.x) / 2, y: (jointPos.y + driverPos.y) / 2 };
        }
        return jointPos;
      })();

      const anchorWorldBaseX = anchorUnits.x * pxPerUnit + centerX;
      const anchorWorldBaseY = anchorUnits.y * pxPerUnit + centerY;
      if (isNaN(anchorWorldBaseX) || isNaN(anchorWorldBaseY)) return null;

      const joint = state.joints[jointId];
      const parentId = joint.parent;
      let pPos = { x: jointPos.x, y: jointPos.y - 1 };
      if (driverPos) {
        pPos = driverPos;
      } else if (parentId && state.joints[parentId]) {
        pPos = getWorldPosition(parentId, state.joints, INITIAL_JOINTS);
      }
      const dx = jointPos.x - pPos.x;
      const dy = jointPos.y - pPos.y;
      const boneLenPx = Math.max(1, Math.hypot(dx, dy) * pxPerUnit);

      const baseAngle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      const mode = mask.mode || 'cutout';
      const finalAngle = (mode === 'roto' ? 0 : baseAngle) + (mask.rotation || 0);

      const thicknessPx = headLenPx * Math.max(0.01, mask.scale);
      let width = thicknessPx;
      let height = thicknessPx;
      let anchorWorldX = anchorWorldBaseX;
      let anchorWorldY = anchorWorldBaseY;

      if (mode === 'rubberhose') {
        const midX = (jointPos.x + pPos.x) / 2;
        const midY = (jointPos.y + pPos.y) / 2;
        anchorWorldX = midX * pxPerUnit + centerX;
        anchorWorldY = midY * pxPerUnit + centerY;
        height = Math.max(1, boneLenPx * Math.max(0.05, mask.lengthScale || 1));
        if (mask.volumePreserve) {
          width = clamp((thicknessPx * thicknessPx) / height, thicknessPx * 0.15, thicknessPx * 4);
        }
      }

      const originX = snapPx(anchorWorldX + mask.offsetX / state.viewScale);
      const originY = snapPx(anchorWorldY + mask.offsetY / state.viewScale);
      const x = snapPx(originX - mask.anchorX * width);
      const y = snapPx(originY - mask.anchorY * height);

      return (
        <image
          key={`joint-mask:${jointId}`}
          href={mask.src ?? undefined}
          x={x}
          y={y}
          width={width}
          height={height}
          opacity={mask.opacity}
          onMouseDown={handleMaskMouseDown(jointId)}
          style={{
            transformOrigin: `${originX}px ${originY}px`,
            transform: `rotate(${finalAngle}deg) skewX(${mask.skewX ?? 0}deg) skewY(${mask.skewY ?? 0}deg) scale(${mask.stretchX ?? 1}, ${mask.stretchY ?? 1})`,
            pointerEvents: maskEditArmed ? 'auto' : 'none',
            cursor: maskEditArmed ? 'grab' : 'default',
          }}
        />
      );
    });
  })();

  // Build joint hierarchy for display
  const buildJointHierarchy = () => {
    const joints = state.joints;
    const hierarchy: Array<{ joint: Joint; level: number; type: 'joint' | 'bone'; boneTo?: string }> = [];
    
    // Head to toe hierarchy
    const headToToeOrder = [
      'head', 'neck_base', 'collar', 'sternum', 'navel', 
      'l_hip', 'l_knee', 'l_ankle', 'l_toe',
      'r_hip', 'r_knee', 'r_ankle', 'r_toe'
    ];
    
    // Arms hierarchy  
    const armsOrder = [
      'l_shoulder', 'l_elbow', 'l_wrist', 'l_fingertip',
      'r_shoulder', 'r_elbow', 'r_wrist', 'r_fingertip'
    ];
    
    // Additional joints
    const additionalJoints = ['l_nipple', 'r_nipple'];
    
    // Add head to toe joints with bones between them
    for (let i = 0; i < headToToeOrder.length; i++) {
      const jointId = headToToeOrder[i];
      const joint = joints[jointId];
      if (joint) {
        hierarchy.push({ joint, level: 0, type: 'joint' });
        
        // Add bone connection to next joint if it exists and is a child
        if (i < headToToeOrder.length - 1) {
          const nextJointId = headToToeOrder[i + 1];
          const nextJoint = joints[nextJointId];
          if (nextJoint && nextJoint.parent === jointId) {
            hierarchy.push({ joint, level: 1, type: 'bone', boneTo: nextJointId });
          }
        }
      }
    }
    
    // Add arms with bones
    for (let i = 0; i < armsOrder.length; i++) {
      const jointId = armsOrder[i];
      const joint = joints[jointId];
      if (joint) {
        hierarchy.push({ joint, level: 0, type: 'joint' });
        
        // Add bone connection to next joint if it exists and is a child
        if (i < armsOrder.length - 1) {
          const nextJointId = armsOrder[i + 1];
          const nextJoint = joints[nextJointId];
          if (nextJoint && nextJoint.parent === jointId) {
            hierarchy.push({ joint, level: 1, type: 'bone', boneTo: nextJointId });
          }
        }
      }
    }
    
    // Add additional joints
    for (const jointId of additionalJoints) {
      const joint = joints[jointId];
      if (joint) {
        hierarchy.push({ joint, level: 0, type: 'joint' });
      }
    }
    
    return hierarchy;
  };

  const jointsLayer = state.showJoints
    ? (() => {
        const regularJoints = Object.keys(state.joints)
          .filter((id) => id !== 'sacrum' && !id.includes('rib'))
          .map(renderJoint);

        const xMarkers = state.activeRoots.map((id) => renderXMarker(id, "#00ff88"));

        const groundRoot = renderGroundRootHandle();
        return groundRoot ? [...regularJoints, ...xMarkers, groundRoot] : [...regularJoints, ...xMarkers];
      })()
    : null;

  const controlModeUi: Record<ControlMode, { label: string; title: string }> = {
    Cardboard: { label: 'Rigid', title: 'Rigid drag (Cardboard): crisp, stiff posing.' },
    Rubberband: { label: 'Elastic', title: 'Elastic drag (Rubberband): stretchy, hose-like posing.' },
    IK: { label: 'Root', title: 'Rooted posing (IK): drag rooted joints to pose limbs.' },
    JointDrag: { label: 'Direct', title: 'Direct joint drag: move joints without extra posing modes.' },
  };

  const WidgetPortal = ({ id, children }: { id: WidgetId; children: React.ReactNode }) => {
    const isFloating = floatingWidgetIds.has(id);
    if (isFloating) {
      const target = widgetPortalTargets[id] ?? null;
      return target ? createPortal(children, target) : null;
    }
    if (activeWidgetId !== id) return null;
    return <>{children}</>;
  };

  return (
    <div
      className="flex h-screen w-full text-[#e0e0e0] font-sans selection:bg-white/20"
      style={{ backgroundColor }}
      data-build-id={BUILD_ID}
    >
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: sidebarOpen ? 360 : 0 }}
        className="relative bg-[#121212] border-r border-[#222] overflow-hidden flex flex-col"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DND_WIDGET_MIME)) e.preventDefault();
        }}
        onDrop={(e) => {
          const payload = e.dataTransfer.getData(DND_WIDGET_MIME);
          if (!isWidgetId(payload)) return;
          e.preventDefault();
          dockWidget(payload);
        }}
      >
        <div className="w-[360px] h-full flex flex-col">
          <div className="p-6 pb-4">
            <div
              className={`flex items-center gap-3 ${sidebarTab === 'global' ? 'opacity-0 pointer-events-none select-none' : ''}`}
            >
              <div className="p-2 bg-white rounded-lg">
                <Activity size={20} className="text-black" />
              </div>
              <div>
                <h1 className={`text-lg font-bold tracking-tight ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>BITRUVIUS</h1>
                <p className="text-[11px] text-white/70">
                  Pose, plan, and export motion from reference.
                </p>
                <p className="text-[10px] text-[#666] uppercase tracking-[0.2em] font-mono">
                  v0.2 · build {BUILD_ID}
                </p>
              </div>
            </div>

            <div className="mt-4 flex bg-[#1a1a1a] border border-[#222] rounded-xl p-1">
              {(
                [
                  { id: 'character' as const, label: 'Character' },
                  { id: 'physics' as const, label: 'Physics' },
                  { id: 'animation' as const, label: 'Animation' },
                  { id: 'global' as const, label: 'Global' },
                ] as const
              ).map((tab) => {
                const active = sidebarTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSidebarTab(tab.id)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      active ? 'bg-white text-black' : 'text-[#666] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col px-6 pb-6">
            <section className="shrink-0 pt-2">
              <div className="flex items-center gap-2 mb-3 text-[#666]">
                <Anchor size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Widgets</h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {WIDGET_TAB_ORDER[sidebarTab].map((id) => {
                  const isFloating = floatingWidgetIds.has(id);
                  const active = activeWidgetId === id && !isFloating;
                  return (
                    <button
                      key={`widget:${id}`}
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_WIDGET_MIME, id);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => activateWidget(id)}
                      className={`relative py-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${
                        active ? 'bg-white text-black border-white' : 'bg-[#222] hover:bg-[#333] border-[#222] text-white'
                      }`}
                      title={isFloating ? 'Floating (click to focus)' : 'Click to activate; drag to pop out'}
                    >
                      <span className="truncate">{WIDGETS[id].title}</span>
                      {isFloating && (
                        <span
                          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#00ff88]"
                          aria-label="Floating"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-[10px] text-[#444]">
                Drag onto the canvas to pop out. Hold <span className="font-mono text-[#666]">Alt</span> while dragging/resizing to disable snapping.
              </div>
            </section>

            <section className="shrink-0 mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
                  {WIDGETS[activeWidgetId].title}
                </div>
                <div className="text-[9px] font-mono text-[#444]">
                  {floatingWidgetIds.has(activeWidgetId) ? 'FLOATING' : 'DOCKED'}
                </div>
              </div>
              <div className="mt-2">{WIDGETS[activeWidgetId].docs}</div>
            </section>

            <div className="flex-1 min-h-0 overflow-y-auto mt-4">
              {floatingWidgetIds.has(activeWidgetId) && (
                <div className="mb-4 p-3 rounded-xl bg-[#181818] border border-[#222] flex items-center justify-between gap-3">
                  <div className="text-[11px] text-[#bbb]">This widget is popped out on the canvas.</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => activateWidget(activeWidgetId)}
                      className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-[#222] hover:bg-[#333]"
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => dockWidget(activeWidgetId)}
                      className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-[#222] hover:bg-[#333]"
                    >
                      Dock
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-6 pb-6">
                <WidgetPortal id="edit">
            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Move size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Edit</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    canUndo ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                  }`}
                  title="Undo (Ctrl/Cmd+Z)"
                >
                  <RotateCcw size={12} />
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                    canRedo ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                  }`}
                  title="Redo (Ctrl+Y / Ctrl/Cmd+Shift+Z)"
                >
                  <RotateCw size={12} />
                  Redo
                </button>
              </div>
            </section>
                </WidgetPortal>

                <WidgetPortal id="tools">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Anchor size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Tools
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-[#bbb] space-y-2">
                      <div>Widgets start docked in the side console to keep the canvas clean.</div>
                      <ul className="list-disc pl-4 space-y-1 text-[#aaa]">
                        <li>Activate widgets from the picker above.</li>
                        <li>Drag a widget onto the canvas to pop it out.</li>
                        <li>Drag a floating widget back onto the sidebar to dock it.</li>
                        <li>Floating widgets snap to a {widgetSnapGridPx}px grid (hold Alt to disable).</li>
                      </ul>
                      <div className="text-[#666] text-[10px] uppercase tracking-widest font-bold">Tip</div>
                      <div className="text-[#aaa] text-[11px]">Use the bottom-right corner to resize floating widgets.</div>
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="joint_masks">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Anchor size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Masks
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <JointMaskWidget
                        state={state}
                        setStateWithHistory={setStateWithHistory}
                        maskJointId={maskJointId}
                        setMaskJointId={setMaskJointId}
                        maskEditArmed={maskEditArmed}
                        setMaskEditArmed={setMaskEditArmed}
                        maskDragMode={maskDragMode}
                        setMaskDragMode={setMaskDragMode}
                        uploadJointMaskFile={uploadJointMaskFile}
                        uploadMaskFile={uploadMaskFile}
                        copyJointMaskTo={copyJointMaskTo}
                      />
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="cutout_relationships">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Layers size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Cutout Relationships
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <CutoutRelationshipVisualizer
                        state={state}
                        setStateWithHistory={setStateWithHistory}
                        uploadJointMaskFile={uploadJointMaskFile}
                        addConsoleLog={addConsoleLog}
                      />
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="bone_inspector">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Layers size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Rig Inspector
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="space-y-3">
                        {(() => {
                          const connKey = selectedConnectionKey;
                          if (!connKey) {
                            return (
                              <div className="text-[10px] text-[#444]">
                                No bone selected. Use Tab/Shift+Tab, or press 2.
                              </div>
                            );
                          }

                          const [a, b] = connKey.split(':');
                          const conn = CONNECTIONS.find((c) => canonicalConnKey(c.from, c.to) === connKey) ?? null;
                          const override = state.connectionOverrides?.[connKey];
                          const currentMode = override?.stretchMode ?? conn?.stretchMode ?? 'rigid';
                          const label = conn?.label || `${a} ↔ ${b}`;

                          const deriveFocusForJoint = (jointId: string): RigFocus | null => {
                            const isRight = jointId.startsWith('r_');
                            const isLeft = jointId.startsWith('l_');
                            const side: RigSide | null = isRight ? 'front' : isLeft ? 'back' : null;

                            const bodyIndex = (() => {
                              if (jointId === 'head') return 0;
                              if (jointId === 'collar') return 1;
                              if (jointId === 'navel') return 2;
                              if (jointId.endsWith('_hip')) return 3;
                              if (jointId.endsWith('_knee')) return 4;
                              if (jointId.endsWith('_ankle')) return 5;
                              if (jointId.endsWith('_toe')) return 6;
                              return null;
                            })();

                            if (bodyIndex !== null) {
                              return {
                                ...rigFocus,
                                stage: 'bone',
                                track: 'body',
                                index: bodyIndex,
                                side: side ?? rigFocus.side,
                              };
                            }

                            const armsIndex = (() => {
                              if (jointId.endsWith('_shoulder')) return 0;
                              if (jointId.endsWith('_elbow')) return 1;
                              if (jointId.endsWith('_wrist')) return 2;
                              if (jointId.endsWith('_fingertip')) return 3;
                              return null;
                            })();

                            if (armsIndex !== null && side) {
                              return {
                                ...rigFocus,
                                stage: 'bone',
                                track: 'arms',
                                index: armsIndex,
                                side,
                              };
                            }

                            if (jointId === 'navel') {
                              return { ...rigFocus, stage: 'bone', track: 'body', index: 2 };
                            }

                            return null;
                          };

                          const relatedKeys = (() => {
                            const sidePrefix = rigFocus.side === 'front' ? 'r' : 'l';
                            if (rigFocus.track === 'body') {
                              return [
                                canonicalConnKey('navel', 'sternum'),
                                canonicalConnKey('sternum', 'collar'),
                                canonicalConnKey('collar', 'neck_base'),
                                canonicalConnKey('neck_base', 'head'),
                                canonicalConnKey('navel', `${sidePrefix}_hip`),
                                canonicalConnKey(`${sidePrefix}_hip`, `${sidePrefix}_knee`),
                                canonicalConnKey(`${sidePrefix}_knee`, `${sidePrefix}_ankle`),
                                canonicalConnKey(`${sidePrefix}_ankle`, `${sidePrefix}_toe`),
                              ];
                            }

                            return [
                              canonicalConnKey('collar', `${sidePrefix}_shoulder`),
                              canonicalConnKey(`${sidePrefix}_shoulder`, `${sidePrefix}_elbow`),
                              canonicalConnKey(`${sidePrefix}_elbow`, `${sidePrefix}_wrist`),
                              canonicalConnKey(`${sidePrefix}_wrist`, `${sidePrefix}_fingertip`),
                            ];
                          })().filter((k) => {
                            const parts = k.split(':');
                            if (parts.length !== 2) return false;
                            return parts[0] in state.joints && parts[1] in state.joints;
                          });

                          return (
                            <>
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
                                  Selected Bone
                                </div>
                                <div className="text-[11px] text-white font-mono">{label}</div>
                                <div className="text-[10px] text-[#555] font-mono">{connKey}</div>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
                                  Stretch Mode
                                </div>
                                <div className="flex bg-[#222] rounded-md p-0.5">
                                  {(['rigid', 'elastic', 'stretch'] as const).map((m) => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => {
                                        setStateWithHistory(`conn_mode:${connKey}`, (prev) => ({
                                          ...prev,
                                          connectionOverrides: {
                                            ...prev.connectionOverrides,
                                            [connKey]: { ...(prev.connectionOverrides[connKey] ?? {}), stretchMode: m },
                                          },
                                        }));
                                      }}
                                      className={`px-2 py-1 rounded text-[8px] font-bold uppercase transition-all ${
                                        currentMode === m ? 'bg-white text-black' : 'text-[#666] hover:text-white'
                                      }`}
                                    >
                                      {m}
                                    </button>
                                  ))}
                                </div>
                                <div className="text-[10px] text-[#444] italic">
                                  Overrides persist in the project state (no global mutation).
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Shape</div>
                                <select
                                  value={override?.shape ?? 'auto'}
                                  onChange={(e) => {
                                    const nextShape = e.target.value;
                                    setStateWithHistory(`conn_shape:${connKey}`, (prev) => {
                                      const nextOverrides = { ...(prev.connectionOverrides ?? {}) };
                                      const existing = (nextOverrides[connKey] ?? {}) as Record<string, unknown>;
                                      if (nextShape === 'auto') {
                                        const cleaned = { ...existing };
                                        delete cleaned.shape;
                                        if (Object.keys(cleaned).length === 0) delete nextOverrides[connKey];
                                        else nextOverrides[connKey] = cleaned as any;
                                      } else {
                                        nextOverrides[connKey] = { ...existing, shape: nextShape } as any;
                                      }
                                      return { ...prev, connectionOverrides: nextOverrides as any };
                                    });
                                  }}
                                  className="w-full px-2 py-2 bg-[#222] rounded-md text-[10px] border border-white/5 font-bold uppercase tracking-widest"
                                >
                                  <option value="auto">Auto (Per bone)</option>
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
                                <div className="text-[10px] text-[#444] italic">
                                  Shape overrides apply at render-time (physics is unchanged).
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
                                  Related ({rigFocus.track} • {rigFocus.side})
                                </div>
                                <div className="space-y-1">
                                  {relatedKeys.map((k) => {
                                    const [ka, kb] = k.split(':');
                                    const c = CONNECTIONS.find((x) => canonicalConnKey(x.from, x.to) === k) ?? null;
                                    const name = c?.label || `${ka} ↔ ${kb}`;
                                    const active = k === connKey;
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() => {
                                          const joints = stateLiveRef.current.joints;
                                          const child =
                                            joints[ka]?.parent === kb
                                              ? ka
                                              : joints[kb]?.parent === ka
                                                ? kb
                                                : (kb || ka);
                                          const nextFocus = deriveFocusForJoint(child);
                                          if (nextFocus) {
                                            setRigFocus(nextFocus);
                                            applyRigFocus(nextFocus);
                                          } else {
                                            setSelectedJointId(child);
                                            setMaskJointId(child);
                                            setSelectedConnectionKey(k);
                                          }
                                        }}
                                        className={`w-full text-left px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                                          active
                                            ? 'bg-[#00ff88]/20 text-[#00ff88]'
                                            : 'bg-white/5 hover:bg-white/10 text-[#ddd]'
                                        }`}
                                      >
                                        {name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="console">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Terminal size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Console
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {(['info', 'warning', 'error', 'success'] as const).map((lvl) => {
                            const active = activeLogLevels.has(lvl);
                            const color =
                              lvl === 'error'
                                ? 'text-lime-400'
                                : lvl === 'warning'
                                  ? 'text-yellow-300'
                                  : lvl === 'success'
                                    ? 'text-green-400'
                                    : 'text-blue-300';
                            return (
                              <button
                                key={lvl}
                                type="button"
                                onClick={() =>
                                  setActiveLogLevels((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(lvl)) next.delete(lvl);
                                    else next.add(lvl);
                                    return next;
                                  })
                                }
                                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest border ${
                                  active ? 'bg-[#222] border-[#333]' : 'bg-transparent border-[#222] opacity-60'
                                } ${color}`}
                              >
                                {lvl}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setConsoleLogs([])}
                          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest bg-[#222] hover:bg-[#333]"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="space-y-1 font-mono text-[11px]">
                        {filteredConsoleLogs.slice(-120).map((log) => (
                          <div key={log.id} className="flex gap-2 items-start">
                            <span className="text-[#555] shrink-0">
                              {new Date(log.ts).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                            <span className="text-[#666] shrink-0">{log.level.toUpperCase()}</span>
                            <span className="text-white break-words">{log.message}</span>
                          </div>
                        ))}
                        {filteredConsoleLogs.length === 0 && (
                          <div className="text-[#444]">No logs (filters may be hiding everything).</div>
                        )}
                      </div>
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="camera">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Maximize2 size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Camera
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#666] uppercase tracking-widest flex justify-between">
                            <span>Zoom</span>
                            <span>{state.viewScale.toFixed(2)}x</span>
                          </label>
                          <input
                            type="range"
                            min="0.5"
                            max="3.0"
                            step="0.01"
                            value={state.viewScale}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              setState((prev) => ({ ...prev, viewScale: val }));
                            }}
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              setState((prev) => ({
                                ...prev,
                                viewOffset: { x: prev.viewOffset.x - 50, y: prev.viewOffset.y },
                              }));
                            }}
                            className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                          >
                            Left
                          </button>
                          <button
                            onClick={() => {
                              setState((prev) => ({
                                ...prev,
                                viewOffset: { x: prev.viewOffset.x + 50, y: prev.viewOffset.y },
                              }));
                            }}
                            className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                          >
                            Right
                          </button>
                          <button
                            onClick={() => {
                              setState((prev) => ({
                                ...prev,
                                viewOffset: { x: prev.viewOffset.x, y: prev.viewOffset.y - 50 },
                              }));
                            }}
                            className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                          >
                            Up
                          </button>
                          <button
                            onClick={() => {
                              setState((prev) => ({
                                ...prev,
                                viewOffset: { x: prev.viewOffset.x, y: prev.viewOffset.y + 50 },
                              }));
                            }}
                            className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                          >
                            Down
                          </button>
                        </div>

                        <button
                          onClick={() => {
                            setState((prev) => ({ ...prev, viewScale: 1.0, viewOffset: { x: 0, y: 0 } }));
                          }}
                          className="w-full py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[#333]"
                        >
                          Reset View
                        </button>

                        <div className="space-y-2">
                          <label className="flex items-center justify-between gap-3 p-2 bg-[#181818] rounded-lg border border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#bbb]">
                              Debug Overlay
                            </span>
                            <input
                              type="checkbox"
                              checked={debugOverlayEnabled}
                              onChange={(e) => {
                                setDebugOverlayEnabled(e.target.checked);
                                if (e.target.checked) resetGridDriftBaseline();
                              }}
                            />
                          </label>

                          <label className="flex items-center justify-between gap-3 p-2 bg-[#181818] rounded-lg border border-white/5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#bbb]">
                              Freeze Grid
                            </span>
                            <input
                              type="checkbox"
                              checked={freezeGridCalibration}
                              onChange={(e) => setFreezeGridCalibration(e.target.checked)}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={resetGridDriftBaseline}
                            className="w-full py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[#333]"
                          >
                            Reset Drift Baseline
                          </button>
                        </div>

                        <div className="p-2 bg-white/5 rounded-md text-[9px] text-[#555] uppercase tracking-tight leading-relaxed">
                          <span className="text-white/40">Pan:</span> MMB or Space+Drag
                        </div>
                      </div>
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="procgen">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Sparkles size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Auto Motion
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <ProcgenWidget
                        state={state}
                        setTimelinePlaying={setTimelinePlaying}
                        setStateWithHistory={setStateWithHistory}
                        captureProcgenNeutralFromCurrent={captureProcgenNeutralFromCurrent}
                        resetProcgenNeutralToTPose={resetProcgenNeutralToTPose}
                        resetProcgenPhase={resetProcgenPhase}
                        requestProcgenBake={requestProcgenBake}
                      />
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="atomic_units">
                  <section>
                    <div className="flex items-center gap-2 mb-4 text-[#666]">
                      <Grid size={14} />
                      <h2
                        className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}
                      >
                        Advanced Controls
                      </h2>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <AtomicUnitsControl
                        state={state}
                        setStateNoHistory={setStateNoHistory}
                        setStateWithHistory={setStateWithHistory}
                        beginHistoryAction={beginHistoryAction}
                        commitHistoryAction={commitHistoryAction}
                        addConsoleLog={addConsoleLog}
                      />
                    </div>
                  </section>
                </WidgetPortal>

                <WidgetPortal id="rig_controls">
              <section>
	              <div className="flex items-center gap-2 mb-4 text-[#666]">
	                <Settings2 size={14} />
	                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Rig Controls</h2>
                <HelpTip
                  text={
                    <>
                      <div className="font-bold mb-1">Rig feel & posing</div>
                      <div className="text-[#ddd]">
                        Use <span className="font-bold">Rigidity</span> to choose how stiff the rig behaves overall.
                      </div>
                      <div className="mt-2 text-[#ddd]">
                        <span className="font-bold">Control mode</span> changes how dragging works (rigid vs elastic vs pinned posing).
                      </div>
                      <div className="mt-2 text-[#ddd]">
                        <span className="font-bold">Stretch</span>, <span className="font-bold">Auto-bend</span>, and <span className="font-bold">Hard stop</span> refine the feel without changing your artwork.
                      </div>
                    </>
                  }
                />
	              </div>
	              <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
	                <div className="flex items-center justify-between mb-2">
	                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Rig Feel</div>
	                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
	                    {getPhysicsBlendMode(state).toUpperCase()} • {Math.round((state.physicsRigidity ?? 0) * 100)}%
	                  </div>
	                </div>
	                <Slider
	                  min={0}
	                  max={1}
	                  step={0.01}
	                  value={[state.physicsRigidity ?? 0]}
	                  onValueChange={(values) => {
	                    const v = values[0] ?? 0;
	                    applyEngineTransition('physics_dial', (prev) => applyFluidHandshake(prev, applyPhysicsMode(prev, v)));
	                  }}
	                  className="w-full"
	                  trackClassName="bg-transparent h-2"
	                  rangeClassName="bg-transparent"
	                  thumbClassName="border-white/20"
	                  trackStyle={{
	                    background: `linear-gradient(90deg, ${applyLightness(BONE_PALETTE.violet, 0.35)}, ${applyLightness(BONE_PALETTE.magenta, 0.35)})`,
	                  }}
	                  rangeStyle={{ backgroundColor: rgbCss(getBoneHex(state.boneStyle), 0.85) }}
	                  thumbStyle={{
	                    backgroundColor: getBoneHex(state.boneStyle),
	                    boxShadow:
	                      '0 0 0 4px rgb(125 255 170 / 0.22), 0 0 18px rgb(125 255 170 / 0.35)',
	                  }}
	                />
	                <div className="mt-3 grid grid-cols-2 gap-2">
	                  <button
	                    type="button"
	                    onClick={() =>
                        applyEngineTransition('physics_dial_rigid', (prev) => applyFluidHandshake(prev, applyPhysicsMode(prev, 0)))
                      }
	                    className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333]"
	                  >
	                    Go Rigid
	                  </button>
	                  <button
	                    type="button"
	                    onClick={() => applyEngineTransition('rigid_start_point', (prev) => createRigidStartPoint(prev))}
	                    className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333]"
	                  >
	                    Set Rigid Start
	                  </button>
	                </div>
	              </div>
	              <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
	                <div className="flex items-center justify-between mb-2">
	                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Bone Color</div>
	                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] font-mono">
	                    {getBoneHex(state.boneStyle)}
	                  </div>
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
	                        boxShadow:
	                          '0 0 0 4px rgb(125 255 170 / 0.18), 0 0 14px rgb(125 255 170 / 0.28)',
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
	                          boneStyle: { ...(prev.boneStyle ?? { hueT: 0, lightness: 0 }), lightness: clamp(v, -1, 1) },
	                        }));
	                      }}
	                      className="w-full"
	                      trackClassName="bg-transparent h-2"
	                      rangeClassName="bg-transparent"
	                      thumbClassName="border-white/20"
	                      trackStyle={{
	                        background: `linear-gradient(90deg, ${applyLightness(getBoneHex(state.boneStyle), -0.45)}, ${getBoneHex(state.boneStyle)}, ${applyLightness(getBoneHex(state.boneStyle), 0.45)})`,
	                      }}
	                      rangeStyle={{ backgroundColor: rgbCss(getBoneHex(state.boneStyle), 0.8) }}
	                      thumbStyle={{
	                        backgroundColor: getBoneHex(state.boneStyle),
	                        boxShadow:
	                          '0 0 0 4px rgb(125 255 170 / 0.18), 0 0 14px rgb(125 255 170 / 0.28)',
	                      }}
	                    />
	                  </div>
	                </div>
	              </div>
	              <div className="mb-4">
                <select
                  value={state.rigidity}
	                  onChange={(e) =>
                      applyEngineTransition('rigidity', (prev) =>
                        applyFluidHandshake(prev, { ...prev, rigidity: e.target.value as any }),
                      )
                    }
	                  className="w-full px-2 py-2 bg-[#222] rounded-xl text-[10px] border border-white/5 font-bold uppercase tracking-widest"
                >
                  <option value="cardboard">Cardboard (Rigid)</option>
                  <option value="realistic">Realistic (Hybrid)</option>
                  <option value="rubberhose">Rubberhose (Elastic)</option>
                </select>
              </div>
              <div className="flex bg-[#222] rounded-xl p-1 mb-4">
                {(['Cardboard', 'Rubberband', 'IK', 'JointDrag'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() =>
                      applyEngineTransition('set_control_mode', (prev) =>
                        prev.controlMode === mode ? prev : applyFluidHandshake(prev, { ...prev, controlMode: mode }),
                      )
                    }
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${state.controlMode === mode ? 'bg-white text-black' : 'text-[#666] hover:text-white'}`}
                    title={controlModeUi[mode].title}
                  >
                    {controlModeUi[mode].label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Toggle 
                  label="Mirroring" 
                  active={state.mirroring} 
                  onClick={() =>
                    applyEngineTransition('toggle_mirroring', (prev) => ({
                      ...prev,
                      mirroring: !prev.mirroring,
                    }))
                  }
                />
                <Toggle 
                  label="Auto-Bend (B)" 
                  active={state.bendEnabled} 
                  onClick={() =>
                    applyEngineTransition('toggle_bend', (prev) =>
                      applyFluidHandshake(prev, { ...prev, bendEnabled: !prev.bendEnabled }),
                    )
                  }
                />
                        <Toggle 
                          label="Elasticity (S)" 
                          active={state.stretchEnabled} 
                          onClick={() =>
                            applyEngineTransition('toggle_stretch', (prev) =>
                              applyFluidHandshake(prev, { ...prev, stretchEnabled: !prev.stretchEnabled }),
                            )
                          }
                        />
                  <Toggle
                    label="Lead (L)"
                    active={state.leadEnabled}
                    onClick={() =>
                      applyEngineTransition('toggle_lead', (prev) => ({
                        ...prev,
                        leadEnabled: !prev.leadEnabled,
                      }))
                    }
                  />
                        <Toggle 
                          label="Hard Stop" 
                          active={state.hardStop} 
                          onClick={() =>
                    applyEngineTransition('toggle_hard_stop', (prev) =>
                      applyFluidHandshake(prev, { ...prev, hardStop: !prev.hardStop }),
                    )
                  }
                />
              </div>
	            </section>
                </WidgetPortal>

                <WidgetPortal id="responsiveness">
            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Activity size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Responsiveness</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#444]">
                    <span>Responsiveness</span>
                    <span className="text-white">{(state.snappiness * 100).toFixed(0)}%</span>
                  </div>
                          <input 
                            type="range" 
                            min="0.05" 
                            max="1.0" 
                            step="0.05"
                            value={state.snappiness}
                            onPointerDown={() => {
                        setTimelinePlaying(false);
                        historyCtrlRef.current.beginAction('snappiness', state);
                      }}
                    onPointerUp={() =>
                      setState((prev) => {
                        const changed = historyCtrlRef.current.commitAction(prev);
                        return changed ? { ...prev } : prev;
                      })
                    }
                    onPointerCancel={() =>
                      setState((prev) => {
                        const changed = historyCtrlRef.current.commitAction(prev);
                        return changed ? { ...prev } : prev;
                      })
                    }
                    onChange={(e) =>
                      setState((s) => ({ ...s, snappiness: parseFloat(e.target.value) }))
                    }
                    className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                  />
                  <div className="text-[#666] text-[9px]">
                    Higher = follows your drag more tightly.
                  </div>
                </div>
              </div>
            </section>
                </WidgetPortal>

                <WidgetPortal id="look">
            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Maximize2 size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Look</h2>
              </div>
                      <div className="grid grid-cols-2 gap-2">
                        {LOOK_MODES.map((mode) => (
                          <button
                            key={mode.id}
                    onClick={() =>
                      applyEngineTransition('set_look_mode', (prev) =>
                        prev.lookMode === mode.id ? prev : { ...prev, lookMode: mode.id as LookModeId },
                      )
                    }
                    className={`p-2 rounded-lg border text-[10px] font-bold uppercase transition-all ${state.lookMode === mode.id ? 'bg-white text-black border-white' : 'bg-transparent text-[#666] border-[#222] hover:border-[#444]'}`}
                  >
                    {mode.label}
                  </button>
                        ))}
                      </div>
                      <div className="mt-2 text-[#666] text-[9px]">
                        {(LOOK_MODES.find((m) => m.id === state.lookMode) ?? LOOK_MODES[0])?.description}
                      </div>
                    </section>
                </WidgetPortal>

                <WidgetPortal id="views">
            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Layers size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Views</h2>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      applyEngineTransition('create_view', (prev) => {
                        const nextName = `View ${prev.views.length + 1}`;
                        const newView = createViewPreset(nextName, prev);
                        return {
                          ...prev,
                          views: [...prev.views, newView],
                          activeViewId: newView.id,
                        };
                      })
                    }
                    className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333]"
                  >
                    New
                  </button>
                  <button
                    type="button"
                    onClick={() => applyEngineTransition('update_view_from_current', (prev) => updateViewFromCurrentState(prev, prev.activeViewId))}
                    disabled={!state.activeViewId}
                    className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                      state.activeViewId ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => applyEngineTransition('delete_view', (prev) => deleteView(prev, prev.activeViewId))}
                    disabled={!state.activeViewId || state.views.length <= 1}
                    className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                      state.activeViewId && state.views.length > 1 ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                  >
                    Delete
                  </button>
                </div>

                <div className="space-y-1">
                  {state.views.map((view) => {
                    const active = view.id === state.activeViewId;
                    return (
                      <button
                        key={`view:${view.id}`}
                        type="button"
                        onClick={() => (active ? null : requestViewSwitch(view.id))}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all ${
                          active ? 'bg-white text-black border-white' : 'bg-transparent text-[#666] border-[#222] hover:border-[#444]'
                        }`}
                        title={view.name}
                      >
                        <span className="truncate">{view.name}</span>
                        <span className={`text-[9px] ${active ? 'text-black/70' : 'text-[#444]'}`}>{active ? 'Active' : 'Switch'}</span>
                      </button>
                    );
                  })}
                  {state.views.length === 0 && <div className="text-[10px] text-[#444]">No views.</div>}
                </div>
              </div>
            </section>
                </WidgetPortal>

                <WidgetPortal id="pixel_fonts">
            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Terminal size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Pixel Fonts</h2>
              </div>
              <div className="space-y-2">
                <select
                  value={titleFont}
                  onChange={(e) => setTitleFont(e.target.value)}
                  className="w-full px-2 py-2 bg-[#222] rounded-xl text-[10px] border border-white/5 font-bold uppercase tracking-widest"
                >
                  <option value="pixel-mono">Classic Pixel (Press Start)</option>
                  <option value="pixel-retro">Retro Terminal (VT323)</option>
                  <option value="pixel-terminal">Modern Terminal (IBM Plex)</option>
                  <option value="pixel-tech">Tech Mono (Share Tech)</option>
                  <option value="pixel-clean">Clean Mono (Roboto)</option>
                  <option value="pixel-display">Display Mono (Major)</option>
                  <option value="pixel-calligraphy">Pixel Calligraphy (ZCOOL)</option>
                  <option value="pixel-brush">Brush Script (Zhi Mang)</option>
                  <option value="pixel-elegant">Elegant Script (Ma Shan)</option>
                </select>
                <div className="text-[#666] text-[9px]">
                  Font style for all titles and intertitles
                </div>
              </div>
            </section>
                </WidgetPortal>

                <WidgetPortal id="background">
            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Settings2 size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Background</h2>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="w-8 h-8 rounded border border-[#333] bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => setBackgroundColor(e.target.value)}
                    className="flex-1 px-2 py-1 bg-[#222] rounded text-[10px] border border-white/5 font-mono"
                    placeholder="#404040"
                  />
                </div>
                <button
                  onClick={() => setBackgroundColor('#404040')}
                  className="w-full py-1 px-2 bg-[#222] hover:bg-[#333] rounded text-[10px] font-bold uppercase transition-all"
                >
                  Reset to Default
                </button>
              </div>
            </section>
                </WidgetPortal>

                <WidgetPortal id="animation">
              <section>
                <div className="flex items-center gap-2 mb-4 text-[#666]">
                  <RotateCcw size={14} />
                  <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Animation</h2>
                </div>
                <div className="space-y-2">
                  <Toggle
                    label="Timeline"
                    active={state.timeline.enabled}
                    onClick={() => {
                      setTimelinePlaying(false);
                      setStateWithHistory('toggle_timeline', (prev) => ({
                        ...prev,
                        timeline: {
                          ...prev.timeline,
                          enabled: !prev.timeline.enabled,
                        },
                      }));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTimelinePlaying(false);
                      setStateWithHistory('timeline_clear_keys', (prev) => ({
                        ...prev,
                        timeline: {
                          ...prev.timeline,
                          clip: { ...prev.timeline.clip, keyframes: [] },
                        },
                      }));
                    }}
                    disabled={state.timeline.clip.keyframes.length === 0}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                      state.timeline.clip.keyframes.length > 0
                        ? 'bg-[#222] hover:bg-[#333]'
                        : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                    title="Clear all keyframes"
                  >
                    <Trash2 size={12} />
                    Clear Keys
                  </button>
                </div>
              </section>
                </WidgetPortal>

                <WidgetPortal id="project">
                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <Download size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Project</h2>
                      </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={downloadStateJson}
                  className="py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase transition-all"
                  title="Save a project file (.json)"
                >
                  Save Project
                </button>
                <button
                  type="button"
                  onClick={() => importStateInputRef.current?.click()}
                  className="py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase transition-all"
                  title="Open a project file (.json)"
                >
                  Open Project
                </button>
              </div>
              <input
                ref={importStateInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void importStateFile(file);
                  e.target.value = '';
                }}
                      />
                    </section>
                </WidgetPortal>

                <WidgetPortal id="export">
                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <Upload size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Export</h2>
                      </div>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={exportSvg}
                                  disabled={!canvasSize.width || !canvasSize.height}
                          className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                            canvasSize.width && canvasSize.height
                              ? 'bg-[#222] hover:bg-[#333]'
                              : 'bg-[#181818] text-[#444] cursor-not-allowed'
                          }`}
                        >
                          Export SVG
                        </button>
                        <button
                          type="button"
                          onClick={() => void exportPng()}
                          disabled={!canvasSize.width || !canvasSize.height}
                          className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                            canvasSize.width && canvasSize.height
                              ? 'bg-[#222] hover:bg-[#333]'
                              : 'bg-[#181818] text-[#444] cursor-not-allowed'
                          }`}
                                >
                                  Export PNG
                                </button>
                              </div>
                  <button
                    type="button"
                    onClick={() => void exportVideo()}
                    disabled={!canvasSize.width || !canvasSize.height || !state.timeline.enabled}
                    className={`w-full mt-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                      canvasSize.width && canvasSize.height && state.timeline.enabled
                        ? 'bg-[#222] hover:bg-[#333]'
                        : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                    title="Export timeline as WebM"
                  >
                    Export WebM
                  </button>
                            </section>
                </WidgetPortal>

                <WidgetPortal id="pose_capture">
                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <RotateCcw size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Pose Capture</h2>
                      </div>
              <div className="space-y-2">
                <button 
                  onClick={() =>
                    setPoseSnapshots((h) => {
                      const { timeline, ...snapshot } = state;
                      void timeline;
                      const timestampedSnapshot = { ...snapshot, timestamp: Date.now() };
                      return [timestampedSnapshot, ...h].slice(0, 5);
                    })
                  }
                  className="w-full py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase transition-all"
                >
                  Save Pose
                </button>

                <div className="p-2 bg-white/5 rounded-lg space-y-2">
                  <label className="flex items-center justify-between gap-3 text-[10px] select-none">
                    <span className="font-bold uppercase tracking-widest text-[#666]">Auto-capture While Dragging</span>
                    <input
                      type="checkbox"
                      checked={autoPoseCaptureEnabled}
                      onChange={(e) => setAutoPoseCaptureEnabled(e.target.checked)}
                      className="rounded accent-white"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">Capture Rate (fps)</div>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={autoPoseCaptureFps}
                        disabled={!autoPoseCaptureEnabled}
                        onChange={(e) => {
                          const v = parseInt(e.target.value || '24', 10);
                          if (!Number.isFinite(v)) return;
                          setAutoPoseCaptureFps(clamp(v, 1, 60));
                        }}
                        className="w-full px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">Max Frames</div>
                      <input
                        type="number"
                        min={2}
                        max={600}
                        value={autoPoseCaptureMaxFrames}
                        disabled={!autoPoseCaptureEnabled}
                        onChange={(e) => {
                          const v = parseInt(e.target.value || '120', 10);
                          if (!Number.isFinite(v)) return;
                          setAutoPoseCaptureMaxFrames(clamp(v, 2, 600));
                        }}
                        className="w-full px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">
                      <span>Overlay Weight</span>
                      <span className="font-mono text-[10px] text-[#888] normal-case">{autoPoseCaptureOverlayWeight.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={autoPoseCaptureOverlayWeight}
                      disabled={!autoPoseCaptureEnabled}
                      onChange={(e) => setAutoPoseCaptureOverlayWeight(clamp(parseFloat(e.target.value), 0, 1))}
                      className="w-full accent-white disabled:opacity-50"
                    />
                    <div className="text-[#666] text-[9px] mt-1">0 = keep base • 1 = overwrite moved joints</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">Min Movement</div>
                      <input
                        type="number"
                        step={0.001}
                        min={0}
                        max={0.1}
                        value={autoPoseCaptureMovedThreshold}
                        disabled={!autoPoseCaptureEnabled}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value || '0');
                          if (!Number.isFinite(v)) return;
                          setAutoPoseCaptureMovedThreshold(clamp(v, 0, 0.1));
                        }}
                        className="w-full px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs disabled:opacity-50"
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666] select-none">
                        <input
                          type="checkbox"
                          checked={autoPoseCaptureSimplifyEnabled}
                          disabled={!autoPoseCaptureEnabled}
                          onChange={(e) => setAutoPoseCaptureSimplifyEnabled(e.target.checked)}
                          className="accent-white"
                        />
                        Simplify (Fewer Poses)
                      </label>
                    </div>
                  </div>

                  {autoPoseCaptureSimplifyEnabled && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">Simplify Amount</div>
                      <input
                        type="number"
                        step={0.001}
                        min={0}
                        max={0.1}
                        value={autoPoseCaptureSimplifyEpsilon}
                        disabled={!autoPoseCaptureEnabled}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value || '0');
                          if (!Number.isFinite(v)) return;
                          setAutoPoseCaptureSimplifyEpsilon(clamp(v, 0, 0.1));
                        }}
                        className="w-full px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs disabled:opacity-50"
                      />
                    </div>
                  )}
                </div>
                
                {/* Interpolation button */}
                {selectedPoseIndices.length >= 2 && (
                  <button 
                    onClick={interpolateSelectedPoses}
                    className="w-full py-2 bg-[#3366cc] hover:bg-[#4477dd] rounded-lg text-[10px] font-bold uppercase transition-all"
                  >
                    Interpolate Selected ({selectedPoseIndices.length} poses)
                  </button>
                )}
                
                <div className="space-y-1">
                  {poseSnapshots.map((h, i) => {
                    const isSelected = selectedPoseIndices.includes(i);
                    const snapshotIndex = poseSnapshots.length - i;
                    
                    return (
                      <button 
                        key={i}
                        onClick={() => setStateWithHistory('apply_pose_snapshot', (prev) => ({ ...prev, ...h }))}
                        onDoubleClick={() => sendPoseToTimeline(h)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          togglePoseSelection(i);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-md text-[10px] transition-colors ${
                          isSelected 
                            ? 'bg-[#3366cc]/30 border border-[#3366cc]/50' 
                            : 'bg-white/5 hover:bg-white/10'
                        }`}
                        title={`Click to apply • Double-click to send to timeline • Right-click (or Ctrl-click) to ${isSelected ? 'deselect' : 'select'} for interpolation`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && (
                            <div className="w-2 h-2 bg-[#3366cc] rounded-full" />
                          )}
                          <span>Pose {snapshotIndex}</span>
                        </div>
                        <span className="text-[#444]">
                          {h.timestamp 
                            ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : "—"
                          }
                        </span>
                      </button>
                    );
			          })}
                </div>
                
                {poseSnapshots.length > 0 && (
                  <div className="text-[#666] text-[9px] mt-2">
                    {selectedPoseIndices.length === 0 
                      ? 'Right-click (or Ctrl-click) poses to select for interpolation'
                      : `Selected ${selectedPoseIndices.length} pose${selectedPoseIndices.length === 1 ? '' : 's'} • Right-click (or Ctrl-click) to deselect`
                    }
                  </div>
                )}
              </div>
            </section>
                </WidgetPortal>

                <WidgetPortal id="scene">
                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <Layers size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Scene</h2>
                      </div>

                      {/* Vitruvian Guides */}
                      <div className="space-y-4 mb-4">
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center justify-between gap-3 text-[10px]">
                            <span className="font-bold uppercase tracking-widest text-[#666]">Rings Overlay</span>
                            <input
                              type="checkbox"
                              checked={gridRingsEnabled}
                              onChange={(e) => setGridRingsEnabled(e.target.checked)}
                              className="rounded accent-white"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-3 text-[10px]">
                            <span className="font-bold uppercase tracking-widest text-[#666]">Grid Overlay</span>
                            <input
                              type="checkbox"
                              checked={gridOverlayEnabled}
                              onChange={(e) => setGridOverlayEnabled(e.target.checked)}
                              className="rounded accent-white"
                            />
                          </label>
                        </div>
                        
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Background Color</span>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={backgroundColor}
                              onChange={(e) => setBackgroundColor(e.target.value)}
                              className="w-full h-8 bg-[#222] border border-[#333] rounded cursor-pointer"
                            />
                            <button
                              onClick={() => setBackgroundColor('#0a0a0a')}
                              className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] whitespace-nowrap"
                            >
                              Reset
                            </button>
                          </div>
                        </div>
                      </div>

                <div className="space-y-2 mb-4">
                  <Toggle
                    label="Joints"
                    active={state.showJoints}
                    onClick={() =>
                      applyEngineTransition('toggle_show_joints', (prev) => ({
                        ...prev,
                        showJoints: !prev.showJoints,
                      }))
                    }
                  />
                  <Toggle
                    label="Joints Above Masks"
                    active={state.jointsOverMasks}
                    onClick={() =>
                      applyEngineTransition('toggle_joints_over_masks', (prev) => ({
                        ...prev,
                        jointsOverMasks: !prev.jointsOverMasks,
                      }))
                    }
                  />
                </div>
                      
                      {/* Background Layer */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Background</span>
                  <button
                    onClick={() => document.getElementById('bg-upload')?.click()}
                    className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                  >
                    Upload
                  </button>
                  <input
                    id="bg-upload"
                    type="file"
                    accept="image/*,video/*,.zip,application/zip,application/x-zip-compressed"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';

                      const isVideo = file.type.startsWith('video/');
                      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
                      const isZip =
                        file.type === 'application/zip' ||
                        file.type === 'application/x-zip-compressed' ||
                        file.name.toLowerCase().endsWith('.zip');

                      const prevSeqId = state.scene.background.sequence?.id;
                      if (prevSeqId) dropReferenceSequence(prevSeqId);

                      if (isVideo) {
                        const url = URL.createObjectURL(file);
                        setStateWithHistory('upload_background_video', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            background: {
                              ...prev.scene.background,
                              src: url,
                              visible: true,
                              mediaType: 'video',
                              videoStart: 0,
                              videoRate: 1,
                              sequence: null,
                            },
                          },
                        }));
                        return;
                      }

                      if (isGif || isZip) {
                        try {
                          addConsoleLog('info', `Loading ${isGif ? 'GIF' : 'ZIP'} sequence for background...`);
                          const fps = Math.max(1, Math.floor(state.timeline.clip?.fps || 24));
                          const seq = await loadReferenceSequenceFromFile(file, fps);
                          referenceSequencesRef.current.set(seq.id, seq);

                          const src = isGif ? URL.createObjectURL(file) : `zip:${seq.id}`;
                          setStateWithHistory('upload_background_sequence', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              background: {
                                ...prev.scene.background,
                                src,
                                visible: true,
                                mediaType: 'sequence',
                                videoStart: 0,
                                videoRate: 1,
                                sequence: {
                                  id: seq.id,
                                  kind: seq.kind,
                                  frameCount: seq.frames.length,
                                  fps: seq.fps,
                                },
                              },
                            },
                          }));
                          addConsoleLog('success', `Background sequence loaded (${seq.frames.length} frames).`);
                        } catch (err) {
                          const message = err instanceof Error ? err.message : 'Failed to load sequence';
                          addConsoleLog('error', `Background sequence failed: ${message}`);
                          alert(`Background sequence failed: ${message}`);
                        }
                        return;
                      }

                      const url = URL.createObjectURL(file);
                      setStateWithHistory('upload_background_image', (prev) => ({
                        ...prev,
                        scene: {
                          ...prev.scene,
                          background: {
                            ...prev.scene.background,
                            src: url,
                            visible: true,
                            mediaType: 'image',
                            videoStart: 0,
                            videoRate: 1,
                            sequence: null,
                          },
                        },
                      }));

                      await cacheImageFromUrl(url, 'background');
                    }}
                  />
                </div>
                
                {state.scene.background.src && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={state.scene.background.visible}
                        onChange={(e) =>
                          setStateWithHistory('toggle_background', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              background: { ...prev.scene.background, visible: e.target.checked }
                            }
                          }))
                        }
                        className="rounded"
                      />
                      <span className="text-[10px]">Visible</span>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px]">
                        <span>Opacity</span>
                        <span>{(state.scene.background.opacity * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={[state.scene.background.opacity]}
                        onValueChange={([val]) =>
                          setStateWithHistory('background_opacity', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              background: { ...prev.scene.background, opacity: val }
                            }
                          }))
                        }
                      />
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#666]">Position X</span>
                        <span>{state.scene.background.x.toFixed(0)}px</span>
                      </div>
                      <Slider
                        min={-2000}
                        max={2000}
                        step={1}
                        value={[state.scene.background.x]}
                        onValueChange={([val]) =>
                          setStateWithHistory('background_x', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              background: { ...prev.scene.background, x: val }
                            }
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#666]">Position Y</span>
                        <span>{state.scene.background.y.toFixed(0)}px</span>
                      </div>
                      <Slider
                        min={-2000}
                        max={2000}
                        step={1}
                        value={[state.scene.background.y]}
                        onValueChange={([val]) =>
                          setStateWithHistory('background_y', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              background: { ...prev.scene.background, y: val }
                            }
                          }))
                        }
                      />
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-[#666]">Scale</span>
                        <span>{state.scene.background.scale.toFixed(2)}x</span>
                      </div>
                      <Slider
                        min={0.01}
                        max={5}
                        step={0.01}
                        value={[state.scene.background.scale]}
                        onValueChange={([val]) =>
                          setStateWithHistory('background_scale', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              background: { ...prev.scene.background, scale: val }
                            }
                          }))
                        }
                      />
                    </div>
                    
                    <select
                      value={state.scene.background.fitMode}
                      onChange={(e) =>
                        setStateWithHistory('background_fit', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            background: { 
                              ...prev.scene.background, 
                              fitMode: e.target.value as 'contain' | 'cover' | 'fill' | 'none'
                            }
                          }
                        }))
                      }
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                              <option value="fill">Fill</option>
                              <option value="none">None</option>
                            </select>

                            {(state.scene.background.mediaType === 'video' || state.scene.background.mediaType === 'sequence') && (
                              <div className="space-y-2 p-2 rounded-md bg-white/5 border border-white/10">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-[#777]">Timing</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-[#666]">Start (s)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      value={state.scene.background.videoStart}
                                      onChange={(e) =>
                                        setStateWithHistory('background_video_start', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            background: { ...prev.scene.background, videoStart: parseFloat(e.target.value) || 0 },
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[#666]">Rate</label>
                                    <input
                                      type="number"
                                      min={0.05}
                                      max={4}
                                      step={0.05}
                                      value={state.scene.background.videoRate}
                                      onChange={(e) =>
                                        setStateWithHistory('background_video_rate', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            background: { ...prev.scene.background, videoRate: parseFloat(e.target.value) || 1 },
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    />
                                  </div>
                                </div>
                                {state.scene.background.mediaType === 'video' && (
                                  <div className="text-[9px] text-[#666]">
                                    PNG/SVG exports don&apos;t embed videos yet (use WebM export).
                                  </div>
                                )}
                              </div>
                            )}
                            
                            <button
                              onClick={() => {
                                const seqId = state.scene.background.sequence?.id;
                                if (seqId) dropReferenceSequence(seqId);
                                setStateWithHistory('clear_background', (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    background: { ...prev.scene.background, src: null, visible: false, mediaType: 'image', sequence: null },
                                  },
                                }));
                              }}
                      className="w-full py-1 bg-[#333] hover:bg-[#444] rounded text-[10px] transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              
                      {/* Foreground Layer */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Foreground</span>
                          <button
                            onClick={() => document.getElementById('fg-upload')?.click()}
                            className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                          >
                            Upload
                          </button>
                          <input
                            id="fg-upload"
                            type="file"
                            accept="image/*,video/*,.zip,application/zip,application/x-zip-compressed"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              e.target.value = '';

                              const isVideo = file.type.startsWith('video/');
                              const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
                              const isZip =
                                file.type === 'application/zip' ||
                                file.type === 'application/x-zip-compressed' ||
                                file.name.toLowerCase().endsWith('.zip');

                              const prevSeqId = state.scene.foreground.sequence?.id;
                              if (prevSeqId) dropReferenceSequence(prevSeqId);

                              if (isVideo) {
                                const url = URL.createObjectURL(file);
                                setStateWithHistory('upload_foreground_video', (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    foreground: {
                                      ...prev.scene.foreground,
                                      src: url,
                                      visible: true,
                                      mediaType: 'video',
                                      videoStart: 0,
                                      videoRate: 1,
                                      sequence: null,
                                    },
                                  },
                                }));
                                return;
                              }

                              if (isGif || isZip) {
                                try {
                                  addConsoleLog('info', `Loading ${isGif ? 'GIF' : 'ZIP'} sequence for foreground...`);
                                  const fps = Math.max(1, Math.floor(state.timeline.clip?.fps || 24));
                                  const seq = await loadReferenceSequenceFromFile(file, fps);
                                  referenceSequencesRef.current.set(seq.id, seq);

                                  const src = isGif ? URL.createObjectURL(file) : `zip:${seq.id}`;
                                  setStateWithHistory('upload_foreground_sequence', (prev) => ({
                                    ...prev,
                                    scene: {
                                      ...prev.scene,
                                      foreground: {
                                        ...prev.scene.foreground,
                                        src,
                                        visible: true,
                                        mediaType: 'sequence',
                                        videoStart: 0,
                                        videoRate: 1,
                                        sequence: {
                                          id: seq.id,
                                          kind: seq.kind,
                                          frameCount: seq.frames.length,
                                          fps: seq.fps,
                                        },
                                      },
                                    },
                                  }));
                                  addConsoleLog('success', `Foreground sequence loaded (${seq.frames.length} frames).`);
                                } catch (err) {
                                  const message = err instanceof Error ? err.message : 'Failed to load sequence';
                                  addConsoleLog('error', `Foreground sequence failed: ${message}`);
                                  alert(`Foreground sequence failed: ${message}`);
                                }
                                return;
                              }

                              const url = URL.createObjectURL(file);
                              setStateWithHistory('upload_foreground_image', (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  foreground: {
                                    ...prev.scene.foreground,
                                    src: url,
                                    visible: true,
                                    mediaType: 'image',
                                    videoStart: 0,
                                    videoRate: 1,
                                    sequence: null,
                                  },
                                },
                              }));

                              await cacheImageFromUrl(url, 'foreground');
                            }}
                          />
                        </div>
                        
                        {state.scene.foreground.src && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={state.scene.foreground.visible}
                                onChange={(e) =>
                                  setStateWithHistory('toggle_foreground', (prev) => ({
                                    ...prev,
                                    scene: {
                                      ...prev.scene,
                                      foreground: { ...prev.scene.foreground, visible: e.target.checked }
                                    }
                                  }))
                                }
                                className="rounded"
                              />
                              <span className="text-[10px]">Visible</span>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex justify-between text-[10px]">
                                <span>Opacity</span>
                                <span>{(state.scene.foreground.opacity * 100).toFixed(0)}%</span>
                              </div>
                              <Slider
                                min={0}
                                max={1}
                                step={0.01}
                                value={[state.scene.foreground.opacity]}
                                onValueChange={([val]) =>
                                  setStateWithHistory('foreground_opacity', (prev) => ({
                                    ...prev,
                                    scene: {
                                      ...prev.scene,
                                      foreground: { ...prev.scene.foreground, opacity: val }
                                    }
                                  }))
                                }
                              />
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-[#666]">Position X</span>
                                <span>{state.scene.foreground.x.toFixed(0)}px</span>
                              </div>
                              <Slider
                                min={-2000}
                                max={2000}
                                step={1}
                                value={[state.scene.foreground.x]}
                                onValueChange={([val]) =>
                                  setStateWithHistory('foreground_x', (prev) => ({
                                    ...prev,
                                    scene: {
                                      ...prev.scene,
                                      foreground: { ...prev.scene.foreground, x: val }
                                    }
                                  }))
                                }
                              />
                            </div>

                            <div className="space-y-3">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-[#666]">Position Y</span>
                                <span>{state.scene.foreground.y.toFixed(0)}px</span>
                              </div>
                              <Slider
                                min={-2000}
                                max={2000}
                                step={1}
                                value={[state.scene.foreground.y]}
                                onValueChange={([val]) =>
                                  setStateWithHistory('foreground_y', (prev) => ({
                                    ...prev,
                                    scene: {
                                      ...prev.scene,
                                      foreground: { ...prev.scene.foreground, y: val }
                                    }
                                  }))
                                }
                              />
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex justify-between text-[10px]">
                                <span className="text-[#666]">Scale</span>
                                <span>{state.scene.foreground.scale.toFixed(2)}x</span>
                              </div>
                              <Slider
                                min={0.01}
                                max={5}
                                step={0.01}
                                value={[state.scene.foreground.scale]}
                                onValueChange={([val]) =>
                                  setStateWithHistory('foreground_scale', (prev) => ({
                                    ...prev,
                                    scene: {
                                      ...prev.scene,
                                      foreground: { ...prev.scene.foreground, scale: val }
                                    }
                                  }))
                                }
                              />
                            </div>
                    
                    <select
                      value={state.scene.foreground.fitMode}
                      onChange={(e) =>
                        setStateWithHistory('foreground_fit', (prev) => ({
                          ...prev,
                          scene: {
                            ...prev.scene,
                            foreground: { 
                              ...prev.scene.foreground, 
                              fitMode: e.target.value as 'contain' | 'cover' | 'fill' | 'none'
                            }
                          }
                        }))
                      }
                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                              <option value="fill">Fill</option>
                              <option value="none">None</option>
                            </select>

                            {(state.scene.foreground.mediaType === 'video' || state.scene.foreground.mediaType === 'sequence') && (
                              <div className="space-y-2 p-2 rounded-md bg-white/5 border border-white/10">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-[#777]">Timing</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-[#666]">Start (s)</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={0.1}
                                      value={state.scene.foreground.videoStart}
                                      onChange={(e) =>
                                        setStateWithHistory('foreground_video_start', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            foreground: { ...prev.scene.foreground, videoStart: parseFloat(e.target.value) || 0 },
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[#666]">Rate</label>
                                    <input
                                      type="number"
                                      min={0.05}
                                      max={4}
                                      step={0.05}
                                      value={state.scene.foreground.videoRate}
                                      onChange={(e) =>
                                        setStateWithHistory('foreground_video_rate', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            foreground: { ...prev.scene.foreground, videoRate: parseFloat(e.target.value) || 1 },
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    />
                                  </div>
                                </div>
                                {state.scene.foreground.mediaType === 'video' && (
                                  <div className="text-[9px] text-[#666]">
                                    PNG/SVG exports don&apos;t embed videos yet (use WebM export).
                                  </div>
                                )}
                              </div>
                            )}
                            
                            <button
                              onClick={() => {
                                const seqId = state.scene.foreground.sequence?.id;
                                if (seqId) dropReferenceSequence(seqId);
                                setStateWithHistory('clear_foreground', (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    foreground: { ...prev.scene.foreground, src: null, visible: false, mediaType: 'image', sequence: null },
                                  },
                                }));
                              }}
                      className="w-full py-1 bg-[#333] hover:bg-[#444] rounded text-[10px] transition-colors"
                    >
                      Clear
                    </button>
                          </div>
                        )}
                      </div>

                      {/* Titles / Intertitles */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Titles</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const frameCount = Math.max(2, Math.floor(state.timeline.clip.frameCount));
                                const startFrame = state.timeline.enabled ? timelineFrame : 0;
                                const endFrame = clamp(startFrame + 24, startFrame, frameCount - 1);
                                const id = `overlay_${Date.now()}`;
                                setStateWithHistory('overlay_add_title', (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    textOverlays: [
                                      ...(prev.scene.textOverlays || []),
                                      {
                                        id,
                                        kind: 'title',
                                        text: 'TITLE',
                                        visible: true,
                                        startFrame,
                                        endFrame,
                                        fontSize: 32,
                                        color: '#ffffff',
                                        align: 'center',
                                      },
                                    ],
                                  },
                                }));
                              }}
                              className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                            >
                              + Title
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const frameCount = Math.max(2, Math.floor(state.timeline.clip.frameCount));
                                const startFrame = state.timeline.enabled ? timelineFrame : 0;
                                const endFrame = clamp(startFrame + 24, startFrame, frameCount - 1);
                                const id = `overlay_${Date.now()}`;
                                setStateWithHistory('overlay_add_intertitle', (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    textOverlays: [
                                      ...(prev.scene.textOverlays || []),
                                      {
                                        id,
                                        kind: 'intertitle',
                                        text: 'INTERTITLE',
                                        visible: true,
                                        startFrame,
                                        endFrame,
                                        fontSize: 48,
                                        color: '#ffffff',
                                        align: 'center',
                                      },
                                    ],
                                  },
                                }));
                              }}
                              className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                            >
                              + Intertitle
                            </button>
                          </div>
                        </div>

                        {(state.scene.textOverlays?.length ?? 0) === 0 ? (
                          <div className="text-[10px] text-[#444]">No overlays yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {(state.scene.textOverlays || []).map((o) => (
                              <div key={o.id} className="p-2 rounded-md bg-white/5 border border-white/10 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={o.visible}
                                      onChange={(e) =>
                                        setStateWithHistory('overlay_toggle', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            textOverlays: (prev.scene.textOverlays || []).map((x) =>
                                              x.id === o.id ? { ...x, visible: e.target.checked } : x,
                                            ),
                                          },
                                        }))
                                      }
                                      className="rounded"
                                    />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
                                      {o.kind === 'intertitle' ? 'Intertitle' : 'Title'}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setStateWithHistory('overlay_delete', (prev) => ({
                                        ...prev,
                                        scene: {
                                          ...prev.scene,
                                          textOverlays: (prev.scene.textOverlays || []).filter((x) => x.id !== o.id),
                                        },
                                      }))
                                    }
                                    className="px-2 py-1 bg-[#331111] hover:bg-[#551111] rounded text-[10px] transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>

                                <input
                                  value={o.text}
                                  onChange={(e) =>
                                    setStateWithHistory('overlay_text', (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        textOverlays: (prev.scene.textOverlays || []).map((x) =>
                                          x.id === o.id ? { ...x, text: e.target.value } : x,
                                        ),
                                      },
                                    }))
                                  }
                                  className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                />

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-[#666]">Start</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={Math.max(0, state.timeline.clip.frameCount - 1)}
                                      value={o.startFrame}
                                      onChange={(e) =>
                                        setStateWithHistory('overlay_start', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            textOverlays: (prev.scene.textOverlays || []).map((x) =>
                                              x.id === o.id ? { ...x, startFrame: parseInt(e.target.value || '0', 10) || 0 } : x,
                                            ),
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[#666]">End</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={Math.max(0, state.timeline.clip.frameCount - 1)}
                                      value={o.endFrame}
                                      onChange={(e) =>
                                        setStateWithHistory('overlay_end', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            textOverlays: (prev.scene.textOverlays || []).map((x) =>
                                              x.id === o.id ? { ...x, endFrame: parseInt(e.target.value || '0', 10) || 0 } : x,
                                            ),
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 items-end">
                                  <div>
                                    <label className="text-[10px] text-[#666]">Size</label>
                                    <input
                                      type="number"
                                      min={8}
                                      max={160}
                                      value={o.fontSize}
                                      onChange={(e) =>
                                        setStateWithHistory('overlay_font_size', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            textOverlays: (prev.scene.textOverlays || []).map((x) =>
                                              x.id === o.id ? { ...x, fontSize: parseInt(e.target.value || '0', 10) || 32 } : x,
                                            ),
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[#666]">Align</label>
                                    <select
                                      value={o.align}
                                      onChange={(e) =>
                                        setStateWithHistory('overlay_align', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            textOverlays: (prev.scene.textOverlays || []).map((x) =>
                                              x.id === o.id ? { ...x, align: e.target.value as any } : x,
                                            ),
                                          },
                                        }))
                                      }
                                      className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                                    >
                                      <option value="left">Left</option>
                                      <option value="center">Center</option>
                                      <option value="right">Right</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-[#666]">Color</label>
                                    <input
                                      type="color"
                                      value={o.color}
                                      onChange={(e) =>
                                        setStateWithHistory('overlay_color', (prev) => ({
                                          ...prev,
                                          scene: {
                                            ...prev.scene,
                                            textOverlays: (prev.scene.textOverlays || []).map((x) =>
                                              x.id === o.id ? { ...x, color: e.target.value } : x,
                                            ),
                                          },
                                        }))
                                      }
                                      className="w-full h-8 bg-[#222] border border-[#333] rounded cursor-pointer"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Masks</div>
                        <div className="mt-2 text-[10px] text-[#444]">
                          Mask uploads + adjustments live in the Joint/Mask widget.
                        </div>
                      </div>

            </section>
                </WidgetPortal>

                <WidgetPortal id="rig_controls">
                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <Anchor size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Root Controls</h2>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-[#888]">Active Roots ({state.activeRoots.length})</span>
                          <button
                            onClick={() => {
                              setStateWithHistory('clear_roots_ground_root', (prev) => ({
                                ...prev,
                                activeRoots: [],
                                groundRootTarget: computeCogWorld(prev.joints, INITIAL_JOINTS),
                              }));
                              pinTargetsRef.current = {};
                            }}
                            className="px-3 py-2 bg-[#333] hover:bg-[#444] rounded-lg text-[10px] font-bold transition-all"
                          >
                            Clear Roots (Ground Root)
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => toggleRoot('l_ankle')}
                            className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                              state.activeRoots.includes('l_ankle')
                                ? 'bg-[#00ff88] text-white'
                                : 'bg-[#333] hover:bg-[#444] text-[#888]'
                            }`}
                          >
                            Root L Ankle
                          </button>
                          <button
                            onClick={() => toggleRoot('r_ankle')}
                            className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                              state.activeRoots.includes('r_ankle')
                                ? 'bg-[#00ff88] text-white'
                                : 'bg-[#333] hover:bg-[#444] text-[#888]'
                            }`}
                          >
                            Root R Ankle
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => toggleRoot('l_wrist')}
                            className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                              state.activeRoots.includes('l_wrist')
                                ? 'bg-[#00ff88] text-white'
                                : 'bg-[#333] hover:bg-[#444] text-[#888]'
                            }`}
                          >
                            Root L Wrist
                          </button>
                          <button
                            onClick={() => toggleRoot('r_wrist')}
                            className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                              state.activeRoots.includes('r_wrist')
                                ? 'bg-[#00ff88] text-white'
                                : 'bg-[#333] hover:bg-[#444] text-[#888]'
                            }`}
                          >
                            Root R Wrist
                          </button>
                        </div>
                      </div>
                    </section>
                </WidgetPortal>

                <WidgetPortal id="joint_hierarchy">
                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <Layers size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Joint Hierarchy</h2>
                      </div>
              {(() => {
                const selected = selectedJointId ? state.joints[selectedJointId] : null;
                const effectiveAngleId = selected ? resolveEffectiveManipulationId(selected.id) : null;
                const effective = effectiveAngleId ? state.joints[effectiveAngleId] : null;
                if (!selected || !effective || !effective.parent) {
                  return (
                    <div className="mb-3 text-[10px] text-[#444]">
                      Select a joint to edit rotation.
                    </div>
                  );
                }

                const angleDeg = toAngleDeg(effective.previewOffset);
                const actionId = `joint_angle:${selected.id}`;
                const labelSuffix = selected.id === 'navel' && effectiveAngleId === 'sternum' ? ' (Sternum)' : '';

                return (
                  <div className="mb-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
                        {selected.label}
                        {labelSuffix} Angle
                      </div>
                      <div className="font-mono text-xs text-white">{angleDeg.toFixed(1)}°</div>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                              value={angleDeg}
                              onPointerDown={() => {
                          setTimelinePlaying(false);
                          historyCtrlRef.current.beginAction(actionId, state);
                        }}
                      onPointerUp={() =>
                        setState((prev) => {
                          const changed = historyCtrlRef.current.commitAction(prev);
                          return changed ? { ...prev } : prev;
                        })
                      }
                      onPointerCancel={() =>
                        setState((prev) => {
                          const changed = historyCtrlRef.current.commitAction(prev);
                          return changed ? { ...prev } : prev;
                        })
                      }
                      onChange={(e) => setJointAngleDeg(effectiveAngleId!, parseFloat(e.target.value))}
                      className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                );
              })()}
                      <div className="max-h-[300px] overflow-y-auto pr-2 space-y-1">
                        {buildJointHierarchy().map((item, index) => (
                          <div key={`${item.type}-${item.joint.id}-${index}`}>
                            {item.type === 'joint' ? (
                              <div 
                                onMouseDown={(e) => {
                                  if (e.detail === 3) {
                                    e.stopPropagation();
                                    toggleRoot(item.joint.id);
                                    return;
                                  }
                                  setSelectedJointId(item.joint.id);
                                }}
                                className={`group flex items-center justify-between p-2 rounded-md transition-colors cursor-pointer ${
                                  draggingId === item.joint.id
                                    ? 'bg-white/10'
                                    : selectedJointId === item.joint.id
                                      ? 'bg-white/5'
                                      : 'hover:bg-white/5'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${item.joint.isEndEffector ? 'bg-white' : 'bg-[#444]'}`} />
                                  <span className="text-xs font-medium">{item.joint.label}</span>
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRoot(item.joint.id);
                                  }}
                                  className={`p-1 rounded transition-colors ${state.activeRoots.includes(item.joint.id) ? 'text-[#00ff88]' : 'text-[#444] group-hover:text-[#888]'}`}
                                >
                                  <Anchor size={12} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 pl-4 py-1">
                                <div className="w-8 h-0.5 bg-[#666] rounded"></div>
                                <span className="text-xs text-[#666] italic">
                                  → {item.boneTo && state.joints[item.boneTo] ? state.joints[item.boneTo].label : 'Bone'}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                            </section>
                </WidgetPortal>
              </div>
            </div>
          </div>

          <div className="p-6 pt-0">
            <button 
              onClick={resetSkeleton}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#222] hover:bg-[#333] rounded-xl text-xs font-bold transition-all active:scale-95"
            >
              <RotateCcw size={14} />
              RESET ENGINE
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Viewport */}
      <main className="flex-1 relative flex flex-col overflow-hidden min-h-0 min-w-0">
        {/* Toggle Sidebar Button */}
        <button 
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-6 left-6 z-10 p-2 bg-[#121212] border border-[#222] rounded-lg hover:bg-[#222] transition-colors"
        >
          {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {/* Canvas */}
        <div 
          ref={canvasRef}
          className="flex-1 cursor-crosshair relative min-h-0 min-w-0 overflow-hidden"
          onMouseDown={() => setSelectedJointId(null)}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            hideCursorHud();
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DND_WIDGET_MIME)) e.preventDefault();
          }}
	          onDrop={(e) => {
	            const payload = e.dataTransfer.getData(DND_WIDGET_MIME);
	            if (!isWidgetId(payload)) return;
	            e.preventDefault();
	            popOutWidget(payload, e.clientX, e.clientY);
	          }}
        >
          <div ref={cursorHudRef} className="editor-cursor-hud">
            <div ref={cursorTargetRef} className="editor-cursor-target" />
            <div ref={cursorReticleRef} className="editor-cursor-reticle">
              <div className="editor-cursor-dot" />
            </div>
            <div ref={cursorLabelRef} className="editor-cursor-label" />
          </div>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            onMouseMove={onCanvasMouseMove}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault(); // Prevent auto-scroll on middle click
              setSelectedJointId(null);
            }}
            className={`w-full h-full skeleton-canvas ${state.lookMode === 'nosferatu' ? 'grayscale contrast-125' : ''}`}
          >
            <defs>
              <filter id="joint-soft-glow" x="-200%" y="-200%" width="400%" height="400%">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>
            <g transform={`translate(${state.viewOffset.x}, ${state.viewOffset.y}) scale(${state.viewScale})`}>
                      {/* Reference Layers */}
                      {state.scene.background.src && state.scene.background.visible && state.scene.background.mediaType === 'image' && (
                        <image
                          href={state.scene.background.src}
                          x={state.scene.background.x}
                          y={state.scene.background.y}
                          width={canvasSize.width}
                          height={canvasSize.height}
                          transform={`scale(${state.scene.background.scale})`}
                          preserveAspectRatio={
                            state.scene.background.fitMode === 'none' ? 'none' :
                            state.scene.background.fitMode === 'fill' ? 'none' :
                            state.scene.background.fitMode === 'cover' ? 'xMidYMid slice' :
                            'xMidYMid meet'
                          }
                          opacity={state.scene.background.opacity}
                        />
                      )}
                      {state.scene.background.visible && state.scene.background.mediaType === 'sequence' && state.scene.background.sequence?.id && (
                        <foreignObject
                          x={state.scene.background.x}
                          y={state.scene.background.y}
                          width={canvasSize.width * state.scene.background.scale}
                          height={canvasSize.height * state.scene.background.scale}
                          opacity={state.scene.background.opacity}
                          style={{ pointerEvents: 'none' }}
                        >
                          <div style={{ 
                            width: '100%', 
                            height: '100%',
                            transform: `scale(${1 / state.scene.background.scale})`,
                            transformOrigin: 'top left'
                          }}>
                            {poseTracingEnabled ? (
                              <SyncedReferenceSequenceCanvas
                                sequence={referenceSequencesRef.current.get(state.scene.background.sequence.id) ?? null}
                                desiredTime={bgVideoDesiredTime}
                                playing={Boolean(state.timeline.enabled && timelinePlaying)}
                                fitMode={state.scene.background.fitMode}
                              />
                            ) : state.scene.background.sequence.kind === 'gif' && state.scene.background.src ? (
                              <img
                                src={state.scene.background.src}
                                style={{ width: '100%', height: '100%', objectFit: fitModeToObjectFit(state.scene.background.fitMode) }}
                              />
                            ) : (
                              <SyncedReferenceSequenceCanvas
                                sequence={referenceSequencesRef.current.get(state.scene.background.sequence.id) ?? null}
                                desiredTime={0}
                                playing={false}
                                fitMode={state.scene.background.fitMode}
                              />
                            )}
                          </div>
                        </foreignObject>
                      )}
                      {state.scene.background.src && state.scene.background.visible && state.scene.background.mediaType === 'video' && (
                        <foreignObject
                          x={state.scene.background.x}
                          y={state.scene.background.y}
                          width={canvasSize.width * state.scene.background.scale}
                          height={canvasSize.height * state.scene.background.scale}
                          opacity={state.scene.background.opacity}
                          style={{ pointerEvents: 'none' }}
                        >
                          <div style={{ 
                            width: '100%', 
                            height: '100%',
                            transform: `scale(${1 / state.scene.background.scale})`,
                            transformOrigin: 'top left'
                          }}>
                            {poseTracingEnabled ? (
                              <SyncedReferenceVideo
                                ref={bgVideoRef}
                                src={state.scene.background.src}
                                desiredTime={bgVideoDesiredTime}
                                playing={Boolean(state.timeline.enabled && timelinePlaying)}
                                playbackRate={state.scene.background.videoRate}
                                objectFit={
                                  state.scene.background.fitMode === 'cover'
                                    ? 'cover'
                                    : state.scene.background.fitMode === 'fill'
                                      ? 'fill'
                                      : state.scene.background.fitMode === 'none'
                                        ? 'none'
                                        : 'contain'
                                }
                                onMeta={setBgVideoMeta}
                              />
                            ) : (
                              <video
                                src={state.scene.background.src}
                                muted
                                loop
                                autoPlay
                                playsInline
                                preload="auto"
                                onLoadedMetadata={(e) => {
                                  const v = e.currentTarget;
                                  setBgVideoMeta({
                                    duration: Number.isFinite(v.duration) ? v.duration : 0,
                                    width: v.videoWidth || 0,
                                    height: v.videoHeight || 0,
                                  });
                                }}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit:
                                    state.scene.background.fitMode === 'cover'
                                      ? 'cover'
                                      : state.scene.background.fitMode === 'fill'
                                        ? 'fill'
                                        : state.scene.background.fitMode === 'none'
                                          ? 'none'
                                          : 'contain',
                                }}
                              />
                            )}
                          </div>
                        </foreignObject>
                      )}

              {/* Grid and Rings - rendered over background */}
              <SystemGrid 
                visible={gridOverlayEnabled || gridRingsEnabled}
                showGrid={gridOverlayEnabled}
                showRings={gridRingsEnabled}
                opacity={0.65}
                plot={gridRingsBgData?.vitruvian.plot ?? null}
                transform={gridOverlayTransform}
                      />

              {/* Backlight Effect */}
              {backlightEnabled && (
                <defs>
                  <radialGradient id="backlight-gradient">
                    <stop offset="0%" stopColor="rgba(255, 220, 100, 0.15)" />
                    <stop offset="50%" stopColor="rgba(255, 200, 50, 0.08)" />
                    <stop offset="100%" stopColor="rgba(255, 180, 0, 0.02)" />
                  </radialGradient>
                </defs>
              )}
              {backlightEnabled && (
                <rect
                  x={-canvasSize.width}
                  y={-canvasSize.height}
                  width={canvasSize.width * 3}
                  height={canvasSize.height * 3}
                  fill="url(#backlight-gradient)"
                  style={{ mixBlendMode: 'screen' }}
                  pointerEvents="none"
                />
              )}

              {/* Engine Content */}
              {/* ... (Existing rendering logic like Onion Skin, Bones, etc.) ... */}
              {/* Note: I'm wrapping the rest of the SVG contents in this <g> */}

              {renderProcgenGroundPlane()}

              {/* Bones & Connections */}
              {CONNECTIONS.map(renderConnection)}
            
            {/* Automatic Hierarchy Bones (Restoring missing bones) */}
            {Object.keys(state.joints).map(id => {
              const joint = state.joints[id];
              if (!joint.parent) return null;
              // Skip nipples for automatic bones
              if (id.includes('nipple')) return null;
              // Check if this connection is already explicitly defined
              const exists = CONNECTIONS.some(c => 
                (c.from === joint.parent && c.to === id) || 
                (c.from === id && c.to === joint.parent)
              );
              if (exists) return null;
              return renderConnection({ from: joint.parent, to: id, type: 'bone' });
            })}

            {/* Ghost Clone Joints */}
            {draggingId && Object.keys(state.joints).map(id => {
              const pos = getWorldPosition(id, state.joints, INITIAL_JOINTS, 'preview');
              const scale = 20;
              const centerX = canvasSize.width / 2;
              const centerY = canvasSize.height / 2;
              const x = snapPx(pos.x * scale + centerX);
              const y = snapPx(pos.y * scale + centerY);
              if (isNaN(x) || isNaN(y)) return null;
              return (
                <circle 
                  key={`ghost-joint-${id}`} 
                  cx={x} cy={y} r="2" 
                  fill="var(--ghost)" 
                  style={{ opacity: 0.5 }} 
                />
              );
            })}
                    
                    {!state.jointsOverMasks && (
                      <>
                        {/* Joints */}
                        {jointsLayer}
                        {/* Cutouts / Masks */}
                        {cutoutsLayer}
                      </>
                    )}

                    {state.jointsOverMasks && (
                      <>
                        {/* Cutouts / Masks */}
                        {cutoutsLayer}
                        {/* Joints */}
                        {jointsLayer}
                      </>
                    )}
                    
                            {/* Foreground Reference Layer */}
                            {state.scene.foreground.src && state.scene.foreground.visible && state.scene.foreground.mediaType === 'image' && (
                              <image
                                href={state.scene.foreground.src}
                                x={state.scene.foreground.x}
                                y={state.scene.foreground.y}
                                width={canvasSize.width}
                                height={canvasSize.height}
                                transform={`scale(${state.scene.foreground.scale})`}
                                preserveAspectRatio={
                                  state.scene.foreground.fitMode === 'none' ? 'none' :
                                  state.scene.foreground.fitMode === 'fill' ? 'none' :
                                  state.scene.foreground.fitMode === 'cover' ? 'xMidYMid slice' :
                                  'xMidYMid meet'
                                }
                                opacity={state.scene.foreground.opacity}
                              />
                            )}
                            {state.scene.foreground.visible && state.scene.foreground.mediaType === 'sequence' && state.scene.foreground.sequence?.id && (
                              <foreignObject
                                x={state.scene.foreground.x}
                                y={state.scene.foreground.y}
                                width={canvasSize.width * state.scene.foreground.scale}
                                height={canvasSize.height * state.scene.foreground.scale}
                                opacity={state.scene.foreground.opacity}
                                style={{ pointerEvents: 'none' }}
                              >
                                <div style={{ width: '100%', height: '100%' }}>
                                  {poseTracingEnabled ? (
                                    <SyncedReferenceSequenceCanvas
                                      sequence={referenceSequencesRef.current.get(state.scene.foreground.sequence.id) ?? null}
                                      desiredTime={fgVideoDesiredTime}
                                      playing={Boolean(state.timeline.enabled && timelinePlaying)}
                                      fitMode={state.scene.foreground.fitMode}
                                    />
                                  ) : state.scene.foreground.sequence.kind === 'gif' && state.scene.foreground.src ? (
                                    <img
                                      src={state.scene.foreground.src}
                                      style={{ width: '100%', height: '100%', objectFit: fitModeToObjectFit(state.scene.foreground.fitMode) }}
                                    />
                                  ) : (
                                    <SyncedReferenceSequenceCanvas
                                      sequence={referenceSequencesRef.current.get(state.scene.foreground.sequence.id) ?? null}
                                      desiredTime={0}
                                      playing={false}
                                      fitMode={state.scene.foreground.fitMode}
                                    />
                                  )}
                                </div>
                              </foreignObject>
                            )}
                            {state.scene.foreground.src && state.scene.foreground.visible && state.scene.foreground.mediaType === 'video' && (
                              <foreignObject
                                x={state.scene.foreground.x}
                                y={state.scene.foreground.y}
                                width={canvasSize.width * state.scene.foreground.scale}
                                height={canvasSize.height * state.scene.foreground.scale}
                                opacity={state.scene.foreground.opacity}
                                style={{ pointerEvents: 'none' }}
                              >
                                <div style={{ width: '100%', height: '100%' }}>
                                  {poseTracingEnabled ? (
                                    <SyncedReferenceVideo
                                      ref={fgVideoRef}
                                      src={state.scene.foreground.src}
                                      desiredTime={fgVideoDesiredTime}
                                      playing={Boolean(state.timeline.enabled && timelinePlaying)}
                                      playbackRate={state.scene.foreground.videoRate}
                                      objectFit={
                                        state.scene.foreground.fitMode === 'cover'
                                          ? 'cover'
                                          : state.scene.foreground.fitMode === 'fill'
                                            ? 'fill'
                                            : state.scene.foreground.fitMode === 'none'
                                              ? 'none'
                                              : 'contain'
                                      }
                                      onMeta={setFgVideoMeta}
                                    />
                                  ) : (
                                    <video
                                      src={state.scene.foreground.src}
                                      muted
                                      loop
                                      autoPlay
                                      playsInline
                                      preload="auto"
                                      onLoadedMetadata={(e) => {
                                        const v = e.currentTarget;
                                        setFgVideoMeta({
                                          duration: Number.isFinite(v.duration) ? v.duration : 0,
                                          width: v.videoWidth || 0,
                                          height: v.videoHeight || 0,
                                        });
                                      }}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit:
                                          state.scene.foreground.fitMode === 'cover'
                                            ? 'cover'
                                            : state.scene.foreground.fitMode === 'fill'
                                              ? 'fill'
                                              : state.scene.foreground.fitMode === 'none'
                                                ? 'none'
                                                : 'contain',
                                      }}
                                    />
                                  )}
                                </div>
                              </foreignObject>
                            )}
                    </g>

                    {/* Text overlays (titles/intertitles) */}
                    {(() => {
                      const frame = state.timeline.enabled ? timelineFrame : 0;
                      const overlays = Array.isArray(state.scene.textOverlays) ? state.scene.textOverlays : [];
                      const active = overlays.filter((o) => o.visible && frame >= o.startFrame && frame <= o.endFrame && (o.text || '').trim());
                      if (active.length === 0) return null;
                      return (
                        <g>
                          {active.map((o) => {
                            if (o.kind === 'intertitle') {
                              return (
                                <g key={o.id}>
                                  <rect x={0} y={0} width={canvasSize.width} height={canvasSize.height} fill="#000" opacity={0.85} />
                                  <text
                                    x={canvasSize.width / 2}
                                    y={canvasSize.height / 2}
                                    fill={o.color || '#fff'}
                                    fontSize={Math.max(8, o.fontSize || 48)}
                                    fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                  >
                                    {o.text}
                                  </text>
                                </g>
                              );
                            }
                            const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : 'middle';
                            const x = o.align === 'left' ? 24 : o.align === 'right' ? canvasSize.width - 24 : canvasSize.width / 2;
                            return (
                              <text
                                key={o.id}
                                x={x}
                                y={20}
                                fill={o.color || '#fff'}
                                fontSize={Math.max(8, o.fontSize || 32)}
                                fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
                                textAnchor={anchor}
                              >
                                {o.text}
                              </text>
                            );
                          })}
                        </g>
                      );
                    })()}
          <div className="absolute top-8 right-8 flex gap-2">
             <button
               onClick={() => setBacklightEnabled(!backlightEnabled)}
               className={`bg-[#121212]/80 backdrop-blur-md border border-[#222] px-4 py-2 rounded-full flex items-center gap-3 transition-all duration-200 ${
                 backlightEnabled ? 'bg-yellow-500/20 border-yellow-500/50' : 'hover:bg-[#1a1a1a]'
               }`}
             >
                <Power 
                  className={`w-4 h-4 transition-colors duration-200 ${
                    backlightEnabled ? 'text-yellow-400' : 'text-gray-400'
                  }`} 
                />
                <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors duration-200 ${
                  backlightEnabled ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {backlightEnabled ? 'Backlight ON' : 'Backlight OFF'}
                </span>
             </button>
          </div>
          {state.timeline.enabled && (() => {
            const frameCount = Math.max(2, Math.floor(state.timeline.clip.frameCount));
            const fps = Math.max(1, Math.floor(state.timeline.clip.fps));
            const hasKeyframe = state.timeline.clip.keyframes.some((k) => k.frame === timelineFrame);

            return (
              <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-[#121212]/90 backdrop-blur-md border border-[#222] rounded-xl px-6 py-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (timelinePlaying) {
                        setTimelinePlaying(false);
                        return;
                      }
                      timelineFrameRef.current = timelineFrame;
                      setTimelinePlaying(true);
                    }}
                    className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    {timelinePlaying ? 'Pause' : 'Play'}
                  </button>

                  <button
                    type="button"
                    onClick={setKeyframeHere}
                    className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    {hasKeyframe ? 'Update Key' : 'Set Key'}
                  </button>

                  <button
                    type="button"
                    onClick={deleteKeyframeHere}
                    disabled={!hasKeyframe}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      hasKeyframe ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                  >
                    Delete Key
                  </button>

                  <button
                    type="button"
                    onClick={() => setPoseTracingEnabled((prev) => !prev)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      poseTracingEnabled ? 'bg-[#3366cc] text-white' : 'bg-[#222] hover:bg-[#333]'
                    }`}
                    title="Pose Trace (P)"
                  >
                    Pose Trace
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToAdjacentKeyframe(-1)}
                    disabled={!state.timeline.clip.keyframes.length}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      state.timeline.clip.keyframes.length ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                    title="Prev keyframe ([ or Shift+←)"
                  >
                    Prev Key
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToAdjacentKeyframe(1)}
                    disabled={!state.timeline.clip.keyframes.length}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      state.timeline.clip.keyframes.length ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                    title="Next keyframe (] or Shift+→)"
                  >
                    Next Key
                  </button>

                  {(state.scene.background.mediaType === 'video' || state.scene.background.mediaType === 'sequence') && state.scene.background.src && (
                    <button
                      type="button"
                      onClick={fitTimelineToBackgroundVideo}
                      className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                      title="Match timeline length to background reference"
                    >
                      Match Ref
                    </button>
                  )}

                  <div className="ml-auto flex items-center gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                      <span>FPS</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={state.timeline.clip?.fps || 24}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 1, 60);
                          setStateWithHistory('timeline_set_fps', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              clip: { ...prev.timeline.clip, fps: next },
                            },
                          }));
                        }}
                        className="w-16 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                      <span>Frames</span>
                      <input
                        type="number"
                        min={2}
                        max={600}
                        value={state.timeline.clip?.frameCount || 120}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 2, 600);
                          setStateWithHistory('timeline_set_frame_count', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              clip: {
                                ...prev.timeline.clip,
                                frameCount: next,
                                keyframes: prev.timeline.clip.keyframes.filter((k) => k.frame < next),
                              },
                            },
                          }));
                          setTimelineFrame((f) => {
                            const clamped = clamp(f, 0, next - 1);
                            timelineFrameRef.current = clamped;
                            return clamped;
                          });
                        }}
                        className="w-20 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                      <span>Easing</span>
                      <select
                        value={state.timeline.clip?.easing || 'linear'}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = e.target.value === 'easeInOut' ? 'easeInOut' : 'linear';
                          setStateWithHistory('timeline_set_easing', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              clip: { ...prev.timeline.clip, easing: next },
                            },
                          }));
                        }}
                        className="px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white text-xs"
                      >
                        <option value="linear">Linear</option>
                        <option value="easeInOut">EaseInOut</option>
                      </select>
                    </div>

                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666] select-none">
                      <input
                        type="checkbox"
                        checked={state.timeline.onionSkin.enabled}
                        onChange={() => {
                          setTimelinePlaying(false);
                          setStateWithHistory('toggle_onion_skin', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              onionSkin: { ...prev.timeline.onionSkin, enabled: !prev.timeline.onionSkin.enabled },
                            },
                          }));
                        }}
                        className="accent-white"
                      />
                      Onion
                    </label>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="w-28 font-mono text-xs text-[#666]">
                    {timelineFrame}/{frameCount - 1}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={frameCount - 1}
                    step={1}
                    value={timelineFrame}
                    onPointerDown={() => {
                      setTimelinePlaying(false);
                      historyCtrlRef.current.beginAction('timeline_scrub', state);
                    }}
                    onPointerUp={() =>
                      setState((prev) => {
                        const changed = historyCtrlRef.current.commitAction(prev);
                        return changed ? { ...prev } : prev;
                      })
                    }
                    onPointerCancel={() =>
                      setState((prev) => {
                        const changed = historyCtrlRef.current.commitAction(prev);
                        return changed ? { ...prev } : prev;
                      })
                    }
                    onChange={(e) => applyTimelineFrame(parseInt(e.target.value, 10))}
                    className="flex-1 accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                  />
                  <div className="w-24 text-[10px] font-bold uppercase tracking-widest text-[#666] text-right">
                    Keys: {state.timeline.clip?.keyframes?.length || 0}
                  </div>
                </div>

                {state.timeline.onionSkin.enabled && (
                  <div className="mt-3 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                    <div className="flex items-center gap-2">
                      <span>Past</span>
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={state.timeline.onionSkin.past}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 0, 12);
                          setStateWithHistory('onion_past', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              onionSkin: { ...prev.timeline.onionSkin, past: next },
                            },
                          }));
                        }}
                        className="w-16 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Future</span>
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={state.timeline.onionSkin.future}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 0, 12);
                          setStateWithHistory('onion_future', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              onionSkin: { ...prev.timeline.onionSkin, future: next },
                            },
                          }));
                        }}
                        className="w-16 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
                  </svg>

          {/* Floating Widgets */}
          {floatingWidgets.map((widget) => {
            const title = WIDGETS[widget.id]?.title ?? widget.id;
            const headerH = 34;
            return (
              <div
                key={widget.id}
                className="absolute z-30 pointer-events-auto"
                style={{ left: widget.x, top: widget.y, width: widget.w }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  focusFloatingWidget(widget.id);
                }}
              >
                <div
                  className="relative bg-[#121212]/90 backdrop-blur-md border border-[#222] rounded-xl shadow-xl overflow-hidden"
                  style={{ height: widget.minimized ? headerH : widget.h }}
                >
                  <div
                    className="h-[34px] px-3 flex items-center justify-between cursor-move select-none"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      focusFloatingWidget(widget.id);
                      setWidgetDragging({
                        id: widget.id,
                        startClientX: e.clientX,
                        startClientY: e.clientY,
                        startX: widget.x,
                        startY: widget.y,
                      });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {widget.id === 'console' ? (
                        <Terminal size={14} className="text-[#666]" />
                      ) : widget.id === 'bone_inspector' ? (
                        <Layers size={14} className="text-[#666]" />
                      ) : widget.id === 'camera' ? (
                        <Maximize2 size={14} className="text-[#666]" />
                      ) : widget.id === 'procgen' ? (
                        <Sparkles size={14} className="text-[#666]" />
                      ) : widget.id === 'atomic_units' ? (
                        <Grid size={14} className="text-[#666]" />
                      ) : (
                        <Anchor size={14} className="text-[#666]" />
                      )}
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">{title}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() =>
                          setFloatingWidgets((prev) =>
                            prev.map((w) => (w.id === widget.id ? { ...w, minimized: !w.minimized } : w)),
                          )
                        }
                        className="p-1 rounded hover:bg-white/10 text-[#888]"
                        title={widget.minimized ? 'Restore' : 'Minimize'}
                      >
                        <Minus size={14} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => dockWidget(widget.id)}
                        className="p-1 rounded hover:bg-white/10 text-[#888]"
                        title="Dock"
                      >
                        <X size={10} className="text-[#666]" />
                      </button>
                    </div>
                  </div>

                  {!widget.minimized && (
                    <>
                      <div
                        ref={(el) => registerWidgetPortalTarget(widget.id, el)}
                        className="p-3 overflow-auto"
                        style={{ height: widget.h - headerH }}
                      />
                      <div
                        className="absolute right-1 bottom-1 h-4 w-4 cursor-se-resize rounded hover:bg-white/10"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          focusFloatingWidget(widget.id);
                          setWidgetResizing({
                            id: widget.id,
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            startW: widget.w,
                            startH: widget.h,
                          });
                        }}
                        title="Resize"
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}

	          {/* HUD Overlay */}
          <div className="absolute bottom-8 left-8 flex gap-4 pointer-events-none">
            <div className="bg-[#121212]/80 backdrop-blur-md border border-[#222] p-4 rounded-2xl">
              <p className="text-[10px] text-[#666] uppercase font-bold mb-2 tracking-widest">State Vector</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
                <span className="text-[#444]">X_COORD</span>
                <span className="text-white">{(state.joints.navel.currentOffset.x).toFixed(3)}</span>
                <span className="text-[#444]">Y_COORD</span>
                <span className="text-white">{(state.joints.navel.currentOffset.y).toFixed(3)}</span>
                <span className="text-[#444]">PINS_ACT</span>
                <span className="text-white">{state.activeRoots.length}</span>
              </div>
            </div>

            {debugOverlayEnabled && (
              <div className="bg-[#121212]/80 backdrop-blur-md border border-[#222] p-4 rounded-2xl">
                <p className="text-[10px] text-[#666] uppercase font-bold mb-2 tracking-widest">Debug</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs">
                  <span className="text-[#444]">CANVAS_W</span>
                  <span className="text-white">{Math.round(debugGridStats.canvasW)}</span>
                  <span className="text-[#444]">CANVAS_H</span>
                  <span className="text-white">{Math.round(debugGridStats.canvasH)}</span>
                  <span className="text-[#444]">VIEW_Z</span>
                  <span className="text-white">{debugGridStats.viewScale.toFixed(2)}</span>
                  <span className="text-[#444]">VIEW_X</span>
                  <span className="text-white">{debugGridStats.viewOffsetX.toFixed(1)}</span>
                  <span className="text-[#444]">VIEW_Y</span>
                  <span className="text-white">{debugGridStats.viewOffsetY.toFixed(1)}</span>
                  <span className="text-[#444]">GRID_CX</span>
                  <span className="text-white">
                    {debugGridStats.gridCenterX == null ? '—' : debugGridStats.gridCenterX.toFixed(1)}
                  </span>
                  <span className="text-[#444]">GRID_CY</span>
                  <span className="text-white">
                    {debugGridStats.gridCenterY == null ? '—' : debugGridStats.gridCenterY.toFixed(1)}
                  </span>
                  <span className="text-[#444]">PX_UNIT</span>
                  <span className="text-white">{debugGridStats.pxPerUnit == null ? '—' : debugGridStats.pxPerUnit.toFixed(1)}</span>
                  <span className="text-[#444]">DRIFT_X</span>
                  <span className="text-white">{debugGridStats.driftX == null ? '—' : debugGridStats.driftX.toFixed(1)}</span>
                  <span className="text-[#444]">DRIFT_Y</span>
                  <span className="text-white">{debugGridStats.driftY == null ? '—' : debugGridStats.driftY.toFixed(1)}</span>
                  <span className="text-[#444]">MAX_DX</span>
                  <span className="text-white">{debugGridStats.maxAbsDriftX.toFixed(1)}</span>
                  <span className="text-[#444]">MAX_DY</span>
                  <span className="text-white">{debugGridStats.maxAbsDriftY.toFixed(1)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="absolute top-8 right-8 flex gap-2">
             <button
               onClick={() => setBacklightEnabled(!backlightEnabled)}
               className={`bg-[#121212]/80 backdrop-blur-md border border-[#222] px-4 py-2 rounded-full flex items-center gap-3 transition-all duration-200 ${
                 backlightEnabled ? 'bg-yellow-500/20 border-yellow-500/50' : 'hover:bg-[#1a1a1a]'
               }`}
             >
                <Power 
                  className={`w-4 h-4 transition-colors duration-200 ${
                    backlightEnabled ? 'text-yellow-400' : 'text-gray-400'
                  }`} 
                />
                <span className={`text-[10px] font-bold tracking-widest uppercase transition-colors duration-200 ${
                  backlightEnabled ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {backlightEnabled ? 'Backlight ON' : 'Backlight OFF'}
                </span>
             </button>
          </div>
        </div>

          {state.timeline.enabled && (() => {
            const frameCount = Math.max(2, Math.floor(state.timeline.clip.frameCount));
            const fps = Math.max(1, Math.floor(state.timeline.clip.fps));
            const hasKeyframe = state.timeline.clip.keyframes.some((k) => k.frame === timelineFrame);

            return (
              <div className="shrink-0 bg-[#121212] border-t border-[#222] px-6 py-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (timelinePlaying) {
                        setTimelinePlaying(false);
                        return;
                      }
                      timelineFrameRef.current = timelineFrame;
                      setTimelinePlaying(true);
                    }}
                    className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    {timelinePlaying ? 'Pause' : 'Play'}
                  </button>

                  <button
                    type="button"
                    onClick={setKeyframeHere}
                    className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                  >
                    {hasKeyframe ? 'Update Key' : 'Set Key'}
                  </button>

                  <button
                    type="button"
                    onClick={deleteKeyframeHere}
                    disabled={!hasKeyframe}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      hasKeyframe ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                  >
                    Delete Key
                  </button>

                  <button
                    type="button"
                    onClick={() => setPoseTracingEnabled((prev) => !prev)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      poseTracingEnabled ? 'bg-[#3366cc] text-white' : 'bg-[#222] hover:bg-[#333]'
                    }`}
                    title="Pose Trace (P)"
                  >
                    Pose Trace
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToAdjacentKeyframe(-1)}
                    disabled={!state.timeline.clip.keyframes.length}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      state.timeline.clip.keyframes.length ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                    title="Prev keyframe ([ or Shift+←)"
                  >
                    Prev Key
                  </button>

                  <button
                    type="button"
                    onClick={() => jumpToAdjacentKeyframe(1)}
                    disabled={!state.timeline.clip.keyframes.length}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                      state.timeline.clip.keyframes.length ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
                    }`}
                    title="Next keyframe (] or Shift+→)"
                  >
                    Next Key
                  </button>

                  {(state.scene.background.mediaType === 'video' || state.scene.background.mediaType === 'sequence') && state.scene.background.src && (
                    <button
                      type="button"
                      onClick={fitTimelineToBackgroundVideo}
                      className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                      title="Match timeline length to background reference"
                    >
                      Match Ref
                    </button>
                  )}

                  <div className="ml-auto flex items-center gap-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                      <span>FPS</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={state.timeline.clip?.fps || 24}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 1, 60);
                          setStateWithHistory('timeline_set_fps', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              clip: { ...prev.timeline.clip, fps: next },
                            },
                          }));
                        }}
                        className="w-16 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                      <span>Frames</span>
                      <input
                        type="number"
                        min={2}
                        max={600}
                        value={state.timeline.clip?.frameCount || 120}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 2, 600);
                          setStateWithHistory('timeline_set_frame_count', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              clip: {
                                ...prev.timeline.clip,
                                frameCount: next,
                                keyframes: prev.timeline.clip.keyframes.filter((k) => k.frame < next),
                              },
                            },
                          }));
                          setTimelineFrame((f) => {
                            const clamped = clamp(f, 0, next - 1);
                            timelineFrameRef.current = clamped;
                            return clamped;
                          });
                        }}
                        className="w-20 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                      <span>Easing</span>
                      <select
                        value={state.timeline.clip?.easing || 'linear'}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = e.target.value === 'easeInOut' ? 'easeInOut' : 'linear';
                          setStateWithHistory('timeline_set_easing', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              clip: { ...prev.timeline.clip, easing: next },
                            },
                          }));
                        }}
                        className="px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white text-xs"
                      >
                        <option value="linear">Linear</option>
                        <option value="easeInOut">EaseInOut</option>
                      </select>
                    </div>

                    <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666] select-none">
                      <input
                        type="checkbox"
                        checked={state.timeline.onionSkin.enabled}
                        onChange={() => {
                          setTimelinePlaying(false);
                          setStateWithHistory('toggle_onion_skin', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              onionSkin: { ...prev.timeline.onionSkin, enabled: !prev.timeline.onionSkin.enabled },
                            },
                          }));
                        }}
                        className="accent-white"
                      />
                      Onion
                    </label>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="w-28 font-mono text-xs text-[#666]">
                    {timelineFrame}/{frameCount - 1}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={frameCount - 1}
                    step={1}
                    value={timelineFrame}
                    onPointerDown={() => {
                      setTimelinePlaying(false);
                      historyCtrlRef.current.beginAction('timeline_scrub', state);
                    }}
                    onPointerUp={() =>
                      setState((prev) => {
                        const changed = historyCtrlRef.current.commitAction(prev);
                        return changed ? { ...prev } : prev;
                      })
                    }
                    onPointerCancel={() =>
                      setState((prev) => {
                        const changed = historyCtrlRef.current.commitAction(prev);
                        return changed ? { ...prev } : prev;
                      })
                    }
                    onChange={(e) => applyTimelineFrame(parseInt(e.target.value, 10))}
                    className="flex-1 accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                  />
                  <div className="w-24 text-[10px] font-bold uppercase tracking-widest text-[#666] text-right">
                    Keys: {state.timeline.clip?.keyframes?.length || 0}
                  </div>
                </div>

                {state.timeline.onionSkin.enabled && (
                  <div className="mt-3 flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-[#666]">
                    <div className="flex items-center gap-2">
                      <span>Past</span>
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={state.timeline.onionSkin.past}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 0, 12);
                          setStateWithHistory('onion_past', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              onionSkin: { ...prev.timeline.onionSkin, past: next },
                            },
                          }));
                        }}
                        className="w-16 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span>Future</span>
                      <input
                        type="number"
                        min={0}
                        max={12}
                        value={state.timeline.onionSkin.future}
                        onChange={(e) => {
                          setTimelinePlaying(false);
                          const next = clamp(parseInt(e.target.value || '0', 10), 0, 12);
                          setStateWithHistory('onion_future', (prev) => ({
                            ...prev,
                            timeline: {
                              ...prev.timeline,
                              onionSkin: { ...prev.timeline.onionSkin, future: next },
                            },
                          }));
                        }}
                        className="w-16 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
  </main>
  <ViewSwitchDialog
    open={viewSwitchOpen}
    fromName={(getActiveView(state)?.name ?? 'Current')}
    toName={(viewSwitchToId ? (state.views.find((v) => v.id === viewSwitchToId)?.name ?? viewSwitchToId) : 'View')}
    onCancel={() => {
      setViewSwitchOpen(false);
      setViewSwitchToId(null);
    }}
    onChoose={(choice) => {
      if (!viewSwitchToId) return;
      performViewSwitch(viewSwitchToId, choice, false);
      setViewSwitchOpen(false);
      setViewSwitchToId(null);
    }}
    onSaveThenChoose={(choice) => {
      if (!viewSwitchToId) return;
      performViewSwitch(viewSwitchToId, choice, true);
      setViewSwitchOpen(false);
      setViewSwitchToId(null);
    }}
  />
  <TransitionWarningDialog
    open={transitionWarningOpen}
    issues={transitionWarningIssues}
    onClose={() => {
      setTransitionWarningOpen(false);
      setTransitionWarningIssues([]);
    }}
  />
</div>
);
}

function Toggle({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      type="button"
      aria-pressed={active}
      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${active ? 'bg-white text-black border-white' : 'bg-transparent text-[#666] border-[#222] hover:border-[#444]'}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-tight">{label}</span>
      {active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
    </button>
  );
}
