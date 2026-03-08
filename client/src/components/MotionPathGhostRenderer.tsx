/**
 * @file MotionPathGhostRenderer.tsx
 * React component for rendering motion path ghosts
 */

import React from 'react';
import type { GhostTrail } from '@/engine/motionPathGhosting';

export interface MotionPathGhostProps {
  trails: GhostTrail[];
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MotionPathGhostRenderer: React.FC<MotionPathGhostProps> = ({
  trails,
  scale,
  offsetX,
  offsetY,
}) => {
  if (trails.length === 0) return null;

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
      {trails.map(trail => (
        <g key={trail.jointId}>
          {/* Render trail as connected line segments */}
          {trail.points.length > 1 && (
            <polyline
              points={trail.points.map(p => 
                `${p.x * scale + offsetX},${p.y * scale + offsetY}`
              ).join(' ')}
              fill="none"
              stroke={trail.color}
              strokeWidth="2"
              opacity={Math.max(...trail.points.map(p => p.opacity)) * 0.5}
              strokeDasharray="5,5"
            />
          )}
          
          {/* Render individual points as small circles */}
          {trail.points.map((point, index) => (
            <circle
              key={index}
              cx={point.x * scale + offsetX}
              cy={point.y * scale + offsetY}
              r="3"
              fill={trail.color}
              opacity={point.opacity * 0.8}
            />
          ))}
          
          {/* Render angle indicator for most recent point */}
          {trail.points.length > 0 && (
            <g transform={`translate(${trail.points[trail.points.length - 1].x * scale + offsetX}, ${trail.points[trail.points.length - 1].y * scale + offsetY})`}>
              <line
                x1="0"
                y1="0"
                x2={Math.cos(trail.points[trail.points.length - 1].angle) * 15}
                y2={Math.sin(trail.points[trail.points.length - 1].angle) * 15}
                stroke={trail.color}
                strokeWidth="2"
                opacity={trail.points[trail.points.length - 1].opacity}
              />
              <circle
                cx={Math.cos(trail.points[trail.points.length - 1].angle) * 15}
                cy={Math.sin(trail.points[trail.points.length - 1].angle) * 15}
                r="2"
                fill={trail.color}
                opacity={trail.points[trail.points.length - 1].opacity}
              />
            </g>
          )}
        </g>
      ))}
    </svg>
  );
};
