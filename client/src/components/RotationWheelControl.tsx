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
        'flex items-center justify-center gap-2',
        isDisabled ? 'opacity-50 pointer-events-none' : '',
        className,
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => adjustStep(-1)}
        className="w-8 h-8 flex items-center justify-center border border-white/20 text-white/70 hover:bg-white/10 transition-colors text-lg font-bold"
        aria-label="Decrement rotation"
        disabled={isDisabled}
      >
        -
      </button>

      <div
        ref={wheelRef}
        className="relative flex items-center justify-center select-none"
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        onPointerDown={handlePointerDown}
        role="slider"
        aria-label="Rotation"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <svg width={WHEEL_SIZE} height={WHEEL_SIZE} className="absolute inset-0">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#2D2D2D" stroke="#3A3A3A" strokeWidth="1" />
          {dragging && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS - 2}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="2"
              strokeDasharray="5 5"
            />
          )}
          <circle
            cx={indicator.x}
            cy={indicator.y}
            r="4"
            fill="#E5E7EB"
            stroke="#2D2D2D"
            strokeWidth="1"
            className="pointer-events-none"
          />
        </svg>
        <span className="relative text-white text-lg font-bold tracking-tight pointer-events-none">{value.toFixed(0)}°</span>
      </div>

      <button
        type="button"
        onClick={() => adjustStep(1)}
        className="w-8 h-8 flex items-center justify-center border border-white/20 text-white/70 hover:bg-white/10 transition-colors text-lg font-bold"
        aria-label="Increment rotation"
        disabled={isDisabled}
      >
        +
      </button>
    </div>
  );
};

