import type { SkeletonState, ViewPreset, EnginePoseSnapshot } from './types';
import { capturePoseSnapshot, applyPoseSnapshotToJoints } from './timeline';
import { INITIAL_JOINTS } from './model';

// View management utilities
export const createViewPreset = (
  name: string,
  currentState: SkeletonState,
  slotOverrides: Record<string, { visible?: boolean; zIndex?: number }> = {}
): ViewPreset => {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const pose = capturePoseSnapshot(currentState.joints);

  return {
    id,
    name,
    pose,
    slotOverrides,
    camera: {
      viewScale: currentState.viewScale,
      viewOffset: currentState.viewOffset,
    },
    reference: {
      background: currentState.scene.background,
      foreground: currentState.scene.foreground,
    },
  };
};

export const switchToView = (state: SkeletonState, viewId: string): SkeletonState => {
  const view = state.views.find(v => v.id === viewId);
  if (!view) return state;

  // Apply pose to joints
  const updatedJoints = applyPoseSnapshotToJoints(state.joints, view.pose);

  // Apply camera overrides
  const viewScale = view.camera?.viewScale ?? state.viewScale;
  const viewOffset = view.camera?.viewOffset ?? state.viewOffset;

  return {
    ...state,
    joints: updatedJoints,
    activeViewId: viewId,
    viewScale,
    viewOffset,
    scene: {
      ...state.scene,
      background: { ...state.scene.background, ...(view.reference?.background || {}) },
      foreground: { ...state.scene.foreground, ...(view.reference?.foreground || {}) },
    },
  };
};

export const updateViewFromCurrentState = (state: SkeletonState, viewId: string): SkeletonState => {
  const viewIndex = state.views.findIndex(v => v.id === viewId);
  if (viewIndex === -1) return state;

  const updatedView = createViewPreset(
    state.views[viewIndex].name,
    state,
    state.views[viewIndex].slotOverrides
  );

  const updatedViews = [...state.views];
  updatedViews[viewIndex] = updatedView;

  return {
    ...state,
    views: updatedViews,
  };
};

export const duplicateView = (state: SkeletonState, sourceViewId: string, newName: string): SkeletonState => {
  const sourceView = state.views.find(v => v.id === sourceViewId);
  if (!sourceView) return state;

  const newView = {
    ...sourceView,
    id: newName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name: newName,
  };

  return {
    ...state,
    views: [...state.views, newView],
  };
};

export const deleteView = (state: SkeletonState, viewId: string): SkeletonState => {
  const updatedViews = state.views.filter(v => v.id !== viewId);
  const newActiveViewId = state.activeViewId === viewId 
    ? (updatedViews.length > 0 ? updatedViews[0].id : '')
    : state.activeViewId;

  return {
    ...state,
    views: updatedViews,
    activeViewId: newActiveViewId,
  };
};

export const updateSlotOverrides = (
  state: SkeletonState, 
  viewId: string, 
  slotId: string, 
  overrides: { visible?: boolean; zIndex?: number }
): SkeletonState => {
  const viewIndex = state.views.findIndex(v => v.id === viewId);
  if (viewIndex === -1) return state;

  const updatedViews = [...state.views];
  const currentOverrides = updatedViews[viewIndex].slotOverrides[slotId] || {};
  
  updatedViews[viewIndex] = {
    ...updatedViews[viewIndex],
    slotOverrides: {
      ...updatedViews[viewIndex].slotOverrides,
      [slotId]: { ...currentOverrides, ...overrides },
    },
  };

  return {
    ...state,
    views: updatedViews,
  };
};

// Helper to get effective slot properties considering view overrides
export const getEffectiveSlotProperties = (
  state: SkeletonState,
  slotId: string
) => {
  const slot = state.cutoutSlots[slotId];
  if (!slot) return null;

  const activeView = state.views.find(v => v.id === state.activeViewId);
  const slotOverride = activeView?.slotOverrides[slotId] || {};

  return {
    ...slot,
    visible: slotOverride.visible !== undefined ? slotOverride.visible : slot.visible,
    zIndex: slotOverride.zIndex !== undefined ? slotOverride.zIndex : slot.zIndex,
  };
};
