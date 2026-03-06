import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Bone, Skeleton, Vec2 } from '@shared/skeleton';
import { ModeToolbar, type EditorMode } from '@/components/ModeToolbar';
import { observeCanvasContainer } from '@/lib/canvas';
import { computeWorldTransforms } from '@/lib/skeleton';
import { useUndoRedo } from '@/hooks/useUndoRedo';

type CutoutMeta = {
  shape: 'rect' | 'trapezoid';
  width: number;
  height: number;
  pivot: Vec2; // local px within the cutout rect (0..width, 0..height)
  trapezoidTopScale: number; // topWidth = width * scale (>=1 => upside-down)
  fill: string;
  stroke: string;
  opacity: number;
};

type Pose = {
  id: string;
  name: string;
  localAnglesByBoneId: Record<string, number>;
};

type SuiteState = {
  skeleton: Skeleton;
  cutoutsByBoneId: Record<string, CutoutMeta>;
  poses: Pose[];
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const normalizeAngle = (a: number) => {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
};

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const uid = () => `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;

const pickColor = (seed: number) => {
  const hues = [18, 42, 82, 140, 188, 222, 266, 312];
  const h = hues[Math.abs(seed) % hues.length] ?? 180;
  return {
    fill: `hsla(${h}deg 70% 55% / 0.18)`,
    stroke: `hsla(${h}deg 70% 65% / 0.85)`,
  };
};

const makeDefaultConstraint = (): Bone['constraint'] => ({
  minAngle: -Math.PI,
  maxAngle: Math.PI,
  stiffness: 1,
});

const makeInitialState = (): SuiteState => {
  const skeleton: Skeleton = {
    id: 'skeleton-suite',
    rootBoneId: 'root',
    bones: {
      root: {
        id: 'root',
        name: 'Root',
        parentId: null,
        localAngle: 0,
        length: 80,
        spriteId: null,
        pivotOffset: { x: 0, y: 0 },
        spriteScale: { x: 1, y: 1 },
        zOrder: 0,
        constraint: makeDefaultConstraint(),
      },
      torso: {
        id: 'torso',
        name: 'Torso',
        parentId: 'root',
        localAngle: 0,
        length: 90,
        spriteId: null,
        pivotOffset: { x: 0, y: 0 },
        spriteScale: { x: 1, y: 1 },
        zOrder: 1,
        constraint: { minAngle: -Math.PI / 3, maxAngle: Math.PI / 3, stiffness: 1 },
      },
      head: {
        id: 'head',
        name: 'Head',
        parentId: 'torso',
        localAngle: 0,
        length: 45,
        spriteId: null,
        pivotOffset: { x: 0, y: 0 },
        spriteScale: { x: 1, y: 1 },
        zOrder: 2,
        constraint: { minAngle: -Math.PI / 3, maxAngle: Math.PI / 3, stiffness: 1 },
      },
      upper_arm: {
        id: 'upper_arm',
        name: 'Upper Arm',
        parentId: 'torso',
        localAngle: -Math.PI / 8,
        length: 70,
        spriteId: null,
        pivotOffset: { x: 0, y: 0 },
        spriteScale: { x: 1, y: 1 },
        zOrder: 3,
        constraint: { minAngle: -Math.PI / 2, maxAngle: Math.PI / 2, stiffness: 1 },
      },
      lower_arm: {
        id: 'lower_arm',
        name: 'Lower Arm',
        parentId: 'upper_arm',
        localAngle: -Math.PI / 10,
        length: 65,
        spriteId: null,
        pivotOffset: { x: 0, y: 0 },
        spriteScale: { x: 1, y: 1 },
        zOrder: 4,
        constraint: { minAngle: -Math.PI / 2, maxAngle: Math.PI / 2, stiffness: 1 },
      },
    },
    ikTargets: [],
  };

  const bones = Object.values(skeleton.bones);
  const cutoutsByBoneId: Record<string, CutoutMeta> = {};
  for (let i = 0; i < bones.length; i++) {
    const b = bones[i]!;
    const { fill, stroke } = pickColor(i);
    const width = Math.max(18, Math.round(b.length * 1.05));
    const height = Math.max(14, Math.round(b.length * 0.35));
    cutoutsByBoneId[b.id] = {
      shape: b.id === 'head' ? 'trapezoid' : 'rect',
      width,
      height: b.id === 'head' ? Math.max(height, 56) : height,
      pivot: b.id === 'head' ? { x: width / 2, y: Math.max(height, 56) } : { x: 10, y: Math.round(height / 2) },
      trapezoidTopScale: b.id === 'head' ? 1.45 : 1,
      fill,
      stroke,
      opacity: 1,
    };
  }

  const idlePose: Pose = {
    id: 'pose-idle',
    name: 'Idle',
    localAnglesByBoneId: Object.fromEntries(Object.values(skeleton.bones).map((b) => [b.id, b.localAngle])),
  };

  return { skeleton, cutoutsByBoneId, poses: [idlePose] };
};

type DragState = { type: 'rotate'; boneId: string } | null;

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
};

export default function SkeletonSuitePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragPointerIdRef = useRef<number | null>(null);

  const { state: suite, setState: setSuite, undo, redo, canUndo, canRedo } = useUndoRedo(makeInitialState());
  const suiteRef = useRef(suite);

  const [mode, setMode] = useState<EditorMode>('Pose');
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(suite.skeleton.rootBoneId);
  const [drag, setDrag] = useState<DragState>(null);
  const [panelSizes, setPanelSizes] = useState({ left: 220, right: 320, bottom: 190 });
  const [showBones, setShowBones] = useState(true);

  const [fromPoseId, setFromPoseId] = useState<string>(() => suite.poses[0]?.id ?? '');
  const [toPoseId, setToPoseId] = useState<string>(() => suite.poses[0]?.id ?? '');
  const [durationMs, setDurationMs] = useState(650);
  const [loop, setLoop] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    suiteRef.current = suite;
  }, [suite]);

  useEffect(() => {
    if (!suite.poses.some((p) => p.id === fromPoseId)) setFromPoseId(suite.poses[0]?.id ?? '');
    if (!suite.poses.some((p) => p.id === toPoseId)) setToPoseId(suite.poses[0]?.id ?? '');
  }, [fromPoseId, suite.poses, toPoseId]);

  const startResize = useCallback(
    (edge: 'left' | 'right' | 'bottom', e: ReactMouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const start = panelSizes;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        setPanelSizes((prev) => {
          if (edge === 'left') {
            const nextLeft = clamp(start.left + dx, 140, window.innerWidth - 450);
            return { ...prev, left: nextLeft };
          }
          if (edge === 'right') {
            const nextRight = clamp(start.right - dx, 220, window.innerWidth - 450);
            return { ...prev, right: nextRight };
          }
          const nextBottom = clamp(start.bottom - dy, 110, window.innerHeight - 250);
          return { ...prev, bottom: nextBottom };
        });
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [panelSizes],
  );

  const posed = useMemo(() => computeWorldTransforms(suite.skeleton), [suite.skeleton]);

  const getWorldFromPointerEvent = useCallback((e: PointerEvent): Vec2 | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    return { x: e.clientX - rect.left - cx, y: e.clientY - rect.top - cy };
  }, []);

  const updateBone = useCallback(
    (boneId: string, updater: (prev: Bone) => Bone, pushToHistory = true) => {
      const base = suiteRef.current;
      const prevBone = base.skeleton.bones[boneId];
      if (!prevBone) return;
      const nextBone = updater(prevBone);
      const next: SuiteState = {
        ...base,
        skeleton: { ...base.skeleton, bones: { ...base.skeleton.bones, [boneId]: nextBone } },
      };
      suiteRef.current = next;
      setSuite(next, pushToHistory);
    },
    [setSuite],
  );

  const updateCutout = useCallback(
    (boneId: string, updater: (prev: CutoutMeta) => CutoutMeta, pushToHistory = true) => {
      const base = suiteRef.current;
      const prev = base.cutoutsByBoneId[boneId];
      if (!prev) return;
      const next: SuiteState = {
        ...base,
        cutoutsByBoneId: { ...base.cutoutsByBoneId, [boneId]: updater(prev) },
      };
      suiteRef.current = next;
      setSuite(next, pushToHistory);
    },
    [setSuite],
  );

  const capturePose = useCallback((s: Skeleton): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [id, b] of Object.entries(s.bones)) out[id] = b.localAngle;
    return out;
  }, []);

  const applyPose = useCallback(
    (pose: Pose, pushToHistory = true) => {
      const base = suiteRef.current;
      const nextBones: Record<string, Bone> = { ...base.skeleton.bones };
      for (const [id, bone] of Object.entries(nextBones)) {
        const a = pose.localAnglesByBoneId[id];
        if (typeof a === 'number' && Number.isFinite(a)) nextBones[id] = { ...bone, localAngle: a };
      }
      const next: SuiteState = { ...base, skeleton: { ...base.skeleton, bones: nextBones } };
      suiteRef.current = next;
      setSuite(next, pushToHistory);
    },
    [setSuite],
  );

  const ensureSelectionValid = useCallback(() => {
    const base = suiteRef.current;
    const id = selectedBoneId;
    if (!id) return;
    if (base.skeleton.bones[id]) return;
    setSelectedBoneId(base.skeleton.rootBoneId);
  }, [selectedBoneId]);

  useEffect(() => {
    ensureSelectionValid();
  }, [ensureSelectionValid, suite.skeleton.bones]);

  const addChildBone = useCallback(() => {
    const base = suiteRef.current;
    const parentId = selectedBoneId && base.skeleton.bones[selectedBoneId] ? selectedBoneId : base.skeleton.rootBoneId;
    const parent = base.skeleton.bones[parentId];
    if (!parent) return;

    const idx = Object.keys(base.skeleton.bones).length + 1;
    let id = `bone_${idx}`;
    while (base.skeleton.bones[id]) id = `bone_${idx}_${Math.floor(Math.random() * 1e6)}`;

    const bone: Bone = {
      id,
      name: `Bone ${idx}`,
      parentId,
      localAngle: 0,
      length: Math.max(30, Math.round(parent.length * 0.8)),
      spriteId: null,
      pivotOffset: { x: 0, y: 0 },
      spriteScale: { x: 1, y: 1 },
      zOrder: (parent.zOrder ?? 0) + 1,
      constraint: makeDefaultConstraint(),
    };

    const { fill, stroke } = pickColor(idx);
    const width = Math.max(18, Math.round(bone.length * 1.05));
    const height = Math.max(14, Math.round(bone.length * 0.35));
      const cutout: CutoutMeta = {
        shape: 'rect',
        width,
        height,
        pivot: { x: 10, y: Math.round(height / 2) },
        trapezoidTopScale: 1,
        fill,
        stroke,
        opacity: 1,
      };

    const nextPoses = base.poses.map((p) => ({
      ...p,
      localAnglesByBoneId: { ...p.localAnglesByBoneId, [id]: 0 },
    }));

    const next: SuiteState = {
      ...base,
      skeleton: { ...base.skeleton, bones: { ...base.skeleton.bones, [id]: bone } },
      cutoutsByBoneId: { ...base.cutoutsByBoneId, [id]: cutout },
      poses: nextPoses,
    };

    suiteRef.current = next;
    setSuite(next, true);
    setSelectedBoneId(id);
  }, [selectedBoneId, setSuite]);

  const deleteSelectedBone = useCallback(() => {
    const base = suiteRef.current;
    const id = selectedBoneId;
    if (!id) return;
    if (id === base.skeleton.rootBoneId) return;
    if (!base.skeleton.bones[id]) return;

    const childrenByParent = new Map<string, string[]>();
    for (const b of Object.values(base.skeleton.bones)) {
      if (!b.parentId) continue;
      const list = childrenByParent.get(b.parentId) ?? [];
      list.push(b.id);
      childrenByParent.set(b.parentId, list);
    }

    const toDelete = new Set<string>();
    const q: string[] = [id];
    while (q.length) {
      const cur = q.shift()!;
      if (toDelete.has(cur)) continue;
      toDelete.add(cur);
      const kids = childrenByParent.get(cur) ?? [];
      kids.forEach((k) => q.push(k));
    }

    const nextBones: Record<string, Bone> = {};
    for (const [bid, b] of Object.entries(base.skeleton.bones)) {
      if (toDelete.has(bid)) continue;
      nextBones[bid] = b;
    }

    const nextCutouts: Record<string, CutoutMeta> = {};
    for (const [bid, c] of Object.entries(base.cutoutsByBoneId)) {
      if (toDelete.has(bid)) continue;
      nextCutouts[bid] = c;
    }

    const nextPoses = base.poses.map((p) => {
      const nextAngles: Record<string, number> = {};
      for (const [bid, a] of Object.entries(p.localAnglesByBoneId)) {
        if (toDelete.has(bid)) continue;
        nextAngles[bid] = a;
      }
      return { ...p, localAnglesByBoneId: nextAngles };
    });

    const next: SuiteState = {
      ...base,
      skeleton: { ...base.skeleton, bones: nextBones },
      cutoutsByBoneId: nextCutouts,
      poses: nextPoses,
    };

    suiteRef.current = next;
    setSuite(next, true);
    setSelectedBoneId(base.skeleton.bones[id]?.parentId ?? base.skeleton.rootBoneId);
  }, [selectedBoneId, setSuite]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const bone of Object.values(suite.skeleton.bones)) {
      if (!bone.parentId) continue;
      const list = map.get(bone.parentId) ?? [];
      list.push(bone.id);
      map.set(bone.parentId, list);
    }
    Array.from(map.values()).forEach((list) => list.sort());
    return map;
  }, [suite.skeleton.bones]);

  const selectedBone = selectedBoneId ? suite.skeleton.bones[selectedBoneId] : null;
  const selectedCutout = selectedBoneId ? suite.cutoutsByBoneId[selectedBoneId] : null;

  const draw = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(cx, cy);

    const bones = Object.values(posed.bones)
      .filter((b) => Number.isFinite(b.worldX) && Number.isFinite(b.worldY) && Number.isFinite(b.worldAngle))
      .sort((a, b) => a.zOrder - b.zOrder);

    // Cutouts (rects) — rigid pieces that ride on FK transforms.
    for (const bone of bones) {
      const x = bone.worldX ?? 0;
      const y = bone.worldY ?? 0;
      const a = bone.worldAngle ?? 0;
      const cutout = suite.cutoutsByBoneId[bone.id];
      if (!cutout) continue;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.globalAlpha = clamp(cutout.opacity, 0, 1);
      ctx.fillStyle = cutout.fill;
      ctx.strokeStyle = cutout.stroke;
      ctx.lineWidth = bone.id === selectedBoneId ? 2.5 : 1.25;
      ctx.beginPath();
      if (cutout.shape === 'trapezoid') {
        const h = cutout.height;
        const bottomW = cutout.width;
        const topScale = clamp(cutout.trapezoidTopScale, 0.2, 3);
        const topW = bottomW * topScale;

        // Coordinates are in "cutout local" where pivot is at (0,0) after translation.
        const bx = -cutout.pivot.x;
        const by = -cutout.pivot.y;

        const bottomLeft = { x: bx, y: by + h };
        const bottomRight = { x: bx + bottomW, y: by + h };

        // Center top edge over bottom edge, allowing top to extend past bbox when inverted.
        const topInset = (bottomW - topW) / 2;
        const topLeft = { x: bx + topInset, y: by };
        const topRight = { x: bx + topInset + topW, y: by };

        ctx.moveTo(bottomLeft.x, bottomLeft.y);
        ctx.lineTo(bottomRight.x, bottomRight.y);
        ctx.lineTo(topRight.x, topRight.y);
        ctx.lineTo(topLeft.x, topLeft.y);
        ctx.closePath();
      } else {
        ctx.rect(-cutout.pivot.x, -cutout.pivot.y, cutout.width, cutout.height);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Debug bones (lines + joint dots)
    if (showBones) {
      for (const bone of bones) {
        const x = bone.worldX ?? 0;
        const y = bone.worldY ?? 0;
        const a = bone.worldAngle ?? 0;
        const tx = x + Math.cos(a) * bone.length;
        const ty = y + Math.sin(a) * bone.length;

        ctx.lineWidth = selectedBoneId === bone.id ? 4 : 2;
        ctx.strokeStyle = selectedBoneId === bone.id ? '#00ff88' : 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }

      if (mode === 'Pose') {
        for (const bone of bones) {
          const x = bone.worldX ?? 0;
          const y = bone.worldY ?? 0;
          ctx.fillStyle = '#e5e5e5';
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // Selection label
    if (selectedBoneId) {
      const b = posed.bones[selectedBoneId];
      if (b && Number.isFinite(b.worldX) && Number.isFinite(b.worldY)) {
        ctx.font = '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
        ctx.fillStyle = '#00ff88';
        ctx.fillText(b.name, (b.worldX ?? 0) + 12, (b.worldY ?? 0) - 12);
      }
    }

    ctx.restore();
  }, [mode, posed.bones, selectedBoneId, showBones, suite.cutoutsByBoneId]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    return observeCanvasContainer(canvas, container);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      const isRedo =
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y');

      if (isUndo) {
        e.preventDefault();
        undo();
        return;
      }
      if (isRedo) {
        e.preventDefault();
        redo();
        return;
      }

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isTyping) return;

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'e') setMode('Edit');
      if (k === 'p') setMode('Pose');
      if (k === 'a') setMode('Animate');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      const w = getWorldFromPointerEvent(e);
      if (!w) return;
      if (mode !== 'Pose') return;

      const bones = Object.values(posed.bones).filter((b) => Number.isFinite(b.worldX) && Number.isFinite(b.worldY));
      for (const bone of bones) {
        const head = { x: bone.worldX ?? 0, y: bone.worldY ?? 0 };
        if (dist(head, w) <= 10) {
          setSelectedBoneId(bone.id);
          setDrag({ type: 'rotate', boneId: bone.id });
          canvas.setPointerCapture(e.pointerId);
          dragPointerIdRef.current = e.pointerId;
          return;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      if (mode !== 'Pose') return;
      const w = getWorldFromPointerEvent(e);
      if (!w) return;

      const base = suiteRef.current.skeleton;
      const posedNow = computeWorldTransforms(base);
      const bone = posedNow.bones[drag.boneId];
      if (!bone) return;

      const head = { x: bone.worldX ?? 0, y: bone.worldY ?? 0 };
      const desiredWorldAngle = Math.atan2(w.y - head.y, w.x - head.x);
      const parentWorldAngle = bone.parentId ? posedNow.bones[bone.parentId]?.worldAngle ?? 0 : 0;
      const desiredLocalAngle = normalizeAngle(desiredWorldAngle - parentWorldAngle);
      const clampedLocalAngle = clamp(desiredLocalAngle, bone.constraint.minAngle, bone.constraint.maxAngle);

      updateBone(bone.id, (b) => ({ ...b, localAngle: clampedLocalAngle }), false);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!drag) return;
      if (mode !== 'Pose') {
        setDrag(null);
        dragPointerIdRef.current = null;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        return;
      }

      const w = getWorldFromPointerEvent(e);
      setDrag(null);
      dragPointerIdRef.current = null;
      if (w && drag.type === 'rotate') {
        const base = suiteRef.current.skeleton;
        const posedNow = computeWorldTransforms(base);
        const bone = posedNow.bones[drag.boneId];
        if (bone) {
          const head = { x: bone.worldX ?? 0, y: bone.worldY ?? 0 };
          const desiredWorldAngle = Math.atan2(w.y - head.y, w.x - head.x);
          const parentWorldAngle = bone.parentId ? posedNow.bones[bone.parentId]?.worldAngle ?? 0 : 0;
          const desiredLocalAngle = normalizeAngle(desiredWorldAngle - parentWorldAngle);
          const clampedLocalAngle = clamp(desiredLocalAngle, bone.constraint.minAngle, bone.constraint.maxAngle);
          updateBone(bone.id, (b) => ({ ...b, localAngle: clampedLocalAngle }), true);
        }
      }

      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [drag, getWorldFromPointerEvent, mode, posed.bones, updateBone]);

  useEffect(() => {
    if (!isPlaying) return;

    const from = suiteRef.current.poses.find((p) => p.id === fromPoseId);
    const to = suiteRef.current.poses.find((p) => p.id === toPoseId);
    if (!from || !to) {
      setIsPlaying(false);
      return;
    }

    const start = performance.now();
    const duration = clamp(durationMs, 50, 60_000);
    let raf = 0;

    const step = (now: number) => {
      const rawT = (now - start) / duration;
      const done = rawT >= 1;
      const t = clamp(rawT, 0, 1);
      const eased = t * t * (3 - 2 * t);

      const base = suiteRef.current;
      const nextBones: Record<string, Bone> = { ...base.skeleton.bones };
      for (const [id, b] of Object.entries(nextBones)) {
        const a0 = from.localAnglesByBoneId[id] ?? b.localAngle;
        const a1 = to.localAnglesByBoneId[id] ?? b.localAngle;
        const d = normalizeAngle(a1 - a0);
        nextBones[id] = { ...b, localAngle: a0 + d * eased };
      }

      const next: SuiteState = { ...base, skeleton: { ...base.skeleton, bones: nextBones } };
      suiteRef.current = next;
      setSuite(next, false);

      if (done) {
        if (loop) {
          // Restart by toggling play off/on without popping history.
          setIsPlaying(false);
          requestAnimationFrame(() => setIsPlaying(true));
          return;
        }
        setIsPlaying(false);
        return;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, fromPoseId, isPlaying, loop, setSuite, toPoseId]);

  const renderBoneTree = (boneId: string, depth: number): JSX.Element | null => {
    const bone = suite.skeleton.bones[boneId];
    if (!bone) return null;
    const children = childrenByParentId.get(boneId) ?? [];
    const selected = selectedBoneId === boneId;

    return (
      <div key={boneId}>
        <button
          type="button"
          onClick={() => setSelectedBoneId(boneId)}
          className={`w-full text-left px-2 py-1 rounded text-xs ${
            selected ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'
          }`}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {bone.name}
        </button>
        {children.map((cid) => renderBoneTree(cid, depth + 1))}
      </div>
    );
  };

  const onExport = useCallback(() => {
    const data = suiteRef.current;
    downloadJson('skeleton_suite.json', data);
  }, []);

  const onImportFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SuiteState>;
      if (!parsed?.skeleton?.bones || !parsed?.skeleton?.rootBoneId) return;

      const skeleton = parsed.skeleton as Skeleton;
      const cutouts = (parsed.cutoutsByBoneId ?? {}) as Record<string, CutoutMeta>;
      const poses = (parsed.poses ?? []) as Pose[];

      const fixedCutouts: Record<string, CutoutMeta> = { ...cutouts };
      for (const [id, b] of Object.entries(skeleton.bones)) {
        if (fixedCutouts[id]) continue;
      const width = Math.max(18, Math.round(b.length * 1.05));
      const height = Math.max(14, Math.round(b.length * 0.35));
      const { fill, stroke } = pickColor(Object.keys(fixedCutouts).length);
      fixedCutouts[id] = {
        shape: 'rect',
        width,
        height,
        pivot: { x: 10, y: Math.round(height / 2) },
        trapezoidTopScale: 1,
        fill,
        stroke,
        opacity: 1,
      };
    }

    // Ensure new fields exist for older exports.
    for (const [id, c] of Object.entries(fixedCutouts)) {
      fixedCutouts[id] = {
        shape: c.shape === 'trapezoid' ? 'trapezoid' : 'rect',
        width: c.width ?? 50,
        height: c.height ?? 30,
        pivot: c.pivot ?? { x: 10, y: 10 },
        trapezoidTopScale: typeof c.trapezoidTopScale === 'number' && Number.isFinite(c.trapezoidTopScale) ? c.trapezoidTopScale : 1,
        fill: c.fill ?? 'rgba(255,255,255,0.15)',
        stroke: c.stroke ?? 'rgba(255,255,255,0.65)',
        opacity: typeof c.opacity === 'number' && Number.isFinite(c.opacity) ? c.opacity : 1,
      };
    }

      const next: SuiteState = {
        skeleton: { ...skeleton, ikTargets: [] },
        cutoutsByBoneId: fixedCutouts,
        poses:
          poses.length > 0
            ? poses
            : [{ id: 'pose-imported', name: 'Imported Pose', localAnglesByBoneId: capturePose(skeleton) }],
      };

      suiteRef.current = next;
      setSuite(next, true);
      setSelectedBoneId(next.skeleton.rootBoneId);
    },
    [capturePose, setSuite],
  );

  const addPose = useCallback(() => {
    const base = suiteRef.current;
    const nextPose: Pose = {
      id: `pose-${uid()}`,
      name: `Pose ${base.poses.length + 1}`,
      localAnglesByBoneId: capturePose(base.skeleton),
    };
    const next: SuiteState = { ...base, poses: [...base.poses, nextPose] };
    suiteRef.current = next;
    setSuite(next, true);
    setFromPoseId(nextPose.id);
    setToPoseId(nextPose.id);
  }, [capturePose, setSuite]);

  const overwritePose = useCallback(
    (poseId: string) => {
      const base = suiteRef.current;
      const idx = base.poses.findIndex((p) => p.id === poseId);
      if (idx < 0) return;
      const updated: Pose = { ...base.poses[idx]!, localAnglesByBoneId: capturePose(base.skeleton) };
      const nextPoses = base.poses.slice();
      nextPoses[idx] = updated;
      const next: SuiteState = { ...base, poses: nextPoses };
      suiteRef.current = next;
      setSuite(next, true);
    },
    [capturePose, setSuite],
  );

  const deletePose = useCallback(
    (poseId: string) => {
      const base = suiteRef.current;
      const nextPoses = base.poses.filter((p) => p.id !== poseId);
      const next: SuiteState = { ...base, poses: nextPoses.length ? nextPoses : base.poses };
      suiteRef.current = next;
      setSuite(next, true);
    },
    [setSuite],
  );

  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-white">
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 flex">
          <div
            className="min-h-0 border-r border-white/10 bg-black/10"
            style={{ width: panelSizes.left, minWidth: panelSizes.left }}
          >
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
              <div className="text-[10px] font-semibold tracking-wide uppercase text-white/60">Skeleton Suite</div>
              <label className="text-[10px] text-white/60 hover:text-white/80 cursor-pointer">
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => onImportFile(e.target.files?.[0] ?? null)}
                />
                Import
              </label>
            </div>
            <div className="p-2 overflow-auto">{renderBoneTree(suite.skeleton.rootBoneId, 0)}</div>
          </div>

          <div className="w-1 bg-white/10 hover:bg-white/20 cursor-col-resize" onMouseDown={(e) => startResize('left', e)} />

          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-white/10 flex items-center gap-3">
              <ModeToolbar mode={mode} setMode={setMode} />
              <label className="ml-3 flex items-center gap-2 text-xs text-white/70 select-none cursor-pointer">
                <input type="checkbox" checked={showBones} onChange={(e) => setShowBones(e.target.checked)} />
                Show bones
              </label>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={onExport}
                  className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/15"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  className={`px-3 py-1 rounded text-xs ${
                    canUndo ? 'bg-white/10 hover:bg-white/15' : 'bg-white/5 text-white/30'
                  }`}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  className={`px-3 py-1 rounded text-xs ${
                    canRedo ? 'bg-white/10 hover:bg-white/15' : 'bg-white/5 text-white/30'
                  }`}
                >
                  Redo
                </button>
              </div>
            </div>

            <div ref={containerRef} className="flex-1 min-h-0 relative">
              <canvas ref={canvasRef} className="absolute inset-0" />
            </div>
          </div>

          <div className="w-1 bg-white/10 hover:bg-white/20 cursor-col-resize" onMouseDown={(e) => startResize('right', e)} />

          <div
            className="min-h-0 border-l border-white/10 bg-black/10"
            style={{ width: panelSizes.right, minWidth: panelSizes.right }}
          >
            <div className="px-3 py-2 border-b border-white/10 text-[10px] font-semibold tracking-wide uppercase text-white/60">
              Properties
            </div>

            <div className="p-3 overflow-auto space-y-4">
              {!selectedBone ? (
                <div className="text-xs text-white/50">Select a bone.</div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addChildBone}
                      className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/15"
                    >
                      Add Child
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedBone}
                      disabled={selectedBone.id === suite.skeleton.rootBoneId}
                      className={`px-3 py-1 rounded text-xs ${
                        selectedBone.id === suite.skeleton.rootBoneId
                          ? 'bg-white/5 text-white/30'
                          : 'bg-red-500/15 text-red-200 hover:bg-red-500/25'
                      }`}
                    >
                      Delete
                    </button>
                  </div>

                  <div>
                    <div className="text-[10px] text-white/60 mb-1">Name</div>
                    <input
                      value={selectedBone.name}
                      onChange={(e) => updateBone(selectedBone.id, (b) => ({ ...b, name: e.target.value }))}
                      className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Length</div>
                      <input
                        type="number"
                        value={selectedBone.length}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, length: clamp(v, 1, 10_000) }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Local Angle (deg)</div>
                      <input
                        type="number"
                        value={Math.round((selectedBone.localAngle * 180) / Math.PI)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, localAngle: (v * Math.PI) / 180 }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Constraint Min (deg)</div>
                      <input
                        type="number"
                        value={Math.round((selectedBone.constraint.minAngle * 180) / Math.PI)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({
                            ...b,
                            constraint: { ...b.constraint, minAngle: (v * Math.PI) / 180 },
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Constraint Max (deg)</div>
                      <input
                        type="number"
                        value={Math.round((selectedBone.constraint.maxAngle * 180) / Math.PI)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({
                            ...b,
                            constraint: { ...b.constraint, maxAngle: (v * Math.PI) / 180 },
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-3">
                    <div className="text-[10px] font-semibold tracking-wide uppercase text-white/60 mb-2">
                      Cardboard Cutout (Rigid)
                    </div>
                    {!selectedCutout ? (
                      <div className="text-xs text-white/50">No cutout meta for this bone.</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-white/60 mb-1">Shape</div>
                            <select
                              value={selectedCutout.shape}
                              onChange={(e) => {
                                const nextShape = e.target.value === 'trapezoid' ? 'trapezoid' : 'rect';
                                updateCutout(selectedBone.id, (c) => ({
                                  ...c,
                                  shape: nextShape,
                                  trapezoidTopScale: nextShape === 'trapezoid' ? Math.max(1, c.trapezoidTopScale || 1.4) : 1,
                                }));
                              }}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs"
                            >
                              <option value="rect">Rectangle</option>
                              <option value="trapezoid">Trapezoid (inverted if &gt; 1)</option>
                            </select>
                          </div>
                          <div>
                            <div className="text-[10px] text-white/60 mb-1">Top Scale</div>
                            <input
                              type="number"
                              step={0.05}
                              value={selectedCutout.trapezoidTopScale}
                              disabled={selectedCutout.shape !== 'trapezoid'}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isFinite(v)) return;
                                updateCutout(selectedBone.id, (c) => ({ ...c, trapezoidTopScale: clamp(v, 0.2, 3) }));
                              }}
                              className={`w-full px-2 py-1 rounded border text-xs font-mono ${
                                selectedCutout.shape === 'trapezoid'
                                  ? 'bg-black/30 border-white/10'
                                  : 'bg-black/20 border-white/5 text-white/35'
                              }`}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-white/60 mb-1">Width</div>
                            <input
                              type="number"
                              value={selectedCutout.width}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isFinite(v)) return;
                                updateCutout(selectedBone.id, (c) => ({ ...c, width: clamp(v, 1, 10_000) }));
                              }}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-white/60 mb-1">Height</div>
                            <input
                              type="number"
                              value={selectedCutout.height}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isFinite(v)) return;
                                updateCutout(selectedBone.id, (c) => ({ ...c, height: clamp(v, 1, 10_000) }));
                              }}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-white/60 mb-1">Pivot X</div>
                            <input
                              type="number"
                              value={selectedCutout.pivot.x}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isFinite(v)) return;
                                updateCutout(selectedBone.id, (c) => ({ ...c, pivot: { ...c.pivot, x: v } }));
                              }}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-white/60 mb-1">Pivot Y</div>
                            <input
                              type="number"
                              value={selectedCutout.pivot.y}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isFinite(v)) return;
                                updateCutout(selectedBone.id, (c) => ({ ...c, pivot: { ...c.pivot, y: v } }));
                              }}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-white/60 mb-1">Opacity</div>
                            <input
                              type="number"
                              step={0.05}
                              value={selectedCutout.opacity}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!Number.isFinite(v)) return;
                                updateCutout(selectedBone.id, (c) => ({ ...c, opacity: clamp(v, 0, 1) }));
                              }}
                              className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                            />
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="h-7 w-10 rounded border border-white/10" style={{ background: selectedCutout.stroke }} />
                            <button
                              type="button"
                              onClick={() => {
                                const { fill, stroke } = pickColor(Math.floor(Math.random() * 10_000));
                                updateCutout(selectedBone.id, (c) => ({ ...c, fill, stroke }));
                              }}
                              className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/15"
                            >
                              Recolor
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const w = suiteRef.current.cutoutsByBoneId[selectedBone.id]?.width ?? selectedCutout.width;
                                const h = suiteRef.current.cutoutsByBoneId[selectedBone.id]?.height ?? selectedCutout.height;
                                updateCutout(selectedBone.id, (c) => ({ ...c, pivot: { x: w / 2, y: h } }));
                              }}
                              className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/15"
                            >
                              Pivot Bottom-Center
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="h-1 bg-white/10 hover:bg-white/20 cursor-row-resize" onMouseDown={(e) => startResize('bottom', e)} />

        <div className="border-t border-white/10 bg-black/10" style={{ height: panelSizes.bottom, minHeight: panelSizes.bottom }}>
          <div className="px-3 py-2 flex items-center gap-3">
            <div className="text-[10px] font-semibold tracking-wide uppercase text-white/60">Pose-to-Pose (FK Only)</div>
            <button type="button" onClick={addPose} className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/15">
              Add Pose
            </button>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-2 text-xs text-white/70">
                <span className="text-white/50">From</span>
                <select
                  value={fromPoseId}
                  onChange={(e) => setFromPoseId(e.target.value)}
                  className="px-2 py-1 rounded bg-black/30 border border-white/10 text-xs"
                >
                  {suite.poses.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/70">
                <span className="text-white/50">To</span>
                <select
                  value={toPoseId}
                  onChange={(e) => setToPoseId(e.target.value)}
                  className="px-2 py-1 rounded bg-black/30 border border-white/10 text-xs"
                >
                  {suite.poses.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/70">
                <span className="text-white/50">ms</span>
                <input
                  type="number"
                  value={durationMs}
                  onChange={(e) => {
                    const v = parseInt(e.target.value || '0', 10);
                    if (!Number.isFinite(v)) return;
                    setDurationMs(clamp(v, 50, 60_000));
                  }}
                  className="w-24 px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-white/70 select-none cursor-pointer">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
                Loop
              </label>
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className={`px-3 py-1 rounded text-xs ${isPlaying ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/15'}`}
              >
                {isPlaying ? 'Stop' : 'Play'}
              </button>
            </div>
          </div>

          <div className="px-3 pb-3 overflow-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {suite.poses.map((p) => (
                <div key={p.id} className="border border-white/10 rounded px-3 py-2 bg-black/20">
                  <div className="flex items-center gap-2">
                    <input
                      value={p.name}
                      onChange={(e) => {
                        const base = suiteRef.current;
                        const idx = base.poses.findIndex((x) => x.id === p.id);
                        if (idx < 0) return;
                        const nextPoses = base.poses.slice();
                        nextPoses[idx] = { ...nextPoses[idx]!, name: e.target.value };
                        const next: SuiteState = { ...base, poses: nextPoses };
                        suiteRef.current = next;
                        setSuite(next, true);
                      }}
                      className="flex-1 px-2 py-1 rounded bg-black/30 border border-white/10 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => applyPose(p, true)}
                      className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/15"
                    >
                      Apply
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => overwritePose(p.id)}
                      className="px-3 py-1 rounded text-xs bg-white/10 hover:bg-white/15"
                    >
                      Overwrite
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (suite.poses.length <= 1) return;
                        deletePose(p.id);
                      }}
                      disabled={suite.poses.length <= 1}
                      className={`px-3 py-1 rounded text-xs ${
                        suite.poses.length <= 1 ? 'bg-white/5 text-white/30' : 'bg-red-500/15 text-red-200 hover:bg-red-500/25'
                      }`}
                    >
                      Delete
                    </button>
                    <div className="ml-auto text-[10px] text-white/45">{Object.keys(p.localAnglesByBoneId).length} bones</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
