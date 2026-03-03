import React from 'react';
import type { SkeletonState } from '../engine/types';
import { applyAtomicScaling, type ScalingSegment } from '../engine/atomic-scaling';
import { INITIAL_JOINTS } from '../engine/model';

interface AtomicUnitsControlProps {
  state: SkeletonState;
  setStateNoHistory: (updater: (prev: SkeletonState) => SkeletonState) => void;
  setStateWithHistory: (action: string, updater: (prev: SkeletonState) => SkeletonState) => void;
  beginHistoryAction: (action: string) => void;
  commitHistoryAction: () => void;
  addConsoleLog: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const AtomicUnitsControl: React.FC<AtomicUnitsControlProps> = ({
  state,
  setStateNoHistory,
  setStateWithHistory,
  beginHistoryAction,
  commitHistoryAction,
  addConsoleLog,
}) => {
  const dragRef = React.useRef<{ segment: ScalingSegment; lastValue: number } | null>(null);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const getFactor = React.useCallback(
    (segment: Exclude<ScalingSegment, 'reset'>): number => {
      const safeDiv = (num: number, den: number) => (Math.abs(den) > 1e-6 ? num / den : 1);

      const getOffset = (jointId: string) => ({
        original: INITIAL_JOINTS[jointId]?.baseOffset,
        current: state.joints[jointId]?.baseOffset,
      });

      const magRatio = (jointId: string) => {
        const { original, current } = getOffset(jointId);
        if (!original || !current) return 1;
        const om = Math.hypot(original.x, original.y);
        const cm = Math.hypot(current.x, current.y);
        return safeDiv(cm, om);
      };

      const xRatio = (jointId: string) => {
        const { original, current } = getOffset(jointId);
        if (!original || !current) return 1;
        return safeDiv(current.x, original.x);
      };

      switch (segment) {
        case 'shoulderSpan':
          return xRatio('l_shoulder');
        case 'pelvicWidth':
          return xRatio('l_hip');
        case 'brachialIndex':
          return magRatio('l_elbow');
        case 'antebrachialIndex':
          return magRatio('l_wrist');
        case 'handScale':
          return magRatio('l_fingertip');
        case 'femoralLength':
          return magRatio('l_knee');
        case 'cruralLength':
          return magRatio('l_ankle');
      }
    },
    [state.joints],
  );

  const getPercent = React.useCallback(
    (segment: Exclude<ScalingSegment, 'reset'>) => {
      const factor = getFactor(segment);
      return clamp(Math.round(factor * 100), 50, 150);
    },
    [getFactor],
  );

  const applyValue = React.useCallback(
    (segment: Exclude<ScalingSegment, 'reset'>, value: number, pushHistory: boolean) => {
      const factor = value / 100;
      const actionId = `atomic_scaling:${segment}`;
      const update = (prev: SkeletonState) => applyAtomicScaling(prev, segment, factor);

      if (pushHistory) {
        setStateWithHistory(actionId, update);
      } else {
        setStateNoHistory(update);
      }
    },
    [setStateNoHistory, setStateWithHistory],
  );

  const resetToDefaults = () => {
    setStateWithHistory('atomic_scaling:reset', (prev) => applyAtomicScaling(prev, 'reset', 1.0));
    addConsoleLog('info', 'Atomic scaling reset to defaults');
  };

  const SliderControl = ({
    label,
    segment,
    min = 50,
    max = 150,
    step = 1,
    description,
  }: {
    label: string;
    segment: Exclude<ScalingSegment, 'reset'>;
    min?: number;
    max?: number;
    step?: number;
    description?: string;
  }) => {
    const value = getPercent(segment);

    return (
      <div className="space-y-2 p-3 bg-[#181818] rounded-lg border border-accent/20">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
          <span className="text-[10px] text-accent">{value}%</span>
        </div>
        {description && <div className="text-[9px] text-[#666]">{description}</div>}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => {
            beginHistoryAction(`atomic_scaling:${segment}`);
            dragRef.current = { segment, lastValue: value };
          }}
          onPointerUp={() => {
            const drag = dragRef.current;
            if (!drag || drag.segment !== segment) return;
            dragRef.current = null;
            commitHistoryAction();
            const factor = drag.lastValue / 100;
            addConsoleLog('info', `Atomic scaling: ${segment} = ${drag.lastValue}% (×${factor.toFixed(2)})`);
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            commitHistoryAction();
          }}
          onChange={(e) => {
            const next = parseInt(e.target.value, 10);
            const active = dragRef.current?.segment === segment;
            if (active) {
              dragRef.current = { segment, lastValue: next };
              applyValue(segment, next, false);
            } else {
              applyValue(segment, next, true);
              const factor = next / 100;
              addConsoleLog('info', `Atomic scaling: ${segment} = ${next}% (×${factor.toFixed(2)})`);
            }
          }}
          className="w-full h-1 bg-[#333] rounded-lg appearance-none cursor-pointer slider"
        />
        <div className="flex justify-between text-[8px] text-[#666]">
          <span>{min}%</span>
          <span>{max}%</span>
        </div>
      </div>
    );
  };

  // Reference `state` so this widget naturally remounts with engine resets.
  void state;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2 text-accent">
        <div className="w-3 h-3 bg-accent rounded-full" />
        <h2 className="text-[10px] font-bold uppercase tracking-widest">Atomic Units</h2>
      </div>

      <div className="space-y-3">
        <div className="text-[9px] text-[#666] font-semibold uppercase tracking-wider">Upper Body</div>
        <SliderControl
          label="Shoulder Span"
          segment="shoulderSpan"
          description="Collar → L/R Shoulder width"
        />
        <SliderControl
          label="Brachial Index"
          segment="brachialIndex"
          description="Shoulder → Elbow length"
        />
        <SliderControl
          label="Antebrachial Index"
          segment="antebrachialIndex"
          description="Elbow → Wrist length"
        />
        <SliderControl
          label="Hand Scale"
          segment="handScale"
          description="Wrist → Fingertips length"
        />
      </div>

      <div className="space-y-3">
        <div className="text-[9px] text-[#666] font-semibold uppercase tracking-wider">Lower Body</div>
        <SliderControl
          label="Pelvic Width"
          segment="pelvicWidth"
          description="Navel → L/R Hip width"
        />
        <SliderControl
          label="Femoral Length"
          segment="femoralLength"
          description="Hip → Knee length"
        />
        <SliderControl
          label="Crural Length"
          segment="cruralLength"
          description="Knee → Ankle length"
        />
      </div>

      <div className="flex gap-2 p-3 bg-[#181818] rounded-lg border border-accent/20">
        <button
          type="button"
          onClick={resetToDefaults}
          className="flex-1 px-3 py-2 bg-[#222] hover:bg-[#333] rounded text-[10px] font-bold uppercase transition-colors"
        >
          Reset All
        </button>
      </div>
    </div>
  );
};
