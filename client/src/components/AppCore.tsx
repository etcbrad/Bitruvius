import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Slider } from "@/components/ui/slider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SystemGrid } from "@/components/SystemGrid";
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

import type { 
  EnginePoseSnapshot, 
  Joint, 
  Point, 
  SkeletonState, 
  ControlMode, 
  Connection, 
  CutoutAsset, 
  SheetPalette, 
  SheetSegment, 
  RigidityPreset,
  RigModel 
} from '../engine/types';

import { LOOK_MODES, type LookModeId } from '../engine/lookModes';
import { throttle, normA, d2r, r2d, clamp, lerp } from '../utils';
import { HistoryController } from '../engine/history';
import { deserializeEngineState, serializeEngineState } from '../engine/serialization';
import { downloadSvg } from '../engine/export/svg';
import { downloadPngFromSvg } from '../engine/export/png';
import { exportAsWebm } from '../engine/export/video';
import { exportGifFramesZip } from '../engine/export/gif';
import { makeDefaultState, sanitizeStateWithReport, sanitizeJoints } from '../engine/settings';
import { CONNECTIONS, INITIAL_JOINTS } from '../engine/model';
import { RIG_MODELS, switchModel } from '../engine/modelSwitcher';
import { applyGroundRootCorrectionToJoints, computeGroundPivotWorld, computeTouchdownYWorld } from '../engine/rooting';
import { shouldRunPosePhysics, stepPosePhysics } from '../engine/physics/posePhysics';
import { buildWorldPoseFromJoints, worldPoseToOffsets } from '../engine/physics/xpbd';
import { applyBalancedNeckConstraint } from '../engine/balancedNeck';
import { applyNeckBaseCenteredOffsets } from '../engine/neckBase';
import { bakeProcgenLoop, createProcgenRuntime, resetProcgenRuntime, stepProcgenPose, type ProcgenRuntime } from '../engine/procedural';
import { applyDeactivationConstraints, toggleJointDeactivation } from '../engine/jointDeactivation';
import { applyPhysicsMode, getPhysicsBlendMode, createRigidStartPoint } from '../engine/physics-config';
import { getOptimalMode, applyPhysicsProfile, shouldAutoSwitch, createSmoothTransition, type UnifiedPhysicsMode } from '../engine/unifiedPhysics';
import { reconcileSkeletonState } from '../engine/reconcileSkeletonState';
import { syncLegacyMasksToCutouts } from '../engine/legacyMaskSync';
import { createViewPreset, deleteView, getActiveView, switchToView, updateViewFromCurrentState } from '../engine/views';
import { TransitionWarningDialog, getTransitionWarningsDisabled } from '../components/TransitionWarningDialog';
import {
  ViewSwitchDialog,
  getViewSwitchDefaultChoice,
  getViewSwitchPromptDisabled,
  type ViewSwitchChoice,
} from '../components/ViewSwitchDialog';
import { AtomicUnitsControl } from '../components/AtomicUnitsControl';
import { HelpTip } from '../components/HelpTip';
import { ProcgenWidget } from '../components/ProcgenWidget';
import { DetailsWidget } from '@/components/DetailsWidget';
import { HumanoidBacklightOverlay } from '@/components/HumanoidBacklightOverlay';
import { CutoutRigBuilder } from '../components/CutoutRigBuilder';
import { CutoutBuilderErrorBoundary } from '../components/CutoutBuilderErrorBoundary';
import { MediaUploadPanel } from '../components/MediaUploadPanel';
import { ExportActionsPanel, type ExportAction } from '../components/ExportActionsPanel';
import { UnifiedPhysicsControl } from '../components/UnifiedPhysicsControl';
import { ManikinConsole } from '../components/ManikinConsole';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { BalancedNeckControls } from '../components/BalancedNeckControls';
import { DEFAULT_BALANCED_NECK_CONFIG } from '../engine/balancedNeck';
import type { TransitionIssue } from '@/lib/transitionIssues';
import {
  BACKGROUND_COLOR_KEY,
  BONE_PALETTE,
  BUILD_ID,
  CONTROL_SETTINGS_KEY,
  DND_WIDGET_MIME,
  LOCAL_STORAGE_KEY,
  POSE_TRACE_KEY,
  WIDGET_DND_ENABLED,
} from '../app/constants';
import { isAppShellRuntime } from '../app/platform';
import { applyLightness, getBoneHex, rgbCss } from '../app/color';
import {
  controlGroupForMode,
  loadControlSettingsCache,
  saveControlSettingsCache,
  snapshotControlSettings,
  updateControlSettingsCache,
  type ControlSettingsCache,
} from '../app/controlSettings';
import { applyRigidTransformToJointSubset, collectSubtreeJointIds } from '../app/jointTransforms';
import { cacheImageFromUrl, cleanupImageCache } from '../app/imageCache';
import { processMaskImageFile } from '../app/maskImageProcessing';
import {
  fitModeToObjectFit,
  SyncedReferenceSequenceCanvas,
  SyncedReferenceVideo,
  type ReferenceSequenceData,
  type ReferenceVideoMeta,
} from '../app/referenceMedia';
import {
  isWidgetId,
  WIDGET_GLOBAL_ORDER,
  WIDGETS,
  WIDGET_TAB_ORDER,
  type FloatingWidget,
  type SidebarTab,
  type WidgetId,
} from '../app/widgets/registry';
import { canonicalConnKey } from '../app/connectionKey';
import type { RigFocus, RigSide, RigStage } from '../app/rigFocus';
import {
  disposeReferenceSequenceData,
  loadReferenceSequenceFromFile as loadReferenceSequenceFromFileImpl,
} from '../app/referenceSequences';

// Re-export commonly used types and constants
export type { 
  SkeletonState, 
  ControlMode, 
  UnifiedPhysicsMode,
  SheetPalette,
  SheetSegment,
  RigidityPreset,
  RigModel,
  TransitionIssue,
  ReferenceSequenceData,
  ReferenceVideoMeta,
  RigFocus,
  RigSide,
  RigStage,
  FloatingWidget,
  SidebarTab,
  WidgetId,
  ExportAction,
  ControlSettingsCache
};

export { 
  INITIAL_JOINTS,
  CONNECTIONS,
  BUILD_ID,
  DEFAULT_BALANCED_NECK_CONFIG,
  LOOK_MODES,
  makeDefaultState,
  sanitizeStateWithReport,
  sanitizeJoints,
  getOptimalMode,
  applyPhysicsProfile,
  shouldAutoSwitch,
  createSmoothTransition
};

// Core hooks that can be shared across cartridges
export const useCoreState = (initialState: SkeletonState) => {
  const [state, setState] = useState<SkeletonState>(initialState);
  const historyCtrlRef = useRef(new HistoryController<SkeletonState>({ limit: 120 }));
  
  const setStateWithHistory = useCallback((actionId: string, update: (prev: SkeletonState) => SkeletonState) => {
    setState(prev => {
      const next = update(prev);
      historyCtrlRef.current.pushUndo(actionId, prev);
      return next;
    });
  }, []);

  const canUndo = historyCtrlRef.current.canUndo();
  const canRedo = historyCtrlRef.current.canRedo();

  return {
    state,
    setState,
    setStateWithHistory,
    canUndo,
    canRedo,
    historyCtrlRef
  };
};

export const useCoreRefs = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const cursorHudRef = useRef<HTMLDivElement>(null);
  const cursorReticleRef = useRef<HTMLDivElement>(null);
  const cursorLabelRef = useRef<HTMLDivElement>(null);
  const cursorAlertRef = useRef<HTMLDivElement>(null);
  const cursorTargetRef = useRef<HTMLDivElement>(null);
  const coordHudRef = useRef<HTMLDivElement>(null);

  return {
    canvasRef,
    svgRef,
    cursorHudRef,
    cursorReticleRef,
    cursorLabelRef,
    cursorAlertRef,
    cursorTargetRef,
    coordHudRef
  };
};

export const useCoreEffects = (state: SkeletonState, setState: React.Dispatch<React.SetStateAction<SkeletonState>>) => {
  // Core effects that apply to both FK and IK modes
  useEffect(() => {
    console.log(`[bitruvius] build=${BUILD_ID}`);
    if (ENGINE_PERSISTENCE_ENABLED) cleanupImageCache();
  }, []);

  // Auto-save functionality
  const queueAutosave = useCallback((next: SkeletonState) => {
    if (!ENGINE_PERSISTENCE_ENABLED) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, serializeEngineState(next));
    } catch {
      // Silently fail
    }
  }, []);

  // Apply state updates
  useEffect(() => {
    if (ENGINE_PERSISTENCE_ENABLED) queueAutosave(state);
  }, [state, queueAutosave]);
};

const ENGINE_PERSISTENCE_ENABLED = false;
