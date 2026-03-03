import { lerp } from '../utils';
import { sampleClipPose } from './timeline';
import type { EnginePoseSnapshot, SkeletonState, Point } from './types';

export type DragRecordingSample = { tMs: number; pose: EnginePoseSnapshot };

export type DragRecordingSession = {
  draggingId: string;
  startMs: number;
  startFrame: number;
  fps: number;
  basePose: EnginePoseSnapshot;
  samples: DragRecordingSample[];
  movedJointIds: Set<string>;
};

export type RecordingFrame = { frame: number; pose: EnginePoseSnapshot };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const detectMovedJointIds = (
  basePose: EnginePoseSnapshot,
  pose: EnginePoseSnapshot,
  threshold: number,
): Set<string> => {
  const out = new Set<string>();
  const t = Math.max(0, threshold);
  const ids = new Set([...Object.keys(basePose.joints ?? {}), ...Object.keys(pose.joints ?? {})]);
  ids.forEach((id) => {
    const a = basePose.joints[id];
    const b = pose.joints[id];
    if (!a || !b) return;
    if (dist(a, b) > t) out.add(id);
  });
  return out;
};

export const buildRecordingFrames = (
  session: DragRecordingSession,
  options: { maxFramesPerDrag: number },
): RecordingFrame[] => {
  const maxFrames = clamp(Math.floor(options.maxFramesPerDrag), 2, 600);
  const fps = clamp(Math.floor(session.fps), 1, 60);
  const startFrame = Math.max(0, Math.floor(session.startFrame));
  const startMs = session.startMs;

  const frameToPose = new Map<number, EnginePoseSnapshot>();

  // Always include starting pose.
  frameToPose.set(startFrame, session.basePose);

  for (const s of session.samples) {
    const dt = Math.max(0, (s.tMs - startMs) / 1000);
    const offset = Math.round(dt * fps);
    if (offset < 0) continue;
    if (offset > maxFrames - 1) continue;
    frameToPose.set(startFrame + offset, s.pose);
  }

  const frames = Array.from(frameToPose.entries())
    .map(([frame, pose]) => ({ frame, pose }))
    .sort((a, b) => a.frame - b.frame);

  if (frames.length <= 1) return frames;

  // Always keep the last recorded frame.
  const last = frames[frames.length - 1]!;
  frameToPose.set(last.frame, last.pose);
  return Array.from(frameToPose.entries())
    .map(([frame, pose]) => ({ frame, pose }))
    .sort((a, b) => a.frame - b.frame);
};

export const simplifyRecordingFrames = (
  frames: RecordingFrame[],
  movedJointIds: Set<string>,
  epsilon: number,
): RecordingFrame[] => {
  if (frames.length <= 2) return frames;
  if (!movedJointIds.size) return [frames[0]!, frames[frames.length - 1]!];

  const eps = Math.max(0, epsilon);
  const kept: RecordingFrame[] = [frames[0]!];
  let lastKept = frames[0]!;

  for (let i = 1; i < frames.length - 1; i += 1) {
    const cur = frames[i]!;
    let changed = false;
    movedJointIds.forEach((id) => {
      if (changed) return;
      const a = lastKept.pose.joints[id];
      const b = cur.pose.joints[id];
      if (!a || !b) return;
      if (dist(a, b) > eps) {
        changed = true;
      }
    });
    if (changed) {
      kept.push(cur);
      lastKept = cur;
    }
  }

  kept.push(frames[frames.length - 1]!);
  return kept;
};

export const mergePoseSnapshotsBlend = (
  base: EnginePoseSnapshot,
  overlay: EnginePoseSnapshot,
  movedJointIds: Set<string>,
  overlayWeightRaw: number,
): EnginePoseSnapshot => {
  const w = clamp(overlayWeightRaw, 0, 1);
  const out: Record<string, Point> = { ...(base.joints ?? {}) };

  movedJointIds.forEach((id) => {
    const a = base.joints[id];
    const b = overlay.joints[id];
    if (!a && !b) return;
    const p0 = a ?? b!;
    const p1 = b ?? a!;
    out[id] = { x: lerp(p0.x, p1.x, w), y: lerp(p0.y, p1.y, w) };
  });

  return { joints: out };
};

export const bakeRecordingIntoTimeline = (
  state: SkeletonState,
  framesRaw: RecordingFrame[],
  movedJointIds: Set<string>,
  basePose: EnginePoseSnapshot,
  overlayWeight: number,
): { nextState: SkeletonState; endFrame: number; bakedFrames: number } => {
  const MAX_FRAME = 599;

  const frames = framesRaw
    .map((f) => ({ ...f, frame: clamp(Math.floor(f.frame), 0, MAX_FRAME) }))
    .sort((a, b) => a.frame - b.frame);

  if (!frames.length) return { nextState: state, endFrame: state.timeline.enabled ? state.timeline.clip.frameCount - 1 : 0, bakedFrames: 0 };

  const endFrame = frames[frames.length - 1]!.frame;
  if (!movedJointIds.size) return { nextState: state, endFrame, bakedFrames: 0 };

  const sourceClip = state.timeline.clip;
  const hasBaseAnimation = Array.isArray(sourceClip.keyframes) && sourceClip.keyframes.length > 0;

  const bakedByFrame = new Map<number, EnginePoseSnapshot>();
  for (const f of frames) {
    const baseAtFrame =
      hasBaseAnimation
        ? (sampleClipPose(sourceClip, f.frame, state.joints, { stretchEnabled: state.stretchEnabled }) ?? basePose)
        : basePose;
    bakedByFrame.set(f.frame, mergePoseSnapshotsBlend(baseAtFrame, f.pose, movedJointIds, overlayWeight));
  }

  const nextKeyframes = (sourceClip.keyframes ?? [])
    .filter((k) => !bakedByFrame.has(k.frame))
    .concat(Array.from(bakedByFrame.entries()).map(([frame, pose]) => ({ frame, pose })))
    .sort((a, b) => a.frame - b.frame);

  const existingCount = clamp(Math.floor(sourceClip.frameCount), 2, 600);
  const nextFrameCount = clamp(Math.max(existingCount, endFrame + 1), 2, 600);

  return {
    nextState: {
      ...state,
      timeline: {
        ...state.timeline,
        enabled: true,
        clip: {
          ...sourceClip,
          frameCount: nextFrameCount,
          keyframes: nextKeyframes,
        },
      },
    },
    endFrame,
    bakedFrames: bakedByFrame.size,
  };
};
