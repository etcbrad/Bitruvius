import type { Joint, Point, RigidityPreset } from "../engine/types";
import { buildWorldPoseFromJoints } from "../engine/physics/xpbd";
import { CONNECTIONS, INITIAL_JOINTS } from "../engine/model";
import { canonicalConnKey } from "./connectionKey";

export const POSE_PHYSICS_STABILIZE_JOINT_IDS = [
  "navel",
  "sternum",
  "collar",
  "neck_base",
  "head",
  "l_shoulder",
  "r_shoulder",
  "l_elbow",
  "r_elbow",
  "l_wrist",
  "r_wrist",
  "l_hip",
  "r_hip",
  "l_knee",
  "r_knee",
  "l_ankle",
  "r_ankle",
  "l_toe",
  "r_toe",
] as const;

type WireRestDef = { a: string; b: string; rest: number };

const WIRE_REST_DEFS: WireRestDef[] = (() => {
  const baseWorld = buildWorldPoseFromJoints(INITIAL_JOINTS, INITIAL_JOINTS, "preview");
  const seen = new Set<string>();
  const out: WireRestDef[] = [];

  const push = (a: string, b: string) => {
    const key = canonicalConnKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    const pa = baseWorld[a];
    const pb = baseWorld[b];
    if (!pa || !pb) return;
    const rest = Math.hypot(pa.x - pb.x, pa.y - pb.y);
    if (!Number.isFinite(rest) || rest <= 1e-6) return;
    out.push({ a, b, rest });
  };

  for (const conn of CONNECTIONS) {
    if (conn.type === "bone") continue;
    push(conn.from, conn.to);
  }

  // Includes the extra "diamond" stiffeners used by pose physics (shoulders ↔ neck base).
  push("l_shoulder", "neck_base");
  push("r_shoulder", "neck_base");

  return out;
})();

export function defaultWireComplianceForRigidity(rigidity: RigidityPreset): number {
  if (rigidity === "cardboard") return 0.00025;
  if (rigidity === "rubberhose") return 0.02;
  return 0.0015;
}

export function computeMaxWireStrain(joints: Record<string, Joint>): number {
  const world = buildWorldPoseFromJoints(joints, INITIAL_JOINTS, "preview");
  let max = 0;
  for (const w of WIRE_REST_DEFS) {
    const a = world[w.a];
    const b = world[w.b];
    if (!a || !b) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (!Number.isFinite(d) || d <= 1e-9) continue;
    const strain = Math.max(0, d / w.rest - 1);
    if (strain > max) max = strain;
  }
  return max;
}

export function computeWorldPoseRmsDelta(
  a: Record<string, Point>,
  b: Record<string, Point>,
): { rms: number; count: number } {
  let n = 0;
  let sum = 0;
  for (const id of POSE_PHYSICS_STABILIZE_JOINT_IDS) {
    const pa = a[id];
    const pb = b[id];
    if (!pa || !pb) continue;
    const dx = pa.x - pb.x;
    const dy = pa.y - pb.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    sum += dx * dx + dy * dy;
    n += 1;
  }
  return { rms: n ? Math.sqrt(sum / n) : 0, count: n };
}
