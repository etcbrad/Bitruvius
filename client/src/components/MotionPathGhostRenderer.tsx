/**
 * @file MotionPathGhostRenderer.tsx
 * React component for rendering motion path ghosts
 */

import React from 'react';
import type { GhostTrail } from '@/engine/motionPathGhosting';
import { ErrorBoundary } from './ErrorBoundary';

export interface MotionPathGhostProps {
  trails: GhostTrail[];
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Helper function to validate and safely format point coordinates
const safePoint = (point: { x: number; y: number }, scale: number, offsetX: number, offsetY: number): string => {
  const safeX = Number.isFinite(point.x) ? point.x : 0;
  const safeY = Number.isFinite(point.y) ? point.y : 0;
  const safeScale = Number.isFinite(scale) ? scale : 1;
  const safeOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
  const safeOffsetY = Number.isFinite(offsetY) ? offsetY : 0;
  
  return `${safeX * safeScale + safeOffsetX},${safeY * safeScale + safeOffsetY}`;
};

// Helper function to validate opacity
const safeOpacity = (opacity: number): number => {
  return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0;
};

// Helper function to validate angle
const safeAngle = (angle: number): number => {
  return Number.isFinite(angle) ? angle : 0;
};

export const MotionPathGhostRenderer: React.FC<MotionPathGhostProps> = ({
  trails,
  scale,
  offsetX,
  offsetY,
}) => {
  if (trails.length === 0) return null;

  return (
    <ErrorBoundary context="MotionPathGhostRenderer">
      <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1000 }}>
        {trails.map(trail => (
          <g key={trail.jointId}>
            {/* Render trail as connected line segments */}
            {trail.points.length > 1 && (
              <polyline
                points={trail.points.map(p => safePoint(p, scale, offsetX, offsetY)).join(' ')}
                fill="none"
                stroke={trail.color}
                strokeWidth="2"
                opacity={safeOpacity(Math.max(...trail.points.map(p => safeOpacity(p.opacity))) * 0.5)}
                strokeDasharray="5,5"
              />
            )}
            
            {/* Render individual points as small circles */}
            {trail.points.map((point, index) => (
              <circle
                key={index}
                cx={Number.isFinite(point.x) ? point.x * scale + offsetX : offsetX}
                cy={Number.isFinite(point.y) ? point.y * scale + offsetY : offsetY}
                r="3"
                fill={trail.color}
                opacity={safeOpacity(point.opacity * 0.8)}
              />
            ))}
            
            {/* Render angle indicator for most recent point */}
            {trail.points.length > 0 && (
              <g transform={`translate(${safePoint(trail.points[trail.points.length - 1], scale, offsetX, offsetY)})`}>
                <line
                  x1="0"
                  y1="0"
                  x2={Math.cos(safeAngle(trail.points[trail.points.length - 1].angle || 0)) * 15}
                  y2={Math.sin(safeAngle(trail.points[trail.points.length - 1].angle || 0)) * 15}
                  stroke={trail.color}
                  strokeWidth="2"
                  opacity={safeOpacity(trail.points[trail.points.length - 1].opacity)}
                />
                <circle
                  cx={Math.cos(safeAngle(trail.points[trail.points.length - 1].angle || 0)) * 15}
                  cy={Math.sin(safeAngle(trail.points[trail.points.length - 1].angle || 0)) * 15}
                  r="2"
                  fill={trail.color}
                  opacity={safeOpacity(trail.points[trail.points.length - 1].opacity)}
                />
              </g>
            )}
          </g>
        ))}
      </svg>
    </ErrorBoundary>
  );
};
