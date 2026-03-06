import { INITIAL_JOINTS } from './model';
import { getWorldPosition, unwrapAngleRad, vectorLength } from './kinematics';
import { solveFabrikChainOffsets } from './ik/fabrik';
import { clampClavicleTargetAngleRad } from './clavicleConstraint';
import { applyManikinFkRotation } from './manikinFk';
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
  // IMPORTANT: keep these in sync with the current rig in `src/engine/model.ts`.
  //
  // "Top → bottom" normalization:
  // - Head pulls the neck chain but does not translate the torso (root at collar).
  // - Arms solve from clavicle down (root at clavicle).
  // - Legs solve from hip down (root at hip).
  if (effectorId === 'neck_base') return 'collar';
  if (effectorId === 'l_wrist' || effectorId === 'l_fingertip') return 'l_clavicle';
  if (effectorId === 'r_wrist' || effectorId === 'r_fingertip') return 'r_clavicle';
  if (effectorId === 'l_ankle' || effectorId === 'l_toe') return 'l_hip';
  if (effectorId === 'r_ankle' || effectorId === 'r_toe') return 'r_hip';
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

export const applyDragToState = (
  prev: SkeletonState,
  draggingId: string,
  mouseWorld: Point,
): SkeletonState => {
  if (!isFinitePoint(mouseWorld)) return prev;
  const joint = prev.joints[draggingId];
  if (!joint) return prev;

  const nextJoints = { ...prev.joints };

  
  // Collar as shoulder socket: in FK/Cardboard, rotating the collar rotates its entire subtree (neck/head + arms)
  // according to per-bone `fkFollowDeg` settings in `connectionOverrides`.
  if (draggingId === 'collar' && prev.controlMode === 'Cardboard' && joint.parent) {
    const parentPos = getWorldPosition(joint.parent, nextJoints, INITIAL_JOINTS, 'preview');
    const dx = mouseWorld.x - parentPos.x;
    const dy = mouseWorld.y - parentPos.y;
    let newPreview = { x: dx, y: dy };

    // Cardboard FK preserves base lengths.
    const baseDist = Math.sqrt(joint.baseOffset.x ** 2 + joint.baseOffset.y ** 2);
    const currentDist = Math.sqrt(newPreview.x ** 2 + newPreview.y ** 2);
    if (currentDist > 1e-9 && baseDist > 1e-9) {
      const factor = baseDist / currentDist;
      newPreview = { x: newPreview.x * factor, y: newPreview.y * factor };
    }

    // Keep rotation continuous + compute delta for FK follow.
    const prevA = Math.atan2(joint.previewOffset.y, joint.previewOffset.x);
    const desiredA = Math.atan2(newPreview.y, newPreview.x);
    const desiredD = Math.sqrt(newPreview.x ** 2 + newPreview.y ** 2);
    const unwrappedA = desiredD > 1e-9 ? unwrapAngleRad(prevA, desiredA) : prevA;
    if (desiredD > 1e-9) newPreview = { x: Math.cos(unwrappedA) * desiredD, y: Math.sin(unwrappedA) * desiredD };
    const deltaRad = unwrappedA - prevA;

    const rotated = applyManikinFkRotation({
      joints: nextJoints,
      baseJoints: INITIAL_JOINTS,
      rootRotateJointId: 'collar',
      deltaRad,
      connectionOverrides: prev.connectionOverrides,
      rotateBaseOffsets: false,
    });

    const next = { ...rotated };
    const collar = next.collar ?? nextJoints.collar;
    if (collar) {
      next.collar = { ...collar, previewOffset: newPreview, targetOffset: newPreview, currentOffset: newPreview };
    }

    return { ...prev, joints: next };
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
    const jointsToRotate = ['navel', 'sternum', 'collar', 'neck_base', 
                          'l_rib', 'r_rib',
                          'l_clavicle', 'r_clavicle', 'l_upper_arm', 'r_upper_arm', 'l_elbow', 'r_elbow', 
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

  // Clavicle constraint: keep clavicles near their horizontal baseline (per torso axis).
  if (prev.clavicleConstraintEnabled && (draggingId === 'l_clavicle' || draggingId === 'r_clavicle') && joint.parent) {
    const curA = Math.atan2(joint.previewOffset.y, joint.previewOffset.x);
    const desiredA = Math.atan2(newPreview.y, newPreview.x);
    const clampedA = clampClavicleTargetAngleRad({
      jointId: draggingId,
      currentAngleRad: curA,
      desiredAngleRad: desiredA,
      joints: nextJoints,
      baseJoints: INITIAL_JOINTS,
    });
    const desiredD = Math.sqrt(newPreview.x ** 2 + newPreview.y ** 2);
    if (Number.isFinite(clampedA) && desiredD > 0) {
      newPreview = { x: Math.cos(clampedA) * desiredD, y: Math.sin(clampedA) * desiredD };
    }
  }

  // 1. IK Solver Logic (FABRIK, anchored per-limb)
  if ((prev.controlMode === 'IK' || prev.controlMode === 'Rubberband') && joint.isEndEffector && joint.parent) {
    const chainIds = collectChainRootToEffector(draggingId, nextJoints);
    const allowStretch = prev.stretchEnabled || prev.controlMode === 'Rubberband';
    const offsets = solveFabrikChainOffsets(chainIds, nextJoints, INITIAL_JOINTS, mouseWorld, allowStretch);
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

  // When lifting the puppet by the head/neck while feet are pinned, bias toward
  // vertical motion and let horizontal alignment "tension" center the body over the pins.
  // This mimics a paper puppet hanging under gravity: it rises smoothly and recenters
  // instead of shimmying side-to-side with the cursor.
  const isLiftHandle = draggingId === 'neck_base';

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

  const canMoveDelta = (delta: Point): boolean => {
    for (const leg of legs) {
      const hipAtT = add(leg.hipWorldStart, delta);
      const d = dist(hipAtT, leg.ankleWorldTarget);
      if (d > leg.reach + 1e-4) return false;
    }
    return true;
  };

  // Inertia / "momentum matching":
  // - When only feet are pinned, let the whole body sway more freely.
  // - As more joints are pinned, make the translation feel heavier (lag behind cursor).
  // This avoids "teleporty" balance shifts and produces a more rigid cutout presence.
  const extraPins = Math.max(0, pinnedCount - pinnedAnkles.length);
  // Default state should feel rigid: reduce lag/sway, especially for top handles.
  const baseFollow = draggingId === 'neck_base' ? 0.985 : 1.0;
  const follow = clamp(baseFollow / (1 + extraPins * 0.14), 0.72, 1.0);

  const { delta, tension } = (() => {
    // Horizontal follow is heavily damped for lift handles when legs are pinned,
    // otherwise it matches normal balance translation.
    const cursorXFollow =
      isLiftHandle && legs.length ? (legs.length >= 2 ? 0.08 : 0.16) : 1.0;

    let proposed = {
      x: desiredDelta.x * follow * cursorXFollow,
      y: desiredDelta.y * follow,
    };

    if (isLiftHandle && legs.length) {
      const centerTargetX = (() => {
        if (pinnedWorld.l_ankle && pinnedWorld.r_ankle) return (pinnedWorld.l_ankle.x + pinnedWorld.r_ankle.x) / 2;
        if (pinnedWorld.l_ankle) return pinnedWorld.l_ankle.x;
        if (pinnedWorld.r_ankle) return pinnedWorld.r_ankle.x;
        return null;
      })();

      if (typeof centerTargetX === 'number' && Number.isFinite(centerTargetX)) {
        // Center the torso (navel) over the pins as lift increases.
        const navelWorldStart = getWorldPosition('navel', nextJoints, INITIAL_JOINTS, 'preview');
        const navelXAfter = navelWorldStart.x + proposed.x;
        const dxCenter = centerTargetX - navelXAfter;
        const liftMag = Math.abs(proposed.y);
        const strengthBase = legs.length >= 2 ? 0.38 : 0.26;
        const strength = strengthBase * clamp(liftMag / 1.25, 0, 1);
        proposed = { ...proposed, x: proposed.x + dxCenter * strength };
      }
    }

    if (!legs.length) return { delta: proposed, tension: 0 };

    // Find the furthest feasible translation (hard stop at reach limit).
    let sMax = 1;
    if ((Math.abs(proposed.x) + Math.abs(proposed.y) > 1e-9) && !canMoveDelta(proposed)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 20; i += 1) {
        const mid = (lo + hi) / 2;
        const cand = scalePoint(proposed, mid);
        if (canMoveDelta(cand)) lo = mid;
        else hi = mid;
      }
      sMax = lo;
    }

    const hardStop = scalePoint(proposed, sMax);
    const nextTension = clamp(1 - sMax, 0, 1);

    // Ease the final tension: as we approach the hard stop, slow the translation down
    // (but never exceed the hard stop).
    const easeAlpha =
      isLiftHandle && legs.length ? clamp(1 - nextTension * 0.85, 0.12, 1) : 1;
    const eased = scalePoint(hardStop, easeAlpha);

    return { delta: eased, tension: nextTension };
  })();

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
    const offsets = solveFabrikChainOffsets(
      chainIds,
      nextJoints,
      INITIAL_JOINTS,
      leg.ankleWorldTarget,
      prev.stretchEnabled,
    );
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
    draggingId === 'neck_upper' ||
    draggingId === 'cranium' ||
    draggingId === 'head';

  // Only run spine-handle correction when we're not under final tension (hard stop),
  // otherwise it fights the reach limit and can produce shimmy.
  if (isSpineHandle && tension < 1e-6) {
    const afterWorld = getWorldPosition(draggingId, nextJoints, INITIAL_JOINTS, 'preview');
    const err = dist(afterWorld, mouseWorld);
    if (err > 1e-3) {
      const chainIds = collectChainRootToJoint(draggingId, nextJoints, 'navel');
      const offsets = solveFabrikChainOffsets(chainIds, nextJoints, INITIAL_JOINTS, mouseWorld, prev.stretchEnabled);
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
