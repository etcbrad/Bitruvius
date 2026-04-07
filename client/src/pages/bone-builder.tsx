import React, { useState } from 'react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { ChevronRight, Sparkles, Wand2, Copy, MousePointer2, GitBranch, ArrowLeftRight, Info } from 'lucide-react';
import clsx from 'clsx';
import { SystemGrid } from '@/components/SystemGrid';
import { Link } from 'wouter';

type Joint2D = { id: string; x: number; y: number };
type Plate2D = { id: string; jointIds: string[]; step: StepId };

type Stance = 'single' | 'dual';
type Species = 'humanoid' | 'quadruped' | 'winged' | 'serpentine' | 'custom';

const STEPS = ['Head', 'Shoulders', 'Arms', 'Torso', 'Pelvis', 'Leg', 'Foot', 'Extras'] as const;
type StepId = (typeof STEPS)[number];

type Mannequin = { id: string; name: string; blurb: string };
const DEFAULT_MANNEQUINS: Mannequin[] = [
  { id: 'default', name: 'Default Mannequin', blurb: 'Neutral proportions, ready for rigid plates.' },
  { id: 'lite', name: 'Lightweight', blurb: 'Simplified joints for quick blocking.' },
];

export default function BoneBuilderPage() {
  const storageKey = 'btv:bone-builder:last';
  const saved = (() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const [stage, setStage] = useState<'landing' | 'builder'>('builder');
  const [selectedMannequin, setSelectedMannequin] = useState<Mannequin>(() => {
    const found = DEFAULT_MANNEQUINS.find((m) => m.id === saved?.mannequinId);
    return found ?? DEFAULT_MANNEQUINS[0]!;
  });
  const [stance, setStance] = useState<Stance>(saved?.stance ?? 'single');
  const [species, setSpecies] = useState<Species>(saved?.species ?? 'humanoid');
  const [height, setHeight] = useState(saved?.height ?? 170);
  const [torsoRatio, setTorsoRatio] = useState(saved?.torsoRatio ?? 50);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [plateReady, setPlateReady] = useState<Record<StepId, boolean>>({
    Head: false,
    Shoulders: false,
    Arms: false,
    Torso: false,
    Pelvis: false,
    Leg: false,
    Foot: false,
    Extras: false,
  });
  const [confirmed, setConfirmed] = useState<Record<StepId, boolean>>({
    Head: false,
    Shoulders: false,
    Arms: false,
    Torso: false,
    Pelvis: false,
    Leg: false,
    Foot: false,
    Extras: false,
  });
  const [penEnabled, setPenEnabled] = useState(false);
  const [legMirrored, setLegMirrored] = useState(false);
  const [legOrigin, setLegOrigin] = useState<'shared' | 'separate' | null>(null);
  const [armMirrored, setArmMirrored] = useState(false);
  const [armOrigin, setArmOrigin] = useState<'shared' | 'separate' | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(() => !saved?.started);

  // lightweight viewport data (decoupled from core engine for now)
  const HEAD_LEN = 80;
  const SNAP_RADIUS = 18;
  const [joints, setJoints] = useState<Joint2D[]>([
    { id: 'root', x: 0, y: 0 },
  ]);
  const [plates, setPlates] = useState<Plate2D[]>([]);
  const [penChain, setPenChain] = useState<Joint2D | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  const currentStep = STEPS[currentStepIndex];

  const canAdvance = plateReady[currentStep];

  const setConfirmedStep = (step: StepId, value: boolean) => {
    setConfirmed((prev) => ({ ...prev, [step]: value }));
  };

  const setPlateReadyStep = (step: StepId, value: boolean) => {
    setPlateReady((prev) => ({ ...prev, [step]: value }));
  };

  const goNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    }
  };

  const handleConfirmStep = (step: StepId) => {
    if (!plateReady[step]) return;
    setConfirmedStep(step, true);

    // Mirror prompts
    if (step === 'Leg') {
      if (!legMirrored) {
        setLegOrigin(null); // trigger prompt UI
      } else {
        goNext();
      }
      return;
    }
    if (step === 'Arms') {
      if (!armMirrored) {
        setArmOrigin(null);
      } else {
        goNext();
      }
      return;
    }

    goNext();
  };

  const startBuilder = (mannequin: Mannequin) => {
    setSelectedMannequin(mannequin);
    setStage('builder');
    setOverlayOpen(false);
    persist({ mannequinId: mannequin.id, stance, species, height, torsoRatio, stage: 'builder', started: true });
  };

  const beginFromWizard = () => {
    setStage('builder');
    setOverlayOpen(false);
    persist({ mannequinId: selectedMannequin.id, stance, species, height, torsoRatio, stage: 'builder', started: true });
  };

  const persist = (data: Partial<{ mannequinId: string; stance: Stance; species: Species; height: number; torsoRatio: number; stage: 'landing' | 'builder'; started: boolean }>) => {
    try {
      const next = {
        mannequinId: data.mannequinId ?? selectedMannequin.id,
        stance: data.stance ?? stance,
        species: data.species ?? species,
        height: data.height ?? height,
        torsoRatio: data.torsoRatio ?? torsoRatio,
        stage: data.stage ?? stage,
        started: data.started ?? !overlayOpen,
      };
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const ghostBadge = (label: string, origin: 'shared' | 'separate' | null) => {
    if (!origin) return null;
    return (
      <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold',
        origin === 'shared' ? 'bg-emerald-900/60 text-emerald-200' : 'bg-sky-900/60 text-sky-200')}
      >
        <ArrowLeftRight size={12} /> {label} • {origin === 'shared' ? 'Shared origin' : 'Separate origin'}
      </span>
    );
  };

  const renderLanding = () => {
    const hasResume = !!saved;
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="absolute inset-0 bg-black/55 backdrop-blur" />
        <div className="relative w-full max-w-5xl mx-auto px-6 py-10 pointer-events-auto">
          <div className="absolute inset-0 opacity-30 -z-10"><SystemGrid /></div>
          <div className="relative mx-auto max-w-6xl px-6 py-8 flex flex-col gap-10 rounded-3xl border border-white/15 bg-[#0c0d12]/95 shadow-2xl">
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-[#8ea7ff]">Bitruvius • Bone Builder</p>
              <h1 className="text-3xl font-bold mt-2">Choose a mannequin or create a character</h1>
              <p className="text-sm text-[#bbb] mt-2">Masks act as rigid plates between joints. Start from a mannequin or craft a new stance before building head-to-toe.</p>
            </div>
            <div className="flex items-center gap-3 text-[#aaa] text-xs bg-white/5 border border-white/10 px-3 py-2 rounded-xl">
              <Info size={16} /> Hover tips are available on every tool.
            </div>
          </header>

          {hasResume && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
              <div>
                Resume last build: {saved?.mannequinId ?? 'mannequin'} • {saved?.stance ?? 'single'} stance
              </div>
              <button
                className="px-3 py-2 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
                onClick={() => setStage('builder')}
              >Resume</button>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
            {DEFAULT_MANNEQUINS.map((m) => (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => startBuilder(m)}
                    className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left transition hover:border-white/30 hover:-translate-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">{m.name}</h2>
                      <Sparkles className="text-amber-300" size={18} />
                    </div>
                    <p className="text-sm text-[#aaa] mt-2">{m.blurb}</p>
                    <div className="mt-4 flex items-center gap-3 text-xs text-emerald-200 font-semibold">
                      <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-black font-semibold hover:bg-white/90" onClick={(e) => { e.stopPropagation(); startBuilder(m); }}>
                        Build plates <ChevronRight size={14} />
                      </button>
                      <Link href="/studio" className="inline-flex items-center gap-1 text-[#9ad5ff] hover:text-white">
                        Launch studio
                      </Link>
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[11px] max-w-xs">
                  Load this mannequin and jump into plate building.
                </TooltipContent>
              </Tooltip>
            ))}

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Create a character</h2>
                    <Wand2 className="text-sky-300" size={18} />
                  </div>

                  <div className="space-y-3 text-sm">
                    <label className="flex items-center justify-between gap-2 text-[#ccc]">
                      <span>Stance</span>
                      <div className="inline-flex gap-2 text-xs">
                        <button
                          className={clsx('px-3 py-1 rounded-md border', stance === 'single' ? 'border-white bg-white text-black' : 'border-white/20 text-white')}
                          onClick={() => setStance('single')}
                        >Single hip</button>
                        <button
                          className={clsx('px-3 py-1 rounded-md border', stance === 'dual' ? 'border-white bg-white text-black' : 'border-white/20 text-white')}
                          onClick={() => setStance('dual')}
                        >Dual hip</button>
                      </div>
                    </label>

                    <label className="flex items-center justify-between gap-2 text-[#ccc]">
                      <span>Species preset</span>
                      <select
                        className="bg-black border border-white/15 rounded-md px-3 py-2 text-sm"
                        value={species}
                        onChange={(e) => setSpecies(e.target.value as Species)}
                      >
                        <option value="humanoid">Humanoid</option>
                        <option value="quadruped">Quadruped</option>
                        <option value="winged">Winged</option>
                        <option value="serpentine">Serpentine</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[#ccc]"><span>Height</span><span className="text-xs text-[#999]">{height} cm</span></div>
                      <Slider value={[height]} min={120} max={220} step={1} onValueChange={(v) => setHeight(v[0] ?? height)} />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[#ccc]"><span>Torso ratio</span><span className="text-xs text-[#999]">{torsoRatio}%</span></div>
                      <Slider value={[torsoRatio]} min={30} max={65} step={1} onValueChange={(v) => setTorsoRatio(v[0] ?? torsoRatio)} />
                    </div>
                  </div>

                  <button
                    onClick={beginFromWizard}
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-white text-black px-4 py-3 text-sm font-semibold hover:bg-white/90"
                  >
                    Build from wizard <ChevronRight size={16} />
                  </button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-[11px] max-w-xs">
                Pick stance and proportions, then start rigging.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex items-center gap-4 backdrop-blur">
            <div className="h-16 w-28 rounded-xl bg-black/50 overflow-hidden" aria-hidden>
              <SystemGrid />
            </div>
            <div className="flex-1">
              <p className="text-sm text-[#aaa]">Rigid plate concept demo</p>
              <p className="text-xs text-[#777]">Use the pen to drop joints a head-length apart; mirror legs/arms as you save plates.</p>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStepper = () => {
    return (
      <ol className="flex flex-col gap-2">
        {STEPS.map((step, idx) => {
          const active = idx === currentStepIndex;
          const done = confirmed[step];
          const locked = idx > currentStepIndex;
          return (
            <Tooltip key={step}>
              <TooltipTrigger asChild>
                <button
                  disabled={locked}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={clsx(
                    'w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                    active ? 'border-white text-white bg-white/10' : 'border-white/10 text-[#ccc]',
                    locked && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={clsx('h-2 w-2 rounded-full', done ? 'bg-emerald-300' : active ? 'bg-white' : 'bg-white/30')} />
                    <span>{step}</span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-[11px] max-w-xs">
                Define the rigid plate for this region to advance.
              </TooltipContent>
            </Tooltip>
          );
        })}
      </ol>
    );
  };

  const renderMirrorPrompt = (kind: 'leg' | 'arm') => {
    const isLeg = kind === 'leg';
    const mirrored = isLeg ? legMirrored : armMirrored;
    const origin = isLeg ? legOrigin : armOrigin;
    if (mirrored) return null;
    const awaitingChoice = origin === null;
    if (!awaitingChoice) return null;
    return (
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Copy size={14} /> Clone & mirror {isLeg ? 'leg' : 'arm'}?
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="px-3 py-2 rounded-lg bg-emerald-500 text-black font-semibold"
                onClick={() => {
                  if (isLeg) {
                    setLegMirrored(true);
                    setLegOrigin('shared');
                  } else {
                    setArmMirrored(true);
                    setArmOrigin('shared');
                  }
                  goNext();
                }}
              >Shared origin</button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">Shared hip/shoulder for centered rigs.</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="px-3 py-2 rounded-lg bg-sky-500 text-black font-semibold"
                onClick={() => {
                  if (isLeg) {
                    setLegMirrored(true);
                    setLegOrigin('separate');
                  } else {
                    setArmMirrored(true);
                    setArmOrigin('separate');
                  }
                  goNext();
                }}
              >Separate origin</button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px]">Separate hips/shoulders for 3/4 or wide creatures.</TooltipContent>
          </Tooltip>
          <button
            className="px-3 py-2 rounded-lg border border-white/20 text-white"
            onClick={() => {
              if (isLeg) setLegOrigin('shared'); else setArmOrigin('shared');
              goNext();
            }}
          >Skip mirror</button>
        </div>
      </div>
    );
  };

  const renderBuilder = () => {
    const handleEndChain = () => setPenChain(null);
    const handleSavePlate = () => {
      setPlateReadyStep(currentStep, true);
      const ids = joints.map((j) => j.id);
      setPlates((prev) => [
        ...prev.filter((p) => p.step !== currentStep),
        { id: `plate-${currentStep}`, jointIds: ids, step: currentStep },
      ]);
    };

    return (
      <div className="min-h-screen bg-transparent text-white">
          <div className="flex">
            {/* Left console */}
            <aside className="w-[320px] border-r border-white/10 bg-[#0a0a0a] min-h-screen p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#777]">Status</p>
                  <p className="text-xs text-[#bbb]">{selectedMannequin.name}</p>
                  <p className="text-[11px] font-semibold text-emerald-300">Rigid plates mode</p>
                </div>
                {ghostBadge('Leg mirrored', legOrigin)}
              </div>

              {ghostBadge('Arm mirrored', armOrigin)}

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm font-semibold">
                  Bone Builder
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-[#aaa] cursor-help">?</div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-[11px]">Head → toes rigid plates with mirror prompts.</TooltipContent>
                  </Tooltip>
                </div>
                {renderStepper()}
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MousePointer2 size={14} /> Pen tool
                </div>
                <p className="text-xs text-[#bbb]">Lay down joints a head-length apart; snap to merge; Alt inserts between nodes.</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#ccc]">Pen mode</span>
                  <button
                    onClick={() => setPenEnabled((v) => !v)}
                    className={clsx('px-3 py-2 rounded-lg text-xs font-semibold border', penEnabled ? 'bg-white text-black border-white' : 'bg-transparent text-white border-white/30')}
                  >{penEnabled ? 'Enabled' : 'Disabled'}</button>
                </div>
                <div className="flex items-center justify-between text-xs text-[#bbb]">
                  <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Pen {penEnabled ? 'on' : 'off'}</span>
                  <span className="inline-flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-sky-400" /> Step: {currentStep}</span>
                </div>
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={handleEndChain}
                    className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/20 hover:bg-white/15"
                  >End chain</button>
                  <button
                    onClick={handleSavePlate}
                    disabled={joints.length < 2}
                    className={clsx('flex-1 px-3 py-2 rounded-lg font-semibold', joints.length < 2 ? 'bg-white/5 text-white/40 border border-white/15 cursor-not-allowed' : 'bg-emerald-600 text-black hover:bg-emerald-500')}
                  >Save plate</button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <GitBranch size={14} /> Plate hardness (Torso)
                </div>
                <p className="text-xs text-[#bbb]">Stiffer plates resist bending; lower for slight flex.</p>
                <Slider min={0} max={100} step={1} defaultValue={[80]} />
              </div>

              <div className="mt-auto flex items-center justify-between text-xs text-[#888]">
                <span>Progress {currentStepIndex + 1} / {STEPS.length}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="underline cursor-help">Validation</span>
                  </TooltipTrigger>
                  <TooltipContent className="text-[11px]">Add at least two joints to form a plate.</TooltipContent>
                </Tooltip>
              </div>
            </aside>

            {/* Canvas / main */}
            <main className="flex-1 min-h-screen p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-[#777]">Active step</p>
                  <h2 className="text-2xl font-bold">{currentStep}</h2>
                </div>
                <div className="flex items-center gap-3">
                  {currentStep === 'Leg' && renderMirrorPrompt('leg')}
                  {currentStep === 'Arms' && renderMirrorPrompt('arm')}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        disabled={!canAdvance}
                        onClick={() => handleConfirmStep(currentStep)}
                        className={clsx('inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold border transition',
                          canAdvance ? 'bg-white text-black border-white' : 'bg-transparent text-white/30 border-white/20 cursor-not-allowed')}
                      >
                        Save plate & continue <ChevronRight size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-[11px]">Save this plate and continue.</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <button
                  onClick={() => setPlateReadyStep(currentStep, true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 font-semibold hover:bg-emerald-500"
                >
                  Mark plate ready
                </button>
                {plateReady[currentStep] && !confirmed[currentStep] && (
                  <span className="text-xs text-emerald-200">Ready — save to advance.</span>
                )}
                {confirmed[currentStep] && <span className="text-xs text-[#bbb]">Saved.</span>}
              </div>

              <Viewport
                headLen={HEAD_LEN}
                snapRadius={SNAP_RADIUS}
                penEnabled={penEnabled}
                penChain={penChain}
                setPenChain={setPenChain}
                hoverPoint={hoverPoint}
                setHoverPoint={setHoverPoint}
                joints={joints}
                setJoints={setJoints}
                plates={plates}
                setPlates={setPlates}
                activeStep={currentStep}
                onMarkPlateReady={() => setPlateReadyStep(currentStep, true)}
              />

              <div className="grid md:grid-cols-3 gap-4">
                <HoverCard title="Plate gizmo" body="Click joints to add/remove; needs at least two." />
                <HoverCard title="Ghost preview" body="This ghost shows the mirrored plate before you commit." />
                <HoverCard title="Extras" body="Use plates for tails, wings, or custom appendages." />
              </div>
            </main>
          </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      {stage === 'landing' ? renderLanding() : renderBuilder()}
    </TooltipProvider>
  );
}

function HoverCard({ title, body }: { title: string; body: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 cursor-help">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Info size={14} /> {title}
          </div>
          <p className="text-xs text-[#aaa] mt-1">{body}</p>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-[11px] max-w-xs">{body}</TooltipContent>
    </Tooltip>
  );
}

type ViewportProps = {
  headLen: number;
  snapRadius: number;
  penEnabled: boolean;
  penChain: Joint2D | null;
  setPenChain: React.Dispatch<React.SetStateAction<Joint2D | null>>;
  hoverPoint: { x: number; y: number } | null;
  setHoverPoint: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  joints: Joint2D[];
  setJoints: React.Dispatch<React.SetStateAction<Joint2D[]>>;
  plates: Plate2D[];
  setPlates: React.Dispatch<React.SetStateAction<Plate2D[]>>;
  activeStep: StepId;
  onMarkPlateReady: () => void;
};

function Viewport(props: ViewportProps) {
  const { headLen, snapRadius, penEnabled, penChain, setPenChain, hoverPoint, setHoverPoint, joints, setJoints, plates, setPlates, activeStep, onMarkPlateReady } = props;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    // delete joint on meta click
    if (e.metaKey || e.ctrlKey) {
      const target = nearestJoint(joints, x, y, snapRadius);
      if (target) {
        setJoints(joints.filter((j) => j.id !== target.id));
      }
      return;
    }

    if (!penEnabled) return;

    if (!penChain) {
      const snapped = snapToExisting(joints, x, y, snapRadius);
      const next = snapped ?? makeJoint(joints.length, x, y);
      setJoints([...joints, ...(snapped ? [] : [next])]);
      setPenChain(next);
      return;
    }

    const dirX = x - penChain.x;
    const dirY = y - penChain.y;
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = penChain.x + (dirX / len) * headLen;
    const ny = penChain.y + (dirY / len) * headLen;
    const snapped = snapToExisting(joints, nx, ny, snapRadius);
    const next = snapped ?? makeJoint(joints.length, nx, ny);
    setJoints((prev) => [...prev, ...(snapped ? [] : [next])]);
    setPenChain(next);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverPoint({ x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 });
  };

  const handleMouseLeave = () => setHoverPoint(null);

  const plateForStep = plates.find((p) => p.step === activeStep);

  return (
    <div className="relative rounded-2xl border border-white/10 overflow-hidden min-h-[460px] bg-[#05070c]" onClick={handleClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div className="absolute inset-0 opacity-40"><SystemGrid /></div>
      <svg className="relative w-full h-full" viewBox="-400 -260 800 520">
        {plateForStep && (
          <PlatePolyline plate={plateForStep} joints={joints} />
        )}
        {joints.map((j) => (
          <circle key={j.id} cx={j.x} cy={j.y} r={10} fill="#8ea7ff" opacity={0.9} />
        ))}
        {penChain && hoverPoint && (
          <line x1={penChain.x} y1={penChain.y} x2={penChain.x + (hoverPoint.x - penChain.x) / Math.hypot(hoverPoint.x - penChain.x, hoverPoint.y - penChain.y || 1) * headLen} y2={penChain.y + (hoverPoint.y - penChain.y) / Math.hypot(hoverPoint.x - penChain.x, hoverPoint.y - penChain.y || 1) * headLen} stroke="#4ade80" strokeWidth={2} strokeDasharray="6 4" />
        )}
      </svg>
    </div>
  );
}

function PlatePolyline({ plate, joints }: { plate: Plate2D; joints: Joint2D[] }) {
  const pts = plate.jointIds.map((id) => joints.find((j) => j.id === id)).filter(Boolean) as Joint2D[];
  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <g>
      <path d={d} stroke="#fbbf24" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.6} />
      {pts.map((p) => (
        <circle key={p.id} cx={p.x} cy={p.y} r={8} fill="#fef3c7" stroke="#d97706" strokeWidth={2} />
      ))}
    </g>
  );
}

const snapToExisting = (joints: Joint2D[], x: number, y: number, radius: number) => {
  const target = nearestJoint(joints, x, y, radius);
  return target ?? null;
};

const nearestJoint = (joints: Joint2D[], x: number, y: number, radius: number) => {
  let best: Joint2D | null = null;
  let bestD = radius;
  for (const j of joints) {
    const d = Math.hypot(j.x - x, j.y - y);
    if (d <= bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
};

const makeJoint = (index: number, x: number, y: number): Joint2D => ({ id: `j${index}`, x, y });
