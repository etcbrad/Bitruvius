import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Bone, Skeleton, Vec2 } from '@shared/skeleton';
import { ModeToolbar, type EditorMode } from '@/components/ModeToolbar';
import { observeCanvasContainer } from '@/lib/canvas';
import { computeWorldTransforms } from '@/lib/skeleton';
import { solveFABRIK } from '@/lib/ik';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { TransitionWarningDialog, getTransitionWarningsDisabled } from '@/components/TransitionWarningDialog';
import type { TransitionIssue } from '@/lib/transitionIssues';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const normalizeAngle = (a: number) => {
  let x = a;
  while (x <= -Math.PI) x += Math.PI * 2;
  while (x > Math.PI) x -= Math.PI * 2;
  return x;
};

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const INITIAL_SKELETON: Skeleton = {
  id: 'demo',
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
      constraint: { minAngle: -Math.PI, maxAngle: Math.PI, stiffness: 1 },
    },
    upper: {
      id: 'upper',
      name: 'Upper',
      parentId: 'root',
      localAngle: 0,
      length: 70,
      spriteId: null,
      pivotOffset: { x: 0, y: 0 },
      spriteScale: { x: 1, y: 1 },
      zOrder: 1,
      constraint: { minAngle: -Math.PI / 2, maxAngle: Math.PI / 2, stiffness: 1 },
    },
    lower: {
      id: 'lower',
      name: 'Lower',
      parentId: 'upper',
      localAngle: 0,
      length: 60,
      spriteId: null,
      pivotOffset: { x: 0, y: 0 },
      spriteScale: { x: 1, y: 1 },
      zOrder: 2,
      constraint: { minAngle: -Math.PI / 2, maxAngle: Math.PI / 2, stiffness: 1 },
    },
  },
  ikTargets: [
    {
      id: 'arm',
      chainEndBoneId: 'lower',
      chainLength: 2,
      targetX: 140,
      targetY: 20,
      enabled: true,
    },
  ],
};

type DragState =
  | { type: 'rotate'; boneId: string }
  | { type: 'ik'; targetId: string }
  | null;

export default function SkeletonEditorPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragPointerIdRef = useRef<number | null>(null);

  const { state: skeleton, setState: setSkeleton, undo, redo, canUndo, canRedo } = useUndoRedo(INITIAL_SKELETON);
  const skeletonRef = useRef(skeleton);

  const [mode, setMode] = useState<EditorMode>('Pose');
  const [selectedBoneId, setSelectedBoneId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [panelSizes, setPanelSizes] = useState({ left: 200, right: 260, bottom: 160 });
  const [transitionWarningOpen, setTransitionWarningOpen] = useState(false);
  const [transitionWarningIssues, setTransitionWarningIssues] = useState<TransitionIssue[]>([]);

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
            const nextLeft = clamp(start.left + dx, 120, window.innerWidth - 400);
            return { ...prev, left: nextLeft };
          }
          if (edge === 'right') {
            const nextRight = clamp(start.right - dx, 180, window.innerWidth - 400);
            return { ...prev, right: nextRight };
          }
          const nextBottom = clamp(start.bottom - dy, 80, window.innerHeight - 200);
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

  const posed = useMemo(() => computeWorldTransforms(skeleton), [skeleton]);

  useEffect(() => {
    skeletonRef.current = skeleton;
  }, [skeleton]);

  useEffect(() => {
    if (mode === 'Pose') return;
    if (!drag) return;

    setDrag(null);

    const canvas = canvasRef.current;
    const pointerId = dragPointerIdRef.current;
    dragPointerIdRef.current = null;
    if (canvas && pointerId !== null) {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }

    const issue: TransitionIssue = {
      severity: 'warning',
      title: 'Stopped active drag',
      detail: 'Left Pose mode while dragging; the active interaction was canceled to prevent contradictory editor modes.',
      autoFixedFields: ['ui.drag'],
    };
    console.warn('[skeleton-editor]', issue.title, issue.detail);
    if (!getTransitionWarningsDisabled()) {
      setTransitionWarningIssues([issue]);
      setTransitionWarningOpen(true);
    }
  }, [drag, mode]);

  const getWorldFromPointerEvent = useCallback(
    (e: PointerEvent): Vec2 | null => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      return { x: e.clientX - rect.left - cx, y: e.clientY - rect.top - cy };
    },
    [],
  );

  const buildChain = useCallback((s: Skeleton, chainEndBoneId: string, chainLength: number): Bone[] => {
    const chainIds: string[] = [];
    let curId: string | null = chainEndBoneId;
    while (chainIds.length < chainLength && curId) {
      const bone: Bone | undefined = s.bones[curId] as Bone | undefined;
      if (!bone) break;
      chainIds.push(curId);
      curId = bone.parentId;
    }
    chainIds.reverse();
    return chainIds.map((id) => s.bones[id] as Bone).filter(Boolean);
  }, []);

  const applySolvedChainLocalAngles = useCallback(
    (base: Skeleton, chain: Bone[], heads: Vec2[], target: Vec2): Skeleton => {
      if (chain.length === 0 || heads.length !== chain.length) return base;

      const nextBones: Record<string, Bone> = { ...base.bones };

      // The chain root might have a parent outside the chain; preserve that parent world angle.
      let parentWorldAngle = (chain[0]!.worldAngle ?? 0) - chain[0]!.localAngle;

      for (let i = 0; i < chain.length; i++) {
        const bone = chain[i]!;
        const a = heads[i]!;
        const b: Vec2 = i < chain.length - 1 ? heads[i + 1]! : target;
        const desiredWorldAngle = Math.atan2(b.y - a.y, b.x - a.x);
        const desiredLocalAngle = normalizeAngle(desiredWorldAngle - parentWorldAngle);
        const clampedLocalAngle = clamp(desiredLocalAngle, bone.constraint.minAngle, bone.constraint.maxAngle);

        nextBones[bone.id] = { ...nextBones[bone.id]!, localAngle: clampedLocalAngle };
        parentWorldAngle = parentWorldAngle + clampedLocalAngle;
      }

      return { ...base, bones: nextBones };
    },
    [],
  );

  const updateIKTarget = useCallback(
    (targetId: string, nextTarget: Vec2, pushToHistory: boolean) => {
      const base = skeletonRef.current;
      const t = base.ikTargets.find((x) => x.id === targetId);
      if (!t) return;

      const updatedTargets = base.ikTargets.map((x) =>
        x.id === targetId ? { ...x, targetX: nextTarget.x, targetY: nextTarget.y } : x,
      );
      const withTarget: Skeleton = { ...base, ikTargets: updatedTargets };

      const posedWithTarget = computeWorldTransforms(withTarget);
      const posedChain = buildChain(posedWithTarget, t.chainEndBoneId, t.chainLength);
      const heads = solveFABRIK(posedChain, nextTarget);
      const updated = applySolvedChainLocalAngles(withTarget, posedChain, heads, nextTarget);

      skeletonRef.current = updated;
      setSkeleton(updated, pushToHistory);
    },
    [applySolvedChainLocalAngles, buildChain, setSkeleton],
  );

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

    // Bones (lines)
    const bones = Object.values(posed.bones)
      .filter((b) => Number.isFinite(b.worldX) && Number.isFinite(b.worldY) && Number.isFinite(b.worldAngle))
      .sort((a, b) => a.zOrder - b.zOrder);

    for (const bone of bones) {
      const x = bone.worldX ?? 0;
      const y = bone.worldY ?? 0;
      const a = bone.worldAngle ?? 0;
      const tx = x + Math.cos(a) * bone.length;
      const ty = y + Math.sin(a) * bone.length;

      ctx.lineWidth = selectedBoneId === bone.id ? 4 : 2;
      ctx.strokeStyle = selectedBoneId === bone.id ? '#00ff88' : '#444';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // FK handles
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

    // IK pins
    for (const t of posed.ikTargets) {
      if (!t.enabled) continue;
      const x = t.targetX;
      const y = t.targetY;
      const s = 10;
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
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
  }, [mode, posed.bones, posed.ikTargets, selectedBoneId]);

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
      } else if (isRedo) {
        e.preventDefault();
        redo();
      } else {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        const isTyping =
          target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button';
        if (isTyping) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const k = e.key.toLowerCase();
        if (k === 'e') setMode('Edit');
        if (k === 'p') setMode('Pose');
        if (k === 'a') setMode('Animate');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, setMode, undo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      const w = getWorldFromPointerEvent(e);
      if (!w) return;

      if (mode !== 'Pose') return;

      // Check IK pins first.
      for (const t of posed.ikTargets) {
        if (!t.enabled) continue;
        if (dist({ x: t.targetX, y: t.targetY }, w) <= 14) {
          setDrag({ type: 'ik', targetId: t.id });
          canvas.setPointerCapture(e.pointerId);
          dragPointerIdRef.current = e.pointerId;
          updateIKTarget(t.id, w, false);
          return;
        }
      }

      const bones = Object.values(posed.bones).filter((b) => Number.isFinite(b.worldX) && Number.isFinite(b.worldY));
      for (const bone of bones) {
        const head = { x: bone.worldX ?? 0, y: bone.worldY ?? 0 };
        if (dist(head, w) <= 8) {
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

      if (drag.type === 'ik') {
        updateIKTarget(drag.targetId, w, false);
        return;
      }

      if (drag.type === 'rotate') {
        const base = skeletonRef.current;
        const posedNow = computeWorldTransforms(base);
        const bone = posedNow.bones[drag.boneId];
        if (!bone) return;

        const head = { x: bone.worldX ?? 0, y: bone.worldY ?? 0 };
        const desiredWorldAngle = Math.atan2(w.y - head.y, w.x - head.x);
        const parentWorldAngle = bone.parentId ? posedNow.bones[bone.parentId]?.worldAngle ?? 0 : 0;
        const desiredLocalAngle = normalizeAngle(desiredWorldAngle - parentWorldAngle);
        const clampedLocalAngle = clamp(desiredLocalAngle, bone.constraint.minAngle, bone.constraint.maxAngle);

        const next: Skeleton = {
          ...base,
          bones: {
            ...base.bones,
            [bone.id]: { ...base.bones[bone.id]!, localAngle: clampedLocalAngle },
          },
        };
        skeletonRef.current = next;
        setSkeleton(next, false);
      }
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

      if (drag.type === 'ik') {
        if (w) updateIKTarget(drag.targetId, w, true);
      } else if (drag.type === 'rotate') {
        if (w) {
          const base = skeletonRef.current;
          const posedNow = computeWorldTransforms(base);
          const bone = posedNow.bones[drag.boneId];
          if (bone) {
            const head = { x: bone.worldX ?? 0, y: bone.worldY ?? 0 };
            const desiredWorldAngle = Math.atan2(w.y - head.y, w.x - head.x);
            const parentWorldAngle = bone.parentId ? posedNow.bones[bone.parentId]?.worldAngle ?? 0 : 0;
            const desiredLocalAngle = normalizeAngle(desiredWorldAngle - parentWorldAngle);
            const clampedLocalAngle = clamp(desiredLocalAngle, bone.constraint.minAngle, bone.constraint.maxAngle);

            const next: Skeleton = {
              ...base,
              bones: {
                ...base.bones,
                [bone.id]: { ...base.bones[bone.id]!, localAngle: clampedLocalAngle },
              },
            };
            skeletonRef.current = next;
            setSkeleton(next, true);
          }
        }
      }

      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore.
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
  }, [
    drag,
    getWorldFromPointerEvent,
    mode,
    posed.bones,
    posed.ikTargets,
    setSkeleton,
    updateIKTarget,
  ]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const bone of Object.values(skeleton.bones)) {
      if (!bone.parentId) continue;
      const list = map.get(bone.parentId) ?? [];
      list.push(bone.id);
      map.set(bone.parentId, list);
    }
    Array.from(map.values()).forEach((list) => list.sort());
    return map;
  }, [skeleton.bones]);

  const selectedBone = selectedBoneId ? skeleton.bones[selectedBoneId] : null;

  const radToDeg = useCallback((r: number) => (r * 180) / Math.PI, []);
  const degToRad = useCallback((d: number) => (d * Math.PI) / 180, []);

  const updateBone = useCallback(
    (boneId: string, updater: (prev: Bone) => Bone) => {
      const base = skeletonRef.current;
      const prevBone = base.bones[boneId];
      if (!prevBone) return;
      const nextBone = updater(prevBone);
      const next: Skeleton = { ...base, bones: { ...base.bones, [boneId]: nextBone } };
      skeletonRef.current = next;
      setSkeleton(next, true);
    },
    [setSkeleton],
  );

  const renderBoneTree = (boneId: string, depth: number): JSX.Element | null => {
    const bone = skeleton.bones[boneId];
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

  return (
    <div className="h-screen w-full bg-[#0a0a0a] text-white">
      <div className="h-full flex flex-col min-h-0">
        <div className="flex-1 min-h-0 flex">
          <div
            className="min-h-0 border-r border-white/10 bg-black/10"
            style={{ width: panelSizes.left, minWidth: panelSizes.left }}
          >
            <div className="px-3 py-2 border-b border-white/10 text-[10px] font-semibold tracking-wide uppercase text-white/60">
              Skeleton Outliner
            </div>
            <div className="p-2 overflow-auto">{renderBoneTree(skeleton.rootBoneId, 0)}</div>
          </div>

          <div
            className="w-1 bg-white/10 hover:bg-white/20 cursor-col-resize"
            onMouseDown={(e) => startResize('left', e)}
          />

          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-white/10 flex items-center gap-3">
              <ModeToolbar mode={mode} setMode={setMode} />
              <div className="ml-auto flex items-center gap-2">
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

          <div
            className="w-1 bg-white/10 hover:bg-white/20 cursor-col-resize"
            onMouseDown={(e) => startResize('right', e)}
          />

          <div
            className="min-h-0 border-l border-white/10 bg-black/10"
            style={{ width: panelSizes.right, minWidth: panelSizes.right }}
          >
            <div className="px-3 py-2 border-b border-white/10 text-[10px] font-semibold tracking-wide uppercase text-white/60">
              Properties
            </div>

            <div className="p-3 overflow-auto space-y-3">
              {!selectedBone ? (
                <div className="text-xs text-white/50">Select a bone.</div>
              ) : (
                <>
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
                      <div className="text-[10px] text-white/60 mb-1">Local Angle (deg)</div>
                      <input
                        type="number"
                        value={radToDeg(selectedBone.localAngle)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, localAngle: degToRad(v) }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Z Order</div>
                      <input
                        type="number"
                        step={1}
                        value={selectedBone.zOrder}
                        onChange={(e) => {
                          const v = parseInt(e.target.value || '0', 10);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, zOrder: v }));
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
                        value={radToDeg(selectedBone.constraint.minAngle)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({
                            ...b,
                            constraint: { ...b.constraint, minAngle: degToRad(v) },
                          }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Constraint Max (deg)</div>
                      <input
                        type="number"
                        value={radToDeg(selectedBone.constraint.maxAngle)}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({
                            ...b,
                            constraint: { ...b.constraint, maxAngle: degToRad(v) },
                          }));
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
                        value={selectedBone.pivotOffset.x}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, pivotOffset: { ...b.pivotOffset, x: v } }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Pivot Y</div>
                      <input
                        type="number"
                        value={selectedBone.pivotOffset.y}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, pivotOffset: { ...b.pivotOffset, y: v } }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Sprite Scale X</div>
                      <input
                        type="number"
                        value={selectedBone.spriteScale.x}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, spriteScale: { ...b.spriteScale, x: v } }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <div className="text-[10px] text-white/60 mb-1">Sprite Scale Y</div>
                      <input
                        type="number"
                        value={selectedBone.spriteScale.y}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!Number.isFinite(v)) return;
                          updateBone(selectedBone.id, (b) => ({ ...b, spriteScale: { ...b.spriteScale, y: v } }));
                        }}
                        className="w-full px-2 py-1 rounded bg-black/30 border border-white/10 text-xs font-mono"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="h-1 bg-white/10 hover:bg-white/20 cursor-row-resize" onMouseDown={(e) => startResize('bottom', e)} />

        <div className="border-t border-white/10 bg-black/10" style={{ height: panelSizes.bottom, minHeight: panelSizes.bottom }}>
          <div className="px-3 py-2 text-[10px] font-semibold tracking-wide uppercase text-white/60">Timeline</div>
        </div>
      </div>

      <TransitionWarningDialog
        open={transitionWarningOpen}
        issues={transitionWarningIssues}
        onClose={() => {
          setTransitionWarningOpen(false);
          setTransitionWarningIssues([]);
        }}
      />
    </div>
  );
}
