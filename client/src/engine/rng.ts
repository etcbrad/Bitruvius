export type Rng = {
  /** Returns a float in [0, 1). */
  next: () => number;
  /** Returns an integer in [min, max] (inclusive). */
  int: (min: number, max: number) => number;
};

// Small, fast, deterministic PRNG (mulberry32).
// Good enough for animation noise / timing jitter; not cryptographic.
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const createRng = (seed: number): Rng => {
  const next = mulberry32(seed);
  return {
    next,
    int: (min: number, max: number) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      if (hi < lo) return lo;
      return lo + Math.floor(next() * (hi - lo + 1));
    },
  };
};

