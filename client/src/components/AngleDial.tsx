import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type AngleDialProps = {
  valueDeg: number;
  onRotateDelta: (deltaDeg: number, ev?: PointerEvent) => void;
  onBegin?: () => void;
  onEnd?: () => void;
  isDisabled?: boolean;
  className?: string;
  sensitivity?: number;
  label?: string;
};

const WHEEL_SIZE = 156;
const CENTER = WHEEL_SIZE / 2;
const RADIUS = CENTER - 10;

const deg2rad = (deg: number) => (deg * Math.PI) / 180;

export const AngleDial: React.FC<AngleDialProps> = ({
  valueDeg,
  onRotateDelta,
  onBegin,
  onEnd,
  isDisabled = false,
  className = '',
  sensitivity = 0.55,
  label = 'Angle',
}) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const centerRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const lastAngleRadRef = useRef<number | null>(null);

  const knob = useMemo(() => {
    const a = deg2rad(valueDeg);
    return {
      x: CENTER + RADIUS * Math.cos(a),
      y: CENTER - RADIUS * Math.sin(a),
    };
  }, [valueDeg]);

  const endDrag = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    pointerIdRef.current = null;
    lastAngleRadRef.current = null;
    onEnd?.();
  }, [dragging, onEnd]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging) return;
      if (isDisabled) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      if (lastAngleRadRef.current === null) return;

      const dx = e.clientX - centerRef.current.x;
      const dy = e.clientY - centerRef.current.y;
      const angle = Math.atan2(dy, dx);
      let delta = angle - lastAngleRadRef.current;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      lastAngleRadRef.current = angle;

      const fine = e.shiftKey ? 0.25 : 1;
      const deltaDeg = (delta * 180) / Math.PI * sensitivity * fine;
      if (!Number.isFinite(deltaDeg) || Math.abs(deltaDeg) < 1e-6) return;
      onRotateDelta(deltaDeg, e);
    },
    [dragging, isDisabled, onRotateDelta, sensitivity],
  );

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

  const beginDrag = useCallback(
    (e: React.PointerEvent) => {
      if (isDisabled) return;
      const el = wheelRef.current;
      if (!el) return;

      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

      const rect = el.getBoundingClientRect();
      centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      pointerIdRef.current = e.pointerId;
      lastAngleRadRef.current = Math.atan2(e.clientY - centerRef.current.y, e.clientX - centerRef.current.x);
      setDragging(true);
      onBegin?.();
    },
    [isDisabled, onBegin],
  );

  return (
    <div className={['flex flex-col items-center justify-center', isDisabled ? 'opacity-50' : '', className].join(' ')}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-[#666]">{label}</div>
      <div
        ref={wheelRef}
        className="relative mt-2 select-none touch-none"
        style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        onPointerDown={beginDrag}
        role="slider"
        aria-label={label}
        aria-valuenow={valueDeg}
      >
        <svg width={WHEEL_SIZE} height={WHEEL_SIZE} className="absolute inset-0">
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="#2D2D2D" stroke="#3A3A3A" strokeWidth="1" />
          {dragging && (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS - 3}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
          )}
          <circle cx={knob.x} cy={knob.y} r="5" fill="#E5E7EB" stroke="#2D2D2D" strokeWidth="1" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-white font-mono text-xl tabular-nums">{valueDeg.toFixed(1)}°</div>
        </div>
      </div>
      <div className="mt-2 text-[9px] text-[#444] font-mono">Drag to rotate · Shift = fine</div>
    </div>
  );
};

