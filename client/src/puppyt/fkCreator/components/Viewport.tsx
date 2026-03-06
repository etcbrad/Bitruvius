import { useEffect, useMemo, useRef, useState } from 'react';
import type { Part, RiggingState } from '../types';
import { MODE_NAMES, ROLE_COLORS } from '../constants';

type DragKind = 'pivot' | 'part' | 'cut' | null;

interface ViewportProps {
  state: RiggingState;
  onSelectPart?: (partId: number | null) => void;
  onStartDraggingPivot?: (partId: number) => void;
  onDragPivot?: (partId: number, x: number, y: number) => void;
  onStopDraggingPivot?: () => void;
  onStartDraggingPart?: (partId: number) => void;
  onDragPart?: (partId: number, dx: number, dy: number) => void;
  onStopDraggingPart?: () => void;
  onStartCut?: (x1: number, y1: number) => void;
  onUpdateCut?: (x2: number, y2: number) => void;
  onToggleMergeSelection?: (partId: number) => void;
}

export function Viewport({
  state,
  onSelectPart,
  onStartDraggingPivot,
  onDragPivot,
  onStopDraggingPivot,
  onStartDraggingPart,
  onDragPart,
  onStopDraggingPart,
  onStartCut,
  onUpdateCut,
  onToggleMergeSelection,
}: ViewportProps) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ kind: DragKind; partId: number | null; lastX: number; lastY: number } | null>(null);

  // Resize canvases to container size (CSS pixels)
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !mainCanvasRef.current || !uiCanvasRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      mainCanvasRef.current.width = width;
      mainCanvasRef.current.height = height;
      uiCanvasRef.current.width = width;
      uiCanvasRef.current.height = height;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    drawCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const cursor = useMemo(() => {
    if (drag?.kind === 'part') return 'grabbing';
    if (drag?.kind === 'pivot') return 'grabbing';
    if (state.mode === 'harvest') return 'grab';
    if (state.mode === 'cut') return 'crosshair';
    return 'default';
  }, [drag?.kind, state.mode]);

  const getMouse = (e: React.MouseEvent): { mx: number; my: number } => {
    if (!uiCanvasRef.current) return { mx: 0, my: 0 };
    const rect = uiCanvasRef.current.getBoundingClientRect();
    return {
      mx: (e.clientX - rect.left - state.offset.x) / state.scale,
      my: (e.clientY - rect.top - state.offset.y) / state.scale,
    };
  };

  const getPartAtPoint = (x: number, y: number): Part | null => {
    for (let i = state.parts.length - 1; i >= 0; i--) {
      const part = state.parts[i]!;
      const [bx, by, bw, bh] = part.bbox;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return part;
    }
    return null;
  };

  const getPivotHit = (x: number, y: number): Part | null => {
    const hitRadius = 10 / Math.max(state.scale, 0.0001); // in sheet px
    for (let i = state.parts.length - 1; i >= 0; i--) {
      const part = state.parts[i]!;
      const dx = x - part.pivot.x;
      const dy = y - part.pivot.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) return part;
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { mx, my } = getMouse(e);
    setCoords({ x: Math.round(mx), y: Math.round(my) });

    if (!drag) return;

    if (drag.kind === 'pivot' && drag.partId != null && onDragPivot) {
      onDragPivot(drag.partId, mx, my);
      return;
    }

    if (drag.kind === 'part' && drag.partId != null && onDragPart) {
      const dx = mx - drag.lastX;
      const dy = my - drag.lastY;
      setDrag({ ...drag, lastX: mx, lastY: my });
      onDragPart(drag.partId, dx, dy);
      return;
    }

    if (drag.kind === 'cut' && onUpdateCut) {
      onUpdateCut(mx, my);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const { mx, my } = getMouse(e);

    if (state.mode === 'cut') {
      onStartCut?.(mx, my);
      setDrag({ kind: 'cut', partId: null, lastX: mx, lastY: my });
      return;
    }

    const pivotHit = getPivotHit(mx, my);
    if (pivotHit && state.mode !== 'merge') {
      onSelectPart?.(pivotHit.id);
      onStartDraggingPivot?.(pivotHit.id);
      setDrag({ kind: 'pivot', partId: pivotHit.id, lastX: mx, lastY: my });
      return;
    }

    const partHit = getPartAtPoint(mx, my);
    if (state.mode === 'merge') {
      if (partHit) onToggleMergeSelection?.(partHit.id);
      return;
    }

    if (partHit) {
      onSelectPart?.(partHit.id);
      onStartDraggingPart?.(partHit.id);
      setDrag({ kind: 'part', partId: partHit.id, lastX: mx, lastY: my });
    } else {
      onSelectPart?.(null);
    }
  };

  const handleMouseUp = () => {
    if (drag?.kind === 'pivot') onStopDraggingPivot?.();
    if (drag?.kind === 'part') onStopDraggingPart?.();
    setDrag(null);
  };

  const drawCanvas = () => {
    const mainCanvas = mainCanvasRef.current;
    const uiCanvas = uiCanvasRef.current;
    if (!mainCanvas || !uiCanvas) return;

    const ctx = mainCanvas.getContext('2d');
    const uictx = uiCanvas.getContext('2d');
    if (!ctx || !uictx) return;

    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    uictx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);

    const s = state.scale;
    const ox = state.offset.x;
    const oy = state.offset.y;

    if (state.img) {
      ctx.save();
      if (state.mode === 'pose') ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#ede8d8';
      ctx.fillRect(ox, oy, state.img.width * s, state.img.height * s);
      ctx.globalAlpha = state.mode === 'pose' ? 0.12 : 1;
      ctx.drawImage(state.img, ox, oy, state.img.width * s, state.img.height * s);
      ctx.globalAlpha = 1;
      ctx.restore();

      uictx.strokeStyle = 'rgba(200,180,140,0.2)';
      uictx.lineWidth = 1;
      uictx.strokeRect(ox + 0.5, oy + 0.5, state.img.width * s - 1, state.img.height * s - 1);
    } else {
      uictx.fillStyle = 'rgba(255,255,255,0.03)';
      uictx.fillRect(60, 60, mainCanvas.width - 120, mainCanvas.height - 120);
      uictx.strokeStyle = 'rgba(255,255,255,0.05)';
      uictx.setLineDash([8, 8]);
      uictx.strokeRect(60.5, 60.5, mainCanvas.width - 121, mainCanvas.height - 121);
      uictx.setLineDash([]);
      uictx.fillStyle = 'rgba(255,255,255,0.08)';
      uictx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace';
      uictx.textAlign = 'center';
      uictx.fillText('— LOAD SHEET TO BEGIN —', mainCanvas.width / 2, mainCanvas.height / 2);
      uictx.textAlign = 'left';
    }

    if (state.mode === 'pose') {
      const roots = state.parts.filter((p) => !p.parent);
      roots.forEach((r) => drawPartHierarchy(ctx, uictx, r, null));
      state.parts.forEach((p) => drawPivotDot(uictx, p));
    } else {
      state.parts.forEach((p) => drawRigBox(uictx, p));
    }

    if (state.cutLine) drawCutLine(uictx, state.cutLine);
    if (state.mode === 'merge') {
      state.mergeSelection.forEach((partId) => {
        const part = state.parts.find((p) => p.id === partId);
        if (part) drawMergeHighlight(uictx, part);
      });
    }
  };

  const drawRigBox = (uictx: CanvasRenderingContext2D, p: Part) => {
    const s = state.scale;
    const ox = state.offset.x;
    const oy = state.offset.y;
    const isSel = p.id === state.selectedId;
    const isDragging = p.id === state.draggingPartId;
    const roleColor = ROLE_COLORS[p.role] || '#888';

    uictx.save();
    uictx.strokeStyle = isDragging ? '#ff6b6b' : isSel ? '#fff' : roleColor + '99';
    uictx.lineWidth = isDragging || isSel ? 2 : 1;
    if (!isSel && !isDragging) uictx.setLineDash([4, 4]);
    uictx.strokeRect(p.bbox[0] * s + ox, p.bbox[1] * s + oy, p.bbox[2] * s, p.bbox[3] * s);
    uictx.setLineDash([]);

    if (isDragging) {
      uictx.fillStyle = 'rgba(255, 107, 107, 0.1)';
      uictx.fillRect(p.bbox[0] * s + ox, p.bbox[1] * s + oy, p.bbox[2] * s, p.bbox[3] * s);
    }

    if (state.mode !== 'harvest' || isSel || isDragging) {
      uictx.font = '9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace';
      const textWidth = uictx.measureText(p.role).width;
      uictx.fillStyle = isDragging ? '#ff6b6b' : roleColor + 'cc';
      uictx.fillRect(p.bbox[0] * s + ox, p.bbox[1] * s + oy - 16, textWidth + 8, 14);
      uictx.fillStyle = '#000';
      uictx.fillText(p.role, p.bbox[0] * s + ox + 4, p.bbox[1] * s + oy - 5);
    }

    uictx.restore();
    drawPivotDot(uictx, p);

    if (p.parent) {
      const par = state.parts.find((x) => x.id === p.parent);
      if (par) {
        uictx.save();
        uictx.strokeStyle = 'rgba(255,196,0,0.3)';
        uictx.lineWidth = 1;
        uictx.setLineDash([3, 6]);
        uictx.beginPath();
        uictx.moveTo(p.pivot.x * s + ox, p.pivot.y * s + oy);
        uictx.lineTo(par.pivot.x * s + ox, par.pivot.y * s + oy);
        uictx.stroke();
        uictx.setLineDash([]);
        uictx.restore();
      }
    }
  };

  const drawPivotDot = (uictx: CanvasRenderingContext2D, p: Part) => {
    const s = state.scale;
    const ox = state.offset.x;
    const oy = state.offset.y;
    const isSel = p.id === state.selectedId;

    const cx = p.pivot.x * s + ox;
    const cy = p.pivot.y * s + oy;
    const r = isSel ? 7 : 5;
    const col = p.pivot.isAuto ? '#00d4e8' : '#ffc400';

    uictx.save();
    uictx.shadowColor = col;
    uictx.shadowBlur = isSel ? 10 : 4;
    uictx.beginPath();
    uictx.arc(cx, cy, r, 0, Math.PI * 2);
    uictx.fillStyle = col;
    uictx.fill();
    uictx.shadowBlur = 0;
    uictx.strokeStyle = '#000';
    uictx.lineWidth = 1;
    uictx.beginPath();
    uictx.moveTo(cx - r, cy);
    uictx.lineTo(cx + r, cy);
    uictx.moveTo(cx, cy - r);
    uictx.lineTo(cx, cy + r);
    uictx.stroke();
    uictx.restore();
  };

  const drawPartHierarchy = (
    ctx: CanvasRenderingContext2D,
    uictx: CanvasRenderingContext2D,
    p: Part,
    parentPivot: { x: number; y: number } | null
  ) => {
    const s = state.scale;
    const ox = state.offset.x;
    const oy = state.offset.y;

    ctx.save();
    const pivX = p.pivot.x * s + ox;
    const pivY = p.pivot.y * s + oy;
    ctx.translate(pivX, pivY);
    ctx.rotate((p.rotation * Math.PI) / 180);

    if (state.img) {
      const [bx, by, bw, bh] = p.bbox;
      const destX = (bx - p.pivot.x) * s;
      const destY = (by - p.pivot.y) * s;
      ctx.drawImage(state.img, bx, by, bw, bh, destX, destY, bw * s, bh * s);
    }
    ctx.restore();

    if (parentPivot) {
      uictx.save();
      uictx.strokeStyle = 'rgba(255,196,0,0.5)';
      uictx.lineWidth = 2;
      uictx.beginPath();
      uictx.moveTo(pivX, pivY);
      uictx.lineTo(parentPivot.x, parentPivot.y);
      uictx.stroke();
      uictx.restore();
    }

    const children = state.parts.filter((c) => c.parent === p.id);
    children.forEach((child) => drawPartHierarchy(ctx, uictx, child, { x: pivX, y: pivY }));
  };

  const drawCutLine = (uictx: CanvasRenderingContext2D, cutLine: { x1: number; y1: number; x2: number; y2: number }) => {
    const s = state.scale;
    const ox = state.offset.x;
    const oy = state.offset.y;

    uictx.save();
    uictx.strokeStyle = '#ff6b6b';
    uictx.lineWidth = 3;
    uictx.setLineDash([10, 5]);
    uictx.beginPath();
    uictx.moveTo(cutLine.x1 * s + ox, cutLine.y1 * s + oy);
    uictx.lineTo(cutLine.x2 * s + ox, cutLine.y2 * s + oy);
    uictx.stroke();
    uictx.restore();
  };

  const drawMergeHighlight = (uictx: CanvasRenderingContext2D, part: Part) => {
    const s = state.scale;
    const ox = state.offset.x;
    const oy = state.offset.y;
    const [px, py, pw, ph] = part.bbox;
    uictx.save();
    uictx.fillStyle = 'rgba(255, 107, 107, 0.3)';
    uictx.fillRect(px * s + ox, py * s + oy, pw * s, ph * s);
    uictx.strokeStyle = '#ff6b6b';
    uictx.lineWidth = 2;
    uictx.strokeRect(px * s + ox, py * s + oy, pw * s, ph * s);
    uictx.restore();
  };

  return (
    <div className="viewport" ref={containerRef}>
      <canvas ref={mainCanvasRef} />
      <canvas
        ref={uiCanvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor }}
      />
      <div className="mode-indicator">
        Mode: <span>{MODE_NAMES[state.mode]}</span>
      </div>
      <div className="coords">
        x: {coords.x} y: {coords.y}
      </div>
    </div>
  );
}

