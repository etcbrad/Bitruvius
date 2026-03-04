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

const isFinitePoint = (p: Point | null | undefined): p is Point =>
  p != null && Number.isFinite(p.x) && Number.isFinite(p.y);

const clampRigidCardboardDragTarget = (input: {
  drag: { id: string; target: Point };
  joints: Record<string, Joint>;
  baseJoints: Record<string, Joint>;
  activeRoots: string[];
  rootTargets: Record<string, Point>;
  world0: WorldPose;
}): Point => {
  const { drag, joints, baseJoints, activeRoots, rootTargets, world0 } = input;

  // Rigid cardboard hard limit:
  // When there are pinned roots, clamp the drag target so the dragged joint stays within the
  // maximum reachable distance to each pinned root (sum of base bone lengths along the path).
  //
  // Over-pulling then "saturates" at the fully-extended configuration instead of producing
  // impossible constraints (which show up as flicker/tension).
  if (!isFinitePoint(drag.target)) {
    const fallback = world0[drag.id];
    return isFinitePoint(fallback) ? fallback : { x: 0, y: 0 };
  }
  if (!activeRoots.length) return drag.target;

  const maxDepth = 64;
  const parentOf = (id: string): string | null => (joints[id] ?? baseJoints[id])?.parent ?? null;

  const pathLenBetween = (aId: string, bId: string): number => {
    if (aId === bId) return 0;

    const aDist = new Map<string, number>();
    let cur: string | null = aId;
    let distAcc = 0;
    for (let depth = 0; cur && depth < maxDepth; depth += 1) {
      if (!aDist.has(cur)) aDist.set(cur, distAcc);
      distAcc += baseLength(cur, baseJoints);
      cur = parentOf(cur);
    }

    cur = bId;
    distAcc = 0;
    for (let depth = 0; cur && depth < maxDepth; depth += 1) {
      const hit = aDist.get(cur);
      if (hit !== undefined) return hit + distAcc;
      distAcc += baseLength(cur, baseJoints);
      cur = parentOf(cur);
    }

    return Number.POSITIVE_INFINITY;
  };

  const pinnedRoots = activeRoots
    .map((id) => {
      const pos = isFinitePoint(rootTargets[id])
        ? rootTargets[id]
        : isFinitePoint(world0[id])
          ? world0[id]
          : null;
      if (!pos) return null;
      const maxDist = pathLenBetween(drag.id, id);
      if (!Number.isFinite(maxDist) || maxDist <= 1e-6) return null;
      return { pos, maxDist };
    })
    .filter((v): v is { pos: Point; maxDist: number } => Boolean(v));

  if (pinnedRoots.length === 0) return drag.target;

  // Iterative projection into the intersection of "reachable" discs.
  let candidate: Point = { ...drag.target };
  for (let iter = 0; iter < 3; iter += 1) {
    for (const root of pinnedRoots) {
      const dx = candidate.x - root.pos.x;
      const dy = candidate.y - root.pos.y;
      const d = Math.hypot(dx, dy);
      if (!Number.isFinite(d) || d <= 1e-9) continue;
      if (d <= root.maxDist) continue;
      const s = root.maxDist / d;
      candidate = { x: root.pos.x + dx * s, y: root.pos.y + dy * s };
    }
  }

  return candidate;
};

export type PosePhysicsInput = {
  joints: Record<string, Joint>;
  baseJoints?: Record<string, Joint>;
  activeRoots: string[];
  rootTargets: Record<string, Point>;
  drag: { id: string; target: Point } | null;
  connectionOverrides?: SkeletonState['connectionOverrides'];
  extraConstraints?: XpbdConstraint[];
  options: {
    iterations?: number;
    dt: number;
    damping?: number;
    wireCompliance?: number;
    rigidity?: string;
    hardStop?: boolean;
    autoBend?: boolean;
    bendEnabled?: boolean;
    hingeSigns?: HingeSignMap;
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
  neck_base: { a: 'collar', b: 'neck_base', c: 'head', min: 20, max: 160 },
  sternum: { a: 'navel', b: 'sternum', c: 'collar', min: 30, max: 150 },
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
  const connectionOverrides = input.connectionOverrides ?? {};

  const dt = clamp(input.options.dt, 1 / 120, 1 / 20);
  const cfg: XpbdConfig = {
    iterations: clamp(input.options.iterations ?? 16, 1, 40),
    dt,
    damping: clamp(input.options.damping ?? 0.03, 0, 0.25),
  };

  const rigidity = input.options.rigidity ?? 'realistic';
  // "Wire" constraints are non-hierarchical braces (structural links / soft limits).
  // For Reiniger-style rigid cutouts, these should be *very* stiff but not perfectly rigid,
  // so the solver can resolve small inconsistencies without jitter/popping.
  const wireCompliance = (() => {
    const requested = Math.max(0, input.options.wireCompliance ?? (rigidity === 'cardboard' ? 0.00025 : 0.0015));
    if (rigidity === 'rubberhose') return 0.02;
    if (rigidity === 'cardboard') return Math.min(requested, 0.002);
    return Math.min(requested, 0.02);
  })();
  const stretchEnabled = Boolean(input.options.stretchEnabled);
  const bendEnabled = Boolean(input.options.bendEnabled);
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

  // Initial world pose from preview.
  const world0 = buildWorldPoseFromJoints(joints, baseJoints, 'preview');

  // Default masses.
  for (const id of Object.keys(baseJoints)) invMass[id] = 1;

  // Hierarchy bones (unbreakable).
  for (const id of Object.keys(baseJoints)) {
    const joint = joints[id] ?? baseJoints[id];
    if (!joint?.parent) continue;

    const key = joint.parent < id ? `${joint.parent}:${id}` : `${id}:${joint.parent}`;
    const conn = connMap.get(key);
    const stretchMode = connectionOverrides[key]?.stretchMode ?? conn?.stretchMode ?? 'rigid';

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

  // Roots (hard).
  for (const id of input.activeRoots) {
    const target = input.rootTargets[id];
    if (!target) continue;
    const c: PinConstraint = { kind: 'pin', id, target, compliance: 0 };
    constraints.push(c);
    invMass[id] = 0;
  }

  // Drag pin (hard).
  if (input.drag) {
    const rigidityForClamp = input.options.rigidity ?? 'realistic';
    const stretchEnabledForClamp = Boolean(input.options.stretchEnabled);

    const target =
      rigidityForClamp === 'cardboard' && !stretchEnabledForClamp
        ? clampRigidCardboardDragTarget({
            drag: input.drag,
            joints,
            baseJoints,
            activeRoots: input.activeRoots,
            rootTargets: input.rootTargets,
            world0,
          })
        : input.drag.target;

    constraints.push({ kind: 'pin', id: input.drag.id, target, compliance: 0 });
    invMass[input.drag.id] = 0;
  }

  if (input.extraConstraints?.length) {
    constraints.push(...input.extraConstraints);
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

  // Shoulder-driven collar balance: gently bias collar toward aiming at the shoulder midpoint.
  // Only active in bend/stretch contexts to avoid fighting rigid FK intent.
  // During head/neck direct manipulation, defer to interaction-driven constraints to avoid twitchy competing targets.
  const draggingHeadOrNeck = input.drag?.id === 'head' || input.drag?.id === 'neck_base';
  if (!draggingHeadOrNeck && rigidity !== 'cardboard' && (bendEnabled || stretchEnabled) && (invMass.collar ?? 1) > 0) {
    const sternumWorld = world0.sternum;
    const lShoulderWorld = world0.l_shoulder;
    const rShoulderWorld = world0.r_shoulder;
    if (sternumWorld && lShoulderWorld && rShoulderWorld) {
      const mid = {
        x: (lShoulderWorld.x + rShoulderWorld.x) * 0.5,
        y: (lShoulderWorld.y + rShoulderWorld.y) * 0.5,
      };
      const dx = mid.x - sternumWorld.x;
      const dy = mid.y - sternumWorld.y;
      const len = Math.hypot(dx, dy);
      if (Number.isFinite(len) && len > 1e-6) {
        const dir = { x: dx / len, y: dy / len };
        const restLen = baseLength('collar', baseJoints);
        if (Number.isFinite(restLen) && restLen > 1e-6) {
          const target = {
            x: sternumWorld.x + dir.x * restLen,
            y: sternumWorld.y + dir.y * restLen,
          };
          const compliance = rigidity === 'rubberhose' ? 0.006 : 0.002;
          const c: PinConstraint = { kind: 'pin', id: 'collar', target, compliance };
          constraints.push(c);
        }
      }
    }
  }

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
  if (state.footPlungerEnabled) return true;
  const cm = state.controlMode;
  if (cm === 'IK' || cm === 'Rubberband' || cm === 'JointDrag') return true;
  if (state.activeRoots.length > 0) return true;
  return Boolean(state.stretchEnabled) || Boolean(state.bendEnabled);
};
