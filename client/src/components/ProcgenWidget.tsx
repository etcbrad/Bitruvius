import React, { useCallback } from 'react';
import { capturePoseSnapshot } from '../engine/timeline';
import { DEFAULT_PROCEDURAL_BITRUVIAN_GAIT } from '../engine/bitruvian/types';
import type { ProcgenMode, SkeletonState } from '../engine/types';
import type { WalkingEngineGait } from '../engine/bitruvian/types';

const modeLabel: Record<ProcgenMode, string> = {
  idle: 'Idle',
  walk_in_place: 'Walk',
  run_in_place: 'Run',
};

const recommendedCycleFrames: Record<ProcgenMode, number> = {
  idle: 120,
  walk_in_place: 48,
  run_in_place: 32,
};

const speedPresets: Record<ProcgenMode, { slow: number; normal: number; fast: number }> = {
  idle: { slow: 180, normal: 120, fast: 90 },
  walk_in_place: { slow: 64, normal: 48, fast: 32 },
  run_in_place: { slow: 48, normal: 32, fast: 24 },
};

const intensityPresets: Record<'light' | 'normal' | 'hard', Partial<WalkingEngineGait>> = {
  light: { intensity: 0.35, stride: 0.5, kick_up_force: 0.25 },
  normal: { intensity: 0.6, stride: 0.7, kick_up_force: 0.4 },
  hard: { intensity: 1.05, stride: 1.0, kick_up_force: 0.65 },
};

const GAIT_CONFIG_ORDER: Array<{ key: keyof WalkingEngineGait; label: string; min: number; max: number; step: number }> = [
  { key: 'intensity', label: 'Intensity', min: 0, max: 2, step: 0.01 },
  { key: 'stride', label: 'Stride', min: 0, max: 2, step: 0.01 },
  { key: 'gravity', label: 'Gravity', min: 0, max: 1, step: 0.01 },
  { key: 'hover_height', label: 'Hover Height', min: 0, max: 1, step: 0.01 },
  { key: 'hip_sway', label: 'Hip Sway', min: 0, max: 1.5, step: 0.01 },
  { key: 'waist_twist', label: 'Waist Twist', min: 0, max: 1.5, step: 0.01 },
  { key: 'torso_swivel', label: 'Torso Swivel', min: 0, max: 1.5, step: 0.01 },
  { key: 'lean', label: 'Lean', min: -1, max: 1, step: 0.01 },
  { key: 'arm_swing', label: 'Arm Swing', min: 0, max: 2, step: 0.01 },
  { key: 'arm_spread', label: 'Arm Spread', min: 0, max: 1, step: 0.01 },
  { key: 'elbow_bend', label: 'Elbow Bend', min: 0, max: 1.5, step: 0.01 },
  { key: 'elbowFlexibility', label: 'Elbow Flex', min: 0, max: 1, step: 0.01 },
  { key: 'foot_roll', label: 'Foot Roll', min: 0, max: 1, step: 0.01 },
  { key: 'kick_up_force', label: 'Kick Up', min: 0, max: 1, step: 0.01 },
  { key: 'head_spin', label: 'Head Spin', min: -1, max: 1, step: 0.01 },
];

export function ProcgenWidget(props: {
  state: SkeletonState;
  setTimelinePlaying: (playing: boolean) => void;
  setStateWithHistory: (actionId: string, update: (prev: SkeletonState) => SkeletonState) => void;
  captureProcgenNeutralFromCurrent: () => void;
  resetProcgenNeutralToTPose: () => void;
  resetProcgenPhase: () => void;
  requestProcgenBake: () => void;
}) {
  const {
    state,
    setTimelinePlaying,
    setStateWithHistory,
    captureProcgenNeutralFromCurrent,
    resetProcgenNeutralToTPose,
    resetProcgenPhase,
    requestProcgenBake,
  } = props;

  const setModeAndWatch = useCallback(
    (mode: ProcgenMode) => {
      setTimelinePlaying(false);
      setStateWithHistory('procgen:watch_preset', (prev) => {
        const neutralPose = prev.procgen.neutralPose ?? capturePoseSnapshot(prev.joints, 'preview');
        return {
          ...prev,
          showJoints: true,
          procgen: {
            ...prev.procgen,
            enabled: true,
            mode,
            neutralPose,
            bake: {
              ...prev.procgen.bake,
              cycleFrames: recommendedCycleFrames[mode] || prev.procgen.bake.cycleFrames,
            },
          },
        };
      });
    },
    [setStateWithHistory, setTimelinePlaying],
  );

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-[#666]">Procedural Motion</div>

      <label className="flex items-center justify-between gap-3 p-2 bg-[#181818] rounded-lg border border-white/5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#bbb]">Enabled</span>
        <input
          type="checkbox"
          checked={state.procgen.enabled}
          onChange={(e) => {
            const nextEnabled = e.target.checked;
            if (nextEnabled) setTimelinePlaying(false);
            setStateWithHistory('procgen:enabled', (prev) => ({
              ...prev,
              showJoints: nextEnabled ? true : prev.showJoints,
              procgen: {
                ...prev.procgen,
                enabled: nextEnabled,
                neutralPose: nextEnabled ? (prev.procgen.neutralPose ?? capturePoseSnapshot(prev.joints, 'preview')) : prev.procgen.neutralPose,
              },
            }));
          }}
          className="accent-white"
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(modeLabel) as ProcgenMode[]).map((mode) => {
          const active = state.procgen.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setModeAndWatch(mode)}
              className={[
                'py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border',
                active ? 'bg-white text-black border-white' : 'bg-[#222] hover:bg-[#333] border-[#333]',
              ].join(' ')}
              title="Set mode and start preview"
            >
              {modeLabel[mode]}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-[#666]">Speed</label>
          <div className="flex bg-[#181818] rounded-lg border border-white/5 overflow-hidden">
            {(['slow', 'normal', 'fast'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTimelinePlaying(false);
                  setStateWithHistory(`procgen:speed:${k}`, (prev) => ({
                    ...prev,
                    procgen: {
                      ...prev.procgen,
                      bake: { ...prev.procgen.bake, cycleFrames: speedPresets[prev.procgen.mode][k] },
                    },
                  }));
                }}
                className="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest bg-[#181818] hover:bg-[#222] border-r border-white/5 last:border-r-0"
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#666]">Intensity</label>
          <div className="flex bg-[#181818] rounded-lg border border-white/5 overflow-hidden">
            {(['light', 'normal', 'hard'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTimelinePlaying(false);
                  setStateWithHistory(`procgen:intensity:${k}`, (prev) => ({
                    ...prev,
                    procgen: {
                      ...prev.procgen,
                      gait: { ...prev.procgen.gait, ...intensityPresets[k] },
                    },
                  }));
                }}
                className="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest bg-[#181818] hover:bg-[#222] border-r border-white/5 last:border-r-0"
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-[#666]">Strength</label>
          <input
            type="number"
            min={0}
            max={3}
            step={0.05}
            value={state.procgen.strength}
            onChange={(e) =>
              setStateWithHistory('procgen:strength', (prev) => ({
                ...prev,
                procgen: { ...prev.procgen, strength: parseFloat(e.target.value) || 0 },
              }))
            }
            className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#666]">Cycle (frames)</label>
          <input
            type="number"
            min={2}
            max={600}
            step={1}
            value={state.procgen.bake.cycleFrames}
            onChange={(e) =>
              setStateWithHistory('procgen:cycleFrames', (prev) => ({
                ...prev,
                procgen: {
                  ...prev.procgen,
                  bake: { ...prev.procgen.bake, cycleFrames: parseInt(e.target.value || '0', 10) || 2 },
                },
              }))
            }
            className="w-full px-2 py-1 bg-[#222] rounded text-[10px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] text-[#666]">Seed</label>
          <input
            type="number"
            min={1}
            max={0x7fffffff}
            step={1}
            value={state.procgen.seed}
            onChange={(e) =>
              setStateWithHistory('procgen:seed', (prev) => ({
                ...prev,
                procgen: { ...prev.procgen, seed: Math.max(1, Math.floor(parseInt(e.target.value || '1', 10) || 1)) },
              }))
            }
            className="w-full px-2 py-1 bg-[#222] rounded text-[10px] font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-[#666]">Randomize</label>
          <button
            type="button"
            onClick={() =>
              setStateWithHistory('procgen:seed_random', (prev) => ({
                ...prev,
                procgen: { ...prev.procgen, seed: (1 + Math.floor(Math.random() * 0x7ffffffe)) | 0 },
              }))
            }
            className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all bg-[#222] hover:bg-[#333] border border-[#333]"
          >
            New Seed
          </button>
        </div>
      </div>

      <details className="bg-[#121212] rounded-lg border border-white/5">
        <summary className="cursor-pointer select-none px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#bbb]">
          Gait Controls
        </summary>
        <div className="p-3 space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setStateWithHistory('procgen:gait_reset', (prev) => ({
                  ...prev,
                  procgen: { ...prev.procgen, gait: { ...DEFAULT_PROCEDURAL_BITRUVIAN_GAIT }, gaitEnabled: {} },
                }))
              }
              className="flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all bg-[#222] hover:bg-[#333] border border-[#333]"
            >
              Reset Gait
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto pr-1 space-y-3">
            {GAIT_CONFIG_ORDER.map((conf) => {
              const enabled = state.procgen.gaitEnabled?.[conf.key] !== false;
              const value = state.procgen.gait[conf.key];
              return (
                <div key={String(conf.key)} className="space-y-1">
                  <div className="flex items-center justify-between text-[9px] uppercase text-[#666]">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => {
                          setStateWithHistory(`procgen:gaitEnabled:${String(conf.key)}`, (prev) => ({
                            ...prev,
                            procgen: {
                              ...prev.procgen,
                              gaitEnabled: {
                                ...prev.procgen.gaitEnabled,
                                [conf.key]: prev.procgen.gaitEnabled?.[conf.key] === false,
                              },
                            },
                          }));
                        }}
                        className="accent-white"
                      />
                      <span className={enabled ? 'text-[#bbb]' : 'text-[#555] line-through'}>{conf.label}</span>
                    </label>
                    <span className="font-mono text-[#bbb]">{typeof value === 'number' ? value.toFixed(2) : '—'}</span>
                  </div>
                  <input
                    type="range"
                    min={conf.min}
                    max={conf.max}
                    step={conf.step}
                    value={typeof value === 'number' ? value : 0}
                    disabled={!enabled}
                    onPointerDownCapture={(e) => e.stopPropagation()}
                    onMouseDownCapture={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const next = parseFloat(e.target.value);
                      setStateWithHistory(`procgen:gait:${String(conf.key)}`, (prev) => ({
                        ...prev,
                        procgen: {
                          ...prev.procgen,
                          gait: { ...prev.procgen.gait, [conf.key]: Number.isFinite(next) ? next : prev.procgen.gait[conf.key] },
                        },
                      }));
                    }}
                    className={`w-full h-1 rounded-full appearance-none cursor-pointer accent-white bg-[#222] ${enabled ? 'opacity-100' : 'opacity-40'}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </details>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex items-center justify-between gap-2 px-2 py-2 bg-[#181818] rounded-lg border border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#bbb]">In Place</span>
          <input
            type="checkbox"
            checked={state.procgen.options.inPlace}
            onChange={() =>
              setStateWithHistory('procgen:opt:inPlace', (prev) => ({
                ...prev,
                procgen: {
                  ...prev.procgen,
                  options: { ...prev.procgen.options, inPlace: !prev.procgen.options.inPlace },
                },
              }))
            }
            className="accent-white"
          />
        </label>

        <label className="flex items-center justify-between gap-2 px-2 py-2 bg-[#181818] rounded-lg border border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#bbb]">Grounding</span>
          <input
            type="checkbox"
            checked={state.procgen.options.groundingEnabled}
            onChange={() =>
              setStateWithHistory('procgen:opt:grounding', (prev) => ({
                ...prev,
                procgen: {
                  ...prev.procgen,
                  options: { ...prev.procgen.options, groundingEnabled: !prev.procgen.options.groundingEnabled },
                },
              }))
            }
            className="accent-white"
          />
        </label>

        <label className="flex items-center justify-between gap-2 px-2 py-2 bg-[#181818] rounded-lg border border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#bbb]">Pause Drag</span>
          <input
            type="checkbox"
            checked={state.procgen.options.pauseWhileDragging}
            onChange={() =>
              setStateWithHistory('procgen:opt:pauseWhileDragging', (prev) => ({
                ...prev,
                procgen: {
                  ...prev.procgen,
                  options: { ...prev.procgen.options, pauseWhileDragging: !prev.procgen.options.pauseWhileDragging },
                },
              }))
            }
            className="accent-white"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 px-2 py-2 bg-[#181818] rounded-lg border border-white/5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-[#bbb]">Ground Line</span>
          <input
            type="checkbox"
            checked={state.procgen.options.groundPlaneVisible}
            onChange={() =>
              setStateWithHistory('procgen:opt:groundPlaneVisible', (prev) => ({
                ...prev,
                procgen: {
                  ...prev.procgen,
                  options: { ...prev.procgen.options, groundPlaneVisible: !prev.procgen.options.groundPlaneVisible },
                },
              }))
            }
            className="accent-white"
          />
        </label>

        <div className="space-y-1">
          <label className="text-[10px] text-[#666]">Ground Y</label>
          <input
            type="number"
            min={-200}
            max={200}
            step={0.25}
            value={state.procgen.options.groundPlaneY}
            onChange={(e) => {
              const raw = parseFloat(e.target.value);
              const next = Number.isFinite(raw) ? Math.max(-200, Math.min(200, raw)) : 0;
              setStateWithHistory('procgen:opt:groundPlaneY', (prev) => ({
                ...prev,
                procgen: { ...prev.procgen, options: { ...prev.procgen.options, groundPlaneY: next } },
              }));
            }}
            className="w-full px-2 py-1 bg-[#222] rounded text-[10px] font-mono"
            title="Drag the ground line on the canvas to adjust visually"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={captureProcgenNeutralFromCurrent}
          className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333] border border-[#333]"
        >
          Capture Neutral
        </button>
        <button
          type="button"
          onClick={resetProcgenNeutralToTPose}
          className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333] border border-[#333]"
        >
          Neutral = T-Pose
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={resetProcgenPhase}
          className="py-2 rounded-lg text-[10px] font-bold uppercase transition-all bg-[#222] hover:bg-[#333] border border-[#333]"
        >
          Reset Phase
        </button>
        <button
          type="button"
          onClick={requestProcgenBake}
          className="py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all bg-[#2b0057] hover:bg-[#3a007a] border border-[#333]"
          title="Bake one loop into timeline keyframes"
        >
          Bake
        </button>
      </div>
    </div>
  );
}
