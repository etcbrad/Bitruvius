import { CONNECTIONS, INITIAL_JOINTS } from '../model';
import type { Joint, Point, SkeletonState } from '../types';
import type {
  HingeLimitConstraint,
  HingeSignMap,
  HingeSoftConstraint,
  PinConstraint,
  WorldPose,
  XpbdConfig,
  XpbdConstraint,
} from './types';
import { baseLength, buildWorldPoseFromJoints, solveXpbd, worldPoseToOffsets } from './xpbd';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const degToRad = (deg: number) => (deg * Math.PI) / 180;

const offsetLen = (a: Point) => Math.hypot(a.x, a.y);

export type PosePhysicsInput = {
  joints: Record<string, Joint>;
  baseJoints?: Record<string, Joint>;
  activePins: string[];
  pinTargets: Record<string, Point>;
  drag: { id: string; target: Point } | null;
  options: {
    iterations?: number;
    dt: number;
    damping?: number;
    wireCompliance?: number;
    rigidity?: string;
    hardStop?: boolean;
    autoBend?: boolean;
    hingeSigns?: HingeSignMap;
    physicsMode?: string;
    stretchEnabled?: boolean;
  };
};

export type PosePhysicsOutput = {
  joints: Record<string, Joint>;
  hingeSigns: HingeSignMap;
  world: WorldPose;
};

const HINGE_LIMITS_DEG: Record<
  string,
  { a: string; b: string; c: string; min: number; max: number }
> = {
  l_elbow: { a: 'l_shoulder', b: 'l_elbow', c: 'l_wrist', min: 5, max: 175 },
  r_elbow: { a: 'r_shoulder', b: 'r_elbow', c: 'r_wrist', min: 5, max: 175 },
  l_knee: { a: 'l_hip', b: 'l_knee', c: 'l_ankle', min: 5, max: 175 },
  r_knee: { a: 'r_hip', b: 'r_knee', c: 'r_ankle', min: 5, max: 175 },
  // Core joints (conservative; can be tuned later)
  neck_base: { a: 'sternum', b: 'neck_base', c: 'cranium', min: 20, max: 160 },
  navel: { a: 'sacrum', b: 'navel', c: 'sternum', min: 30, max: 150 },
};

const computeBaseHingeAngle = (a: string, b: string, c: string): number => {
  const baseWorld = buildWorldPoseFromJoints(INITIAL_JOINTS, INITIAL_JOINTS, 'preview');
  const pa = baseWorld[a];
  const pb = baseWorld[b];
  const pc = baseWorld[c];
  if (!pa || !pb || !pc) return Math.PI / 2;

  const v1 = { x: pa.x - pb.x, y: pa.y - pb.y };
  const v2 = { x: pc.x - pb.x, y: pc.y - pb.y };
  const l1 = Math.hypot(v1.x, v1.y);
  const l2 = Math.hypot(v2.x, v2.y);
  if (l1 <= 1e-9 || l2 <= 1e-9) return Math.PI / 2;
  const u1 = { x: v1.x / l1, y: v1.y / l1 };
  const u2 = { x: v2.x / l2, y: v2.y / l2 };
  const d = clamp(u1.x * u2.x + u1.y * u2.y, -1, 1);
  return Math.acos(d);
};

const BASE_BEND_REST: Record<string, number> = Object.fromEntries(
  Object.entries(HINGE_LIMITS_DEG).map(([hingeId, def]) => [
    hingeId,
    computeBaseHingeAngle(def.a, def.b, def.c),
  ]),
);

export const stepPosePhysics = (input: PosePhysicsInput): PosePhysicsOutput => {
  return stepPosePhysicsInternal(input);
};

const stepPosePhysicsInternal = (input: PosePhysicsInput): PosePhysicsOutput => {
  const baseJoints = input.baseJoints ?? INITIAL_JOINTS;
  const joints = input.joints;

  const dt = clamp(input.options.dt, 1 / 120, 1 / 20);
  const cfg: XpbdConfig = {
    iterations: clamp(input.options.iterations ?? 16, 1, 40),
    dt,
    damping: clamp(input.options.damping ?? 0.03, 0, 0.25),
  };

  const rigidity = input.options.rigidity ?? 'realistic';
  const wireCompliance =
    rigidity === 'rubberhose'
      ? 0.02
      : rigidity === 'cardboard'
        ? 0.0001
        : Math.max(0, input.options.wireCompliance ?? 0.0015);
  const stretchEnabled = Boolean(input.options.stretchEnabled);
  const boneElasticCompliance =
    rigidity === 'rubberhose' ? 0.0015 : rigidity === 'cardboard' ? 0 : 0.0005;

  const connMap = (() => {
    const m = new Map<string, (typeof CONNECTIONS)[number]>();
    for (const c of CONNECTIONS) {
      const a = c.from;
      const b = c.to;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      m.set(key, c);
    }
    return m;
  })();

  const constraints: XpbdConstraint[] = [];
  const invMass: Record<string, number> = {};

  // Default masses.
  for (const id of Object.keys(baseJoints)) invMass[id] = 1;

  // Hierarchy bones (unbreakable).
  for (const id of Object.keys(baseJoints)) {
    const joint = joints[id] ?? baseJoints[id];
    if (!joint?.parent) continue;

    const key = joint.parent < id ? `${joint.parent}:${id}` : `${id}:${joint.parent}`;
    const conn = connMap.get(key);
    const stretchMode = conn?.stretchMode ?? 'rigid';

    const baseRest = baseLength(id, baseJoints);
    let rest = baseRest;
    if (stretchEnabled && stretchMode === 'stretch') {
      const off = joint.previewOffset ?? joint.targetOffset ?? joint.baseOffset;
      const len = offsetLen(off);
      if (Number.isFinite(len) && len > 1e-6) rest = len;
    }

    const compliance = stretchMode === 'elastic' ? boneElasticCompliance : 0;

    const constraint: any = {
      kind: 'distance',
      a: joint.parent,
      b: id,
      rest,
      compliance,
    };

    if (conn) {
      constraint.connection = conn;
    }

    constraints.push(constraint);
  }

  // Wires / soft limits from CONNECTIONS (soft distance constraints).
  const baseWorld = buildWorldPoseFromJoints(baseJoints, baseJoints, 'preview');
  const wireKey = new Set<string>();
  for (const conn of CONNECTIONS) {
    if (conn.type === 'bone') continue;
    const a = conn.from;
    const b = conn.to;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (wireKey.has(key)) continue;
    wireKey.add(key);
    const pa = baseWorld[a];
    const pb = baseWorld[b];
    if (!pa || !pb) continue;
    constraints.push({
      kind: 'distance',
      a,
      b,
      rest: dist(pa, pb),
      compliance: wireCompliance,
    });
  }

  // Pins (hard).
  for (const id of input.activePins) {
    const target = input.pinTargets[id];
    if (!target) continue;
    const c: PinConstraint = { kind: 'pin', id, target, compliance: 0 };
    constraints.push(c);
    invMass[id] = 0;
  }

  // Drag pin (hard).
  if (input.drag) {
    constraints.push({ kind: 'pin', id: input.drag.id, target: input.drag.target, compliance: 0 });
    invMass[input.drag.id] = 0;
  }

  // Hard stop hinge limits.
  if (input.options.hardStop) {
    for (const def of Object.values(HINGE_LIMITS_DEG)) {
      const c: HingeLimitConstraint = {
        kind: 'hingeLimit',
        a: def.a,
        b: def.b,
        c: def.c,
        minRad: degToRad(def.min),
        maxRad: degToRad(def.max),
        compliance: 0,
      };
      constraints.push(c);
    }
  }

  // Auto-bend (soft bias to rest).
  if (input.options.autoBend) {
    for (const [hingeId, def] of Object.entries(HINGE_LIMITS_DEG)) {
      const restRad = BASE_BEND_REST[hingeId] ?? Math.PI / 2;
      const c: HingeSoftConstraint = {
        kind: 'hingeSoft',
        a: def.a,
        b: def.b,
        c: def.c,
        restRad,
        compliance: 0.02,
      };
      constraints.push(c);
    }
  }

  // Initial world pose from preview.
  const world0 = buildWorldPoseFromJoints(joints, baseJoints, 'preview');
  const physicsOutput = solveXpbd(
    world0,
    constraints,
    invMass,
    cfg,
    input.options.hingeSigns ?? {},
  );
  
  const { world, hingeSigns } = physicsOutput;

  // Convert world positions to local offsets and write them back across preview/target/current
  // to avoid any ghost/delay artifacts.
  const offsets = worldPoseToOffsets(world, baseJoints);
  const nextJoints: Record<string, Joint> = { ...joints };
  for (const id of Object.keys(baseJoints)) {
    const j = nextJoints[id] ?? baseJoints[id];
    const off = offsets[id] ?? j.previewOffset;
    nextJoints[id] = { ...j, previewOffset: off, targetOffset: off, currentOffset: off };
  }

  return { joints: nextJoints, hingeSigns, world };
};

export const shouldRunPosePhysics = (state: SkeletonState): boolean => {
  const cm = state.controlMode;
  if (cm === 'IK' || cm === 'Hybrid' || cm === 'JointDrag') return true;
  return Boolean(state.stretchEnabled) || Boolean(state.bendEnabled);
};
