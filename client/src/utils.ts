export const d2r = (d: number) => d * Math.PI / 180;
export const r2d = (r: number) => r * 180 / Math.PI;
export const normA = (a: number) => ((a % 360) + 540) % 360 - 180;
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

export const throttle = (func: Function, limit: number) => {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
};
