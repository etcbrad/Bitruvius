import { useEffect } from 'react';

import type { Joint, Point, SkeletonState } from '../engine/types';
import type { EnginePoseSnapshot } from '../engine/types';

export const useTimelinePlayback = (opts: {
  enabled: boolean;
  timelinePlaying: boolean;
  fps: number;
  frameCount: number;
  timelineFrameRef: React.MutableRefObject<number>;
  setTimelineFrame: (frame: number) => void;
  setState: React.Dispatch<React.SetStateAction<SkeletonState>>;
  getInitialRootTargets: (state: SkeletonState) => Record<string, Point>;
  samplePose: (state: SkeletonState, frame: number) => EnginePoseSnapshot | null;
  applyPose: (joints: Record<string, Joint>, pose: EnginePoseSnapshot) => Record<string, Joint>;
  projectPosePhysicsIfNeeded: (
    state: SkeletonState,
    joints: Record<string, Joint>,
    rootTargets: Record<string, Point>,
  ) => Record<string, Joint>;
}) => {
  const {
    enabled,
    timelinePlaying,
    fps,
    frameCount,
    timelineFrameRef,
    setTimelineFrame,
    setState,
    getInitialRootTargets,
    samplePose,
    applyPose,
    projectPosePhysicsIfNeeded,
  } = opts;

  useEffect(() => {
    if (!enabled) return;
    if (!timelinePlaying) return;

    let rafId = 0;
    let last = performance.now();
    let acc = 0;
    const safeFps = Math.max(1, Math.floor(fps));
    const safeFrameCount = Math.max(1, Math.floor(frameCount));
    const frameStep = 1 / safeFps;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      acc += dt;

      let advance = 0;
      while (acc >= frameStep) {
        acc -= frameStep;
        advance += 1;
        if (advance >= 5) {
          acc = 0;
          break;
        }
      }

      if (advance > 0) {
        const nextFrame = (timelineFrameRef.current + advance) % safeFrameCount;
        timelineFrameRef.current = nextFrame;
        setTimelineFrame(nextFrame);

        setState((prev) => {
          const pose = samplePose(prev, nextFrame);
          if (!pose) return prev;

          const seeded = applyPose(prev.joints, pose);
          const rootTargets = getInitialRootTargets(prev);
          const projected = projectPosePhysicsIfNeeded(prev, seeded, rootTargets);
          return { ...prev, joints: projected };
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    applyPose,
    enabled,
    frameCount,
    fps,
    getInitialRootTargets,
    projectPosePhysicsIfNeeded,
    samplePose,
    setState,
    setTimelineFrame,
    timelineFrameRef,
    timelinePlaying,
  ]);
};
