import { INITIAL_JOINTS } from './model';
import { getWorldPosition, unwrapAngleRad, vectorLength } from './kinematics';
import type { Point, SkeletonState } from './types';

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const scalePoint = (v: Point, s: number): Point => ({ x: v.x * s, y: v.y * s });

const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });

const normalize = (v: Point): Point => {
  const d = Math.hypot(v.x, v.y);
  if (d <= 1e-9) return { x: 0, y: 0 };
  return { x: v.x / d, y: v.y / d };
};

const mirroredOffset = (v: Point): Point => ({ x: -v.x, y: v.y });

const isFinitePoint = (p: Point): boolean =>
  Number.isFinite(p.x) && Number.isFinite(p.y);

const jointLength = (
  id: string,
  joints: SkeletonState['joints'],
  baseJoints: SkeletonState['joints'],
  stretchEnabled: boolean,
): number => {
  const joint = joints[id] ?? baseJoints[id];
  if (!joint) return 0;
  const v = stretchEnabled ? joint.previewOffset : joint.baseOffset;
  const len = vectorLength(v);
  return Number.isFinite(len) ? len : 0;
};

const getIkRootForEffector = (effectorId: string): string | null => {
  // Heuristic anchors (avoid pulling the whole spine around for limb IK).
  // These match the current rig in `src/engine/model.ts`.
  if (effectorId === 'head') return 'neck_base';
  if (effectorId === 'l_wrist' || effectorId === 'l_fingertip') return 'l_shoulder';
  if (effectorId === 'r_wrist' || effectorId === 'r_fingertip') return 'r_shoulder';
  if (effectorId === 'l_ankle') return 'l_hip';
  if (effectorId === 'r_ankle') return 'r_hip';
  if (effectorId === 'l_toe') return 'l_hip';
  if (effectorId === 'r_toe') return 'r_hip';
  return null;
};

const collectChainRootToJoint = (
  jointId: string,
  joints: SkeletonState['joints'],
  rootId: string,
): string[] => {
  const ids: string[] = [];

  let current: string | null = jointId;
  let depth = 0;
  while (current && depth < 64) {
    ids.push(current);
    if (current === rootId) break;
    current = joints[current]?.parent ?? null;
    depth += 1;
  }

  if (ids[ids.length - 1] !== rootId) {
    // Fall back to full chain when root isn't found.
    ids.length = 0;
    current = jointId;
    depth = 0;
    while (current && depth < 64) {
      ids.push(current);
      current = joints[current]?.parent ?? null;
      depth += 1;
    }
  }

  return ids.reverse();
};

const collectChainRootToEffector = (
  effectorId: string,
  joints: SkeletonState['joints'],
): string[] => {
  const desiredRoot = getIkRootForEffector(effectorId);
  const ids: string[] = [];

  let current: string | null = effectorId;
  let depth = 0;
  while (current && depth < 32) {
    ids.push(current);
    if (desiredRoot && current === desiredRoot) break;
    current = joints[current]?.parent ?? null;
    depth += 1;
  }

  // If the desired root wasn't found in the ancestor chain, fall back to the full chain.
  if (desiredRoot && ids[ids.length - 1] !== desiredRoot) {
    ids.length = 0;
    current = effectorId;
    depth = 0;
    while (current && depth < 32) {
      ids.push(current);
      current = joints[current]?.parent ?? null;
      depth += 1;
    }
  }

  return ids.reverse();
};

const solveFabrikChain = (
  chainIds: string[],
  joints: SkeletonState['joints'],
  baseJoints: SkeletonState['joints'],
  target: Point,
  stretchEnabled: boolean,
): Record<string, Point> | null => {
  if (chainIds.length < 2) return null;

  const positions: Point[] = chainIds.map((id) => getWorldPosition(id, joints, baseJoints, 'preview'));
  const lengths: number[] = [];
  for (let i = 1; i < chainIds.length; i++) {
    const id = chainIds[i];
    const joint = joints[id] ?? baseJoints[id];
    if (!joint) {
      lengths.push(0);
      continue;
    }
    const len = stretchEnabled ? vectorLength(joint.previewOffset) : vectorLength(joint.baseOffset);
    lengths.push(Math.max(0, len));
  }

  const root = positions[0];
  const totalLen = lengths.reduce((acc, v) => acc + v, 0);
  const toTarget = dist(root, target);

  if (!Number.isFinite(totalLen) || totalLen <= 1e-9) return null;

  // Unreachable: fully extend toward target.
  if (toTarget >= totalLen) {
    for (let i = 0; i < chainIds.length - 1; i++) {
      const r = dist(target, positions[i]);
      if (r <= 1e-9) continue;
      const lambda = lengths[i] / r;
      // p(i+1) = (1-l)*p(i) + l*target
      positions[i + 1] = add(scalePoint(positions[i], 1 - lambda), scalePoint(target, lambda));
    }
  } else {
    const tol = 1e-4;
    const maxIter = 12;
    const baseRoot = { ...root };

    for (let iter = 0; iter < maxIter; iter++) {
      // Forward reaching
      positions[positions.length - 1] = { ...target };
      for (let i = positions.length - 2; i >= 0; i--) {
        const dir = sub(positions[i], positions[i + 1]);
        const u = normalize(dir);
        positions[i] = add(positions[i + 1], scalePoint(u, lengths[i]));
      }

      // Backward reaching
      positions[0] = { ...baseRoot };
      for (let i = 1; i < positions.length; i++) {
        const dir = sub(positions[i], positions[i - 1]);
        const u = normalize(dir);
        positions[i] = add(positions[i - 1], scalePoint(u, lengths[i - 1]));
      }

      if (dist(positions[positions.length - 1], target) <= tol) break;
    }
  }

  // Convert to local offsets for each joint (root stays fixed).
  const nextOffsets: Record<string, Point> = {};
  for (let i = 1; i < chainIds.length; i++) {
    const id = chainIds[i];
    nextOffsets[id] = sub(positions[i], positions[i - 1]);
  }
  return nextOffsets;
};

export const applyDragToState = (
  prev: SkeletonState,
  draggingId: string,
  mouseWorld: Point,
): SkeletonState => {
  const nextJoints = { ...prev.joints };
  const joint = nextJoints[draggingId];
  if (!joint) return prev;

  
  // Special handling for collar in rigid FK mode: ensure proper rotation with children
  if (draggingId === 'collar' && prev.controlMode === 'Cardboard' && !prev.stretchEnabled) {
    // Get parent position (sternum)
    let parentPos = { x: 0, y: 0 };
    if (joint.parent) {
      parentPos = getWorldPosition(joint.parent, nextJoints, INITIAL_JOINTS, 'preview');
    }
    
    // Calculate desired collar offset with rigid length
    const dx = mouseWorld.x - parentPos.x;
    const dy = mouseWorld.y - parentPos.y;
    let newPreview = { x: dx, y: dy };
    
    // Maintain bone length for rigid rotation
    const baseDist = Math.sqrt(joint.baseOffset.x ** 2 + joint.baseOffset.y ** 2);
    const currentDist = Math.sqrt(newPreview.x ** 2 + newPreview.y ** 2);
    if (currentDist > 0) {
      const factor = baseDist / currentDist;
      newPreview.x *= factor;
      newPreview.y *= factor;
    }
    
    // Keep rotation continuous
    const prevA = Math.atan2(joint.previewOffset.y, joint.previewOffset.x);
    const desiredA = Math.atan2(newPreview.y, newPreview.x);
    const desiredD = Math.sqrt(newPreview.x ** 2 + newPreview.y ** 2);
    if (desiredD > 0) {
      const unwrappedA = unwrapAngleRad(prevA, desiredA);
      newPreview = { x: Math.cos(unwrappedA) * desiredD, y: Math.sin(unwrappedA) * desiredD };
    }
    
    // Update collar
    nextJoints.collar = {
      ...nextJoints.collar,
      previewOffset: newPreview,
      targetOffset: newPreview,
      currentOffset: newPreview,
    };
    
    // Children will automatically follow through the kinematic chain in the physics system
    return { ...prev, joints: nextJoints };
  }
  
  // Special handling for sacrum: rotate everything above it instead of translating.
  // Guarded because some rigs don't include a `sacrum` joint.
  if (draggingId === 'sacrum' && nextJoints.sacrum && INITIAL_JOINTS.sacrum) {
    const sacrumWorld = getWorldPosition('sacrum', nextJoints, INITIAL_JOINTS, 'preview');
    
    // Calculate rotation based on mouse position relative to sacrum
    const relativeMouse = { x: mouseWorld.x - sacrumWorld.x, y: mouseWorld.y - sacrumWorld.y };
    const targetAngle = Math.atan2(relativeMouse.y, relativeMouse.x);
    
    // Get current forward direction of the spine (from sacrum to navel)
    const navelWorld = getWorldPosition('navel', nextJoints, INITIAL_JOINTS, 'preview');
    const currentForward = { x: navelWorld.x - sacrumWorld.x, y: navelWorld.y - sacrumWorld.y };
    const currentAngle = Math.atan2(currentForward.y, currentForward.x);
    
    const rotation = targetAngle - currentAngle;
    
    // Rotate all joints in the nested kinematic chain above sacrum
    // This respects the hierarchy: Sacrum → Navel → Sternum → Collar (Branch Point)
    const jointsToRotate = ['navel', 'sternum', 'collar', 'neck_base', 'head', 
                          'l_nipple', 'r_nipple', 'l_rib', 'r_rib',
                          'l_shoulder', 'r_shoulder', 'l_elbow', 'r_elbow', 
                          'l_wrist', 'r_wrist', 'l_fingertip', 'r_fingertip'];
    
    for (const jointId of jointsToRotate) {
      const joint = nextJoints[jointId];
      if (!joint) continue;
      
      const currentWorld = getWorldPosition(jointId, nextJoints, INITIAL_JOINTS, 'preview');
      const relativePos = { x: currentWorld.x - sacrumWorld.x, y: currentWorld.y - sacrumWorld.y };
      
      // Apply rotation
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const rotatedRelative = {
        x: relativePos.x * cos - relativePos.y * sin,
        y: relativePos.x * sin + relativePos.y * cos
      };
      
      const newWorld = { x: rotatedRelative.x + sacrumWorld.x, y: rotatedRelative.y + sacrumWorld.y };
      
      // Convert back to offset relative to parent (maintains nested chain structure)
      let parentPos = { x: 0, y: 0 };
      if (joint.parent) {
        parentPos = getWorldPosition(joint.parent, nextJoints, INITIAL_JOINTS, 'preview');
      }
      
      const newOffset = { x: newWorld.x - parentPos.x, y: newWorld.y - parentPos.y };
      
      // Update all offset types to ensure consistency and prevent physics interference
      nextJoints[jointId] = {
        ...joint,
        baseOffset: newOffset,
        previewOffset: newOffset,
        targetOffset: newOffset,
        currentOffset: newOffset,
      };
    }
    
    // Keep sacrum fixed at its base position - no stretching, bending, or physics interference
    nextJoints.sacrum = {
      ...nextJoints.sacrum,
      baseOffset: INITIAL_JOINTS.sacrum.baseOffset,
      previewOffset: INITIAL_JOINTS.sacrum.baseOffset,
      targetOffset: INITIAL_JOINTS.sacrum.baseOffset,
      currentOffset: INITIAL_JOINTS.sacrum.baseOffset,
    };
    
    return { ...prev, joints: nextJoints };
  }

  let parentPos = { x: 0, y: 0 };
  if (joint.parent) {
    parentPos = getWorldPosition(joint.parent, nextJoints, INITIAL_JOINTS, 'preview');
  }

  const dx = mouseWorld.x - parentPos.x;
  const dy = mouseWorld.y - parentPos.y;

  // Default preview position based on mouse
  let newPreview = { x: dx, y: dy };

  // Control Mode Logic: Restrict dragging based on mode
  if (prev.controlMode === 'IK') {
    // In IK, only end effectors can be dragged (sacrum handled above)
    if (!joint.isEndEffector) return prev;
  } else if (prev.controlMode === 'Cardboard' && !prev.stretchEnabled) {
    // In Cardboard mode, enforce rigid bone lengths unless stretching is enabled.
    if (joint.parent) {
      const baseDist = Math.sqrt(joint.baseOffset.x ** 2 + joint.baseOffset.y ** 2);
      const currentDist = Math.sqrt(newPreview.x ** 2 + newPreview.y ** 2);
      if (currentDist > 0) {
        const factor = baseDist / currentDist;
        newPreview.x *= factor;
        newPreview.y *= factor;
      }
    }
  } else if (prev.controlMode === 'JointDrag') {
    // JointDrag mode: change proportions without physics breaking (update baseOffset)
    const nextJoints = { ...prev.joints };
    const draggingJoint = nextJoints[draggingId];
    if (!draggingJoint) return prev;

    let parentPos = { x: 0, y: 0 };
    if (draggingJoint.parent) {
      parentPos = getWorldPosition(draggingJoint.parent, nextJoints, INITIAL_JOINTS, 'preview');
    }
    const newOffset = { x: mouseWorld.x - parentPos.x, y: mouseWorld.y - parentPos.y };
    
    // Calculate the change from the original base offset
    const deltaX = newOffset.x - draggingJoint.baseOffset.x;
    const deltaY = newOffset.y - draggingJoint.baseOffset.y;
    
    nextJoints[draggingId] = {
      ...draggingJoint,
      baseOffset: newOffset,
      previewOffset: newOffset,
      targetOffset: newOffset,
      currentOffset: newOffset,
    };

    // Enhanced mirroring: apply exact same delta to mirror joint
    if (prev.mirroring && draggingJoint.mirrorId) {
      const mirrorJoint = nextJoints[draggingJoint.mirrorId];
      if (mirrorJoint) {
        // Apply the same delta changes to the mirror joint
        const mirrorNewOffset = {
          x: mirrorJoint.baseOffset.x + deltaX,
          y: mirrorJoint.baseOffset.y + deltaY,
        };
        
        nextJoints[draggingJoint.mirrorId] = {
          ...mirrorJoint,
          baseOffset: mirrorNewOffset,
          previewOffset: mirrorNewOffset,
          targetOffset: mirrorNewOffset,
          currentOffset: mirrorNewOffset,
          rotation: draggingJoint.rotation,
        };
      }
    }
    return { ...prev, joints: nextJoints };
  }

  // 2. FK / Default Dragging Logic

  // Static rotation: preserve the current segment length while rotating toward the cursor.
  // (Stretching/proportion edits are handled explicitly via JointDrag mode.)
  if (joint.parent) {
    // FK in Cardboard is intended to be rigid: preserve base lengths even if stretch is enabled globally.
    const effectiveStretchEnabled = prev.controlMode === 'Cardboard' ? false : prev.stretchEnabled;
    const desiredLen = jointLength(draggingId, nextJoints, INITIAL_JOINTS, effectiveStretchEnabled);
    const d = Math.hypot(newPreview.x, newPreview.y);
    if (desiredLen > 1e-9 && d > 1e-9) {
      const f = desiredLen / d;
      newPreview = { x: newPreview.x * f, y: newPreview.y * f };
    }
  }

  // Keep drag rotation continuous by unwrapping target angle relative to current preview angle.
  if (joint.parent) {
    const prevA = Math.atan2(joint.previewOffset.y, joint.previewOffset.x);
    const desiredA = Math.atan2(newPreview.y, newPreview.x);
    const desiredD = Math.sqrt(newPreview.x ** 2 + newPreview.y ** 2);
    if (desiredD > 0) {
      const unwrappedA = unwrapAngleRad(prevA, desiredA);
      newPreview = { x: Math.cos(unwrappedA) * desiredD, y: Math.sin(unwrappedA) * desiredD };
    }
  }

  // 1. IK Solver Logic (FABRIK, anchored per-limb)
  if ((prev.controlMode === 'IK' || prev.controlMode === 'Rubberband') && joint.isEndEffector && joint.parent) {
    const chainIds = collectChainRootToEffector(draggingId, nextJoints);
    const allowStretch = prev.stretchEnabled || prev.controlMode === 'Rubberband';
    const offsets = solveFabrikChain(chainIds, nextJoints, INITIAL_JOINTS, mouseWorld, allowStretch);
    if (offsets) {
      for (const [id, off] of Object.entries(offsets)) {
        const j = nextJoints[id];
        if (!j) continue;
        nextJoints[id] = { ...j, previewOffset: off, targetOffset: off, currentOffset: off };
      }

      // Mirroring: reflect updated offsets across the Y axis.
      if (prev.mirroring) {
        for (const id of Object.keys(offsets)) {
          const j = nextJoints[id];
          if (!j?.mirrorId) continue;
          const mirror = nextJoints[j.mirrorId];
          if (!mirror) continue;
          const m = mirroredOffset(nextJoints[id].previewOffset);
          nextJoints[j.mirrorId] = { ...mirror, previewOffset: m, targetOffset: m, currentOffset: m };
        }
      }

      return { ...prev, joints: nextJoints };
    }
  }

  // FK Mode: Maintain bone length (Rigid Rotation) - Now handled in Cardboard mode above
  // This section is removed to avoid duplication

  nextJoints[draggingId] = {
    ...joint,
    previewOffset: newPreview,
    targetOffset: newPreview,
    currentOffset: newPreview,
  };

  // Mirroring
  if (prev.mirroring && joint.mirrorId) {
    const mirrorJoint = nextJoints[joint.mirrorId];
    nextJoints[joint.mirrorId] = {
      ...mirrorJoint,
      previewOffset: {
        x: -newPreview.x,
        y: newPreview.y,
      },
      targetOffset: {
        x: -newPreview.x,
        y: newPreview.y,
      },
      currentOffset: {
        x: -newPreview.x,
        y: newPreview.y,
      },
    };
  }

  return { ...prev, joints: nextJoints };
};

export const applyBalanceDragToState = (
  prev: SkeletonState,
  draggingId: string,
  mouseWorld: Point,
  pinnedWorld: Record<string, Point>,
): SkeletonState => {
  const nextJoints = { ...prev.joints };
  const draggingJoint = nextJoints[draggingId];
  const root = nextJoints.root;
  if (!draggingJoint || !root) return prev;
  if (!isFinitePoint(mouseWorld)) return prev;

  const pinnedAnkles = [
    pinnedWorld.l_ankle ? ('l_ankle' as const) : null,
    pinnedWorld.r_ankle ? ('r_ankle' as const) : null,
  ].filter(Boolean);

  const startWorld = getWorldPosition(draggingId, nextJoints, INITIAL_JOINTS, 'preview');
  const desiredDelta = sub(mouseWorld, startWorld);
  if (!isFinitePoint(desiredDelta)) return prev;

  const pinnedSet = new Set(Object.keys(pinnedWorld ?? {}));
  const pinnedCount = pinnedSet.size;

  type PinnedLeg = {
    ankleId: 'l_ankle' | 'r_ankle';
    hipId: 'l_hip' | 'r_hip';
    kneeId: 'l_knee' | 'r_knee';
    hipWorldStart: Point;
    ankleWorldTarget: Point;
    reach: number;
  };

  const legs: PinnedLeg[] = pinnedAnkles
    .map((ankleId) => {
      const hipId = ankleId === 'l_ankle' ? 'l_hip' : 'r_hip';
      const kneeId = ankleId === 'l_ankle' ? 'l_knee' : 'r_knee';
      const hipWorldStart = getWorldPosition(hipId, nextJoints, INITIAL_JOINTS, 'preview');
      const ankleWorldTarget = pinnedWorld[ankleId!];
      if (!ankleWorldTarget || !isFinitePoint(hipWorldStart) || !isFinitePoint(ankleWorldTarget)) return null;

      const reach =
        jointLength(kneeId!, nextJoints, INITIAL_JOINTS, prev.stretchEnabled) +
        jointLength(ankleId!, nextJoints, INITIAL_JOINTS, prev.stretchEnabled);

      return { ankleId, hipId, kneeId, hipWorldStart, ankleWorldTarget, reach };
    })
    .filter((v): v is PinnedLeg => Boolean(v));

  const canMove = (t: number): boolean => {
    for (const leg of legs) {
      const hipAtT = add(leg.hipWorldStart, scalePoint(desiredDelta, t));
      const d = dist(hipAtT, leg.ankleWorldTarget);
      if (d > leg.reach + 1e-4) return false;
    }
    return true;
  };

  let t = 1;
  if (legs.length && (Math.abs(desiredDelta.x) + Math.abs(desiredDelta.y) > 1e-9) && !canMove(1)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (canMove(mid)) lo = mid;
      else hi = mid;
    }
    t = lo;
  }

  // Inertia / "momentum matching":
  // - When only feet are pinned, let the whole body sway more freely.
  // - As more joints are pinned, make the translation feel heavier (lag behind cursor).
  // This avoids "teleporty" balance shifts and produces a more rigid cutout presence.
  const extraPins = Math.max(0, pinnedCount - pinnedAnkles.length);
  // Default state should feel rigid: reduce lag/sway, especially for top handles.
  const baseFollow = draggingId === 'head' || draggingId === 'neck_base' ? 0.985 : 1.0;
  const follow = clamp(baseFollow / (1 + extraPins * 0.14), 0.72, 1.0);

  const delta = scalePoint(desiredDelta, t * follow);

  const nextRootOffset = add(root.previewOffset, delta);
  nextJoints.root = {
    ...root,
    previewOffset: nextRootOffset,
    targetOffset: nextRootOffset,
    currentOffset: nextRootOffset,
  };

  // Re-pin legs: keep ankle world position fixed while hips translate with the body.
  for (const leg of legs) {
    const chainIds = collectChainRootToEffector(leg.ankleId, nextJoints);
    const offsets = solveFabrikChain(chainIds, nextJoints, INITIAL_JOINTS, leg.ankleWorldTarget, prev.stretchEnabled);
    if (!offsets) continue;

    for (const [id, off] of Object.entries(offsets)) {
      const j = nextJoints[id];
      if (!j) continue;
      nextJoints[id] = { ...j, previewOffset: off, targetOffset: off, currentOffset: off };
    }

    // Mirroring: only apply to non-pinned mirror joints so balance constraints win.
    if (prev.mirroring) {
      for (const id of Object.keys(offsets)) {
        const j = nextJoints[id];
        if (!j?.mirrorId) continue;
        if (pinnedSet.has(j.mirrorId)) continue;
        const mirror = nextJoints[j.mirrorId!];
        if (!mirror) continue;
        const m = mirroredOffset(nextJoints[id].previewOffset);
        nextJoints[j.mirrorId] = { ...mirror, previewOffset: m, targetOffset: m, currentOffset: m };
      }
    }
  }

  // If balance clamped the root translation, allow spine segments to bend toward the cursor
  // without disturbing pinned feet.
  const isSpineHandle =
    draggingId === 'navel' ||
    draggingId === 'sternum' ||
    draggingId === 'neck_base' ||
    draggingId === 'cranium' ||
    draggingId === 'head';

  // Skip spine handle logic for spine handles to prevent interference
  if (isSpineHandle) {
    const afterWorld = getWorldPosition(draggingId, nextJoints, INITIAL_JOINTS, 'preview');
    const err = dist(afterWorld, mouseWorld);
    if (err > 1e-3) {
      const chainIds = collectChainRootToJoint(draggingId, nextJoints, 'navel');
      const offsets = solveFabrikChain(chainIds, nextJoints, INITIAL_JOINTS, mouseWorld, prev.stretchEnabled);
      if (offsets) {
        for (const [id, off] of Object.entries(offsets)) {
          const j = nextJoints[id];
          if (!j) continue;
          nextJoints[id] = { ...j, previewOffset: off, targetOffset: off, currentOffset: off };
        }
      }
    }
  }

  return { ...prev, joints: nextJoints };
};
