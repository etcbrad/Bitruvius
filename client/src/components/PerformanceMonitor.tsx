import React, { useState, useEffect } from 'react';
import { Monitor, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import { usePerformanceTracker, type PerformanceMetrics } from '../hooks/usePerformanceTracker';

interface PerformanceMonitorProps {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showDetails?: boolean;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  enabled = true,
  position = 'top-right',
  showDetails = false
}) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    averageFps: 0,
    dropCount: 0,
    totalFrames: 0,
    isOptimal: true
  });
  const [isVisible, setIsVisible] = useState(false);
  const tracker = usePerformanceTracker();

  useEffect(() => {
    if (!enabled) return;

    tracker.start();
    
    const interval = setInterval(() => {
      const currentMetrics = tracker.getMetrics();
      setMetrics(currentMetrics);
    }, 100); // Update every 100ms

    return () => {
      clearInterval(interval);
      tracker.stop();
    };
  }, [enabled, tracker]);

  if (!enabled) return null;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };

  const getStatusColor = () => {
    if (metrics.isOptimal) return 'text-green-400';
    if (metrics.averageFps >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getStatusIcon = () => {
    if (metrics.isOptimal) return <CheckCircle size={12} />;
    if (metrics.averageFps >= 50) return <AlertCircle size={12} />;
    return <AlertCircle size={12} />;
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50`}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
          isVisible 
            ? 'bg-white/10 border-white/30 text-white' 
            : 'bg-black/50 border-white/10 text-white/60 hover:border-white/20'
        }`}
      >
        <Monitor size={14} />
        <span className="text-xs font-mono">{metrics.fps} FPS</span>
        <span className={getStatusColor()}>
          {getStatusIcon()}
        </span>
      </button>

      {/* Detailed Panel */}
      {isVisible && (
        <div className="mt-2 p-4 rounded-lg border border-white/20 bg-black/80 backdrop-blur-sm text-white min-w-[200px]">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">
                Performance
              </h3>
              <div className={`flex items-center gap-1 ${getStatusColor()}`}>
                {getStatusIcon()}
                <span className="text-xs font-mono">
                  {metrics.isOptimal ? 'Optimal' : 'Suboptimal'}
                </span>
              </div>
            </div>

            {/* Main Metrics */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-white/40">Current FPS</div>
                <div className="font-mono text-lg">{metrics.fps}</div>
              </div>
              <div>
                <div className="text-white/40">Average FPS</div>
                <div className="font-mono text-lg">{metrics.averageFps}</div>
              </div>
              <div>
                <div className="text-white/40">Frame Time</div>
                <div className="font-mono">{metrics.frameTime}ms</div>
              </div>
              <div>
                <div className="text-white/40">Frame Drops</div>
                <div className="font-mono">{metrics.dropCount}</div>
              </div>
            </div>

            {/* Performance Bar */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-white/40">Performance</span>
                <span className="text-white/60">{Math.round((metrics.averageFps / 60) * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    metrics.isOptimal ? 'bg-green-400' : 
                    metrics.averageFps >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${Math.min(100, (metrics.averageFps / 60) * 100)}%` }}
                />
              </div>
            </div>

            {/* Detailed Info */}
            {showDetails && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Total Frames</span>
                  <span className="font-mono">{metrics.totalFrames.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Drop Rate</span>
                  <span className="font-mono">
                    {metrics.totalFrames > 0 
                      ? `${((metrics.dropCount / metrics.totalFrames) * 100).toFixed(1)}%`
                      : '0%'
                    }
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-white/40">Target</span>
                  <span className="font-mono">60 FPS</span>
                </div>
              </div>
            )}

            {/* Optimization Tips */}
            {!metrics.isOptimal && (
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-start gap-2">
                  <Zap size={10} className="text-yellow-400 mt-0.5" />
                  <div className="text-xs text-white/60">
                    {metrics.averageFps < 30 
                      ? 'Consider reducing mask count or lowering physics quality'
                      : 'Performance is acceptable but could be optimized'
                    }
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
