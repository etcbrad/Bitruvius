import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RotationWheelControlProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (newValue: number) => void;
  isDisabled?: boolean;
  className?: string;
};

const WHEEL_SIZE = 120;
const CENTER = WHEEL_SIZE / 2;
const RADIUS = CENTER - 6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const RotationWheelControl: React.FC<RotationWheelControlProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  isDisabled = false,
  className = '',
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartAngle = useRef(0);
  const dragStartValue = useRef(0);
  const wheelCenter = useRef({ x: 0, y: 0 });

  const clampValue = useCallback(
    (v: number) => clamp(v, min, max),
    [min, max],
  );

  const beginDrag = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wheelRef.current?.getBoundingClientRect();
      if (!rect) return;
      wheelCenter.current = { x: rect.left + CENTER, y: rect.top + CENTER };
      dragStartValue.current = value;
      const dx = clientX - wheelCenter.current.x;
      const dy = clientY - wheelCenter.current.y;
      dragStartAngle.current = (Math.atan2(dy, dx) * 180) / Math.PI;
      setDragging(true);
    },
    [value],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isDisabled) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      beginDrag(e.clientX, e.clientY);
    },
    [beginDrag, isDisabled],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || isDisabled) return;
      const dx = e.clientX - wheelCenter.current.x;
      const dy = e.clientY - wheelCenter.current.y;
      const currentAngle = (Math.atan2(dy, dx) * 180) / Math.PI;

      let angleDelta = currentAngle - dragStartAngle.current;
      if (angleDelta > 180) angleDelta -= 360;
      if (angleDelta < -180) angleDelta += 360;

      const next = clampValue(dragStartValue.current + angleDelta);
      onChange(next);
    },
    [clampValue, dragging, isDisabled, onChange],
  );

  const endDrag = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [endDrag, handlePointerMove]);

  const adjustStep = useCallback(
    (dir: -1 | 1) => {
      if (isDisabled) return;
      onChange(clampValue(value + dir * step));
    },
    [clampValue, isDisabled, onChange, step, value],
  );

  const indicatorAngle = useMemo(() => {
    const range = max - min;
    if (!range) return 0;
    const normalized = (value - min) / range;
    return normalized * 360;
  }, [max, min, value]);

  const indicator = useMemo(() => {
    const rad = ((indicatorAngle - 90) * Math.PI) / 180;
    return {
      x: CENTER + RADIUS * Math.cos(rad),
      y: CENTER + RADIUS * Math.sin(rad),
    };
  }, [indicatorAngle]);

  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-2',
        isDisabled ? 'opacity-50 pointer-events-none' : '',
        className,
      ].join(' ')}
    >
      <div
        ref={wheelRef}
        className="relative flex items-center justify-center select-none cursor-pointer group"
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        onPointerDown={handlePointerDown}
        role="slider"
        aria-label="Rotation"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <svg width={WHEEL_SIZE} height={WHEEL_SIZE} className="absolute inset-0">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#111" stroke="#333" strokeWidth="1" className="group-hover:stroke-accent/50 transition-colors" />
          <circle cx={CENTER} cy={CENTER} r={RADIUS - 8} fill="none" stroke="#222" strokeWidth="1" strokeDasharray="2 4" />
          {dragging && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS - 2}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeDasharray="5 5"
              className="opacity-50"
            />
          )}
          <line 
            x1={CENTER} 
            y1={CENTER} 
            x2={indicator.x} 
            y2={indicator.y} 
            stroke="var(--accent)" 
            strokeWidth="1" 
            className="opacity-30" 
          />
          <circle
            cx={indicator.x}
            cy={indicator.y}
            r="5"
            fill="var(--accent)"
            stroke="#000"
            strokeWidth="1.5"
            className="pointer-events-none shadow-xl"
          />
        </svg>
        <div className="flex flex-col items-center justify-center relative">
          <span className="text-white text-xl font-bold tracking-tighter leading-none">{value.toFixed(0)}°</span>
          <span className="text-[8px] text-[#666] uppercase font-bold tracking-widest mt-1">deg</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => adjustStep(-1)}
          className="w-10 h-6 flex items-center justify-center rounded bg-[#222] border border-[#333] text-white/70 hover:bg-[#333] hover:text-white transition-all text-xs font-bold"
          aria-label="Decrement rotation"
          disabled={isDisabled}
        >
          -
        </button>
        <button
          type="button"
          onClick={() => onChange(0)}
          className="px-2 h-6 flex items-center justify-center rounded bg-[#222] border border-[#333] text-[8px] font-bold uppercase tracking-widest text-[#666] hover:text-white transition-all"
          disabled={isDisabled}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => adjustStep(1)}
          className="w-10 h-6 flex items-center justify-center rounded bg-[#222] border border-[#333] text-white/70 hover:bg-[#333] hover:text-white transition-all text-xs font-bold"
          aria-label="Increment rotation"
          disabled={isDisabled}
        >
          +
        </button>
      </div>
    </div>
        <button
          type="button"
          onClick={() => onChange(0)}
          className="px-2 h-6 flex items-center justify-center rounded bg-[#222] border border-[#333] text-[8px] font-bold uppercase tracking-widest text-[#666] hover:text-white transition-all"
          disabled={isDisabled}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => adjustStep(1)}
          className="w-10 h-6 flex items-center justify-center rounded bg-[#222] border border-[#333] text-white/70 hover:bg-[#333] hover:text-white transition-all text-xs font-bold"
          aria-label="Increment rotation"
          disabled={isDisabled}
        >
          +
        </button>
      </div>
    </div>
  );
};

