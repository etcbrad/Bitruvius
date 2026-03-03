import type { TransitionIssue, TransitionResult } from '@/lib/transitionIssues';
import { LOOK_MODE_ID_SET } from './lookModes';
import type { SkeletonState } from './types';

type Fix = {
  title: string;
  detail: string;
  fields: string[];
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampScale = (v: number) => Math.max(0.1, Math.min(10, v));
const clampOffset = (v: number) => Math.max(-50_000, Math.min(50_000, v));

export const reconcileSkeletonState = (state: SkeletonState): TransitionResult<SkeletonState> => {
  const fixes: Fix[] = [];
  let next = state;

  if (!LOOK_MODE_ID_SET.has(next.lookMode)) {
    const prev = next.lookMode;
    next = { ...next, lookMode: 'default' };
    fixes.push({
      title: 'Invalid look mode',
      detail: `Look mode "${String(prev)}" is unknown; reverting to Default.`,
      fields: ['look.lookMode'],
    });
  }

  const pr = typeof next.physicsRigidity === 'number' ? next.physicsRigidity : undefined;
  if (pr !== undefined) {
    const clamped = clamp01(pr);
    if (clamped !== pr) {
      next = { ...next, physicsRigidity: clamped };
      fixes.push({
        title: 'Physics dial clamped',
        detail: `physicsRigidity was outside 0..1 and was clamped to ${clamped.toFixed(3)}.`,
        fields: ['simulation.physicsRigidity'],
      });
    }
  }

  const vs = typeof next.viewScale === 'number' ? next.viewScale : undefined;
  if (vs !== undefined) {
    const normalized = Number.isFinite(vs) ? clampScale(vs) : 1.0;
    if (normalized !== vs) {
      next = { ...next, viewScale: normalized };
      fixes.push({
        title: 'Camera zoom normalized',
        detail: `viewScale was invalid/out of range and was normalized to ${normalized.toFixed(3)}.`,
        fields: ['camera.viewScale'],
      });
    }
  }

  const vo = next.viewOffset as any;
  if (vo && typeof vo === 'object') {
    const xRaw = (vo as any).x;
    const yRaw = (vo as any).y;
    const x = typeof xRaw === 'number' && Number.isFinite(xRaw) ? clampOffset(xRaw) : 0;
    const y = typeof yRaw === 'number' && Number.isFinite(yRaw) ? clampOffset(yRaw) : 0;
    if (x !== xRaw || y !== yRaw) {
      next = { ...next, viewOffset: { x, y } as any };
      fixes.push({
        title: 'Camera pan normalized',
        detail: 'viewOffset was invalid/out of range and was normalized.',
        fields: ['camera.viewOffset'],
      });
    }
  }

  if (Array.isArray(next.views) && next.views.length > 0) {
    const ok = typeof next.activeViewId === 'string' && next.views.some((v) => v.id === next.activeViewId);
    if (!ok) {
      const fallback = next.views[0]!.id;
      next = { ...next, activeViewId: fallback };
      fixes.push({
        title: 'Invalid active view',
        detail: `Active view did not exist; switched to "${fallback}".`,
        fields: ['view.activeViewId'],
      });
    }
  }

  if (next.lookMode === 'skeletal') {
    const needShowJoints = !next.showJoints;
    const needOver = !next.jointsOverMasks;
    if (needShowJoints || needOver) {
      next = {
        ...next,
        showJoints: true,
        jointsOverMasks: true,
      };
      fixes.push({
        title: 'Skeletal look enforces rig visibility',
        detail: 'Skeletal mode forces joints to be visible and drawn above masks.',
        fields: [
          ...(needShowJoints ? ['render.showJoints'] : []),
          ...(needOver ? ['render.jointsOverMasks'] : []),
        ],
      });
    }
  }

  const issues: TransitionIssue[] = fixes.map((f) => ({
    severity: 'info',
    title: f.title,
    detail: f.detail,
    autoFixedFields: f.fields,
  }));

  return { state: next, issues };
};
