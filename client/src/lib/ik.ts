import type { Bone, Vec2 } from '@shared/skeleton';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const normalizeAngle = (a: number) => {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
};

export function solveFABRIK(
  chain: Bone[], // ordered root → tip, world transforms already computed
  target: Vec2,
  iterations = 10,
  tolerance = 0.5,
): Vec2[] {
  if (chain.length === 0) return [];

  const n = chain.length;

  const p: Vec2[] = new Array(n + 1);
  for (let i = 0; i < n; i++) {
    const b = chain[i]!;
    p[i] = { x: b.worldX ?? 0, y: b.worldY ?? 0 };
  }

  const tipBone = chain[n - 1]!;
  const tipHead = p[n - 1]!;
  const tipAngle = tipBone.worldAngle ?? 0;
  p[n] = {
    x: tipHead.x + Math.cos(tipAngle) * tipBone.length,
    y: tipHead.y + Math.sin(tipAngle) * tipBone.length,
  };

  const root = { ...p[0]! };

  for (let it = 0; it < iterations; it++) {
    // Forward pass
    p[n] = { x: target.x, y: target.y };
    for (let i = n - 1; i >= 0; i--) {
      const d = dist(p[i]!, p[i + 1]!);
      const ratio = d > 1e-6 ? chain[i]!.length / d : 0;
      p[i] = lerp(p[i + 1]!, p[i]!, ratio);
    }

    // Backward pass
    p[0] = { ...root };
    for (let i = 0; i < n; i++) {
      const d = dist(p[i]!, p[i + 1]!);
      const ratio = d > 1e-6 ? chain[i]!.length / d : 0;
      p[i + 1] = lerp(p[i]!, p[i + 1]!, ratio);
    }

    if (dist(p[n]!, target) < tolerance) break;
  }

  // Clamp implied local angles by projecting each segment from the root outward.
  let parentWorldAngle = (chain[0]!.worldAngle ?? 0) - chain[0]!.localAngle;
  for (let i = 0; i < n; i++) {
    const bone = chain[i]!;
    const a = p[i]!;
    const b = p[i + 1]!;
    const impliedWorldAngle = Math.atan2(b.y - a.y, b.x - a.x);
    const impliedLocalAngle = normalizeAngle(impliedWorldAngle - parentWorldAngle);

    const clampedLocalAngle = clamp(impliedLocalAngle, bone.constraint.minAngle, bone.constraint.maxAngle);
    const clampedWorldAngle = parentWorldAngle + clampedLocalAngle;

    p[i + 1] = {
      x: a.x + Math.cos(clampedWorldAngle) * bone.length,
      y: a.y + Math.sin(clampedWorldAngle) * bone.length,
    };

    parentWorldAngle = clampedWorldAngle;
  }

  return p.slice(0, n);
}

