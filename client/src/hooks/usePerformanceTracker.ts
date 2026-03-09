import { useRef, useCallback, useEffect } from 'react';

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  averageFps: number;
  dropCount: number;
  totalFrames: number;
  isOptimal: boolean;
}

export interface PerformanceTracker {
  start: () => void;
  stop: () => void;
  getMetrics: () => PerformanceMetrics;
  reset: () => void;
}

export const usePerformanceTracker = (): PerformanceTracker => {
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(0);
  const fpsHistoryRef = useRef<number[]>([]);
  const dropCountRef = useRef(0);
  const isRunningRef = useRef(false);
  const animationIdRef = useRef<number>();

  const TARGET_FPS = 60;
  const FRAME_TIME_TARGET = 1000 / TARGET_FPS; // 16.67ms
  const HISTORY_SIZE = 60; // 1 second of history at 60fps

  const calculateMetrics = useCallback((): PerformanceMetrics => {
    const now = performance.now();
    const deltaTime = now - lastTimeRef.current;
    
    // Validate deltaTime to prevent negative values
    if (deltaTime > 0 && Number.isFinite(deltaTime)) {
      const currentFps = 1000 / deltaTime;
      fpsHistoryRef.current.push(currentFps);
      
      // Keep only recent history
      if (fpsHistoryRef.current.length > HISTORY_SIZE) {
        fpsHistoryRef.current.shift();
      }

      // Check for frame drops (below 55fps)
      if (currentFps < 55) {
        dropCountRef.current++;
      }
    }

    const averageFps = fpsHistoryRef.current.length > 0
      ? fpsHistoryRef.current.reduce((sum, fps) => sum + fps, 0) / fpsHistoryRef.current.length
      : 0;

    const currentFps = fpsHistoryRef.current[fpsHistoryRef.current.length - 1] || 0;
    const isOptimal = averageFps >= 58 && dropCountRef.current < 5;

    return {
      fps: Math.round(currentFps),
      frameTime: Math.round(Math.max(0, deltaTime) * 100) / 100,
      averageFps: Math.round(averageFps * 100) / 100,
      dropCount: dropCountRef.current,
      totalFrames: frameCountRef.current,
      isOptimal
    };
  }, []);

  const tick = useCallback(() => {
    if (!isRunningRef.current) return;

    const now = performance.now();
    frameCountRef.current++;
    lastTimeRef.current = now;

    calculateMetrics();
    animationIdRef.current = requestAnimationFrame(tick);
  }, [calculateMetrics]);

  const start = useCallback(() => {
    if (isRunningRef.current) return;
    
    isRunningRef.current = true;
    lastTimeRef.current = performance.now();
    frameCountRef.current = 0;
    dropCountRef.current = 0;
    fpsHistoryRef.current = [];
    
    animationIdRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    isRunningRef.current = false;
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = undefined;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    frameCountRef.current = 0;
    lastTimeRef.current = 0;
    dropCountRef.current = 0;
    fpsHistoryRef.current = [];
  }, [stop]);

  const getMetrics = useCallback((): PerformanceMetrics => {
    return calculateMetrics();
  }, [calculateMetrics]);

  useEffect(() => {
    return () => {
      // Clean up animation frame and stop tracking
      isRunningRef.current = false;
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
        animationIdRef.current = undefined;
      }
    };
  }, []);

  return {
    start,
    stop,
    getMetrics,
    reset
  };
};

// Utility function for performance benchmarking
export const benchmarkPerformance = async (
  testName: string,
  iterations: number,
  testFunction: () => void | Promise<void>
): Promise<{ name: string; avgTime: number; totalTime: number; iterations: number }> => {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await testFunction();
    const end = performance.now();
    times.push(end - start);
  }
  
  const totalTime = times.reduce((sum, time) => sum + time, 0);
  const avgTime = totalTime / iterations;
  
  return {
    name: testName,
    avgTime: Math.round(avgTime * 1000) / 1000,
    totalTime: Math.round(totalTime * 1000) / 1000,
    iterations
  };
};
