import React, { useMemo, useState } from 'react';
import type { SkeletonState } from '@/engine/types';
import type { SetStateWithHistory } from '@/types/state';
import { SystemGrid } from '@/components/SystemGrid';
import { MousePointer2, Check, SkipForward } from 'lucide-react';
import clsx from 'clsx';

const TARGETS: { id: string; label: string; kind: 'joint' | 'dash' }[] = [
  { id: 'head', label: 'Head', kind: 'joint' },
  { id: 'chin', label: 'Chin (dash)', kind: 'dash' },
  { id: 'neck_v', label: 'Neck V', kind: 'joint' },
  { id: 'sternum_dash', label: 'Sternum (dash)', kind: 'dash' },
  { id: 'navel', label: 'Navel', kind: 'joint' },
  { id: 'groin', label: 'Groin/Hips', kind: 'joint' },
  { id: 'knee_l', label: 'Left Knee', kind: 'joint' },
  { id: 'foot_l', label: 'Left Foot', kind: 'joint' },
];

type Props = {
  state: SkeletonState;
  setStateWithHistory: SetStateWithHistory;
};

const defaultBB = (): NonNullable<SkeletonState['boneBuilder']> => ({
  overlayDismissed: true,
  activeStep: 'Head',
  plateReadyByStep: {},
  plates: [],
  penChainJointId: null,
  snapRadiusPx: 18,
  headLenPx: 80,
  specialPoints: {},
  settings: { stance: 'single', species: 'humanoid', height: 170, torsoRatio: 50 },
});

const hydrateBB = (prev: SkeletonState): NonNullable<SkeletonState['boneBuilder']> => ({
  ...defaultBB(),
  ...(prev.boneBuilder ?? {}),
  overlayDismissed: prev.boneBuilder?.overlayDismissed ?? true,
  activeStep: prev.boneBuilder?.activeStep ?? 'Head',
  plateReadyByStep: prev.boneBuilder?.plateReadyByStep ?? {},
  plates: prev.boneBuilder?.plates ?? [],
  penChainJointId: prev.boneBuilder?.penChainJointId ?? null,
  snapRadiusPx: prev.boneBuilder?.snapRadiusPx ?? 18,
  headLenPx: prev.boneBuilder?.headLenPx ?? 80,
  settings: prev.boneBuilder?.settings ?? { stance: 'single', species: 'humanoid', height: 170, torsoRatio: 50 },
  specialPoints: prev.boneBuilder?.specialPoints ?? {},
});

export function BoneBuilderPenOverlay({ state, setStateWithHistory }: Props) {
  const [penOn, setPenOn] = useState(false);
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);

  const specialPoints = state.boneBuilder?.specialPoints ?? {};
  const headLenPx = state.boneBuilder?.headLenPx ?? 80;

  const nextIndex = useMemo(() => {
    for (let i = 0; i < TARGETS.length; i++) {
      if (!specialPoints[TARGETS[i].id]) return i;
    }
    return TARGETS.length - 1;
  }, [specialPoints]);

  const activeTarget = TARGETS[nextIndex] ?? TARGETS[TARGETS.length - 1];

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!penOn) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const target = activeTarget;
    if (!target) return;
    setStateWithHistory('bone_builder_pen', (prev) => {
      const base = hydrateBB(prev);
      const nextSpecial = { ...(base.specialPoints ?? {}) };
      nextSpecial[target.id] = { x, y, kind: target.kind };
      const { points: withAuto, stagedAdds } = autoFillLegAndArms(nextSpecial, headLenPx);

      // Stage pop-out over a few frames (milliseconds)
      stagedAdds.forEach((add, idx) => {
        window.setTimeout(() => {
          setStateWithHistory('bone_builder_pen_stage', (stagePrev) => {
            const stagedBase = hydrateBB(stagePrev);
            const stagedSpecial = stagedBase.specialPoints ?? {};
            stagedBase.specialPoints = stagedSpecial;
            if (stagedSpecial[add.id]) return stagePrev;
            const updated = {
              ...stagedBase,
              specialPoints: { ...stagedSpecial, [add.id]: add.point },
            };
            return { ...stagePrev, boneBuilder: updated };
          });
        }, 50 * (idx + 1));
      });

      return {
        ...prev,
        boneBuilder: {
          ...base,
          specialPoints: withAuto,
        },
      };
    });
  };

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!penOn) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPreview({ x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 });
  };

  const handleLeave = () => setPreview(null);

  const clearPoint = (id: string) => {
    setStateWithHistory('bone_builder_pen_clear', (prev) => {
      const base = hydrateBB(prev);
      const next = { ...(base.specialPoints ?? {}) };
      delete next[id];
      return { ...prev, boneBuilder: { ...base, specialPoints: next } };
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[70]">
      <div
        className="absolute inset-4 rounded-2xl border border-white/10 overflow-hidden"
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ pointerEvents: penOn ? 'auto' : 'none' }}
      >
        <div className="absolute inset-0 opacity-25">
          <SystemGrid />
        </div>
        <svg className="absolute inset-0 w-full h-full" viewBox="-400 -260 800 520">
          {Object.entries(specialPoints).map(([id, pt]) =>
            pt.kind === 'dash' ? (
              <line
                key={id}
                x1={pt.x - 12}
                y1={pt.y}
                x2={pt.x + 12}
                y2={pt.y}
                stroke="rgba(80,80,80,0.7)"
                strokeWidth={3}
                strokeLinecap="round"
              />
            ) : (
              <circle key={id} cx={pt.x} cy={pt.y} r={7} fill="#8ea7ff" stroke="#1f2937" strokeWidth={2} opacity={0.9} />
            ),
          )}
          {preview && penOn && activeTarget && (
            activeTarget.kind === 'dash' ? (
              <line
                x1={preview.x - 12}
                y1={preview.y}
                x2={preview.x + 12}
                y2={preview.y}
                stroke="rgba(120,120,120,0.4)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray="6 4"
              />
            ) : (
              <circle cx={preview.x} cy={preview.y} r={7} fill="rgba(142,167,255,0.4)" />
            )
          )}
        </svg>
      </div>

      <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 bg-black/75 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3 text-xs text-white shadow-lg">
        <button
          onClick={() => setPenOn((v) => !v)}
          className={clsx('inline-flex items-center gap-2 px-3 py-2 rounded-lg border', penOn ? 'bg-white text-black border-white' : 'border-white/30 text-white')}
        >
          <MousePointer2 size={14} />
          Pen (plates)
        </button>
        <span className="text-[#9ad5ff]">Target: {activeTarget?.label ?? 'All set'}</span>
        <span className="text-[#888]">Click to place; dash targets render thin gray lines.</span>
        <button
          onClick={() => {
            if (activeTarget) {
              setStateWithHistory('bone_builder_pen_skip', (prev) => {
                const base = hydrateBB(prev);
                const nextSpecial = { ...(base.specialPoints ?? {}) };
                nextSpecial[activeTarget.id] = { x: 0, y: 0, kind: activeTarget.kind };
                const { points: withAuto, stagedAdds } = autoFillLegAndArms(nextSpecial, headLenPx);
                stagedAdds.forEach((add, idx) => {
                  window.setTimeout(() => {
                    setStateWithHistory('bone_builder_pen_stage', (stagePrev) => {
                      const stagedBase = hydrateBB(stagePrev);
                      const stagedSpecial = stagedBase.specialPoints ?? {};
                      stagedBase.specialPoints = stagedSpecial;
                      if (stagedSpecial[add.id]) return stagePrev;
                      const updated = {
                        ...stagedBase,
                        specialPoints: { ...stagedSpecial, [add.id]: add.point },
                      };
                      return { ...stagePrev, boneBuilder: updated };
                    });
                  }, 50 * (idx + 1));
                });
                return {
                  ...prev,
                  boneBuilder: {
                    ...base,
                    specialPoints: withAuto,
                  },
                };
              });
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 border border-white/15"
        >
          <SkipForward size={12} /> Skip
        </button>
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap gap-2 justify-center max-w-3xl">
        {TARGETS.map((t) => {
          const placed = Boolean(specialPoints[t.id]);
          return (
            <div key={t.id} className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs', placed ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/15 bg-black/40')}>
              <span className="font-semibold">{t.label}</span>
              {placed ? (
                <button onClick={() => clearPoint(t.id)} className="inline-flex items-center gap-1 text-emerald-200">
                  <Check size={12} /> Clear
                </button>
              ) : (
                <span className="text-[#777]">Pending</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function autoFillLegAndArms(
  points: Record<string, { x: number; y: number; kind: 'joint' | 'dash' }>,
  headLen: number,
): { points: Record<string, { x: number; y: number; kind: 'joint' | 'dash' }>; stagedAdds: { id: string; point: { x: number; y: number; kind: 'joint' } }[] } {
  const groin = points['groin'];
  const kneeL = points['knee_l'];
  const footL = points['foot_l'];
  const stagedAdds: { id: string; point: { x: number; y: number; kind: 'joint' } }[] = [];

  // Mirror leg
  if (groin && kneeL && footL) {
    points['knee_r'] = points['knee_r'] ?? { ...kneeL, x: -kneeL.x, kind: 'joint' };
    points['foot_r'] = points['foot_r'] ?? { ...footL, x: -footL.x, kind: 'joint' };
    stagedAdds.push({ id: 'knee_r', point: points['knee_r'] as any });
    stagedAdds.push({ id: 'foot_r', point: points['foot_r'] as any });
  }

  // Auto arms
  const head = points['head'];
  const neck = points['neck_v'];
  const sternum = points['sternum_dash'];
  if (groin && head && neck && sternum && kneeL && footL) {
    const shoulderY = (neck.y + sternum.y) / 2 + headLen * 0.2;
    const legLen =
      Math.hypot(groin.x - kneeL.x, groin.y - kneeL.y) +
      Math.hypot(kneeL.x - footL.x, kneeL.y - footL.y);
    const upper = legLen * 0.45;
    const lower = legLen * 0.35;
    const shoulderX = Math.max(Math.abs(head.x), headLen * 0.6) + 20;

    const shoulderL = { x: -shoulderX, y: shoulderY, kind: 'joint' as const };
    const shoulderR = { x: shoulderX, y: shoulderY, kind: 'joint' as const };
    const elbowL = { x: shoulderL.x, y: shoulderL.y + upper, kind: 'joint' as const };
    const wristL = { x: elbowL.x, y: elbowL.y + lower, kind: 'joint' as const };
    const elbowR = { x: shoulderR.x, y: shoulderR.y + upper, kind: 'joint' as const };
    const wristR = { x: elbowR.x, y: elbowR.y + lower, kind: 'joint' as const };

    points['shoulder_l'] = points['shoulder_l'] ?? shoulderL;
    points['shoulder_r'] = points['shoulder_r'] ?? shoulderR;
    points['elbow_l'] = points['elbow_l'] ?? elbowL;
    points['elbow_r'] = points['elbow_r'] ?? elbowR;
    points['wrist_l'] = points['wrist_l'] ?? wristL;
    points['wrist_r'] = points['wrist_r'] ?? wristR;

    stagedAdds.push(
      { id: 'shoulder_l', point: shoulderL },
      { id: 'shoulder_r', point: shoulderR },
      { id: 'elbow_l', point: elbowL },
      { id: 'elbow_r', point: elbowR },
      { id: 'wrist_l', point: wristL },
      { id: 'wrist_r', point: wristR },
    );
  }

  return { points, stagedAdds };
}
