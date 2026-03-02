import React, { useRef, useState, useCallback } from 'react';
import type { TimelineKeyframe } from '../engine/types';

interface KeyframeTimelineProps {
  keyframes: TimelineKeyframe[];
  frameCount: number;
  currentFrame: number;
  onKeyframeMove: (fromFrame: number, toFrame: number) => void;
  onKeyframeClick?: (frame: number) => void;
  className?: string;
}

export const KeyframeTimeline: React.FC<KeyframeTimelineProps> = ({
  keyframes,
  frameCount,
  currentFrame,
  onKeyframeMove,
  onKeyframeClick,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggedKeyframe, setDraggedKeyframe] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0);

  const getKeyframePosition = useCallback((frame: number): number => {
    return (frame / (frameCount - 1)) * 100;
  }, [frameCount]);

  const getFrameFromPosition = useCallback((clientX: number): number => {
    if (!containerRef.current) return 0;
    
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, relativeX / rect.width));
    const frame = Math.round(percentage * (frameCount - 1));
    
    return Math.max(0, Math.min(frameCount - 1, frame));
  }, [frameCount]);

  const handleKeyframeMouseDown = useCallback((e: React.MouseEvent, frame: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const keyframePosition = getKeyframePosition(frame);
    const keyframeX = rect.left + (keyframePosition / 100) * rect.width;
    const offset = e.clientX - keyframeX;
    
    setDraggedKeyframe(frame);
    setDragOffset(offset);
  }, [getKeyframePosition]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggedKeyframe === null) return;
    
    const newFrame = getFrameFromPosition(e.clientX - dragOffset);
    
    // Check if the new frame is different from current
    if (newFrame !== draggedKeyframe) {
      onKeyframeMove(draggedKeyframe, newFrame);
      setDraggedKeyframe(newFrame);
    }
  }, [draggedKeyframe, dragOffset, getFrameFromPosition, onKeyframeMove]);

  const handleMouseUp = useCallback(() => {
    setDraggedKeyframe(null);
    setDragOffset(0);
  }, []);

  React.useEffect(() => {
    if (draggedKeyframe !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggedKeyframe, handleMouseMove, handleMouseUp]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-6 ${className}`}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Render keyframe icons */}
      {keyframes.map((keyframe) => {
        const position = getKeyframePosition(keyframe.frame);
        const isDragged = draggedKeyframe === keyframe.frame;
        const isCurrent = keyframe.frame === currentFrame;
        
        return (
          <div
            key={keyframe.frame}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 cursor-pointer transition-all ${
              isDragged 
                ? 'bg-blue-500 border-blue-300 scale-125 z-20' 
                : isCurrent 
                  ? 'bg-yellow-500 border-yellow-300 scale-110 z-10'
                  : 'bg-gray-600 border-gray-400 hover:bg-gray-500 hover:border-gray-300 hover:scale-105'
            }`}
            style={{ left: `${position}%` }}
            onMouseDown={(e) => handleKeyframeMouseDown(e, keyframe.frame)}
            onClick={() => onKeyframeClick?.(keyframe.frame)}
            title={`Frame ${keyframe.frame}`}
          />
        );
      })}
      
      {/* Drag preview line */}
      {draggedKeyframe !== null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-blue-400 pointer-events-none z-30"
          style={{ left: `${getKeyframePosition(draggedKeyframe)}%` }}
        />
      )}
    </div>
  );
};
