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

interface BenchmarkLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  family: 'benchmark';
  label: string;
}

type PlotLine = {
  family: string;
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};
type EnhancedLine = PlotLine | BenchmarkLine;

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

  const keptFamilies = new Set(['head-x', 'head-y', 'centerline', 'square', 'diagonal', 'triangle', 'cubit', 'palm', 'finger']);
  const filteredLines = plot?.lines?.filter((l) => keptFamilies.has(l.family)) ?? [];
  const filteredCircles = plot?.circles?.filter((c) => c.family === 'reach') ?? [];

  // Vitruvian benchmarks for proportional lines
  const getBenchmarkLines = () => {
    const benchmarks = [
      // Navel line (classical Vitruvian center)
      { x1: -0.5, y1: 0.55, x2: 0.5, y2: 0.55, family: 'benchmark', label: 'navel' },
      // Genital line (half height)
      { x1: -0.5, y1: 0.5, x2: 0.5, y2: 0.5, family: 'benchmark', label: 'genitals' },
      // Knee line (quarter height)
      { x1: -0.5, y1: 0.25, x2: 0.5, y2: 0.25, family: 'benchmark', label: 'knees' },
      // Chin line (7/8 height)
      { x1: -0.5, y1: 0.875, x2: 0.5, y2: 0.875, family: 'benchmark', label: 'chin' },
      // Brow line (approximate)
      { x1: -0.5, y1: 0.942, x2: 0.5, y2: 0.942, family: 'benchmark', label: 'brows' },
      // Nose base line
      { x1: -0.5, y1: 0.908, x2: 0.5, y2: 0.908, family: 'benchmark', label: 'nose' },
      // Hairline
      { x1: -0.5, y1: 0.975, x2: 0.5, y2: 0.975, family: 'benchmark', label: 'hairline' },
    ];
    return benchmarks;
  };

  const benchmarkLines = getBenchmarkLines();

  // Vitruvian triangle calculation (equilateral triangle inscribed in circle)
  const getTrianglePoints = (cx: number, cy: number, r: number) => {
    const points = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i * 2 * Math.PI / 3) - Math.PI / 2; // Start from top
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      points.push(`${toPxX(x)},${toPxY(y)}`);
    }
    return points.join(' ');
  };

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
            stroke="rgba(139, 119, 101, 0.04)"
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
            stroke="rgba(139, 119, 101, 0.06)"
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
          <stop offset="0%" stopColor="rgba(139, 119, 101, 0.08)" />
          <stop offset="65%" stopColor="rgba(139, 119, 101, 0.03)" />
          <stop offset="100%" stopColor="rgba(139, 119, 101, 0)" />
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

      {/* Vitruvian Square */}
      {showGrid && (
        <g>
          {/* Outer square with 4x4 grid */}
          <rect
            x={toPxX(-0.5)}
            y={toPxY(1.0)}
            width={t.pxPerUnit}
            height={t.pxPerUnit}
            fill="none"
            stroke="rgba(139, 119, 101, 0.12)"
            strokeWidth="1.5"
          />
          
          {/* 4x4 grid lines within square */}
          {Array.from({ length: 3 }, (_, i) => i + 1).map((i) => (
            <g key={`grid-${i}`}>
              {/* Vertical lines */}
              <line
                x1={toPxX(-0.5 + (i * 0.25))}
                y1={toPxY(1.0)}
                x2={toPxX(-0.5 + (i * 0.25))}
                y2={toPxY(0.0)}
                stroke="rgba(139, 119, 101, 0.05)"
                strokeWidth="0.5"
              />
              {/* Horizontal lines */}
              <line
                x1={toPxX(-0.5)}
                y1={toPxY(1.0 - (i * 0.25))}
                x2={toPxX(0.5)}
                y2={toPxY(1.0 - (i * 0.25))}
                stroke="rgba(139, 119, 101, 0.05)"
                strokeWidth="0.5"
              />
            </g>
          ))}
          
          {/* Diagonal lines */}
          <line
            x1={toPxX(-0.5)}
            y1={toPxY(1.0)}
            x2={toPxX(0.5)}
            y2={toPxY(0.0)}
            stroke="rgba(139, 119, 101, 0.08)"
            strokeWidth="1"
            strokeDasharray="8 12"
          />
          <line
            x1={toPxX(0.5)}
            y1={toPxY(1.0)}
            x2={toPxX(-0.5)}
            y2={toPxY(0.0)}
            stroke="rgba(139, 119, 101, 0.08)"
            strokeWidth="1"
            strokeDasharray="8 12"
          />
        </g>
      )}

      {/* Plot lines with enhanced proportional data */}
      {showGrid && [
        ...filteredLines,
        ...benchmarkLines,
      ].map((l) => {
        const isCenterline = l.family === 'centerline';
        const isSquare = l.family === 'square';
        const isDiagonal = l.family === 'diagonal';
        const isTriangle = l.family === 'triangle';
        const isBenchmark = l.family === 'benchmark';
        const isCubit = l.family === 'cubit';
        const isPalm = l.family === 'palm';
        const isFinger = l.family === 'finger';
        const isHeadX = l.family === 'head-x';
        const isHeadY = l.family === 'head-y';
        
        let stroke = 'rgba(139, 119, 101, 0.10)';
        let strokeWidth = 0.9;
        let dashArray = '';
        
        if (isBenchmark) {
          stroke = 'rgba(180, 120, 60, 0.15)';
          strokeWidth = 1.1;
          dashArray = '2 6';
        } else if (isCenterline) {
          stroke = 'rgba(139, 119, 101, 0.12)';
          strokeWidth = 1.25;
        } else if (isSquare) {
          stroke = 'rgba(139, 119, 101, 0.11)';
          strokeWidth = 1.1;
          dashArray = '6 10';
        } else if (isDiagonal) {
          stroke = 'rgba(139, 119, 101, 0.08)';
          strokeWidth = 1;
          dashArray = '8 12';
        } else if (isTriangle) {
          stroke = 'rgba(139, 119, 101, 0.09)';
          strokeWidth = 1.2;
        } else if (isCubit) {
          stroke = 'rgba(160, 130, 80, 0.07)';
          strokeWidth = 0.8;
        } else if (isPalm) {
          stroke = 'rgba(150, 125, 75, 0.06)';
          strokeWidth = 0.7;
        } else if (isFinger) {
          stroke = 'rgba(140, 120, 70, 0.04)';
          strokeWidth = 0.5;
        } else if (isHeadX || isHeadY) {
          stroke = 'rgba(145, 125, 85, 0.08)';
          strokeWidth = 0.8;
        }

        return (
          <g key={'key' in l ? l.key : l.label || `${l.family}-${l.x1}-${l.y1}`}>
            <line
              x1={toPxX(l.x1)}
              y1={toPxY(l.y1)}
              x2={toPxX(l.x2)}
              y2={toPxY(l.y2)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
            />
            {'label' in l && isBenchmark && (
              <text
                x={toPxX(0.51)}
                y={toPxY(l.y1) + 4}
                fill="rgba(120, 80, 40, 0.4)"
                fontSize="10"
                fontFamily="monospace"
                style={{ opacity: 0.6 }}
              >
                {l.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Vitruvian Circle */}
      {showRings && (
        <circle
          cx={toPxX(0)}
          cy={toPxY(0.5)}
          r={t.pxPerUnit * 0.5}
          fill="none"
          stroke="rgba(139, 119, 101, 0.11)"
          strokeWidth="1.3"
        />
      )}

      {/* Vitruvian Triangle */}
      {showRings && (
        <polygon
          points={getTrianglePoints(0, 0.5, 0.5)}
          fill="none"
          stroke="rgba(139, 119, 101, 0.10)"
          strokeWidth="1.2"
          strokeDasharray="4 8"
        />
      )}

      {/* Additional reach circles with Vitruvian proportions */}
      {showRings && [
        ...(filteredCircles.length > 0 ? filteredCircles : [
          { key: 'fallback-1', cx: 0, cy: 0.55, r: 0.25, family: 'reach' },
          { key: 'fallback-2', cx: 0, cy: 0.55, r: 0.5, family: 'reach' },
        ]),
        // Additional Vitruvian circles
        { key: 'head-circle', cx: 0, cy: 0.9375, r: 0.0625, family: 'proportion' },
        { key: 'chest-circle', cx: 0, cy: 0.75, r: 0.15, family: 'proportion' },
        { key: 'pelvic-circle', cx: 0, cy: 0.5, r: 0.1, family: 'proportion' },
        { key: 'knee-circle', cx: -0.15, cy: 0.25, r: 0.05, family: 'proportion' },
        { key: 'knee-circle-right', cx: 0.15, cy: 0.25, r: 0.05, family: 'proportion' },
      ].map((c, idx) => {
        const isOuter = c.key.includes('max') || idx === 0;
        const isProportion = c.family === 'proportion';
        let stroke, strokeWidth, dashArray;
        
        if (isProportion) {
          stroke = 'rgba(120, 90, 50, 0.08)';
          strokeWidth = 0.8;
          dashArray = '1 4';
        } else {
          stroke = isOuter ? 'rgba(139, 119, 101, 0.11)' : 'rgba(139, 119, 101, 0.07)';
          strokeWidth = isOuter ? 1.35 : 0.9;
          dashArray = isOuter ? '' : '3 10';
        }
        
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
        stroke="rgba(139, 119, 101, 0.12)"
        strokeWidth="1"
      />
    </g>
  );
};
