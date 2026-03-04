import * as React from 'react';
import { Pause, Play, Plus, Trash2, Repeat, ChevronsUpDown } from 'lucide-react';

import type { EnginePoseSnapshot, SkeletonState } from '../engine/types';
import { getPhysicsBlendMode } from '../engine/physics-config';
import { stepPosePhysics } from '../engine/physics/posePhysics';
import { getWorldPositionFromOffsets } from '../engine/kinematics';
import { INITIAL_JOINTS } from '../engine/model';
import { applyPoseSnapshotToJoints, capturePoseSnapshot, sampleClipPose, sampleClipPoseIk } from '../engine/timeline';

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(v)));

const sortKeyframes = (kfs: Array<{ frame: number; pose: EnginePoseSnapshot }>) =>
  [...kfs].sort((a, b) => a.frame - b.frame);

type TimelineSolveMode = 'auto' | 'fk' | 'ik' | 'physics' | 'ik+physics';

const defaultWireComplianceForRigidity = (rigidity: SkeletonState['rigidity']): number => {
  if (rigidity === 'cardboard') return 0.00025;
  if (rigidity === 'rubberhose') return 0.02;
  return 0.0015;
};

const computeRootTargetsForClip = (state: SkeletonState): Record<string, { x: number; y: number }> => {
  const pose0 =
    sampleClipPose(state.timeline.clip, 0, INITIAL_JOINTS, { stretchEnabled: state.stretchEnabled }) ??
    capturePoseSnapshot(INITIAL_JOINTS, 'preview');
  return state.activeRoots.reduce<Record<string, { x: number; y: number }>>((acc, rootId) => {
    acc[rootId] = getWorldPositionFromOffsets(rootId, pose0.joints, INITIAL_JOINTS);
    return acc;
  }, {});
};

export function PoseTimelineWidget(props: {
  state: SkeletonState;
  timelinePlaying: boolean;
  solveMode: TimelineSolveMode;
  setSolveMode: React.Dispatch<React.SetStateAction<TimelineSolveMode>>;
  ikEffectors: string[];
  setIkEffectors: React.Dispatch<React.SetStateAction<string[]>>;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  applyTimelineFrame: (frame: number) => void;
  setStateWithHistory: (actionId: string, update: (prev: SkeletonState) => SkeletonState) => void;
}) {
  const {
    state,
    timelinePlaying,
    solveMode,
    setSolveMode,
    ikEffectors,
    setIkEffectors,
    onPlay,
    onPause,
    onStop,
    applyTimelineFrame,
    setStateWithHistory,
  } = props;

  const keyframes = Array.isArray(state.timeline.clip.keyframes) ? sortKeyframes(state.timeline.clip.keyframes) : [];
  const fps = clampInt(state.timeline.clip.fps || 24, 1, 60);

  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [inbetweenCount, setInbetweenCount] = React.useState(1);
  React.useEffect(() => {
    if (selectedIndex < keyframes.length) return;
    setSelectedIndex(Math.max(0, keyframes.length - 1));
  }, [keyframes.length, selectedIndex]);

  const totalFrames = Math.max(1, clampInt(state.timeline.clip.frameCount || 1, 1, 600));
  const totalSeconds = totalFrames / Math.max(1, fps);

  const ikModeActive = solveMode === 'ik' || solveMode === 'ik+physics';
  const physicsModeActive = solveMode === 'physics' || solveMode === 'ik+physics';

  const ikGroups = React.useMemo(() => {
    const groups = [
      { id: 'hands', label: 'Hands', jointIds: ['l_wrist', 'r_wrist'] },
      { id: 'feet', label: 'Feet', jointIds: ['l_ankle', 'r_ankle'] },
      { id: 'head', label: 'Head', jointIds: ['head'] },
    ] as const;
    return groups
      .map((g) => ({ ...g, jointIds: g.jointIds.filter((id) => id in INITIAL_JOINTS) }))
      .filter((g) => g.jointIds.length > 0);
  }, []);

  const toggleIkGroup = (ids: readonly string[]) => {
    setIkEffectors((prev) => {
      const hasAny = ids.some((id) => prev.includes(id));
      if (hasAny) return prev.filter((id) => !ids.includes(id));
      const next = [...prev];
      for (const id of ids) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  };

  const addCurrentPose = () => {
    setStateWithHistory('pose_timeline:add_pose', (prev) => {
      const pose = capturePoseSnapshot(prev.joints, 'preview');
      const prevKfs = Array.isArray(prev.timeline.clip.keyframes) ? sortKeyframes(prev.timeline.clip.keyframes) : [];

      const defaultDur = clampInt(prev.timeline.clip.fps || 24, 1, 120);
      if (prevKfs.length === 0) {
        return {
          ...prev,
          timeline: {
            ...prev.timeline,
            enabled: true,
            clip: {
              ...prev.timeline.clip,
              fps,
              frameCount: Math.max(2, Math.floor(prev.timeline.clip.frameCount || defaultDur + 1)),
              keyframes: [{ frame: 0, pose }],
            },
          },
        };
      }

      const last = prevKfs[prevKfs.length - 1]!;
      const nextFrame = clampInt(last.frame + defaultDur, last.frame + 1, 599);
      const nextKfs = [...prevKfs, { frame: nextFrame, pose }];
      const nextFrameCount = clampInt(Math.max(prev.timeline.clip.frameCount || 2, nextFrame + 1), 2, 600);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          enabled: true,
          clip: { ...prev.timeline.clip, fps: clampInt(prev.timeline.clip.fps || 24, 1, 60), frameCount: nextFrameCount, keyframes: nextKfs },
        },
      };
    });
  };

  const insertInbetweens = () => {
    const idx = clampInt(selectedIndex, 0, Math.max(0, keyframes.length - 2));
    if (idx < 0 || idx >= keyframes.length - 1) return;
    const a = keyframes[idx]!;
    const b = keyframes[idx + 1]!;
    const gap = b.frame - a.frame - 1;
    if (gap <= 0) return;

    const desiredCount = clampInt(inbetweenCount, 1, 48);
    const count = clampInt(desiredCount, 1, gap);
    if (count <= 0) return;

    setStateWithHistory('pose_timeline:insert_inbetweens', (prev) => {
      const prevKfs = Array.isArray(prev.timeline.clip.keyframes) ? sortKeyframes(prev.timeline.clip.keyframes) : [];
      if (idx >= prevKfs.length - 1) return prev;
      const start = prevKfs[idx]!;
      const end = prevKfs[idx + 1]!;
      const innerGap = end.frame - start.frame - 1;
      if (innerGap <= 0) return prev;

      const actualCount = clampInt(count, 1, innerGap);
      const step = (end.frame - start.frame) / (actualCount + 1);
      const framesRaw = Array.from({ length: actualCount }, (_, i) => Math.round(start.frame + step * (i + 1)));
      const frames = framesRaw
        .map((f) => clampInt(f, start.frame + 1, end.frame - 1))
        .sort((x, y) => x - y);

      // Ensure strictly increasing unique frames.
      for (let i = 1; i < frames.length; i += 1) {
        frames[i] = Math.max(frames[i]!, frames[i - 1]! + 1);
      }
      // Clamp any overflow back into range.
      for (let i = frames.length - 1; i >= 0; i -= 1) {
        frames[i] = Math.min(frames[i]!, end.frame - (frames.length - i));
      }

      const shouldPhysics =
        physicsModeActive ? prev.activeRoots.length > 0 : solveMode === 'auto' && getPhysicsBlendMode(prev) === 'fluid' && prev.activeRoots.length > 0;
      const rootTargets = shouldPhysics ? computeRootTargetsForClip(prev) : null;

      const computePoseAt = (frame: number): EnginePoseSnapshot | null => {
        const base =
          ikModeActive
            ? sampleClipPoseIk(prev.timeline.clip, frame, INITIAL_JOINTS, ikEffectors, { stretchEnabled: prev.stretchEnabled })
            : sampleClipPose(prev.timeline.clip, frame, INITIAL_JOINTS, { stretchEnabled: prev.stretchEnabled });
        if (!base) return null;
        if (!shouldPhysics || !rootTargets) return base;
        const seeded = applyPoseSnapshotToJoints(INITIAL_JOINTS, base);
        const projected = stepPosePhysics({
          joints: seeded,
          baseJoints: INITIAL_JOINTS,
          activeRoots: prev.activeRoots,
          rootTargets,
          relativePins: prev.relativePins,
          drag: null,
          connectionOverrides: prev.connectionOverrides,
          options: {
            dt: 1 / 60,
            iterations: 22,
            damping: 0.12,
            wireCompliance: defaultWireComplianceForRigidity(prev.rigidity),
            rigidity: prev.rigidity,
            hardStop: prev.hardStop,
            autoBend: prev.bendEnabled,
            stretchEnabled: prev.stretchEnabled,
          },
        }).joints;
        return capturePoseSnapshot(projected, 'preview');
      };

      const inserted = frames
        .map((frame) => {
          const pose = computePoseAt(frame);
          return pose ? { frame, pose } : null;
        })
        .filter(Boolean) as Array<{ frame: number; pose: EnginePoseSnapshot }>;
      if (!inserted.length) return prev;

      const withoutConflicts = prevKfs.filter((k) => !frames.includes(k.frame));
      const nextKfs = sortKeyframes([...withoutConflicts, ...inserted]);
      return { ...prev, timeline: { ...prev.timeline, enabled: true, clip: { ...prev.timeline.clip, keyframes: nextKfs } } };
    });
  };

  const updateSelectedPose = () => {
    const idx = clampInt(selectedIndex, 0, Math.max(0, keyframes.length - 1));
    const selected = keyframes[idx];
    if (!selected) return;
    setStateWithHistory('pose_timeline:update_pose', (prev) => {
      const pose = capturePoseSnapshot(prev.joints, 'preview');
      const prevKfs = Array.isArray(prev.timeline.clip.keyframes) ? sortKeyframes(prev.timeline.clip.keyframes) : [];
      const nextKfs = prevKfs.map((k) => (k.frame === selected.frame ? { ...k, pose } : k));
      return { ...prev, timeline: { ...prev.timeline, enabled: true, clip: { ...prev.timeline.clip, keyframes: nextKfs } } };
    });
  };

  const deleteSelectedPose = () => {
    const idx = clampInt(selectedIndex, 0, Math.max(0, keyframes.length - 1));
    const selected = keyframes[idx];
    if (!selected) return;
    setStateWithHistory('pose_timeline:delete_pose', (prev) => {
      const prevKfs = Array.isArray(prev.timeline.clip.keyframes) ? sortKeyframes(prev.timeline.clip.keyframes) : [];
      const filtered = prevKfs.filter((k) => k.frame !== selected.frame);
      if (filtered.length === 0) {
        return { ...prev, timeline: { ...prev.timeline, enabled: false, clip: { ...prev.timeline.clip, keyframes: [] } } };
      }
      const shift = filtered[0]!.frame;
      const shifted = filtered.map((k) => ({ ...k, frame: Math.max(0, k.frame - shift) }));
      const nextFrameCount = clampInt(Math.max(2, shifted[shifted.length - 1]!.frame + 1), 2, 600);
      return { ...prev, timeline: { ...prev.timeline, enabled: true, clip: { ...prev.timeline.clip, frameCount: nextFrameCount, keyframes: shifted } } };
    });
  };

  const setDurationFrames = (idx: number, durationFramesRaw: number) => {
    if (idx < 0 || idx >= keyframes.length - 1) return;
    const a = keyframes[idx]!;
    const b = keyframes[idx + 1]!;
    const desired = clampInt(durationFramesRaw, 1, 600);
    const current = Math.max(1, b.frame - a.frame);
    if (desired === current) return;

    setStateWithHistory('pose_timeline:set_duration', (prev) => {
      const prevKfs = Array.isArray(prev.timeline.clip.keyframes) ? sortKeyframes(prev.timeline.clip.keyframes) : [];
      if (idx >= prevKfs.length - 1) return prev;
      const frames = prevKfs.map((k) => k.frame);
      const old = Math.max(1, frames[idx + 1]! - frames[idx]!);
      const delta = desired - old;
      const maxDelta = 599 - frames[frames.length - 1]!;
      const safeDelta = clampInt(delta, -599, maxDelta);
      for (let j = idx + 1; j < frames.length; j += 1) frames[j] = frames[j]! + safeDelta;
      // Monotonic enforcement.
      frames[0] = 0;
      for (let j = 1; j < frames.length; j += 1) frames[j] = Math.max(frames[j]!, frames[j - 1]! + 1);
      // Keep last within bounds.
      const overflow = frames[frames.length - 1]! - 599;
      if (overflow > 0) {
        for (let j = 1; j < frames.length; j += 1) frames[j] = Math.max(j, frames[j]! - overflow);
      }

      const nextKfs = prevKfs.map((k, j) => ({ ...k, frame: frames[j]! }));
      const nextFrameCount = clampInt(Math.max(2, nextKfs[nextKfs.length - 1]!.frame + 1), 2, 600);
      return { ...prev, timeline: { ...prev.timeline, enabled: true, clip: { ...prev.timeline.clip, frameCount: nextFrameCount, keyframes: nextKfs } } };
    });
  };

  const closeLoop = () => {
    if (keyframes.length < 2) return;
    const first = keyframes[0]!;
    setStateWithHistory('pose_timeline:close_loop', (prev) => {
      const prevKfs = Array.isArray(prev.timeline.clip.keyframes) ? sortKeyframes(prev.timeline.clip.keyframes) : [];
      if (prevKfs.length < 2) return prev;
      const defaultDur = clampInt(prev.timeline.clip.fps || 24, 1, 120);
      const last = prevKfs[prevKfs.length - 1]!;
      const nextFrame = clampInt(last.frame + defaultDur, last.frame + 1, 599);
      const nextKfs = [...prevKfs, { frame: nextFrame, pose: first.pose }];
      const nextFrameCount = clampInt(Math.max(prev.timeline.clip.frameCount || 2, nextFrame + 1), 2, 600);
      return { ...prev, timeline: { ...prev.timeline, enabled: true, clip: { ...prev.timeline.clip, frameCount: nextFrameCount, keyframes: nextKfs } } };
    });
  };

  const clearAll = () => {
    onPause();
    setStateWithHistory('pose_timeline:clear', (prev) => ({
      ...prev,
      timeline: { ...prev.timeline, enabled: false, clip: { ...prev.timeline.clip, keyframes: [] } },
    }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">Pose Timeline</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={timelinePlaying ? onPause : onPlay}
            disabled={keyframes.length < 2}
            className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
              keyframes.length >= 2 ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
            }`}
          >
            {timelinePlaying ? (
              <span className="inline-flex items-center gap-2">
                <Pause size={12} /> Pause
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Play size={12} /> Play
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onStop}
            className="px-3 py-2 rounded-lg bg-[#222] hover:bg-[#333] text-[10px] font-bold uppercase tracking-widest transition-all"
            title="Stop and return to first pose"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
        <span>Solve</span>
        <select
          value={solveMode}
          onChange={(e) => setSolveMode(e.target.value as TimelineSolveMode)}
          className="flex-1 px-2 py-2 bg-[#0a0a0a] rounded-xl text-[10px] border border-[#222] font-bold uppercase tracking-widest text-white"
        >
          <option value="auto">Auto</option>
          <option value="fk">FK</option>
          <option value="ik">IK</option>
          <option value="physics">Physics</option>
          <option value="ik+physics">IK + Physics</option>
        </select>
      </div>

      {ikModeActive && (
        <div className="grid grid-cols-3 gap-2">
          {ikGroups.map((g) => {
            const active = g.jointIds.some((id) => ikEffectors.includes(id));
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => toggleIkGroup(g.jointIds)}
                className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  active ? 'bg-white text-black' : 'bg-[#181818] hover:bg-[#222] text-[#bbb]'
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="col-span-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#666] mb-1">Inbetweens</div>
          <input
            type="number"
            min={1}
            max={48}
            value={inbetweenCount}
            onChange={(e) => setInbetweenCount(clampInt(parseInt(e.target.value || '1', 10), 1, 48))}
            className="w-full px-2 py-2 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
          />
        </div>
        <button
          type="button"
          onClick={insertInbetweens}
          disabled={keyframes.length < 2}
          className={`col-span-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
            keyframes.length >= 2 ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
          }`}
          title="Insert interpolated poses between the selected pose and the next pose"
        >
          Interpolate (Insert)
        </button>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#666]">
        <span>FPS</span>
        <input
          type="number"
          min={1}
          max={60}
          value={fps}
          onChange={(e) => {
            const next = clampInt(parseInt(e.target.value || '24', 10), 1, 60);
            setStateWithHistory('pose_timeline:set_fps', (prev) => ({
              ...prev,
              timeline: { ...prev.timeline, enabled: true, clip: { ...prev.timeline.clip, fps: next } },
            }));
          }}
          className="w-16 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
        />
        <div className="flex items-center gap-1">
          {[12, 24, 30, 60].map((v) => (
            <button
              key={`fps:${v}`}
              type="button"
              onClick={() =>
                setStateWithHistory('pose_timeline:set_fps_preset', (prev) => ({
                  ...prev,
                  timeline: { ...prev.timeline, enabled: true, clip: { ...prev.timeline.clip, fps: v } },
                }))
              }
              className={`px-2 py-1 rounded-md border text-[10px] font-mono transition-all ${
                fps === v ? 'bg-white text-black border-white' : 'bg-[#0a0a0a] text-[#bbb] border-[#222] hover:border-[#333]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[10px] text-[#666]">
          {totalFrames}f / {totalSeconds.toFixed(2)}s
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={addCurrentPose}
          className="py-2 bg-[#222] hover:bg-[#333] rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2"
        >
          <Plus size={12} /> Add Pose
        </button>
        <button
          type="button"
          onClick={updateSelectedPose}
          disabled={!keyframes.length}
          className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
            keyframes.length ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
          }`}
          title="Overwrite the selected pose with the current pose"
        >
          <ChevronsUpDown size={12} /> Set Pose
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={closeLoop}
          disabled={keyframes.length < 2}
          className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
            keyframes.length >= 2 ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
          }`}
          title="Append the first pose at the end to create a smooth loop"
        >
          <Repeat size={12} /> Close Loop
        </button>
        <button
          type="button"
          onClick={deleteSelectedPose}
          disabled={!keyframes.length}
          className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${
            keyframes.length ? 'bg-[#222] hover:bg-[#333]' : 'bg-[#181818] text-[#444] cursor-not-allowed'
          }`}
        >
          <Trash2 size={12} /> Delete
        </button>
      </div>

      <div className="space-y-2">
        {keyframes.length === 0 ? (
          <div className="text-[10px] text-[#666]">Add poses to build a pose-to-pose animation.</div>
        ) : (
          keyframes.map((k, i) => {
            const isSelected = i === selectedIndex;
            const next = keyframes[i + 1];
            const durFrames = next ? Math.max(1, next.frame - k.frame) : null;
            const durSec = durFrames != null ? durFrames / fps : null;
            return (
              <div
                key={`pose-kf:${k.frame}:${i}`}
                className={`p-2 rounded-lg border ${isSelected ? 'border-white/25 bg-white/5' : 'border-white/10 bg-[#0a0a0a]/40'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIndex(i);
                      applyTimelineFrame(k.frame);
                    }}
                    className="text-left text-[10px] font-bold uppercase tracking-widest text-[#ddd] hover:text-white transition-colors"
                    title="Jump to this pose"
                  >
                    Pose {i + 1}
                  </button>
                  <div className="font-mono text-[10px] text-[#666]">t={k.frame}</div>
                </div>
                {durFrames != null && (
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-[#666]">
                    <span className="font-bold uppercase tracking-widest text-[#666]">To next</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={durFrames}
                      onChange={(e) => {
                        const frames = clampInt(parseInt(e.target.value || '1', 10), 1, 600);
                        setDurationFrames(i, frames);
                      }}
                      className="w-20 px-2 py-1 rounded-md bg-[#0a0a0a] border border-[#222] text-white font-mono text-xs"
                    />
                    <span className="font-mono text-[10px] text-[#666]">f</span>
                    <span className="ml-auto font-mono text-[10px] text-[#666]">{durSec != null ? `${durSec.toFixed(2)}s` : ''}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={clearAll}
        className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-[#181818] hover:bg-[#222] transition-all"
      >
        Clear Pose Timeline
      </button>
    </div>
  );
}
