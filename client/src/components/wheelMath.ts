export type WheelMathArgs = {
  min: number;
  max: number;
  step: number;
  sensitivity?: number; // 1 = a full 360deg maps across full range/log-range
  fineSensitivity?: number; // used when Shift is held (optional)
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const quantize = (v: number, min: number, step: number) => {
  if (!Number.isFinite(step) || step <= 0) return v;
  const q = Math.round((v - min) / step) * step + min;
  // Avoid floating noise in UI readouts (e.g. 0.30000000004)
  const digits = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step)) + 1));
  const m = Math.pow(10, digits);
  return Math.round(q * m) / m;
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

