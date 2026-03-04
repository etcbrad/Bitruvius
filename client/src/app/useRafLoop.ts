import { useEffect, useRef } from 'react';

export const useRafLoop = (fn: (nowMs: number, dtSec: number) => void, deps: unknown[] = []) => {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      fnRef.current(now, dt);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};

