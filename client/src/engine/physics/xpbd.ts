import { vectorLength } from '../kinematics';
import type { Joint, Point } from '../types';
import type {
  AxisLimitConstraint,
  AxisSpringConstraint,
  DistanceConstraint,
  HingeLimitConstraint,
  HingeSignMap,
  HingeSoftConstraint,
  PinConstraint,
  WorldPose,
  XpbdConfig,
  XpbdConstraint,
} from './types';

const EPS = 1e-9;

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (v: Point, s: number): Point => ({ x: v.x * s, y: v.y * s });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const crossZ = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const normalize = (v: Point): Point => {
  const d = Math.hypot(v.x, v.y);
  if (d <= EPS) return { x: 0, y: 0 };
  return { x: v.x / d, y: v.y / d };
};

const rotate = (v: Point, rad: number): Point => {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

const isFinitePoint = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y);

export const buildWorldPoseFromJoints = (
  joints: Record<string, Joint>,
  baseJoints: Record<string, Joint>,
  mode: 'preview' | 'target' | 'current' = 'preview',
): WorldPose => {
  const memo: Record<string, Point> = {};
  const visiting = new Set<string>();

  const getOffset = (j: Joint, base: Joint): Point => {
    const raw =
      mode === 'preview'
        ? (j.previewOffset ?? j.targetOffset)
        : mode === 'target'
          ? j.targetOffset
          : j.currentOffset;
    const fb =
      mode === 'preview'
        ? (base.previewOffset ?? base.targetOffset)
        : mode === 'target'
          ? base.targetOffset
          : base.currentOffset;
    return isFinitePoint(raw) ? raw : fb;
  };

  const worldOf = (id: string): Point => {
    if (memo[id]) return memo[id];
    const joint = joints[id] ?? baseJoints[id];
    const base = baseJoints[id];
    if (!joint || !base) {
      memo[id] = { x: 0, y: 0 };
      return memo[id];
    }
    if (visiting.has(id)) {
      memo[id] = { x: 0, y: 0 };
      return memo[id];
    }
    visiting.add(id);
    const off = getOffset(joint, base);
    if (!joint.parent) {
      memo[id] = { ...off };
    } else {
      memo[id] = add(worldOf(joint.parent), off);
    }
    visiting.delete(id);
    return memo[id];
  };

  for (const id of Object.keys(baseJoints)) {
    worldOf(id);
  }
  return memo;
};

export const worldPoseToOffsets = (
  world: WorldPose,
  baseJoints: Record<string, Joint>,
): Record<string, Point> => {
  const offsets: Record<string, Point> = {};
  for (const id of Object.keys(baseJoints)) {
    const joint = baseJoints[id];
    const w = world[id] ?? { x: 0, y: 0 };
    if (!joint.parent) offsets[id] = { ...w };
    else offsets[id] = sub(w, world[joint.parent] ?? { x: 0, y: 0 });
  }
  return offsets;
};

type SolveContext = {
  p: WorldPose;
  prevP: WorldPose;
  invMass: Record<string, number>;
  lambdas: Map<string, number>;
  cfg: XpbdConfig;
  hingeSigns: HingeSignMap;
};

const lambdaKey = (c: DistanceConstraint | PinConstraint) =>
  c.kind === 'distance' ? `d:${c.a}:${c.b}` : `p:${c.id}`;

const axisSpringKey = (c: AxisSpringConstraint) => `as:${c.id}:${c.axis}`;
const axisLimitKey = (c: AxisLimitConstraint, bound: 'min' | 'max') => `al:${c.id}:${c.axis}:${bound}`;

const solvePin = (ctx: SolveContext, c: PinConstraint) => {
  const pos = ctx.p[c.id];
  if (!pos) return;
  if (!isFinitePoint(c.target)) return;

  if (c.compliance <= 0) {
    ctx.p[c.id] = { ...c.target };
    ctx.invMass[c.id] = 0;
    return;
  }

  const w = ctx.invMass[c.id] ?? 1;
  if (w <= 0) {
    ctx.p[c.id] = { ...c.target };
    return;
  }

  const dir = sub(pos, c.target);
  const len = Math.hypot(dir.x, dir.y);
  if (len <= EPS) return;
  const n = scale(dir, 1 / len);

  const C = len;
  const alpha = c.compliance / (ctx.cfg.dt * ctx.cfg.dt);
  const key = lambdaKey(c);
  const lambda0 = ctx.lambdas.get(key) ?? 0;

  const dlambda = (-C - alpha * lambda0) / (w + alpha);
  const lambda = lambda0 + dlambda;
  ctx.lambdas.set(key, lambda);

  ctx.p[c.id] = sub(pos, scale(n, w * dlambda));
};

const solveAxisSpring = (ctx: SolveContext, c: AxisSpringConstraint) => {
  const pos = ctx.p[c.id];
  if (!pos) return;
  if (!Number.isFinite(c.target)) return;

  const axis = c.axis;
  const v = axis === 'x' ? pos.x : pos.y;

  if (c.compliance <= 0) {
    ctx.p[c.id] = axis === 'x' ? { ...pos, x: c.target } : { ...pos, y: c.target };
    return;
  }

  const w = ctx.invMass[c.id] ?? 1;
  if (w <= 0) return;

  const C = v - c.target;
  if (!Number.isFinite(C) || Math.abs(C) <= EPS) return;

  const alpha = Math.max(0, c.compliance) / (ctx.cfg.dt * ctx.cfg.dt);
  const key = axisSpringKey(c);
  const lambda0 = ctx.lambdas.get(key) ?? 0;

  const dlambda = (-C - alpha * lambda0) / (w + alpha);
  const lambda = lambda0 + dlambda;
  ctx.lambdas.set(key, lambda);

  const nextV = v + w * dlambda;
  ctx.p[c.id] = axis === 'x' ? { ...pos, x: nextV } : { ...pos, y: nextV };
};

const solveAxisLimit = (ctx: SolveContext, c: AxisLimitConstraint) => {
  const axis = c.axis;

  const min = c.min;
  const max = c.max;
  if (min === undefined && max === undefined) return;

  // Prefer resolving min/max separately with independent lambdas to avoid interference.
  const applyBound = (bound: 'min' | 'max', boundValue: number) => {
    const pos = ctx.p[c.id];
    if (!pos) return;
    const v = axis === 'x' ? pos.x : pos.y;
    const isViolation = bound === 'min' ? v < boundValue : v > boundValue;
    if (!isViolation) return;

    if (c.compliance <= 0) {
      ctx.p[c.id] = axis === 'x' ? { ...pos, x: boundValue } : { ...pos, y: boundValue };
      return;
    }

    const w = ctx.invMass[c.id] ?? 1;
    if (w <= 0) return;

    const C = v - boundValue; // negative for min violations, positive for max violations
    if (!Number.isFinite(C) || Math.abs(C) <= EPS) return;

    const alpha = Math.max(0, c.compliance) / (ctx.cfg.dt * ctx.cfg.dt);
    const key = axisLimitKey(c, bound);
    const lambda0 = ctx.lambdas.get(key) ?? 0;

    const dlambda = (-C - alpha * lambda0) / (w + alpha);
    const lambda = lambda0 + dlambda;
    ctx.lambdas.set(key, lambda);

    const nextV = v + w * dlambda;
    ctx.p[c.id] = axis === 'x' ? { ...pos, x: nextV } : { ...pos, y: nextV };
  };

  if (min !== undefined && Number.isFinite(min)) applyBound('min', min);
  if (max !== undefined && Number.isFinite(max)) applyBound('max', max);
};

const solveDistance = (ctx: SolveContext, c: DistanceConstraint) => {
  const pa = ctx.p[c.a];
  const pb = ctx.p[c.b];
  if (!pa || !pb) return;

  const wa = ctx.invMass[c.a] ?? 1;
  const wb = ctx.invMass[c.b] ?? 1;
  if (wa + wb <= 0) return;

  const d = sub(pb, pa);
  const len = Math.hypot(d.x, d.y);
  if (len <= EPS) return;
  const n = scale(d, 1 / len);
  const C = len - c.rest;

  const alpha = Math.max(0, c.compliance) / (ctx.cfg.dt * ctx.cfg.dt);
  const key = lambdaKey(c);
  const lambda0 = ctx.lambdas.get(key) ?? 0;

  const dlambda = (-C - alpha * lambda0) / (wa + wb + alpha);
  const lambda = lambda0 + dlambda;
  ctx.lambdas.set(key, lambda);

  ctx.p[c.a] = sub(pa, scale(n, wa * dlambda));
  ctx.p[c.b] = add(pb, scale(n, wb * dlambda));
};

const angleAt = (a: Point, b: Point, c: Point) => {
  const v1 = normalize(sub(a, b));
  const v2 = normalize(sub(c, b));
  const d = clamp(dot(v1, v2), -1, 1);
  return Math.acos(d);
};

const solveHingeLimit = (ctx: SolveContext, c: HingeLimitConstraint) => {
  const pa = ctx.p[c.a];
  const pb = ctx.p[c.b];
  const pc = ctx.p[c.c];
  if (!pa || !pb || !pc) return;

  const wc = ctx.invMass[c.c] ?? 1;
  if (wc <= 0) return;

  const v1 = sub(pa, pb);
  const v2 = sub(pc, pb);
  const l2 = Math.hypot(v2.x, v2.y);
  const l1 = Math.hypot(v1.x, v1.y);
  if (l1 <= EPS || l2 <= EPS) return;

  const theta = angleAt(pa, pb, pc);
  const min = clamp(c.minRad, 0, Math.PI);
  const max = clamp(c.maxRad, 0, Math.PI);
  if (theta >= min && theta <= max) return;

  const desired = clamp(theta, min, max);
  const u1 = scale(v1, 1 / l1);

  const rawSign = Math.sign(crossZ(u1, scale(v2, 1 / l2)));
  const signKey = `hinge:${c.b}`;
  const signPrev = ctx.hingeSigns[signKey] ?? (rawSign || 1);
  const sign = rawSign || signPrev || 1;
  ctx.hingeSigns[signKey] = sign;

  const u2d = rotate(u1, sign * desired);
  const targetC = add(pb, scale(u2d, l2));

  if (c.compliance <= 0) {
    ctx.p[c.c] = targetC;
    return;
  }

  // Softly approach the limit when compliance > 0.
  const t = clamp(1 / (1 + c.compliance * 50), 0.05, 1);
  ctx.p[c.c] = add(pc, scale(sub(targetC, pc), t));
};

const solveHingeSoft = (ctx: SolveContext, c: HingeSoftConstraint) => {
  const pa = ctx.p[c.a];
  const pb = ctx.p[c.b];
  const pc = ctx.p[c.c];
  if (!pa || !pb || !pc) return;

  const wc = ctx.invMass[c.c] ?? 1;
  if (wc <= 0) return;

  const v1 = sub(pa, pb);
  const v2 = sub(pc, pb);
  const l2 = Math.hypot(v2.x, v2.y);
  const l1 = Math.hypot(v1.x, v1.y);
  if (l1 <= EPS || l2 <= EPS) return;

  const u1 = scale(v1, 1 / l1);
  const u2 = scale(v2, 1 / l2);

  const rawSign = Math.sign(crossZ(u1, u2));
  const signKey = `hinge:${c.b}`;
  const signPrev = ctx.hingeSigns[signKey] ?? (rawSign || 1);
  const sign = rawSign || signPrev || 1;
  ctx.hingeSigns[signKey] = sign;

  const desired = clamp(c.restRad, 0, Math.PI);
  const u2d = rotate(u1, sign * desired);
  const targetC = add(pb, scale(u2d, l2));

  const compliance = Math.max(0, c.compliance);
  const strength = compliance <= 0 ? 1 : clamp(1 / (1 + compliance * 35), 0.03, 0.35);
  ctx.p[c.c] = add(pc, scale(sub(targetC, pc), strength));
};

export const solveXpbd = (
  world: WorldPose,
  constraints: XpbdConstraint[],
  invMass: Record<string, number>,
  cfg: XpbdConfig,
  hingeSignsIn: HingeSignMap = {},
): { world: WorldPose; hingeSigns: HingeSignMap } => {
  const p: WorldPose = {};
  const prevP: WorldPose = {};
  for (const [id, pos] of Object.entries(world)) {
    p[id] = { ...pos };
    prevP[id] = { ...pos };
  }

  const ctx: SolveContext = {
    p,
    prevP,
    invMass: { ...invMass },
    lambdas: new Map(),
    cfg,
    hingeSigns: { ...hingeSignsIn },
  };

  const iterations = Math.max(1, Math.floor(cfg.iterations));

  // Apply hard pins up front (and freeze them for this step).
  for (const c of constraints) {
    if (c.kind === 'pin' && c.compliance <= 0) solvePin(ctx, c);
  }

  for (let iter = 0; iter < iterations; iter++) {
    for (const c of constraints) {
      if (c.kind === 'distance') {
        solveDistance(ctx, c);
      }
      else if (c.kind === 'pin') solvePin(ctx, c);
      else if (c.kind === 'axisSpring') solveAxisSpring(ctx, c);
      else if (c.kind === 'axisLimit') solveAxisLimit(ctx, c);
      else if (c.kind === 'hingeLimit') solveHingeLimit(ctx, c);
      else if (c.kind === 'hingeSoft') solveHingeSoft(ctx, c);
    }
  }

  // Damping: reduce frame-to-frame jitter by blending toward previous pose.
  const damping = clamp(cfg.damping, 0, 0.25);
  if (damping > 0) {
    for (const [id, pos] of Object.entries(ctx.p)) {
      const prevPos = prevP[id];
      if (!prevPos) continue;
      if ((ctx.invMass[id] ?? 1) <= 0) continue;
      ctx.p[id] = add(pos, scale(sub(prevPos, pos), damping));
    }
  }

  return { world: ctx.p, hingeSigns: ctx.hingeSigns };
};

export const baseLength = (id: string, baseJoints: Record<string, Joint>): number => {
  const j = baseJoints[id];
  if (!j) return 0;
  const len = vectorLength(j.baseOffset);
  return Number.isFinite(len) ? len : 0;
};
