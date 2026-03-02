import React, { useId } from 'react';

interface SystemGridProps {
  visible?: boolean;
  showGrid?: boolean;
  showRings?: boolean;
  opacity?: number;
  plot?: {
    lines: Array<{
      family: string;
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }>;
    circles: Array<{
      family: string;
      key: string;
      cx: number;
      cy: number;
      r: number;
    }>;
  } | null;
  transform?: {
    characterCenterX: number;
    characterCenterY: number;
    pxPerUnit: number;
  } | null;
}

export const SystemGrid: React.FC<SystemGridProps> = ({ 
  visible = true, 
  showGrid = true,
  showRings = true,
  opacity = 0.18,
  plot = null,
  transform = null,
}) => {
  if (!visible) return null;

  const ids = useId().replaceAll(':', '');
  const span = 20000;

  const t = transform ?? {
    characterCenterX: 0,
    characterCenterY: 0,
    pxPerUnit: 1000,
  };

  const toPxX = (x: number) => t.characterCenterX + x * t.pxPerUnit;
  const toPxY = (y: number) => t.characterCenterY + (0.5 - y) * t.pxPerUnit;

  const headLenPx = Math.max(12, t.pxPerUnit * 0.125);
  const majorGridSize = headLenPx;
  const minorGridSize = Math.max(6, majorGridSize / 8);
  const groundY = toPxY(0);

  const keptFamilies = new Set(['head-x', 'head-y', 'centerline', 'square']);
  const filteredLines = plot?.lines?.filter((l) => keptFamilies.has(l.family)) ?? [];
  const filteredCircles = plot?.circles?.filter((c) => c.family === 'reach') ?? [];

  return (
    <g className="pointer-events-none" style={{ opacity }}>
      <defs>
        <pattern
          id={`system-grid-minor-${ids}`}
          width={minorGridSize}
          height={minorGridSize}
          patternUnits="userSpaceOnUse"
          x={t.characterCenterX}
          y={t.characterCenterY}
        >
          <path
            d={`M ${minorGridSize} 0 L 0 0 0 ${minorGridSize}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.035)"
            strokeWidth="0.5"
          />
        </pattern>
        <pattern
          id={`system-grid-major-${ids}`}
          width={majorGridSize}
          height={majorGridSize}
          patternUnits="userSpaceOnUse"
          x={t.characterCenterX}
          y={t.characterCenterY}
        >
          <rect
            width={majorGridSize}
            height={majorGridSize}
            fill={`url(#system-grid-minor-${ids})`}
          />
          <path
            d={`M ${majorGridSize} 0 L 0 0 0 ${majorGridSize}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.055)"
            strokeWidth="1"
          />
        </pattern>

        <linearGradient
          id={`system-ground-${ids}`}
          x1="0"
          y1={groundY}
          x2="0"
          y2={groundY + Math.max(80, headLenPx * 2.5)}
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.065)" />
          <stop offset="65%" stopColor="rgba(255, 255, 255, 0.02)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </linearGradient>
      </defs>

      {/* Grid */}
      {showGrid && (
        <rect
          x={-span}
          y={-span}
          width={span * 2}
          height={span * 2}
          fill={`url(#system-grid-major-${ids})`}
        />
      )}

      {/* Plot lines (keep it sparse; skip dense "finger" artifacts) */}
      {showGrid &&
        filteredLines.map((l) => {
          const isCenterline = l.family === 'centerline';
          const isSquare = l.family === 'square';
          const stroke = isCenterline ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.07)';
          const strokeWidth = isCenterline ? 1.25 : isSquare ? 1.1 : 0.9;
          const dashArray = isSquare ? '6 10' : '';

          return (
            <line
              key={l.key}
              x1={toPxX(l.x1)}
              y1={toPxY(l.y1)}
              x2={toPxX(l.x2)}
              y2={toPxY(l.y2)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
            />
          );
        })}

      {/* Rings */}
      {showRings &&
        (filteredCircles.length > 0
          ? filteredCircles
          : [
              { key: 'fallback-1', cx: 0, cy: 0.55, r: 0.25, family: 'reach' },
              { key: 'fallback-2', cx: 0, cy: 0.55, r: 0.5, family: 'reach' },
            ]
        ).map((c, idx) => {
          const isOuter = c.key.includes('max') || idx === 0;
          const stroke = isOuter ? 'rgba(255, 255, 255, 0.11)' : 'rgba(255, 255, 255, 0.07)';
          const strokeWidth = isOuter ? 1.35 : 0.9;
          const dashArray = isOuter ? '' : '3 10';
          return (
            <circle
              key={c.key}
              cx={toPxX(c.cx)}
              cy={toPxY(c.cy)}
              r={Math.max(1, c.r * t.pxPerUnit)}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
            />
          );
        })}

      {/* Ground (subtle strip + line) */}
      <rect
        x={-span}
        y={groundY}
        width={span * 2}
        height={span * 2}
        fill={`url(#system-ground-${ids})`}
      />
      <line
        x1={-span}
        y1={groundY}
        x2={span}
        y2={groundY}
        stroke="rgba(255, 255, 255, 0.12)"
        strokeWidth="1"
      />
    </g>
  );
};
