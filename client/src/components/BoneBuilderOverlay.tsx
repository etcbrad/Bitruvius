import React, { useMemo, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SystemGrid } from '@/components/SystemGrid';
import { Sparkles, Wand2, ChevronRight, Info } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'wouter';
import type { SkeletonState } from '@/engine/types';
import type { SetStateWithHistory } from '@/types/state';

type Stance = 'single' | 'dual';
type Species = 'humanoid' | 'quadruped' | 'winged' | 'serpentine' | 'custom';

type Props = {
  state: SkeletonState;
  setStateWithHistory: SetStateWithHistory;
  onLaunchStudio?: () => void;
};

const defaultBoneBuilder = (): NonNullable<SkeletonState['boneBuilder']> => ({
  overlayDismissed: false,
  activeStep: 'Head',
  plateReadyByStep: {},
  plates: [],
  penChainJointId: null,
  snapRadiusPx: 18,
  headLenPx: 80,
  specialPoints: {},
  settings: { stance: 'single', species: 'humanoid', height: 170, torsoRatio: 50 },
});

export function BoneBuilderOverlay({ state, setStateWithHistory, onLaunchStudio }: Props) {
  const bb = state.boneBuilder ?? defaultBoneBuilder();
  const [stance, setStance] = useState<Stance>(bb.settings.stance);
  const [species, setSpecies] = useState<Species>(bb.settings.species);
  const [height, setHeight] = useState<number>(bb.settings.height);
  const [torsoRatio, setTorsoRatio] = useState<number>(bb.settings.torsoRatio);

  const hasResume = useMemo(() => Boolean(bb.overlayDismissed || bb.plates?.length), [bb]);
  const open = !bb.overlayDismissed;

  const persist = (nextOverlayDismissed: boolean) => {
    setStateWithHistory('bone_builder_overlay', (prev) => ({
      ...prev,
      boneBuilder: {
        ...(prev.boneBuilder ?? defaultBoneBuilder()),
        overlayDismissed: nextOverlayDismissed,
        settings: { stance, species, height, torsoRatio },
      },
    }));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center text-white">
      <div className="absolute inset-0 bg-black/65 backdrop-blur" />
      <div className="absolute inset-0 opacity-35 pointer-events-none">
        <SystemGrid />
      </div>
      <div className="relative w-full max-w-5xl mx-auto px-6">
        <div className="rounded-3xl border border-white/15 bg-[#0c0d12]/95 shadow-2xl p-8 space-y-8">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-[#8ea7ff]">Bitruvius • Bone Builder</p>
              <h1 className="text-3xl font-bold mt-1">Lay rigid plates from head to toe</h1>
              <p className="text-sm text-[#bbb]">Pick a base stance, drop joints with the pen, mirror limbs—without hiding the scene.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#aaa] bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
              <Info size={14} /> Hover tips on every control.
            </div>
          </header>

          <div className="grid md:grid-cols-3 gap-6">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-white/30 hover:-translate-y-0.5"
                  onClick={() => persist(true)}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Connected manikin system</h2>
                    <Sparkles className="text-amber-300" size={18} />
                  </div>
                  <p className="text-sm text-[#aaa] mt-2">Streamlined, left-console flow that keeps the current rig in sync while you add plates.</p>
                  <div className="mt-4 inline-flex items-center gap-2 text-xs text-emerald-200 font-semibold">
                    <ChevronRight size={14} /> Start building plates
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent className="text-[11px] max-w-xs">Keeps the current rig in view; overlay closes.</TooltipContent>
            </Tooltip>

            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Create a character</h2>
                <Wand2 className="text-sky-300" size={18} />
              </div>
              <label className="flex items-center justify-between text-sm text-[#ccc]">
                <span>Stance</span>
                <div className="inline-flex gap-2 text-xs">
                  <button className={clsx('px-3 py-1 rounded-md border', stance === 'single' ? 'border-white bg-white text-black' : 'border-white/20 text-white')} onClick={() => setStance('single')}>Single hip</button>
                  <button className={clsx('px-3 py-1 rounded-md border', stance === 'dual' ? 'border-white bg-white text-black' : 'border-white/20 text-white')} onClick={() => setStance('dual')}>Dual hip</button>
                </div>
              </label>
              <label className="flex items-center justify-between text-sm text-[#ccc]">
                <span>Species</span>
                <select value={species} onChange={(e) => setSpecies(e.target.value as Species)} className="bg-black border border-white/15 rounded-md px-3 py-2 text-sm">
                  <option value="humanoid">Humanoid</option>
                  <option value="quadruped">Quadruped</option>
                  <option value="winged">Winged</option>
                  <option value="serpentine">Serpentine</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="flex items-center justify-between text-sm text-[#ccc]">
                <span>Height</span>
                <input type="range" min={120} max={220} value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-40" />
                <span className="text-xs text-[#888]">{height} cm</span>
              </label>
              <label className="flex items-center justify-between text-sm text-[#ccc]">
                <span>Torso ratio</span>
                <input type="range" min={30} max={65} value={torsoRatio} onChange={(e) => setTorsoRatio(Number(e.target.value))} className="w-40" />
                <span className="text-xs text-[#888]">{torsoRatio}%</span>
              </label>
              <button className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black px-4 py-3 text-sm font-semibold hover:bg-white/90" onClick={() => persist(true)}>
                Build from wizard <ChevronRight size={14} />
              </button>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/studio"
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-3 hover:border-white/30"
                  onClick={() => {
                    persist(true);
                    onLaunchStudio?.();
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Default manikin</h2>
                    <Sparkles className="text-emerald-300" size={18} />
                  </div>
                  <p className="text-sm text-[#aaa]">Jump to the standard studio layout with the baseline manikin loaded.</p>
                  <div className="mt-2 text-xs text-[#9ad5ff]">/studio</div>
                </Link>
              </TooltipTrigger>
              <TooltipContent className="text-[11px] max-w-xs">Keeps your current rig and widgets—no overlay.</TooltipContent>
            </Tooltip>
          </div>

          <div className="text-xs text-[#888]">Overlay lives on top of the real canvas so you can still see the rig while making choices.</div>
          {hasResume && <div className="text-xs text-emerald-200">Resume available: previous plates or settings detected.</div>}
        </div>
      </div>
    </div>
  );
}
