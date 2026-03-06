import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { applyWheelDeltaLinear, applyWheelDeltaLog, type WheelMathArgs } from './wheelMath';

type WheelMode = 'linear' | 'log';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  mode: WheelMode;
  disabled?: boolean;
  sensitivity?: number;
  fineSensitivity?: number;
  onChange: (next: number) => void;
  className?: string;
  formatValue?: (v: number) => string;
};

const WHEEL_SIZE = 120;
const CENTER = WHEEL_SIZE / 2;
const RADIUS = CENTER - 6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const ValueWheelControl: React.FC<Props> = ({
  label,
  value,
  min,
  max,
  step,
  mode,
  disabled = false,
  sensitivity = 1,
  fineSensitivity = 0.25,
  onChange,
  className = '',
  formatValue,
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartAngleDegRef = useRef(0);
  const dragStartValueRef = useRef(0);
  const wheelCenterRef = useRef({ x: 0, y: 0 });
  const fineRef = useRef(false);

  const argsBase: WheelMathArgs = useMemo(
    () => ({
      min,
      max,
      step,
      sensitivity,
      fineSensitivity,
    }),
    [fineSensitivity, max, min, sensitivity, step],
  );

  const applyDelta = useCallback(
    (startValue: number, deltaDeg: number) => {
      const args: WheelMathArgs = {
        ...argsBase,
        sensitivity: fineRef.current ? fineSensitivity : sensitivity,
      };
      return mode === 'log'
        ? applyWheelDeltaLog(startValue, deltaDeg, args)
        : applyWheelDeltaLinear(startValue, deltaDeg, args);
    },
    [argsBase, fineSensitivity, mode, sensitivity],
  );

  const beginDrag = useCallback(
    (clientX: number, clientY: number, fine: boolean) => {
      const rect = wheelRef.current?.getBoundingClientRect();
      if (!rect) return;
      wheelCenterRef.current = { x: rect.left + CENTER, y: rect.top + CENTER };
      dragStartValueRef.current = value;
      const dx = clientX - wheelCenterRef.current.x;
      const dy = clientY - wheelCenterRef.current.y;
      dragStartAngleDegRef.current = (Math.atan2(dy, dx) * 180) / Math.PI;
      fineRef.current = fine;
      setDragging(true);
    },
    [value],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      beginDrag(e.clientX, e.clientY, Boolean(e.shiftKey));
    },
    [beginDrag, disabled],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging || disabled) return;
      fineRef.current = Boolean((e as any).shiftKey);
      const dx = e.clientX - wheelCenterRef.current.x;
      const dy = e.clientY - wheelCenterRef.current.y;
      const currentAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

      let deltaDeg = currentAngleDeg - dragStartAngleDegRef.current;
      if (deltaDeg > 180) deltaDeg -= 360;
      if (deltaDeg < -180) deltaDeg += 360;

      const next = applyDelta(dragStartValueRef.current, deltaDeg);
      onChange(next);
    },
    [applyDelta, disabled, dragging, onChange],
  );

  const endDrag = useCallback(() => setDragging(false), []);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [endDrag, onPointerMove]);

  const indicatorAngleDeg = useMemo(() => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
    const v = clamp(value, min, max);
    const normalized = (v - min) / (max - min);
    return normalized * 360;
  }, [max, min, value]);

  const indicator = useMemo(() => {
    const rad = ((indicatorAngleDeg - 90) * Math.PI) / 180;
    return {
      x: CENTER + RADIUS * Math.cos(rad),
      y: CENTER + RADIUS * Math.sin(rad),
    };
  }, [indicatorAngleDeg]);

  const displayValue = useMemo(() => {
    if (formatValue) return formatValue(value);
    return Number.isFinite(value) ? String(value) : '—';
  }, [formatValue, value]);

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-[#666]">{label}</div>
      <div
        ref={wheelRef}
        className={`relative select-none ${disabled ? 'opacity-40' : ''}`}
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        onPointerDown={onPointerDown}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <svg width={WHEEL_SIZE} height={WHEEL_SIZE} className="block">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#121212" stroke="#333" strokeWidth={2} />
          {/* ticks */}
          {Array.from({ length: 24 }).map((_, i) => {
            const a = (i / 24) * Math.PI * 2;
            const x1 = CENTER + (RADIUS - 10) * Math.cos(a);
            const y1 = CENTER + (RADIUS - 10) * Math.sin(a);
            const x2 = CENTER + (RADIUS - 4) * Math.cos(a);
            const y2 = CENTER + (RADIUS - 4) * Math.sin(a);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#222" strokeWidth={2} />;
          })}
          {/* indicator */}
          <circle cx={indicator.x} cy={indicator.y} r={6} fill="#00ff88" stroke="#0a0a0a" strokeWidth={2} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="px-2 py-1 rounded-md bg-black/50 border border-white/10 text-[10px] font-mono text-white tabular-nums">
            {displayValue}
          </div>
        </div>
      </div>
      <div className="text-[9px] text-[#555]">Shift = fine</div>
    </div>
  );
};

