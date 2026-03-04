import React from 'react';

import { WIDGET_DND_ENABLED } from '../constants';

export type SidebarTab = 'character' | 'physics' | 'animation' | 'global';

export type WidgetId =
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

export type WidgetMode = 'docked' | 'floating';

export type FloatingWidget = {
  id: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
};

export const isWidgetId = (value: unknown): value is WidgetId => {
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

export const WIDGETS: Record<
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
          {WIDGET_DND_ENABLED ? (
            <>
              <li>Drag a widget onto the canvas to pop it out.</li>
              <li>Drag a widget back onto the sidebar to dock it.</li>
            </>
          ) : (
            <li>Pop-out dragging is temporarily disabled (widgets stay docked).</li>
          )}
        </ul>
      </div>
    ),
    defaultFloatSize: { w: 360, h: 240 },
    minFloatSize: { w: 220, h: 140 },
  },
  edit: {
    title: 'Edit',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Undo/redo and editor utilities.</div>,
    defaultFloatSize: { w: 360, h: 190 },
    minFloatSize: { w: 220, h: 140 },
  },
  joint_hierarchy: {
    title: 'Joint Hierarchy',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Quick navigation through joints and bones.</div>,
    defaultFloatSize: { w: 360, h: 540 },
    minFloatSize: { w: 240, h: 200 },
  },
  joint_masks: {
    title: 'Masks',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Edit cutout masks and masking behavior.</div>,
    defaultFloatSize: { w: 360, h: 420 },
    minFloatSize: { w: 240, h: 200 },
  },
  cutout_relationships: {
    title: 'Cutout Relationships',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Visualize and debug cutout overlaps and ordering.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 260, h: 200 },
  },
  bone_inspector: {
    title: 'Rig Inspector',
    tabGroup: 'character',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Inspect bones, joints, and stretch behavior.</div>,
    defaultFloatSize: { w: 360, h: 300 },
    minFloatSize: { w: 240, h: 180 },
  },
  rig_controls: {
    title: 'Rig Controls',
    tabGroup: null,
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
    minFloatSize: { w: 260, h: 220 },
  },
  responsiveness: {
    title: 'Responsiveness',
    tabGroup: null,
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Fine-tune smoothing, damping, and feel.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 260, h: 200 },
  },
  atomic_units: {
    title: 'Advanced Controls',
    tabGroup: null,
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Low-level rig settings and debugging utilities.</div>,
    defaultFloatSize: { w: 420, h: 560 },
    minFloatSize: { w: 280, h: 220 },
  },
  animation: {
    title: 'Animation',
    tabGroup: 'animation',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Timeline and keyframe tools.</div>,
    defaultFloatSize: { w: 420, h: 340 },
    minFloatSize: { w: 260, h: 200 },
  },
  procgen: {
    title: 'Auto Motion',
    tabGroup: 'physics',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Procedural motion and loop baking.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 260, h: 200 },
  },
  camera: {
    title: 'Camera',
    tabGroup: 'animation',
    isGlobal: false,
    docs: <div className="text-[11px] text-[#bbb]">Viewport and export framing controls.</div>,
    defaultFloatSize: { w: 320, h: 220 },
    minFloatSize: { w: 220, h: 160 },
  },
  look: {
    title: 'Look',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Display style and look presets.</div>,
    defaultFloatSize: { w: 420, h: 420 },
    minFloatSize: { w: 260, h: 200 },
  },
  views: {
    title: 'Views',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Save and switch camera / view presets.</div>,
    defaultFloatSize: { w: 420, h: 520 },
    minFloatSize: { w: 260, h: 220 },
  },
  pixel_fonts: {
    title: 'Pixel Fonts',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Choose the UI title font style.</div>,
    defaultFloatSize: { w: 420, h: 260 },
    minFloatSize: { w: 260, h: 200 },
  },
  background: {
    title: 'Background',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Canvas background color and defaults.</div>,
    defaultFloatSize: { w: 420, h: 320 },
    minFloatSize: { w: 260, h: 200 },
  },
  scene: {
    title: 'Scene',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Reference layers, titles, and scene overlays.</div>,
    defaultFloatSize: { w: 520, h: 640 },
    minFloatSize: { w: 300, h: 240 },
  },
  project: {
    title: 'Project',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Save and open project files.</div>,
    defaultFloatSize: { w: 420, h: 260 },
    minFloatSize: { w: 260, h: 200 },
  },
  export: {
    title: 'Export',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Export SVG/PNG/WebM outputs.</div>,
    defaultFloatSize: { w: 420, h: 280 },
    minFloatSize: { w: 260, h: 200 },
  },
  pose_capture: {
    title: 'Pose Capture',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Capture pose snapshots and bake recordings.</div>,
    defaultFloatSize: { w: 520, h: 560 },
    minFloatSize: { w: 300, h: 240 },
  },
  console: {
    title: 'Console',
    tabGroup: 'global',
    isGlobal: true,
    docs: <div className="text-[11px] text-[#bbb]">Engine and workflow logs.</div>,
    defaultFloatSize: { w: 520, h: 340 },
    minFloatSize: { w: 280, h: 200 },
  },
};

export const WIDGET_GLOBAL_ORDER: WidgetId[] = [
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

export const WIDGET_TAB_ORDER: Record<SidebarTab, WidgetId[]> = {
  character: ['tools', 'edit', 'joint_hierarchy', 'joint_masks', 'cutout_relationships', 'bone_inspector'],
  physics: ['procgen'],
  animation: ['animation', 'camera'],
  global: WIDGET_GLOBAL_ORDER,
};
