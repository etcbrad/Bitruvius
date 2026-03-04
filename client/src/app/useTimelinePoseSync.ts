import { useEffect } from 'react';

import type { Joint, SkeletonState } from '../engine/types';
import type { EnginePoseSnapshot } from '../engine/types';

export const useTimelinePoseSync = (opts: {
  enabled: boolean;
  timelinePlaying: boolean;
  timelineFrame: number;
  setState: React.Dispatch<React.SetStateAction<SkeletonState>>;
  samplePose: (state: SkeletonState, frame: number) => EnginePoseSnapshot | null;
  applyPose: (joints: Record<string, Joint>, pose: EnginePoseSnapshot) => Record<string, Joint>;
  projectPosePhysicsIfNeeded: (state: SkeletonState, joints: Record<string, Joint>) => Record<string, Joint>;
}) => {
  const {
    enabled,
    timelinePlaying,
    timelineFrame,
    setState,
    samplePose,
    applyPose,
    projectPosePhysicsIfNeeded,
  } = opts;

  useEffect(() => {
    if (!enabled) return;
    if (timelinePlaying) return;

    setState((prev) => {
      const pose = samplePose(prev, timelineFrame);
      if (!pose) return prev;
      const seeded = applyPose(prev.joints, pose);
      const projected = projectPosePhysicsIfNeeded(prev, seeded);
      if (projected === prev.joints) return prev;
      return { ...prev, joints: projected };
    });
  }, [applyPose, enabled, projectPosePhysicsIfNeeded, samplePose, setState, timelineFrame, timelinePlaying]);
};

