export type WheelMathArgs = {
  min: number;
  max: number;
  step: number;
  sensitivity?: number; // 1 = a full 360deg maps across full range/log-range
  fineSensitivity?: number; // used when Shift is held (optional)
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const quantize = (v: number, min: number, step: number) => {
  // Input validation
  if (!Number.isFinite(v) || !Number.isFinite(min) || !Number.isFinite(step)) {
    return v;
  }
  
  // Handle edge cases for step
  if (step <= 0) {
    // If step is invalid or zero, return the value clamped to reasonable bounds
    return v;
  }
  
  // Handle very small steps to prevent floating point precision issues
  if (step < 1e-10) {
    return v;
  }
  
  const q = Math.round((v - min) / step) * step + min;
  
  // Avoid floating noise in UI readouts (e.g. 0.30000000004)
  // Calculate appropriate precision based on step size
  const stepLog10 = Math.log10(Math.abs(step));
  const digits = Math.max(0, Math.min(12, Math.ceil(-stepLog10) + 2));
  const m = Math.pow(10, digits);
  const quantized = Math.round(q * m) / m;
  
  // Final validation to ensure we didn't create NaN or Infinity
  if (!Number.isFinite(quantized)) {
    return v;
  }
  
  return quantized;
};

export function applyWheelDeltaLinear(value: number, deltaDeg: number, args: WheelMathArgs): number {
  const { min, max, step } = args;
  const sensitivity = Number.isFinite(args.sensitivity) ? (args.sensitivity as number) : 1;
  if (!Number.isFinite(value) || !Number.isFinite(deltaDeg) || !Number.isFinite(min) || !Number.isFinite(max)) return value;
  if (max <= min) return clamp(value, min, max);

  const range = max - min;
  const dv = (deltaDeg / 360) * range * sensitivity;
  const next = clamp(value + dv, min, max);
  return clamp(quantize(next, min, step), min, max);
}

export function applyWheelDeltaLog(value: number, deltaDeg: number, args: WheelMathArgs): number {
  const { min, max, step } = args;
  const sensitivity = Number.isFinite(args.sensitivity) ? (args.sensitivity as number) : 1;
  if (!Number.isFinite(value) || !Number.isFinite(deltaDeg) || !Number.isFinite(min) || !Number.isFinite(max)) return value;
  if (max <= min) return clamp(value, min, max);

  // Log wheel requires positive bounds; fall back to linear if invalid.
  if (min <= 0 || max <= 0) return applyWheelDeltaLinear(value, deltaDeg, args);

  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const logRange = logMax - logMin;
  if (!Number.isFinite(logRange) || Math.abs(logRange) < 1e-12) return clamp(value, min, max);

  const vClamped = clamp(value, min, max);
  const logV = Math.log(vClamped);
  const dLog = (deltaDeg / 360) * logRange * sensitivity;
  const next = Math.exp(logV + dLog);
  const clamped = clamp(next, min, max);
  return clamp(quantize(clamped, min, step), min, max);
}

