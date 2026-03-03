import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Slider } from "@/components/ui/slider";
import { SystemGrid } from "@/components/SystemGrid";
import { 
  Activity, 
  Lock, 
  Unlock, 
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
  Power
} from 'lucide-react';
import { Joint, Point, SkeletonState, ControlMode, Connection } from './engine/types';
import { viewModes, ViewModeId } from './viewModes';
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
import { makeDefaultState, sanitizeState, sanitizeJoints } from './engine/settings';
import { CONNECTIONS, INITIAL_JOINTS } from './engine/model';
import { shouldRunPosePhysics, stepPosePhysics } from './engine/physics/posePhysics';
import { generateProceduralPose, type ProceduralMode } from './engine/procedural';
import { applyPhysicsMode, getPhysicsBlendMode, createRigidStartPoint } from './engine/physics-config';
import { AtomicUnitsControl } from './components/AtomicUnitsControl';
import { HelpTip } from './components/HelpTip';
import { RotationWheelControl } from '@/components/RotationWheelControl';

const LOCAL_STORAGE_KEY = 'bitruvius_state';
const IMAGE_CACHE_KEY = 'bitruvius_image_cache';
const BACKGROUND_COLOR_KEY = 'bitruvius_background_color';
const POSE_TRACE_KEY = 'bitruvius_pose_trace_enabled';
const BUILD_ID = 'Bitruvius';
const DND_WIDGET_MIME = 'text/bitruvius-widget';

type ReferenceVideoMeta = { duration: number; width: number; height: number };

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

type WidgetKind = 'joint_masks' | 'bone_inspector' | 'console' | 'camera' | 'procgen' | 'atomic_units';

type FloatingWidget = {
  id: string;
  kind: WidgetKind;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
};

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
  const [state, setState] = useState<SkeletonState>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = deserializeEngineState(saved);
      if (parsed.ok) {
        const sanitizedState = sanitizeState(parsed.rawState);
        const defaults = makeDefaultState();
        
        // Restore cached images
        const restoredState = { ...sanitizedState };
        
                // Restore cached images (videos are not cached in localStorage).
                if (restoredState.scene.background.src && restoredState.scene.background.mediaType !== 'video') {
                  const cachedBg = restoreImageFromCache('background');
                  if (cachedBg) {
                    restoredState.scene.background.src = cachedBg;
                  }
                }
                
                if (restoredState.scene.foreground.src && restoredState.scene.foreground.mediaType !== 'video') {
                  const cachedFg = restoreImageFromCache('foreground');
                  if (cachedFg) {
                    restoredState.scene.foreground.src = cachedFg;
                  }
                }
        
        // Restore head mask
        if (restoredState.scene.headMask.src) {
          const cachedHeadMask = restoreImageFromCache('head_mask');
          if (cachedHeadMask) {
            restoredState.scene.headMask.src = cachedHeadMask;
          }
        }
        
    // Restore joint masks
    for (const jointId of Object.keys(restoredState.scene.jointMasks)) {
      const mask = restoredState.scene.jointMasks[jointId];
      if (mask && mask.src) {
        const cachedMask = restoreImageFromCache(`joint_mask_${jointId}`);
        if (cachedMask) {
          mask.src = cachedMask;
        }
      }
    }
    
        // Ensure joint masks are initialized for all joints (and include all mask fields).
        for (const jointId of Object.keys(INITIAL_JOINTS)) {
          if (!restoredState.scene.jointMasks[jointId]) {
            restoredState.scene.jointMasks[jointId] = { ...defaults.scene.jointMasks[jointId] };
          }
        }

    return restoredState;
  }
}
return makeDefaultState();
});

  useEffect(() => {
    console.log(`[bitruvius] build=${BUILD_ID}`);
    cleanupImageCache(); // Clean up old cache entries
  }, []);

  const activePinsKey = state.activePins.join('|');
  useEffect(() => {
    const active = new Set(state.activePins);
    const next = { ...pinTargetsRef.current };
    let changed = false;

    for (const id of state.activePins) {
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
  }, [activePinsKey]);

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
  const [maskDragging, setMaskDragging] = useState<null | {
    jointId: string;
    startClientX: number;
    startClientY: number;
    startOffsetX: number;
    startOffsetY: number;
  }>(null);
  const maskDraggingLiveRef = useRef(false);
  const [maskJointId, setMaskJointId] = useState<string>('head');
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [selectedConnectionKey, setSelectedConnectionKey] = useState<string | null>(null);
  const [rigFocus, setRigFocus] = useState<RigFocus>({ track: 'body', index: 0, side: 'front', stage: 'joint' });
  const [timelineFrame, setTimelineFrame] = useState(0);
  const timelineFrameRef = useRef(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [poseTracingEnabled, setPoseTracingEnabled] = useState(() => localStorage.getItem(POSE_TRACE_KEY) === '1');
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const fgVideoRef = useRef<HTMLVideoElement | null>(null);
  const [bgVideoMeta, setBgVideoMeta] = useState<ReferenceVideoMeta | null>(null);
  const [fgVideoMeta, setFgVideoMeta] = useState<ReferenceVideoMeta | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const importStateInputRef = useRef<HTMLInputElement>(null);
  const maskUploadInputRef = useRef<HTMLInputElement>(null);
  const jointMaskUploadInputRef = useRef<HTMLInputElement>(null);
  const maskJointIdRef = useRef<string>('head');
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [gridRingsBgData, setGridRingsBgData] = useState<GridRingsBackgroundData | null>(null);
          const [gridRingsEnabled, setGridRingsEnabled] = useState(true);
          const [gridOverlayEnabled, setGridOverlayEnabled] = useState(true);
          const [backlightEnabled, setBacklightEnabled] = useState(false);
          const [backgroundColor, setBackgroundColor] = useState(() => {
    // Load saved background color or use faded paper default
    const saved = localStorage.getItem(BACKGROUND_COLOR_KEY);
    return saved || '#fff3d1'; // Faded paper yellowish default
  });

  const stateLiveRef = useRef(state);
  useEffect(() => {
    stateLiveRef.current = state;
  }, [state]);

  useEffect(() => {
    maskJointIdRef.current = maskJointId;
  }, [maskJointId]);

  useEffect(() => {
    try {
      localStorage.setItem(POSE_TRACE_KEY, poseTracingEnabled ? '1' : '0');
    } catch {
      // Ignore storage errors.
    }
  }, [poseTracingEnabled]);

  const timelineFpsLive = Math.max(1, Math.floor(state.timeline.clip?.fps || 24));
  const bgVideoDesiredTime =
    state.scene.background.mediaType === 'video'
      ? state.scene.background.videoStart +
        (state.timeline.enabled ? (timelineFrame / timelineFpsLive) * state.scene.background.videoRate : 0)
      : 0;
  const fgVideoDesiredTime =
    state.scene.foreground.mediaType === 'video'
      ? state.scene.foreground.videoStart +
        (state.timeline.enabled ? (timelineFrame / timelineFpsLive) * state.scene.foreground.videoRate : 0)
      : 0;
          const [procgenMode, setProcgenMode] = useState<ProceduralMode>('walk');
          const [procgenCycleFrames, setProcgenCycleFrames] = useState(48);
          const [procgenStrength, setProcgenStrength] = useState(1);
  
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
  const [widgetDragging, setWidgetDragging] = useState<null | {
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  }>(null);

  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleMinimized, setConsoleMinimized] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [activeLogLevels, setActiveLogLevels] = useState<Set<ConsoleLogLevel>>(
    () => new Set<ConsoleLogLevel>(['info', 'warning', 'error', 'success']),
  );

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

	    const spawnFloatingWidget = useCallback(
	    (kind: WidgetKind, clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const x = rect ? clientX - rect.left : clientX;
      const y = rect ? clientY - rect.top : clientY;

	      const w =
	        kind === 'console'
	          ? 420
	          : kind === 'camera'
	            ? 200
	            : kind === 'procgen'
	              ? 300
	              : kind === 'atomic_units'
	                ? 380
                  : kind === 'bone_inspector'
                    ? 320
	                : 360;
	      const h =
	        kind === 'console'
	          ? 280
	          : kind === 'camera'
	            ? 150
	            : kind === 'procgen'
	              ? 200
	              : kind === 'atomic_units'
	                ? 520
                  : kind === 'bone_inspector'
                    ? 240
	                : 420;
      const id = kind + '-' + Math.random().toString(36).slice(2, 9);

      setFloatingWidgets((prev) => [
        ...prev,
        {
          id,
          kind,
          minimized: false,
          w,
          h,
          x: Math.max(12, Math.round(x - w * 0.5)),
          y: Math.max(12, Math.round(y - 18)),
        },
      ]);
    },
    [],
  );

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

  const ensureFloatingWidgetOpen = useCallback((kind: WidgetKind) => {
    const center = getCanvasCenterClient();
    setFloatingWidgets((prev) => {
      const idx = prev.findIndex((w) => w.kind === kind);
      if (idx >= 0) {
        const w = prev[idx]!;
        const next = prev.slice();
        next.splice(idx, 1);
        next.push({ ...w, minimized: false });
        return next;
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      const x = rect ? center.x - rect.left : center.x;
      const y = rect ? center.y - rect.top : center.y;

      const w =
        kind === 'console'
          ? 420
          : kind === 'camera'
            ? 200
            : kind === 'procgen'
              ? 300
              : kind === 'atomic_units'
                ? 380
                : kind === 'bone_inspector'
                  ? 320
                  : 360;
      const h =
        kind === 'console'
          ? 280
          : kind === 'camera'
            ? 150
            : kind === 'procgen'
              ? 200
              : kind === 'atomic_units'
                ? 520
                : kind === 'bone_inspector'
                  ? 240
                  : 420;

      const id = kind + '-' + Math.random().toString(36).slice(2, 9);
      return [
        ...prev,
        {
          id,
          kind,
          minimized: false,
          w,
          h,
          x: Math.max(12, Math.round(x - w * 0.5)),
          y: Math.max(12, Math.round(y - 18)),
        },
      ];
    });
  }, [getCanvasCenterClient]);

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
      ensureFloatingWidgetOpen('bone_inspector');
      return;
    }

    ensureFloatingWidgetOpen('joint_masks');
  }, [ensureFloatingWidgetOpen, focusBoneKeyForJointId, focusJointId, setState]);

  useEffect(() => {
    applyRigFocus(rigFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!widgetDragging) return;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - widgetDragging.startClientX;
      const dy = e.clientY - widgetDragging.startClientY;
      setFloatingWidgets((prev) =>
        prev.map((w) =>
          w.id === widgetDragging.id
            ? {
                ...w,
                x: widgetDragging.startX + dx,
                y: widgetDragging.startY + dy,
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
  }, [widgetDragging]);

  // Update physics mode based on view mode only (JointDrag is for proportions, not 3D)
  useEffect(() => {
    // Only 3D view mode allows stretching, JointDrag is for proportion editing
    const newPhysicsMode = state.viewMode === '3D' ? '3D' : '2D';
    if (state.physicsMode !== newPhysicsMode) {
      setStateWithHistory('update_physics_mode', (prev) => ({
        ...prev,
        physicsMode: newPhysicsMode,
      }));
    }
  }, [state.viewMode]);

  // Save background color to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(BACKGROUND_COLOR_KEY, backgroundColor);
  }, [backgroundColor]);

  // Handle Nosferatu mode styling - only set background if user hasn't changed it
  useEffect(() => {
    if (state.viewMode === 'nosferatu') {
      // Only change to black if user is still using the default background
      const savedColor = localStorage.getItem(BACKGROUND_COLOR_KEY);
      if (!savedColor || savedColor === '#fff3d1') {
        setBackgroundColor('#000000');
      }
    }
    // Note: We don't reset the background when leaving nosferatu mode to preserve user choice
  }, [state.viewMode]);

  const setStateWithHistory = useCallback(
    (actionId: string, update: (prev: SkeletonState) => SkeletonState) => {
      setState((prev) => {
        const next = update(prev);
        if (!Object.is(next, prev)) {
          historyCtrlRef.current.pushUndo(actionId, prev);
        }
        return next;
      });
    },
    [],
  );

  const applyFluidHandshake = useCallback((prev: SkeletonState, next: SkeletonState): SkeletonState => {
    const settingsChanged =
      prev.controlMode !== next.controlMode ||
      prev.rigidity !== next.rigidity ||
      prev.physicsMode !== next.physicsMode ||
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
        const next = sanitizeState(parsed.rawState);
        setStateWithHistory('import_state', () => next);
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
        activePins: state.activePins,
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
    state.activePins,
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
              src: sourceMask.src,
              visible: true,
              opacity: sourceMask.opacity,
              scale: sourceMask.scale,
              offsetX: sourceMask.offsetX,
              offsetY: sourceMask.offsetY,
            },
          },
        },
      }));
      
      // Cache the copied mask for persistence
      cacheImageFromUrl(sourceMask.src, `joint_mask_${targetJointId}`);
      
      addConsoleLog('success', `Mask copied from ${sourceJointId} to ${targetJointId}`);
    },
    [addConsoleLog, setStateWithHistory, state.scene.jointMasks],
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
    const maxFrame = Math.max(0, state.timeline.clip.frameCount - 1);
    setTimelineFrame((f) => clamp(f, 0, maxFrame));
  }, [state.timeline.clip.frameCount]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, serializeEngineState(state));
      } catch {
        // Ignore quota / serialization errors to avoid breaking the editor loop.
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [state]);

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

  const gridOverlayTransform = useMemo(() => {
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
        const isDirectManipulation = Boolean(draggingIdLiveRef.current) || maskDraggingLiveRef.current;
        const isRigidDragMode = prev.controlMode === 'Cardboard' && !prev.stretchEnabled;
        const physicsActive = shouldRunPosePhysics(prev) && (Boolean(drag) || prev.activePins.length > 0);
        
        // Exclude navel and collar from physics when they're being dragged to prevent tension/jitter
        const navelIsDragged = drag?.id === 'navel';
        const collarIsDragged = drag?.id === 'collar';

        if (physicsActive && !navelIsDragged && !collarIsDragged) {
          const handshakeKey = [
            prev.controlMode,
            prev.rigidity,
            prev.physicsMode,
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

          const drag = dragTargetRef.current;
          const pinTargets = pinTargetsRef.current;
          const activePinTargets: Record<string, Point> = {};
          for (const id of prev.activePins) {
            const t = pinTargets[id];
            if (t) activePinTargets[id] = t;
          }

          const rubberbandAnchor = rubberbandAnchorPinRef.current;
          const activePins =
            rubberbandAnchor && rubberbandAnchor.id in prev.joints
              ? Array.from(new Set([...prev.activePins, rubberbandAnchor.id]))
              : prev.activePins;
          if (rubberbandAnchor && rubberbandAnchor.id in prev.joints) {
            activePinTargets[rubberbandAnchor.id] = rubberbandAnchor.target;
          }

          const result = stepPosePhysics({
            joints: prev.joints,
            activePins,
            pinTargets: activePinTargets,
            drag: drag && drag.id in prev.joints ? drag : null,
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
              physicsMode: prev.physicsMode,
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

          const blended: Record<string, Joint> = { ...prev.joints };
          for (const id of Object.keys(result.joints)) {
            const before = prev.joints[id] ?? result.joints[id]!;
            const after = result.joints[id]!;
            const off = {
              x: lerp(before.previewOffset.x, after.previewOffset.x, t),
              y: lerp(before.previewOffset.y, after.previewOffset.y, t),
            };
            blended[id] = { ...after, previewOffset: off, targetOffset: off, currentOffset: off };
          }

          return { ...prev, joints: blended };
        }

        const nextJoints = { ...prev.joints };
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

        if (changed) return { ...prev, joints: nextJoints };
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
          const pose = sampleClipPose(prev.timeline.clip, nextFrame, prev.joints, {
            stretchEnabled: prev.stretchEnabled,
          });
          if (!pose) return prev;
          return { ...prev, joints: applyPoseSnapshotToJoints(prev.joints, pose) };
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    state.timeline.enabled,
    state.timeline.clip.easing,
    state.timeline.clip.fps,
    state.timeline.clip.frameCount,
    state.timeline.clip.keyframes,
    timelinePlaying,
  ]);

  useEffect(() => {
    if (!state.timeline.enabled) return;
    if (timelinePlaying) return;
    setState((prev) => {
      const pose = sampleClipPose(prev.timeline.clip, timelineFrame, prev.joints, { stretchEnabled: prev.stretchEnabled });
      if (!pose) return prev;
      return { ...prev, joints: applyPoseSnapshotToJoints(prev.joints, pose) };
    });
  }, [state.timeline.enabled, state.timeline.clip, timelineFrame, timelinePlaying]);

  const handleMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setTimelinePlaying(false);
    setSelectedJointId(id);
    setMaskJointId(id);
    setSelectedConnectionKey(focusBoneKeyForJointId(id, state.joints));
    syncRigFocusFromJointId(id);
    historyCtrlRef.current.beginAction(`drag:${id}`, state);
    draggingIdLiveRef.current = id;

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
        const anchorId = pickRubberbandAnchorId(id);
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
    
    // Exclude navel and collar from physics when they start being dragged
    if (shouldRunPosePhysics(state) && id !== 'navel' && id !== 'collar') {
      dragTargetRef.current = { id, target: getWorldPosition(id, state.joints, INITIAL_JOINTS, 'preview') };
    }
    pinWorldRef.current = state.activePins.reduce<Record<string, Point>>((acc, pinId) => {
      acc[pinId] = getWorldPosition(pinId, state.joints, INITIAL_JOINTS, 'preview');
      return acc;
    }, {});
    setDraggingId(id);
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
    });
  };

    const getMouseWorld = (clientX: number, clientY: number): Point => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
      
      const transformedX = (screenX - state.viewOffset.x) / state.viewScale;
      const transformedY = (screenY - state.viewOffset.y) / state.viewScale;
      
    return {
      x: (transformedX - centerX) / (20),
      y: (transformedY - centerY) / (20),
    };
    };

    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const mouseWorld = getMouseWorld(e.clientX, e.clientY);

        if (maskDragging) {
          maskDraggingLiveRef.current = true;
          // `offsetX/offsetY` are stored in *screen pixels* so mask movement feels consistent
          // regardless of the current zoom (`viewScale` is applied to the whole SVG group).
          const dx = e.clientX - maskDragging.startClientX;
          const dy = e.clientY - maskDragging.startClientY;
          const jointId = maskDragging.jointId;
          setState((prev) => {
            const mask = prev.scene.jointMasks[jointId];
            if (!mask) return prev;
            const nextOffsetX = maskDragging.startOffsetX + dx;
            const nextOffsetY = maskDragging.startOffsetY + dy;
            return {
              ...prev,
              scene: {
                ...prev.scene,
                jointMasks: {
                  ...prev.scene.jointMasks,
                  [jointId]: {
                    ...mask,
                    offsetX: Number.isFinite(nextOffsetX) ? nextOffsetX : 0,
                    offsetY: Number.isFinite(nextOffsetY) ? nextOffsetY : 0,
                  },
                },
              },
            };
          });
          return;
        }

        if (!draggingId) return;
        draggingIdLiveRef.current = draggingId;

        const mouseX = mouseWorld.x;
        const mouseY = mouseWorld.y;

        // Exclude navel and collar from physics drag updates
        if (shouldRunPosePhysics(state) && draggingId !== 'navel' && draggingId !== 'collar') {
          dragTargetRef.current = { id: draggingId, target: { x: mouseX, y: mouseY } };
          return;
        }

        const pinWorld = pinWorldRef.current;
        const hasPinnedFeet = Boolean(pinWorld && ('l_ankle' in pinWorld || 'r_ankle' in pinWorld));
	        const isBalanceHandle =
	          draggingId === 'head' ||
	          draggingId === 'neck_base' ||
	          draggingId === 'sternum' ||
	          draggingId === 'navel' ||
	          draggingId === 'l_hip' ||
	          draggingId === 'r_hip';

        if (hasPinnedFeet && isBalanceHandle) {
          setState((prev) =>
            (prev.controlMode === 'IK' || prev.controlMode === 'Rubberband') && pinWorld
              ? applyBalanceDragToState(prev, draggingId, { x: mouseX, y: mouseY }, pinWorld)
              : applyDragToState(prev, draggingId, { x: mouseX, y: mouseY }),
          );
        } else {
          setState((prev) => applyDragToState(prev, draggingId, { x: mouseX, y: mouseY }));
        }
      },
      [draggingId, maskDragging, state.stretchEnabled, state.viewScale, state.viewOffset, canvasSize],
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

    // Clear navel and collar from physics drag target specifically
    if (draggingId === 'navel' || draggingId === 'collar') {
      dragTargetRef.current = null;
    }

    draggingIdLiveRef.current = null;
    pinWorldRef.current = null;
    if (draggingId !== 'navel' && draggingId !== 'collar') {
      dragTargetRef.current = null;
    }
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
    if (state.scene.background.mediaType !== 'video' || !state.scene.background.src) {
      alert('Set a background video first.');
      return;
    }
    const duration = bgVideoMeta?.duration ?? 0;
    if (!Number.isFinite(duration) || duration <= 0) {
      alert('Background video metadata not loaded yet. Try toggling the background visibility or Pose Trace on/off.');
      return;
    }

    setTimelinePlaying(false);
    timelineFrameRef.current = 0;
    setTimelineFrame(0);

    setStateWithHistory('timeline_fit_to_bg_video', (prev) => {
      const baseFps = clamp(Math.floor(prev.timeline.clip.fps || 24), 1, 60);
      const videoStart = clamp(prev.scene.background.videoStart, 0, Math.max(0, duration));
      const videoRate = clamp(prev.scene.background.videoRate, 0.05, 4);
      const totalTimelineSeconds = Math.max(0, (duration - videoStart) / Math.max(0.0001, videoRate));

      const maxFrames = 600;
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
    state.scene.background.mediaType,
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
    hingeSignsRef.current = {};
    setStateWithHistory('reset_engine', (prev) => ({
      ...prev,
      joints: sanitizeJoints(null),
    }));
  };

  const togglePin = (id: string) => {
    if (state.activePins.includes(id)) {
      const next = { ...pinTargetsRef.current };
      delete next[id];
      pinTargetsRef.current = next;
    } else {
      pinTargetsRef.current = {
        ...pinTargetsRef.current,
        [id]: getWorldPosition(id, state.joints, INITIAL_JOINTS, 'preview'),
      };
    }
    setStateWithHistory('toggle_pin', (prev) => ({
      ...prev,
      activePins: prev.activePins.includes(id)
        ? prev.activePins.filter((p) => p !== id)
        : [...prev.activePins, id],
    }));
  };

    const renderConnection = (conn: Connection) => {
    const fromJoint = state.joints[conn.from];
    const toJoint = state.joints[conn.to];
    if (!fromJoint || !toJoint) return null;

    const start = getWorldPosition(conn.from, state.joints, INITIAL_JOINTS);
    const end = getWorldPosition(conn.to, state.joints, INITIAL_JOINTS);
    
    const ghostStart = getWorldPosition(conn.from, state.joints, INITIAL_JOINTS, 'preview');
    const ghostEnd = getWorldPosition(conn.to, state.joints, INITIAL_JOINTS, 'preview');

    // Use raw engine units, the <g> transform handles the rest
    const scale = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;

    const x1 = start.x * scale + centerX;
    const y1 = start.y * scale + centerY;
    const x2 = end.x * scale + centerX;
    const y2 = end.y * scale + centerY;
    
    const gx1 = ghostStart.x * scale + centerX;
    const gy1 = ghostStart.y * scale + centerY;
    const gx2 = ghostEnd.x * scale + centerX;
    const gy2 = ghostEnd.y * scale + centerY;

    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Styling based on connection type
    const useGridPalette = true;
    let strokeColor = "#2b0057";
    let strokeWidth = 4;
    let opacity = 0.9;
    let dashArray = "";
    const connKey = canonicalConnKey(conn.from, conn.to);
    const isSelectedConn = selectedConnectionKey === connKey;

    if (conn.type === 'soft_limit') {
      strokeWidth = 2;
      opacity = 0.6;
      dashArray = "2 2";
    } else if (conn.type === 'structural_link') {
      strokeWidth = 1;
      opacity = 0.3;
      strokeColor = useGridPalette ? "rgba(43, 0, 87, 0.55)" : "#666";
    }

    if (isSelectedConn) {
      strokeColor = '#ff8800';
      opacity = 1.0;
      strokeWidth = Math.max(strokeWidth, 4) + 2;
      dashArray = '';
    }

    const renderShape = () => {
      const shape = conn.shape || 'standard';
      
      switch (shape) {
        case 'muscle':
          return (
            <path
              d={`
                M 0,0
                Q ${len * 0.5}, -15 ${len}, 0
                Q ${len * 0.5}, 15 0, 0
                Z
              `}
              fill={strokeColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity }}
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
              fill={strokeColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity }}
            />
          );
        case 'cylinder':
           return (
            <rect
              x="0" y="-4" width={len} height="8"
              fill={strokeColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity }}
            />
          );
        case 'wire':
          return (
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={strokeColor}
              strokeWidth="2"
              style={{ opacity }}
            />
          );
        case 'wireframe':
          return (
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#00ff00"
              strokeWidth="0.5"
              style={{ opacity: 0.6 }}
            />
          );
        case 'nosferatu':
          const isNosferatuMode = state.viewMode === 'nosferatu';
          const nosferatuShape = conn.shape || 'standard';
          
          // Render Nosferatu-specific shapes
          if (isNosferatuMode) {
            switch (nosferatuShape) {
              case 'muscle':
                return (
                  <path
                    d={`
                      M 0,0
                      L ${len}, 0
                      L ${len}, 2
                      L 0, 2
                      Z
                    `}
                    fill="#ffffff"
                    transform={`translate(${x1}, ${y1}) rotate(${angle})`}
                    style={{ opacity: 0.9 }}
                  />
                );
              case 'tapered':
                return (
                  <path
                    d={`
                      M 0,-2
                      L ${len}, -0.5
                      L ${len}, 0.5
                      L 0, 2
                      Z
                    `}
                    fill="#ffffff"
                    transform={`translate(${x1}, ${y1}) rotate(${angle})`}
                    style={{ opacity: 0.9 }}
                  />
                );
              case 'cylinder':
                return (
                  <rect
                    x="0" y="-2" width={len} height="4"
                    fill="#ffffff"
                    transform={`translate(${x1}, ${y1}) rotate(${angle})`}
                    style={{ opacity: 0.9 }}
                  />
                );
              case 'wireframe':
                return (
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#ffffff"
                    strokeWidth="1"
                    style={{ opacity: 0.7 }}
                  />
                );
              default:
                return (
                  <line
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="#ffffff"
                    strokeWidth="2"
                    style={{ opacity: 0.9 }}
                  />
                );
            }
          }
          
          // Fallback to normal rendering
          return (
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              style={{ opacity }}
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
              fill={strokeColor}
              transform={`translate(${x1}, ${y1}) rotate(${angle})`}
              style={{ opacity }}
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
    const isLotte = state.viewMode === 'lotte';
    const isRoot = !joint.parent;
    const isSelected = selectedJointId === id;
    
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

    if (isNaN(x) || isNaN(y)) return null;

    const isNipple = id.includes('nipple');

    if (isNipple) return null;

    const fillColor = isLotte ? "#000000" : (isRoot ? "white" : (state.activePins.includes(id) ? "#ff8800" : (state.controlMode === 'Rubberband' && isLongPress ? "#ff4444" : "var(--accent)")));
    const strokeColor = isLotte ? "#000000" : (isSelected ? 'rgba(255, 255, 255, 0.9)' : (state.controlMode === 'Rubberband' && isLongPress ? 'rgba(255, 68, 68, 0.8)' : 'var(--bg)'));

    return (
      <circle
        key={`joint-${id}`}
        cx={x} cy={y} r={isRoot ? 6 : (draggingId === id ? 6 : 4)}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected ? 3 : 2}
        className="cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown(id)}
      />
    );
  };

  const renderXMarker = (id: string, color: string = "#ff8800") => {
    const pos = getWorldPosition(id, state.joints, INITIAL_JOINTS);
    const scale = 20;
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const x = pos.x * scale + centerX;
    const y = pos.y * scale + centerY;

    if (isNaN(x) || isNaN(y)) return null;

    const size = 8;
    return (
      <g key={`x-marker-${id}`}>
        <line x1={x - size} y1={y - size} x2={x + size} y2={y + size} stroke={color} strokeWidth="2" />
        <line x1={x + size} y1={y - size} x2={x - size} y2={y + size} stroke={color} strokeWidth="2" />
        <line x1={x - size} y1={y + size} x2={x + size} y2={y - size} stroke={color} strokeWidth="2" />
        <line x1={x - size} y1={y + size} x2={x + size} y2={y - size} stroke={color} strokeWidth="2" />
      </g>
    );
  };

    const jointMasksLayer = (() => {
      if (!canvasSize.width || !canvasSize.height) return null;
      const pxPerUnit = 20;
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
    const headPos = getWorldPosition('head', state.joints, INITIAL_JOINTS);
    const neckBasePos = getWorldPosition('neck_base', state.joints, INITIAL_JOINTS);
    const headLenUnits = Math.hypot(headPos.x - neckBasePos.x, headPos.y - neckBasePos.y);
    const headLenPx = Math.max(1, headLenUnits * 20);
      const neckSpanUnits = Math.hypot(headPos.x - neckBasePos.x, headPos.y - neckBasePos.y);
      const neckSpanPx = Math.max(1, neckSpanUnits * pxPerUnit);

      return Object.entries(state.scene.jointMasks).map(([jointId, mask]) => {
        if (!mask?.src || !mask.visible) return null;
        if (!(jointId in state.joints)) return null;

        const jointPos = getWorldPosition(jointId, state.joints, INITIAL_JOINTS);
        const relatedIds = (mask.relatedJoints || []).filter((id) => id !== jointId && id in state.joints);

        const relatedCentroid = (() => {
          if (!relatedIds.length) return null;
          let sx = 0;
          let sy = 0;
          for (const id of relatedIds) {
            const p = getWorldPosition(id, state.joints, INITIAL_JOINTS);
            sx += p.x;
            sy += p.y;
          }
          return { x: sx / relatedIds.length, y: sy / relatedIds.length };
        })();

        const anchorUnits =
          relatedCentroid ? { x: (jointPos.x + relatedCentroid.x) / 2, y: (jointPos.y + relatedCentroid.y) / 2 } : jointPos;

        const anchorXUnits = anchorUnits.x * pxPerUnit + centerX;
        const anchorYUnits = anchorUnits.y * pxPerUnit + centerY;
        if (isNaN(anchorXUnits) || isNaN(anchorYUnits)) return null;
        
        // Calculate orientation based on bone vector from parent
        const joint = state.joints[jointId];
        const parentId = joint.parent;
        let pPos = { x: jointPos.x, y: jointPos.y - 1 }; // Default upward (head direction)
        if (relatedCentroid) {
          pPos = relatedCentroid;
        } else if (parentId && state.joints[parentId]) {
          pPos = getWorldPosition(parentId, state.joints, INITIAL_JOINTS);
        }
        const dx = jointPos.x - pPos.x;
        const dy = jointPos.y - pPos.y;
        const boneLenPx = Math.max(1, Math.hypot(dx, dy) * pxPerUnit);

        const baseAngle = (Math.atan2(dy, dx) * (180 / Math.PI)) + 90;
        const mode = mask.mode || 'cutout';
        const finalAngle = (mode === 'roto' ? 0 : baseAngle) + (mask.rotation || 0);

        // "Thickness" stays head-relative; "length" (rubberhose) follows the bone.
        const thicknessPx = headLenPx * Math.max(0.01, mask.scale);
        let width = thicknessPx;
        let height = thicknessPx;
        let anchorWorldX = anchorXUnits;
        let anchorWorldY = anchorYUnits;

        if (mode === 'rubberhose') {
          const midX = (jointPos.x + pPos.x) / 2;
          const midY = (jointPos.y + pPos.y) / 2;
          anchorWorldX = midX * pxPerUnit + centerX;
          anchorWorldY = midY * pxPerUnit + centerY;
          height = Math.max(1, boneLenPx * Math.max(0.05, mask.lengthScale || 1));
          if (mask.volumePreserve) {
            width = clamp((thicknessPx * thicknessPx) / height, thicknessPx * 0.15, thicknessPx * 4);
          } else {
            width = thicknessPx;
          }
        }

        return (
          <image
            key={`joint-mask:${jointId}`}
            href={mask.src}
            x={anchorWorldX + (mask.offsetX / state.viewScale) - (mask.anchorX * width)}
            y={anchorWorldY + (mask.offsetY / state.viewScale) - (mask.anchorY * height)}
            width={width}
            height={height}
            opacity={mask.opacity}
            onMouseDown={handleMaskMouseDown(jointId)}
            style={{
              transformOrigin: `${anchorWorldX + (mask.offsetX / state.viewScale)}px ${anchorWorldY + (mask.offsetY / state.viewScale)}px`,
              transform: `rotate(${finalAngle}deg)`,
              pointerEvents: maskEditArmed ? 'auto' : 'none',
              cursor: maskEditArmed ? 'grab' : 'default',
            }}
          />
        );
      });
    })();

    const headMaskLayer = (() => {
      if (!canvasSize.width || !canvasSize.height) return null;
      if (!state.scene.headMask?.src || !state.scene.headMask.visible) return null;

      const pxPerUnit = 20;
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
      
      // Get head position and orientation
      const headPos = getWorldPosition('head', state.joints, INITIAL_JOINTS);
      const neckBasePos = getWorldPosition('neck_base', state.joints, INITIAL_JOINTS);
      const headX = headPos.x * pxPerUnit + centerX;
      const headY = headPos.y * pxPerUnit + centerY;
      
      if (isNaN(headX) || isNaN(headY)) return null;

      // Calculate head size based on head length
      const headLenUnits = Math.hypot(headPos.x - neckBasePos.x, headPos.y - neckBasePos.y);
      const headLenPx = Math.max(1, headLenUnits * pxPerUnit);
      const size = headLenPx * Math.max(0.01, state.scene.headMask.scale);

      // Calculate head rotation based on neck-to-head vector
      const dx = headPos.x - neckBasePos.x;
      const dy = headPos.y - neckBasePos.y;
      const baseAngle = (Math.atan2(dy, dx) * (180 / Math.PI)) + 90;
      const mode = state.scene.headMask.mode || 'cutout';
      const finalAngle = (mode === 'roto' ? 0 : baseAngle) + (state.scene.headMask.rotation || 0);

      const thicknessPx = headLenPx * Math.max(0.01, state.scene.headMask.scale);
      let width = thicknessPx;
      let height = thicknessPx;
      let anchorWorldX = headX;
      let anchorWorldY = headY;
      if (mode === 'rubberhose') {
        const boneLenPx = Math.max(1, Math.hypot(dx, dy) * pxPerUnit);
        anchorWorldX = ((headPos.x + neckBasePos.x) / 2) * pxPerUnit + centerX;
        anchorWorldY = ((headPos.y + neckBasePos.y) / 2) * pxPerUnit + centerY;
        height = Math.max(1, boneLenPx * Math.max(0.05, state.scene.headMask.lengthScale || 1));
        if (state.scene.headMask.volumePreserve) {
          width = clamp((thicknessPx * thicknessPx) / height, thicknessPx * 0.15, thicknessPx * 4);
        }
      }

      return (
        <image
          key="head-mask"
          href={state.scene.headMask.src}
          x={anchorWorldX + (state.scene.headMask.offsetX / state.viewScale) - (state.scene.headMask.anchorX * width)}
          y={anchorWorldY + (state.scene.headMask.offsetY / state.viewScale) - (state.scene.headMask.anchorY * height)}
          width={width}
          height={height}
          opacity={state.scene.headMask.opacity}
          style={{
            transformOrigin: `${anchorWorldX + (state.scene.headMask.offsetX / state.viewScale)}px ${anchorWorldY + (state.scene.headMask.offsetY / state.viewScale)}px`,
            transform: `rotate(${finalAngle}deg)`,
            pointerEvents: 'none',
          }}
        />
      );
    })();

  const jointsLayer = state.showJoints ? (() => {
  const regularJoints = Object.keys(state.joints)
    .filter(id => id !== 'sacrum' && !id.includes('rib'))
    .map(renderJoint);
  
  const xMarkers = state.activePins.map(id => renderXMarker(id, "#ff8800"));
  
  return [...regularJoints, ...xMarkers];
})() : null;

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
      >
        <div className="w-[360px] h-full flex flex-col">
          <div className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg">
                <Activity size={20} className="text-black" />
              </div>
              <div>
                <h1 className={`text-lg font-bold tracking-tight ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>BITRUVIUS</h1>
                <p className="text-[10px] text-[#666] uppercase tracking-[0.2em] font-mono">
                  Core Engine v0.2 · build {BUILD_ID}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-6">
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

            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Anchor size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Widgets</h2>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
	                  [
	                    { kind: 'joint_masks' as const, label: 'Joint Masks' },
                      { kind: 'bone_inspector' as const, label: 'Bone Inspector' },
	                    { kind: 'console' as const, label: 'Console' },
	                    { kind: 'camera' as const, label: 'Camera' },
	                  { kind: 'procgen' as const, label: 'Procedural' },
	                    { kind: 'atomic_units' as const, label: 'Atomic Units' },
	                  ] as const
	                ).map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_WIDGET_MIME, kind);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => {
                      const rect = canvasRef.current?.getBoundingClientRect();
                      const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
                      const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
                      spawnFloatingWidget(kind, cx, cy);
                    }}
                    className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333]"
                    title="Drag onto canvas or click to spawn"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[#444]">
                Drag buttons onto the canvas to spawn floating tools.
              </p>
            </section>

	            <section>
	              <div className="flex items-center gap-2 mb-4 text-[#666]">
	                <Settings2 size={14} />
	                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Rigidity & Control</h2>
                <HelpTip
                  text={
                    <>
                      <div className="font-bold mb-1">Rigidity presets</div>
                      <div className="text-[#ddd]">
                        Cardboard is stiff and crisp. Realistic is a balanced hybrid. Rubberhose makes wires and elastic
                        links looser.
                      </div>
                      <div className="mt-2 text-[#ddd]">
                        <span className="font-bold">Elasticity</span> lets connections marked as <span className="font-mono">stretch</span> keep their stretched length (see the Bone Dynamics widget).
                      </div>
                      <div className="mt-2 text-[#ddd]">
                        <span className="font-bold">Auto-Bend</span> adds a soft rest-angle bias; <span className="font-bold">Hard Stop</span> clamps hinge limits.
                      </div>
                    </>
                  }
                />
	              </div>
	              <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
	                <div className="flex items-center justify-between mb-2">
	                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Physics Dial</div>
	                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
	                    {getPhysicsBlendMode(state).toUpperCase()} • {Math.round((state.physicsRigidity ?? 0) * 100)}%
	                  </div>
	                </div>
	                <input
	                  type="range"
	                  min="0"
	                  max="1"
	                  step="0.01"
	                  value={state.physicsRigidity ?? 0}
	                  onChange={(e) => {
	                    const v = parseFloat(e.target.value);
	                    setStateWithHistory('physics_dial', (prev) => applyFluidHandshake(prev, applyPhysicsMode(prev, v)));
	                  }}
	                  className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
	                />
	                <div className="mt-3 grid grid-cols-2 gap-2">
	                  <button
	                    type="button"
	                    onClick={() =>
                        setStateWithHistory('physics_dial_rigid', (prev) => applyFluidHandshake(prev, applyPhysicsMode(prev, 0)))
                      }
	                    className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333]"
	                  >
	                    Snap Rigid
	                  </button>
	                  <button
	                    type="button"
	                    onClick={() => setStateWithHistory('rigid_start_point', (prev) => createRigidStartPoint(prev))}
	                    className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333]"
	                  >
	                    Rigid Start
	                  </button>
	                </div>
	              </div>
	              <div className="mb-4">
                <select
                  value={state.rigidity}
	                  onChange={(e) =>
                      setStateWithHistory('rigidity', (prev) =>
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
                {(['Cardboard', 'Rubberband', 'IK', 'JointDrag'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() =>
                      setStateWithHistory('set_control_mode', (prev) =>
                        prev.controlMode === mode ? prev : applyFluidHandshake(prev, { ...prev, controlMode: mode }),
                      )
                    }
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${state.controlMode === mode ? 'bg-white text-black' : 'text-[#666] hover:text-white'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <Toggle 
                  label="Mirroring" 
                  active={state.mirroring} 
                  onClick={() =>
                    setStateWithHistory('toggle_mirroring', (prev) => ({
                      ...prev,
                      mirroring: !prev.mirroring,
                    }))
                  }
                />
                <Toggle 
                  label="Auto-Bend (B)" 
                  active={state.bendEnabled} 
                  onClick={() =>
                    setStateWithHistory('toggle_bend', (prev) =>
                      applyFluidHandshake(prev, { ...prev, bendEnabled: !prev.bendEnabled }),
                    )
                  }
                />
                        <Toggle 
                          label="Elasticity (S)" 
                          active={state.stretchEnabled} 
                          onClick={() =>
                            setStateWithHistory('toggle_stretch', (prev) =>
                              applyFluidHandshake(prev, { ...prev, stretchEnabled: !prev.stretchEnabled }),
                            )
                          }
                        />
                  <Toggle
                    label="Lead (L)"
                    active={state.leadEnabled}
                    onClick={() =>
                      setStateWithHistory('toggle_lead', (prev) => ({
                        ...prev,
                        leadEnabled: !prev.leadEnabled,
                      }))
                    }
                  />
                        <Toggle 
                          label="Hard Stop" 
                          active={state.hardStop} 
                          onClick={() =>
                    setStateWithHistory('toggle_hard_stop', (prev) =>
                      applyFluidHandshake(prev, { ...prev, hardStop: !prev.hardStop }),
                    )
                  }
                />
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Activity size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Live Feedback</h2>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-[#444]">
                    <span>Snappiness</span>
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
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4 text-[#666]">
                <Maximize2 size={14} />
                <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>View Modes</h2>
              </div>
                      <div className="grid grid-cols-2 gap-2">
                        {viewModes.map(mode => (
                          <button
                            key={mode.id}
                    onClick={() =>
                      setStateWithHistory('set_view_mode', (prev) =>
                        prev.viewMode === mode.id ? prev : { ...prev, viewMode: mode.id },
                      )
                    }
                    className={`p-2 rounded-lg border text-[10px] font-bold uppercase transition-all ${state.viewMode === mode.id ? 'bg-white text-black border-white' : 'bg-transparent text-[#666] border-[#222] hover:border-[#444]'}`}
                  >
                    {mode.label}
                  </button>
                        ))}
                      </div>
                    </section>

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

                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <Download size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Transfer</h2>
                      </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={downloadStateJson}
                  className="py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase transition-all"
                >
                  Save JSON
                </button>
                <button
                  type="button"
                  onClick={() => importStateInputRef.current?.click()}
                  className="py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase transition-all"
                >
                  Load JSON
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

                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <RotateCcw size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Capture History</h2>
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
                  Capture Pose
                </button>

                <div className="p-2 bg-white/5 rounded-lg space-y-2">
                  <label className="flex items-center justify-between gap-3 text-[10px] select-none">
                    <span className="font-bold uppercase tracking-widest text-[#666]">Auto Pose Capture</span>
                    <input
                      type="checkbox"
                      checked={autoPoseCaptureEnabled}
                      onChange={(e) => setAutoPoseCaptureEnabled(e.target.checked)}
                      className="rounded accent-white"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">Record FPS</div>
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
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">Moved Thresh</div>
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
                        Simplify
                      </label>
                    </div>
                  </div>

                  {autoPoseCaptureSimplifyEnabled && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666] mb-1">Simplify Eps</div>
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
                        title={`Click to apply • Double-click to send to timeline • Right-click to ${isSelected ? 'deselect' : 'select'} for interpolation`}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && (
                            <div className="w-2 h-2 bg-[#3366cc] rounded-full" />
                          )}
                          <span>Pose Snapshot {snapshotIndex}</span>
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
                      ? 'Right-click poses to select for interpolation'
                      : `Selected ${selectedPoseIndices.length} pose${selectedPoseIndices.length === 1 ? '' : 's'} • Right-click to deselect`
                    }
                  </div>
                )}
              </div>
            </section>

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
                      setStateWithHistory('toggle_show_joints', (prev) => ({
                        ...prev,
                        showJoints: !prev.showJoints,
                      }))
                    }
                  />
                  <Toggle
                    label="Joints Above Masks"
                    active={state.jointsOverMasks}
                    onClick={() =>
                      setStateWithHistory('toggle_joints_over_masks', (prev) => ({
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
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const isVideo = file.type.startsWith('video/');
                      const url = URL.createObjectURL(file);
                      setStateWithHistory('upload_background', (prev) => ({
                        ...prev,
                        scene: {
                          ...prev.scene,
                          background: {
                            ...prev.scene.background,
                            src: url,
                            visible: true,
                            mediaType: isVideo ? 'video' : 'image',
                            videoStart: 0,
                            videoRate: 1,
                          },
                        }
                      }));
                      
                      // Cache images for persistence (videos are typically too large for localStorage).
                      if (!isVideo) await cacheImageFromUrl(url, 'background');
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

                            {state.scene.background.mediaType === 'video' && (
                              <div className="space-y-2 p-2 rounded-md bg-white/5 border border-white/10">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-[#777]">Video</div>
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
                                <div className="text-[9px] text-[#666]">
                                  PNG/SVG exports don&apos;t embed videos yet (use WebM export).
                                </div>
                              </div>
                            )}
                            
                            <button
                              onClick={() =>
                                setStateWithHistory('clear_background', (prev) => ({
                                  ...prev,
                          scene: {
                            ...prev.scene,
                            background: { ...prev.scene.background, src: null, visible: false }
                          }
                        }))
                      }
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
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const isVideo = file.type.startsWith('video/');
                              const url = URL.createObjectURL(file);
                              setStateWithHistory('upload_foreground', (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  foreground: {
                                    ...prev.scene.foreground,
                                    src: url,
                                    visible: true,
                                    mediaType: isVideo ? 'video' : 'image',
                                    videoStart: 0,
                                    videoRate: 1,
                                  },
                                }
                              }));
                              
                              // Cache images for persistence (videos are typically too large for localStorage).
                              if (!isVideo) await cacheImageFromUrl(url, 'foreground');
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

                            {state.scene.foreground.mediaType === 'video' && (
                              <div className="space-y-2 p-2 rounded-md bg-white/5 border border-white/10">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-[#777]">Video</div>
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
                                <div className="text-[9px] text-[#666]">
                                  PNG/SVG exports don&apos;t embed videos yet (use WebM export).
                                </div>
                              </div>
                            )}
                            
                            <button
                              onClick={() =>
                                setStateWithHistory('clear_foreground', (prev) => ({
                                  ...prev,
                          scene: {
                            ...prev.scene,
                            foreground: { ...prev.scene.foreground, src: null, visible: false }
                          }
                        }))
                      }
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

                      {/* Head Mask */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Head Mask</span>
                    <HelpTip
                      text={
                        <>
                          <div className="font-bold mb-1">Head mask</div>
                          <div className="text-[#ddd]">
                            Works like a joint mask, but anchored to the head. Use <span className="font-bold">Roto</span> when you want manual rotation (rotoscope-style tracking).
                          </div>
                        </>
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => maskUploadInputRef.current?.click()}
                    className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                  >
                    Upload
                  </button>
                </div>

                <input
                  ref={maskUploadInputRef}
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

                {state.scene.headMask.src ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-[10px]">
                        <input
                          type="checkbox"
                          checked={state.scene.headMask.visible}
                          onChange={(e) =>
                            setStateWithHistory('head_mask_visible', (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                headMask: { ...prev.scene.headMask, visible: e.target.checked },
                              },
                            }))
                          }
                          className="rounded"
                        />
                        Visible
                      </label>
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
                      >
                        Clear
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span>Opacity</span>
                        <span>{(state.scene.headMask.opacity * 100).toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.scene.headMask.opacity}
                        onChange={(e) =>
                          setStateWithHistory('head_mask_opacity', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              headMask: { ...prev.scene.headMask, opacity: parseFloat(e.target.value) },
                            },
                          }))
                        }
                        className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span>Scale</span>
                        <span>{state.scene.headMask.scale.toFixed(2)}×</span>
                      </div>
                      <input
                        type="range"
                        min="0.01"
                        max="20"
                        step="0.01"
                        value={state.scene.headMask.scale}
                        onChange={(e) =>
                          setStateWithHistory('head_mask_scale', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              headMask: { ...prev.scene.headMask, scale: parseFloat(e.target.value) },
                            },
                          }))
                        }
                        className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                      />
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
                            scene: {
                              ...prev.scene,
                              headMask: { ...prev.scene.headMask, mode: e.target.value as any },
                            },
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
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span>Length Scale</span>
                            <span className="text-[#666]">{(state.scene.headMask.lengthScale || 1).toFixed(2)}×</span>
                          </div>
                          <input
                            type="range"
                            min="0.05"
                            max="3"
                            step="0.01"
                            value={state.scene.headMask.lengthScale || 1}
                            onChange={(e) =>
                              setStateWithHistory('head_mask_length_scale', (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  headMask: { ...prev.scene.headMask, lengthScale: parseFloat(e.target.value) },
                                },
                              }))
                            }
                            className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
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
                                scene: {
                                  ...prev.scene,
                                  headMask: { ...prev.scene.headMask, volumePreserve: e.target.checked },
                                },
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
                                <span>{state.scene.headMask.rotation.toFixed(0)}°</span>
                              </div>
                              <RotationWheelControl
                                value={state.scene.headMask.rotation}
                                min={-360}
                                max={360}
                                step={1}
                                onChange={(val) =>
                                  setStateWithHistory('head_mask_rotation', (prev) => ({
                                    ...prev,
                                    scene: {
                                      ...prev.scene,
                                      headMask: { ...prev.scene.headMask, rotation: val },
                                    },
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
                          value={state.scene.headMask.offsetX}
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
                          value={state.scene.headMask.offsetY}
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

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Anchor X (Pin)</span>
                        <span>{Math.round(state.scene.headMask.anchorX * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={state.scene.headMask.anchorX}
                        onChange={(e) =>
                          setStateWithHistory('head_mask_anchor_x', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              headMask: { ...prev.scene.headMask, anchorX: parseFloat(e.target.value) },
                            },
                          }))
                        }
                        className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[9px] text-[#666]">
                        <span>Anchor Y (Pin)</span>
                        <span>{Math.round(state.scene.headMask.anchorY * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={state.scene.headMask.anchorY}
                        onChange={(e) =>
                          setStateWithHistory('head_mask_anchor_y', (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              headMask: { ...prev.scene.headMask, anchorY: parseFloat(e.target.value) },
                            },
                          }))
                        }
                        className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-[#444]">No head mask uploaded.</div>
                )}
              </div>

              {/* Joint Masks */}
              <div className="mb-4">
                {(() => {
                  const mask = state.scene.jointMasks[maskJointId];
                  if (!mask) {
                    return (
                      <div className="text-[10px] text-[#444]">
                        Joint mask state missing (try Reset Engine).
                      </div>
                    );
                  }

                  const canPlace = Boolean(mask.src && mask.visible);

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Joint Masks</span>
                          <HelpTip
                            text={
                              <>
                                <div className="font-bold mb-1">Mask modes</div>
                                <div className="text-[#ddd]">
                                  <span className="font-bold">Cutout</span>: rigid sticker that rotates with the bone.
                                </div>
                                <div className="text-[#ddd]">
                                  <span className="font-bold">Rubberhose</span>: stretches along the parent bone (use Length Scale / Volume Preserve).
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
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
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
                                    relatedJoints: [],
                                  };
                                }
                                return {
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    jointMasks: newMasks,
                                  },
                                };
                              });
                            }}
                            className="px-2 py-1 bg-[#331111] hover:bg-[#551111] rounded text-[10px] transition-colors"
                            title="Clear all masks"
                          >
                            Clear All
                          </button>
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
                            onClick={() => jointMaskUploadInputRef.current?.click()}
                            className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                          >
                            Upload
                          </button>
                        </div>
                      </div>

                      <input
                        ref={jointMaskUploadInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          await uploadJointMaskFile(file, maskJointIdRef.current);
                        }}
                      />

                      <div>
                        <label className="text-[10px] text-[#666]">Joint</label>
                        <select
                          value={maskJointId}
                          onChange={(e) => setMaskJointId(e.target.value)}
                          className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                        >
                          {Object.keys(state.joints).map((id) => (
                            <option key={id} value={id}>
                              {state.joints[id].label || id}
                            </option>
                          ))}
                        </select>
                      </div>

                      {mask.src && (
                        <div className="space-y-4 pt-2">
                          <div className="space-y-3">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-[#666]">Opacity</span>
                              <span>{(mask.opacity * 100).toFixed(0)}%</span>
                            </div>
                            <Slider
                              min={0}
                              max={1}
                              step={0.01}
                              value={[mask.opacity]}
                              onValueChange={([val]) =>
                                setStateWithHistory(`mask_opacity:${maskJointId}`, (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    jointMasks: {
                                      ...prev.scene.jointMasks,
                                      [maskJointId]: { ...mask, opacity: val }
                                    }
                                  }
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-3">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-[#666]">Scale</span>
                              <span>{mask.scale.toFixed(2)}x</span>
                            </div>
                            <Slider
                              min={0.01}
                              max={5}
                              step={0.01}
                              value={[mask.scale]}
                              onValueChange={([val]) =>
                                setStateWithHistory(`mask_scale:${maskJointId}`, (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    jointMasks: {
                                      ...prev.scene.jointMasks,
                                      [maskJointId]: { ...mask, scale: val }
                                    }
                                  }
                                }))
                              }
                            />
                          </div>

                                  {/* Rotation wheel is available in the detailed controls below. */}
                                </div>
                              )}

                      <div className="flex gap-2">
                        <select
                          value=""
                          onChange={handleCopyMaskChange}
                          className="flex-1 px-2 py-1 bg-[#222] rounded text-[10px]"
                          disabled={!mask.src}
                        >
                          <option value="" disabled>
                            Copy graphic to: {mask.src ? 'select joint' : 'upload first'}
                          </option>
                          {Object.keys(state.joints)
                            .filter(id => id !== maskJointId)
                            .map((id) => (
                              <option key={id} value={id}>
                                {state.joints[id].label || id}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Anchor X (Pin)</span>
                          <span>{Math.round(mask.anchorX * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={mask.anchorX}
                          onChange={(e) =>
                            setStateWithHistory(`mask_anchor_x:${maskJointId}`, (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                jointMasks: {
                                  ...prev.scene.jointMasks,
                                  [maskJointId]: { ...prev.scene.jointMasks[maskJointId], anchorX: parseFloat(e.target.value) },
                                },
                              },
                            }))
                          }
                          className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-[#666]">
                          <span>Anchor Y (Pin)</span>
                          <span>{Math.round(mask.anchorY * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={mask.anchorY}
                          onChange={(e) =>
                            setStateWithHistory(`mask_anchor_y:${maskJointId}`, (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                jointMasks: {
                                  ...prev.scene.jointMasks,
                                  [maskJointId]: { ...prev.scene.jointMasks[maskJointId], anchorY: parseFloat(e.target.value) },
                                },
                              },
                            }))
                          }
                          className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-white"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-[10px]">
                          <input
                            type="checkbox"
                            checked={mask.visible}
                            onChange={(e) =>
                              setStateWithHistory(`mask_visible:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...prev.scene.jointMasks[maskJointId], visible: e.target.checked },
                                  },
                                },
                              }))
                            }
                            className="rounded"
                          />
                          Visible
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setStateWithHistory(`mask_clear:${maskJointId}`, (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                jointMasks: {
                                  ...prev.scene.jointMasks,
                                  [maskJointId]: {
                                    ...prev.scene.jointMasks[maskJointId],
                                    src: null,
                                    visible: false,
                                    opacity: 1,
                                    scale: 1,
                                    offsetX: 0,
                                    offsetY: 0,
                                    relatedJoints: [],
                                  },
                                },
                              },
                            }))
                          }
                          className="px-2 py-1 bg-[#333] hover:bg-[#444] rounded text-[10px] transition-colors"
                        >
                          Clear
                        </button>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span>Opacity</span>
                          <span>{(mask.opacity * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={mask.opacity}
                          onChange={(e) =>
                            setStateWithHistory(`mask_opacity:${maskJointId}`, (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                jointMasks: {
                                  ...prev.scene.jointMasks,
                                  [maskJointId]: { ...prev.scene.jointMasks[maskJointId], opacity: parseFloat(e.target.value) },
                                },
                              },
                            }))
                          }
                          className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span>Scale</span>
                          <span>{mask.scale.toFixed(2)}×</span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="20"
                          step="0.01"
                          value={mask.scale}
                          onChange={(e) =>
                            setStateWithHistory(`mask_scale:${maskJointId}`, (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                jointMasks: {
                                  ...prev.scene.jointMasks,
                                  [maskJointId]: { ...prev.scene.jointMasks[maskJointId], scale: parseFloat(e.target.value) },
                                },
                              },
                            }))
                          }
                          className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px]">
                          <span>Mode</span>
                          <span className="text-[#666]">{(mask.mode || 'cutout').toUpperCase()}</span>
                        </div>
                        <select
                          value={mask.mode || 'cutout'}
                          onChange={(e) =>
                            setStateWithHistory(`mask_mode:${maskJointId}`, (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                jointMasks: {
                                  ...prev.scene.jointMasks,
                                  [maskJointId]: { ...prev.scene.jointMasks[maskJointId], mode: e.target.value as any },
                                },
                              },
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
                        <div className="flex items-center justify-between text-[10px]">
                          <span>Relationship Joints</span>
                          <button
                            type="button"
                            onClick={() =>
                              setStateWithHistory(`mask_related_joints_clear:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...prev.scene.jointMasks[maskJointId], relatedJoints: [] },
                                  },
                                },
                              }))
                            }
                            className="px-2 py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                            title="Clear relationship joints (use parent bone instead)"
                          >
                            Use Parent
                          </button>
                        </div>
                        <select
                          multiple
                          value={(mask.relatedJoints || []).filter((id) => id !== maskJointId)}
                          onChange={(e) => {
                            const next = Array.from(e.target.selectedOptions)
                              .map((o) => o.value)
                              .filter((id) => id && id !== maskJointId);

                            setStateWithHistory(`mask_related_joints:${maskJointId}`, (prev) => ({
                              ...prev,
                              scene: {
                                ...prev.scene,
                                jointMasks: {
                                  ...prev.scene.jointMasks,
                                  [maskJointId]: { ...prev.scene.jointMasks[maskJointId], relatedJoints: next },
                                },
                              },
                            }));
                          }}
                          className="w-full px-2 py-1 bg-[#222] rounded text-[10px] h-24"
                        >
                          {Object.keys(state.joints)
                            .filter((id) => id !== maskJointId)
                            .map((id) => (
                              <option key={id} value={id}>
                                {state.joints[id].label || id}
                              </option>
                            ))}
                        </select>
                        <div className="text-[9px] text-[#666]">
                          Select one or more joints to drive placement/orientation. Empty uses the joint&apos;s parent bone.
                        </div>
                      </div>

                      {(mask.mode || 'cutout') === 'rubberhose' && (
                        <>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px]">
                              <span>Length Scale</span>
                              <span className="text-[#666]">{(mask.lengthScale || 1).toFixed(2)}×</span>
                            </div>
                            <input
                              type="range"
                              min="0.05"
                              max="3"
                              step="0.01"
                              value={mask.lengthScale || 1}
                              onChange={(e) =>
                                setStateWithHistory(`mask_length_scale:${maskJointId}`, (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    jointMasks: {
                                      ...prev.scene.jointMasks,
                                      [maskJointId]: {
                                        ...prev.scene.jointMasks[maskJointId],
                                        lengthScale: parseFloat(e.target.value),
                                      },
                                    },
                                  },
                                }))
                              }
                              className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                            />
                          </div>

                          <label className="flex items-center justify-between gap-2 text-[10px]">
                            <span className="text-[#666]">Volume Preserve</span>
                            <input
                              type="checkbox"
                              checked={Boolean(mask.volumePreserve)}
                              onChange={(e) =>
                                setStateWithHistory(`mask_volume_preserve:${maskJointId}`, (prev) => ({
                                  ...prev,
                                  scene: {
                                    ...prev.scene,
                                    jointMasks: {
                                      ...prev.scene.jointMasks,
                                      [maskJointId]: {
                                        ...prev.scene.jointMasks[maskJointId],
                                        volumePreserve: e.target.checked,
                                      },
                                    },
                                  },
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
                                  <span>{mask.rotation.toFixed(0)}°</span>
                                </div>
                                <RotationWheelControl
                                  value={mask.rotation}
                                  min={-360}
                                  max={360}
                                  step={1}
                                  onChange={(val) =>
                                    setStateWithHistory(`mask_rotation:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...prev.scene.jointMasks[maskJointId], rotation: val },
                                        },
                                      },
                                    }))
                                  }
                                  isDisabled={!mask.src}
                                />
                              </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[#666]">Offset X</label>
                          <input
                            type="number"
                            value={mask.offsetX}
                            onChange={(e) =>
                              setStateWithHistory(`mask_offset_x:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...prev.scene.jointMasks[maskJointId], offsetX: parseFloat(e.target.value) || 0 },
                                  },
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
                            value={mask.offsetY}
                            onChange={(e) =>
                              setStateWithHistory(`mask_offset_y:${maskJointId}`, (prev) => ({
                                ...prev,
                                scene: {
                                  ...prev.scene,
                                  jointMasks: {
                                    ...prev.scene.jointMasks,
                                    [maskJointId]: { ...prev.scene.jointMasks[maskJointId], offsetY: parseFloat(e.target.value) || 0 },
                                  },
                                },
                              }))
                            }
                            className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                          />
                        </div>
                      </div>

                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span>Rotation</span>
                                  <span>{mask.rotation.toFixed(0)}°</span>
                                </div>
                                <RotationWheelControl
                                  value={mask.rotation}
                                  min={-180}
                                  max={180}
                                  step={1}
                                  onChange={(val) =>
                                    setStateWithHistory(`mask_rotation:${maskJointId}`, (prev) => ({
                                      ...prev,
                                      scene: {
                                        ...prev.scene,
                                        jointMasks: {
                                          ...prev.scene.jointMasks,
                                          [maskJointId]: { ...prev.scene.jointMasks[maskJointId], rotation: val },
                                        },
                                      },
                                    }))
                                  }
                                  isDisabled={!mask.src}
                                />
                              </div>

                      <button
                        type="button"
                        onClick={() =>
                          setStateWithHistory(`mask_center:${maskJointId}`, (prev) => ({
                            ...prev,
                            scene: {
                              ...prev.scene,
                              jointMasks: {
                                ...prev.scene.jointMasks,
                                [maskJointId]: { ...prev.scene.jointMasks[maskJointId], offsetX: 0, offsetY: 0 },
                              },
                            },
                          }))
                        }
                        className="w-full py-1 bg-[#222] hover:bg-[#333] rounded text-[10px] transition-colors"
                      >
                        Center on joint
                      </button>
                    </div>
                  );
	          })()}
              </div>
            </section>

                    <section>
                      <div className="flex items-center gap-2 mb-4 text-[#666]">
                        <Layers size={14} />
                        <h2 className={`text-[10px] font-bold uppercase tracking-widest ${titleFontClassMap[titleFont as keyof typeof titleFontClassMap]}`}>Joint Hierarchy</h2>
                      </div>
              {(() => {
                const selected = selectedJointId ? state.joints[selectedJointId] : null;
                if (!selected || !selected.parent) {
                  return (
                    <div className="mb-3 text-[10px] text-[#444]">
                      Select a joint to edit rotation.
                    </div>
                  );
                }

                const angleDeg = toAngleDeg(selected.previewOffset);
                const actionId = `joint_angle:${selected.id}`;

                return (
                  <div className="mb-3 p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">
                        {selected.label} Angle
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
                      onChange={(e) => setJointAngleDeg(selected.id, parseFloat(e.target.value))}
                      className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                    />
                  </div>
                );
              })()}
                      <div className="max-h-[300px] overflow-y-auto pr-2 space-y-1">
                        {(Object.values(state.joints) as Joint[]).map((joint: Joint) => (
                          <div 
                            key={joint.id}
                      onClick={() => setSelectedJointId(joint.id)}
                            className={`group flex items-center justify-between p-2 rounded-md transition-colors cursor-pointer ${
                        draggingId === joint.id
                          ? 'bg-white/10'
                          : selectedJointId === joint.id
                            ? 'bg-white/5'
                            : 'hover:bg-white/5'
                      }`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${joint.isEndEffector ? 'bg-white' : 'bg-[#444]'}`} />
                              <span className="text-xs font-medium">{joint.label}</span>
                            </div>
                            <button 
                              onClick={(e) => {
                          e.stopPropagation();
                          togglePin(joint.id);
                        }}
                              className={`p-1 rounded transition-colors ${state.activePins.includes(joint.id) ? 'text-[#ff8800]' : 'text-[#444] group-hover:text-[#888]'}`}
                            >
                              <Anchor size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                            </section>
            </div>
          </div>

          <div className="p-6 pt-0">
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-[#666] mb-3">Pin Controls</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-[#888]">Active Pins ({state.activePins.length})</span>
                  <button
                    onClick={() => {
                      setStateWithHistory('clear_all_pins', (prev) => ({
                        ...prev,
                        activePins: [],
                      }));
                      pinTargetsRef.current = {};
                    }}
                    className="px-3 py-2 bg-[#333] hover:bg-[#444] rounded-lg text-[10px] font-bold transition-all"
                    disabled={state.activePins.length === 0}
                  >
                    Clear All Pins
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => togglePin('l_ankle')}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                      state.activePins.includes('l_ankle') 
                        ? 'bg-[#ff8800] text-white' 
                        : 'bg-[#333] hover:bg-[#444] text-[#888]'
                    }`}
                  >
                    Pin L Ankle
                  </button>
                  <button
                    onClick={() => togglePin('r_ankle')}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                      state.activePins.includes('r_ankle') 
                        ? 'bg-[#ff8800] text-white' 
                        : 'bg-[#333] hover:bg-[#444] text-[#888]'
                    }`}
                  >
                    Pin R Ankle
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => togglePin('l_wrist')}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                      state.activePins.includes('l_wrist') 
                        ? 'bg-[#ff8800] text-white' 
                        : 'bg-[#333] hover:bg-[#444] text-[#888]'
                    }`}
                  >
                    Pin L Wrist
                  </button>
                  <button
                    onClick={() => togglePin('r_wrist')}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all ${
                      state.activePins.includes('r_wrist') 
                        ? 'bg-[#ff8800] text-white' 
                        : 'bg-[#333] hover:bg-[#444] text-[#888]'
                    }`}
                  >
                    Pin R Wrist
                  </button>
                </div>
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
      <main className="flex-1 relative flex flex-col overflow-hidden">
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
          className="flex-1 cursor-crosshair relative"
          onMouseDown={() => setSelectedJointId(null)}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DND_WIDGET_MIME)) e.preventDefault();
          }}
	          onDrop={(e) => {
	            const payload = e.dataTransfer.getData(DND_WIDGET_MIME) as WidgetKind;
	            if (
	              payload !== 'joint_masks' &&
                payload !== 'bone_inspector' &&
	              payload !== 'console' &&
	              payload !== 'camera' &&
	              payload !== 'procgen' &&
	              payload !== 'atomic_units'
	            ) {
	              return;
	            }
	            e.preventDefault();
	            spawnFloatingWidget(payload, e.clientX, e.clientY);
	          }}
        >
          <svg
            ref={svgRef}
            width={canvasSize.width}
            height={canvasSize.height}
            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
            onMouseMove={onCanvasMouseMove}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault(); // Prevent auto-scroll on middle click
              setSelectedJointId(null);
            }}
            className={`w-full h-full skeleton-canvas ${state.viewMode === 'noir' ? 'grayscale contrast-125' : ''}`}
          >
            <g transform={`translate(${state.viewOffset.x}, ${state.viewOffset.y}) scale(${state.viewScale})`}>
                      {/* Reference Layers */}
                      {state.scene.background.src && state.scene.background.visible && state.scene.background.mediaType === 'image' && (
                        <image
                          href={state.scene.background.src}
                          x={state.scene.background.x}
                          y={state.scene.background.y}
                          width={canvasSize.width * state.scene.background.scale}
                          height={canvasSize.height * state.scene.background.scale}
                          preserveAspectRatio={
                            state.scene.background.fitMode === 'none' ? 'none' :
                            state.scene.background.fitMode === 'fill' ? 'none' :
                            state.scene.background.fitMode === 'cover' ? 'xMidYMid slice' :
                            'xMidYMid meet'
                          }
                          opacity={state.scene.background.opacity}
                        />
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
                          <div style={{ width: '100%', height: '100%' }}>
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
                opacity={0.18}
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
              const x = pos.x * scale + centerX;
              const y = pos.y * scale + centerY;
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
                        {/* Joint Masks */}
                        {jointMasksLayer}
                        {/* Head Mask */}
                        {headMaskLayer}
                      </>
                    )}

                    {state.jointsOverMasks && (
                      <>
                        {/* Joint Masks */}
                        {jointMasksLayer}
                        {/* Head Mask */}
                        {headMaskLayer}
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
                                width={canvasSize.width * state.scene.foreground.scale}
                                height={canvasSize.height * state.scene.foreground.scale}
                                preserveAspectRatio={
                                  state.scene.foreground.fitMode === 'none' ? 'none' :
                                  state.scene.foreground.fitMode === 'fill' ? 'none' :
                                  state.scene.foreground.fitMode === 'cover' ? 'xMidYMid slice' :
                                  'xMidYMid meet'
                                }
                                opacity={state.scene.foreground.opacity}
                              />
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

                  {state.scene.background.mediaType === 'video' && state.scene.background.src && (
                    <button
                      type="button"
                      onClick={fitTimelineToBackgroundVideo}
                      className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                      title="Match timeline length to background video"
                    >
                      Match Video
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
            const title =
              widget.kind === 'console'
                ? 'Console'
                : widget.kind === 'bone_inspector'
                  ? 'Bone Inspector'
                : widget.kind === 'camera'
                  ? 'Camera'
                  : widget.kind === 'procgen'
                    ? 'Procedural Generation'
                    : widget.kind === 'atomic_units'
                      ? 'Atomic Units'
                      : 'Joint Masks';
            const headerH = 34;
            return (
              <div
                key={widget.id}
                className="absolute z-30 pointer-events-auto"
                style={{ left: widget.x, top: widget.y, width: widget.w }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="bg-[#121212]/90 backdrop-blur-md border border-[#222] rounded-xl shadow-xl overflow-hidden"
                  style={{ height: widget.minimized ? headerH : widget.h }}
                >
                  <div
                    className="h-[34px] px-3 flex items-center justify-between cursor-move select-none"
                    onMouseDown={(e) => {
                      e.stopPropagation();
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
                      {widget.kind === 'console' ? (
                        <Terminal size={14} className="text-[#666]" />
                      ) : widget.kind === 'bone_inspector' ? (
                        <Layers size={14} className="text-[#666]" />
                      ) : widget.kind === 'camera' ? (
                        <Maximize2 size={14} className="text-[#666]" />
                      ) : widget.kind === 'procgen' ? (
                        <Sparkles size={14} className="text-[#666]" />
                      ) : widget.kind === 'atomic_units' ? (
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
                        onClick={() => setFloatingWidgets((prev) => prev.filter((w) => w.id !== widget.id))}
                        className="p-1 rounded hover:bg-white/10 text-[#888]"
                        title="Close"
                      >
                        <X size={10} className="text-[#666]" />
                      </button>
                    </div>
                  </div>

          <div className="p-3 overflow-auto" style={{ height: widget.h - headerH }}>
	            {widget.kind === 'console' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(['info', 'warning', 'error', 'success'] as const).map((lvl) => {
                      const active = activeLogLevels.has(lvl);
                      const color =
                        lvl === 'error'
                          ? 'text-orange-400'
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
                        {new Date(log.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
            ) : widget.kind === 'bone_inspector' ? (
              <div className="space-y-3">
                {(() => {
                  const connKey = selectedConnectionKey;
                  if (!connKey) {
                    return <div className="text-[10px] text-[#444]">No bone selected. Use Tab/Shift+Tab, or press 2.</div>;
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
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Selected Bone</div>
                        <div className="text-[11px] text-white font-mono">{label}</div>
                        <div className="text-[10px] text-[#555] font-mono">{connKey}</div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Stretch Mode</div>
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
                                    joints[ka]?.parent === kb ? ka : joints[kb]?.parent === ka ? kb : (kb || ka);
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
                                  active ? 'bg-[#ff8800]/20 text-[#ff8800]' : 'bg-white/5 hover:bg-white/10 text-[#ddd]'
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
            ) : widget.kind === 'camera' ? (
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
                                  setState(prev => ({ ...prev, viewScale: val }));
                                }}
                                className="w-full accent-white bg-[#222] h-1 rounded-full appearance-none cursor-pointer"
                              />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <button 
                                onClick={() => {
                                  setState(prev => ({ ...prev, viewOffset: { x: prev.viewOffset.x - 50, y: prev.viewOffset.y } }));
                                }}
                                className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                              >
                                Left
                              </button>
                              <button 
                                onClick={() => {
                                  setState(prev => ({ ...prev, viewOffset: { x: prev.viewOffset.x + 50, y: prev.viewOffset.y } }));
                                }}
                                className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                              >
                                Right
                              </button>
                              <button 
                                onClick={() => {
                                  setState(prev => ({ ...prev, viewOffset: { x: prev.viewOffset.x, y: prev.viewOffset.y - 50 } }));
                                }}
                                className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                              >
                                Up
                              </button>
                              <button 
                                onClick={() => {
                                  setState(prev => ({ ...prev, viewOffset: { x: prev.viewOffset.x, y: prev.viewOffset.y + 50 } }));
                                }}
                                className="py-1 bg-[#222] hover:bg-[#333] rounded text-[9px] font-bold uppercase border border-white/5"
                              >
                                Down
                              </button>
                            </div>

                            <button 
                              onClick={() => {
                                setState(prev => ({ ...prev, viewScale: 1.0, viewOffset: { x: 0, y: 0 } }));
                              }}
                              className="w-full py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[#333]"
                            >
                              Reset View
                            </button>
                            <div className="p-2 bg-white/5 rounded-md text-[9px] text-[#555] uppercase tracking-tight leading-relaxed">
                              <span className="text-white/40">Pan:</span> MMB or Space+Drag
                            </div>
                          </div>
	                    ) : widget.kind === 'procgen' ? (
                      <div className="space-y-4">
                        <div className="text-[10px] text-[#666]">Procedural Engine</div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-[#666]">Mode</label>
                            <select
                              value={procgenMode}
                              onChange={(e) => setProcgenMode(e.target.value as ProceduralMode)}
                              className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                            >
                              <option value="walk">Walk Loop</option>
                              <option value="idle">Idle Loop</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-[#666]">Strength</label>
                            <input
                              type="number"
                              min={0}
                              max={3}
                              step={0.1}
                              value={procgenStrength}
                              onChange={(e) => setProcgenStrength(parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-[#666]">Cycle Frames</label>
                          <input
                            type="number"
                            min={2}
                            max={600}
                            step={1}
                            value={procgenCycleFrames}
                            onChange={(e) => setProcgenCycleFrames(parseInt(e.target.value || '0', 10) || 2)}
                            className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
                          />
                        </div>

                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTimelinePlaying(false);
                              setTimelineFrame(0);
                              setStateWithHistory(`procgen_bake:${procgenMode}`, (prev) => {
                                const frameCount = clamp(Math.floor(procgenCycleFrames), 2, 600);
                                const fps = Math.max(1, Math.floor(prev.timeline.clip.fps || 24));
                                const neutral = capturePoseSnapshot(prev.joints, 'preview');
                                const rawFrames = [
                                  0,
                                  Math.floor(frameCount * 0.25),
                                  Math.floor(frameCount * 0.5),
                                  Math.floor(frameCount * 0.75),
                                  frameCount - 1,
                                ];
                                const frames = Array.from(new Set(rawFrames.map((f) => clamp(f, 0, frameCount - 1)))).sort((a, b) => a - b);
                                const keyframes = frames.map((f) => ({
                                  frame: f,
                                  pose: generateProceduralPose({
                                    mode: procgenMode,
                                    neutral,
                                    frame: f,
                                    fps,
                                    cycleFrames: frameCount,
                                    strength: procgenStrength,
                                  }),
                                }));
                                if (keyframes.length >= 2) keyframes[keyframes.length - 1].pose = keyframes[0].pose;
                                const firstPose = keyframes[0]?.pose ?? neutral;
                                return {
                                  ...prev,
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
                            }}
                            className="w-full py-2 bg-[#2b0057] hover:bg-[#3a007a] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[#333]"
                          >
                            Bake Loop to Timeline
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              // Generate random pose
                              const randomPose = Object.keys(INITIAL_JOINTS).reduce((acc, id) => {
                                acc[id] = {
                                  ...INITIAL_JOINTS[id],
                                  previewOffset: {
                                    x: INITIAL_JOINTS[id].baseOffset.x + (Math.random() - 0.5) * 2,
                                    y: INITIAL_JOINTS[id].baseOffset.y + (Math.random() - 0.5) * 2,
                                  },
                                  targetOffset: INITIAL_JOINTS[id].baseOffset,
                                  currentOffset: INITIAL_JOINTS[id].baseOffset,
                                };
                                return acc;
                              }, {} as Record<string, typeof INITIAL_JOINTS[string]>);
                              setState((prev) => ({ ...prev, joints: randomPose }));
                            }}
                            className="w-full py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[#333]"
                          >
                            Random Pose
                          </button>

                          <button
                            type="button"
                            onClick={() => setState((prev) => ({ ...prev, joints: INITIAL_JOINTS }))}
                            className="w-full py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border border-[#333]"
                          >
                            Reset to T-Pose
                          </button>

                          <div className="p-2 bg-white/5 rounded-md text-[9px] text-[#555] uppercase tracking-tight leading-relaxed">
                            Tip: Bake a loop, then export WebM (and add Titles in the sidebar).
                          </div>
                        </div>
                      </div>
	                    ) : widget.kind === 'atomic_units' ? (
	                      <AtomicUnitsControl
	                        state={state}
	                        setStateNoHistory={setStateNoHistory}
	                        setStateWithHistory={setStateWithHistory}
	                        beginHistoryAction={beginHistoryAction}
	                        commitHistoryAction={commitHistoryAction}
	                        addConsoleLog={addConsoleLog}
	                      />
	                    ) : (
              <div className="space-y-4">
                <div className="text-[10px] text-[#666]">
                  Bone Dynamics (Rigid / Elastic / Stretch)
                </div>
                <div className="space-y-2">
                  {CONNECTIONS.filter(c => c.type === 'bone').map((conn, idx) => (
                    <div key={`bone-dyn-${idx}`} className="flex items-center justify-between gap-2 p-2 bg-white/5 rounded-lg">
                      <span className="text-[10px] font-bold text-white uppercase truncate max-w-[80px]">
                        {conn.label || `${conn.from}->${conn.to}`}
                      </span>
                      <div className="flex bg-[#222] rounded-md p-0.5">
                        {(['rigid', 'elastic', 'stretch'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => {
                              const key = canonicalConnKey(conn.from, conn.to);
                              setStateWithHistory(`conn_mode:${key}`, (prev) => ({
                                ...prev,
                                connectionOverrides: {
                                  ...prev.connectionOverrides,
                                  [key]: { ...(prev.connectionOverrides[key] ?? {}), stretchMode: m },
                                },
                              }));
                            }}
                            className={`px-2 py-1 rounded text-[8px] font-bold uppercase transition-all ${
                              (state.connectionOverrides[canonicalConnKey(conn.from, conn.to)]?.stretchMode ?? conn.stretchMode ?? 'rigid') === m
                                ? 'bg-white text-black'
                                : 'text-[#666] hover:text-white'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-[#444] mt-2 italic">
                  Rigid: Fixed length. Elastic: Soft bounce. Stretch: Fully deformable.
                </div>
              </div>
            )}
          </div>
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
                <span className="text-white">{state.activePins.length}</span>
              </div>
            </div>
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

                  {state.scene.background.mediaType === 'video' && state.scene.background.src && (
                    <button
                      type="button"
                      onClick={fitTimelineToBackgroundVideo}
                      className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
                      title="Match timeline length to background video"
                    >
                      Match Video
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
</div>
);
}

function Toggle({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${active ? 'bg-white text-black border-white' : 'bg-transparent text-[#666] border-[#222] hover:border-[#444]'}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-tight">{label}</span>
      {active ? <Lock size={12} /> : <Unlock size={12} />}
    </button>
  );
}
