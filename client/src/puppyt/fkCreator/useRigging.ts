import { useCallback, useMemo, useState } from 'react';
import type { AnatomicalRole, Mode, Part, RiggingState } from './types';
import { AUTO_PARENTS } from './constants';

let partIdCounter = 1;

const cap = (s: string) => (s.length ? s[0]!.toUpperCase() + s.slice(1) : s);
const bbox = (x: number, y: number, w: number, h: number): [number, number, number, number] => [x, y, w, h];

export function useRigging() {
  const [state, setState] = useState<RiggingState>({
    mode: 'harvest',
    img: null,
    parts: [],
    selectedId: null,
    scale: 1,
    offset: { x: 0, y: 0 },
    draggingPivotPartId: null,
    draggingPartId: null,
    cutLine: null,
    mergeSelection: [],
    lastMessage: null,
  });

  const notify = useCallback((message: string) => {
    setState((prev) => ({ ...prev, lastMessage: message }));
  }, []);

  const setMode = useCallback(
    (mode: Mode) => {
      setState((prev) => ({
        ...prev,
        mode,
        cutLine: mode === 'cut' ? prev.cutLine : null,
        mergeSelection: mode === 'merge' ? prev.mergeSelection : [],
        draggingPivotPartId: null,
        draggingPartId: null,
      }));
      notify(`Mode → ${cap(mode)}`);
    },
    [notify]
  );

  const loadImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const img = new Image();
        img.onload = () => {
          const headerHeight = 52;
          const sidebarWidth = 290;
          const margin = 0.85;

          const canvasWidth = Math.max(100, window.innerWidth - sidebarWidth);
          const canvasHeight = Math.max(100, window.innerHeight - headerHeight);
          const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height) * margin;
          const offsetX = (canvasWidth - img.width * scale) / 2;
          const offsetY = (canvasHeight - img.height * scale) / 2;

          setState((prev) => ({
            ...prev,
            img,
            scale,
            offset: { x: offsetX, y: offsetY },
          }));
          notify(`Sheet loaded — ${file.name}`);
        };
        img.src = evt.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [notify]
  );

  const clearParts = useCallback(() => {
    setState((prev) => ({
      ...prev,
      parts: [],
      selectedId: null,
      mergeSelection: [],
      cutLine: null,
    }));
    notify('Parts cleared');
  }, [notify]);

  const selectPart = useCallback((id: number | null) => {
    setState((prev) => ({ ...prev, selectedId: id }));
  }, []);

  const updatePart = useCallback((prop: keyof Part | 'rotation', value: unknown) => {
    setState((prev) => {
      if (prev.selectedId == null) return prev;
      const parts = prev.parts.map((p) => {
        if (p.id !== prev.selectedId) return p;
        if (prop === 'rotation') return { ...p, rotation: Number(value) || 0 };
        return { ...p, [prop]: value } as Part;
      });
      return { ...prev, parts };
    });
  }, []);

  const updatePartParent = useCallback((parentId: number | null) => {
    setState((prev) => {
      if (prev.selectedId == null) return prev;
      const parts = prev.parts.map((p) => (p.id === prev.selectedId ? { ...p, parent: parentId } : p));
      return { ...prev, parts };
    });
  }, []);

  const startDraggingPivot = useCallback((partId: number) => {
    setState((prev) => ({ ...prev, draggingPivotPartId: partId, draggingPartId: null }));
  }, []);

  const dragPivot = useCallback((partId: number, x: number, y: number) => {
    setState((prev) => {
      const parts = prev.parts.map((p) =>
        p.id === partId ? { ...p, pivot: { x, y, isAuto: false } } : p
      );
      return { ...prev, parts };
    });
  }, []);

  const stopDraggingPivot = useCallback(() => {
    setState((prev) => ({ ...prev, draggingPivotPartId: null }));
  }, []);

  const startDraggingPart = useCallback((partId: number) => {
    setState((prev) => ({ ...prev, draggingPartId: partId, draggingPivotPartId: null }));
  }, []);

  const dragPart = useCallback((partId: number, dx: number, dy: number) => {
    setState((prev) => {
      const parts = prev.parts.map((p) => {
        if (p.id !== partId) return p;
        return {
          ...p,
          bbox: bbox(p.bbox[0] + dx, p.bbox[1] + dy, p.bbox[2], p.bbox[3]),
          pivot: { x: p.pivot.x + dx, y: p.pivot.y + dy, isAuto: false },
        };
      });
      return { ...prev, parts };
    });
  }, []);

  const stopDraggingPart = useCallback(() => {
    setState((prev) => ({ ...prev, draggingPartId: null }));
  }, []);

  const startCut = useCallback((x: number, y: number) => {
    setState((prev) => ({ ...prev, cutLine: { x1: x, y1: y, x2: x, y2: y } }));
  }, []);

  const updateCut = useCallback((x2: number, y2: number) => {
    setState((prev) => {
      if (!prev.cutLine) return prev;
      return { ...prev, cutLine: { ...prev.cutLine, x2, y2 } };
    });
  }, []);

  const cancelCut = useCallback(() => {
    setState((prev) => ({ ...prev, cutLine: null }));
  }, []);

  const completeCut = useCallback(() => {
    setState((prev) => {
      if (!prev.cutLine || !prev.img) return prev;
      const { x1, y1, x2, y2 } = prev.cutLine;

      const cutParts: Part[] = [];
      const cutDirection = Math.abs(x2 - x1) > Math.abs(y2 - y1) ? 'vertical' : 'horizontal';

      prev.parts.forEach((part) => {
        const [px, py, pw, ph] = part.bbox;

        const intersects =
          (x1 >= px && x1 <= px + pw && y1 >= py && y1 <= py + ph) ||
          (x2 >= px && x2 <= px + pw && y2 >= py && y2 <= py + ph) ||
          (x1 <= px && x2 >= px + pw && y1 <= py && y2 >= py + ph);

        if (!intersects) {
          cutParts.push(part);
          return;
        }

        if (cutDirection === 'vertical') {
          const cutX = (x1 + x2) / 2;
          if (cutX > px && cutX < px + pw) {
            cutParts.push({
              ...part,
              id: partIdCounter++,
              name: `${part.name}_L`,
              bbox: bbox(px, py, cutX - px, ph),
            });
            cutParts.push({
              ...part,
              id: partIdCounter++,
              name: `${part.name}_R`,
              bbox: bbox(cutX, py, px + pw - cutX, ph),
            });
            return;
          }
        } else {
          const cutY = (y1 + y2) / 2;
          if (cutY > py && cutY < py + ph) {
            cutParts.push({
              ...part,
              id: partIdCounter++,
              name: `${part.name}_T`,
              bbox: bbox(px, py, pw, cutY - py),
            });
            cutParts.push({
              ...part,
              id: partIdCounter++,
              name: `${part.name}_B`,
              bbox: bbox(px, cutY, pw, py + ph - cutY),
            });
            return;
          }
        }

        cutParts.push(part);
      });

      return { ...prev, parts: cutParts, cutLine: null };
    });
    notify('Cut completed');
  }, [notify]);

  const toggleMergeSelection = useCallback((partId: number) => {
    setState((prev) => {
      const isSelected = prev.mergeSelection.includes(partId);
      return {
        ...prev,
        mergeSelection: isSelected ? prev.mergeSelection.filter((id) => id !== partId) : [...prev.mergeSelection, partId],
      };
    });
  }, []);

  const mergeSelected = useCallback(() => {
    setState((prev) => {
      if (prev.mergeSelection.length < 2) return prev;
      const selectedParts = prev.parts.filter((p) => prev.mergeSelection.includes(p.id));
      if (selectedParts.length < 2) return prev;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      selectedParts.forEach((part) => {
        const [px, py, pw, ph] = part.bbox;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px + pw);
        maxY = Math.max(maxY, py + ph);
      });

      const mergedPart: Part = {
        id: partIdCounter++,
        name: `Merged_${partIdCounter}`,
        role: 'Custom',
        bbox: bbox(minX, minY, maxX - minX, maxY - minY),
        pivot: { x: minX + (maxX - minX) / 2, y: minY + (maxY - minY) * 0.15, isAuto: true },
        rotation: 0,
        parent: null,
      };

      const parts = prev.parts.filter((p) => !prev.mergeSelection.includes(p.id));
      parts.push(mergedPart);

      return { ...prev, parts, mergeSelection: [], selectedId: mergedPart.id };
    });
    notify('Merge completed');
  }, [notify]);

  const exportProject = useCallback(() => {
    setState((prev) => {
      const data = {
        version: '0.2',
        parts: prev.parts.map((p) => ({
          name: p.name,
          role: p.role,
          bbox: p.bbox,
          pivot: p.pivot,
          rotation: p.rotation,
          parent: p.parent,
        })),
      };

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bitruvius-rig.puppt';
      a.click();
      URL.revokeObjectURL(url);

      return { ...prev, lastMessage: 'Exported .puppt JSON' };
    });
  }, []);

  const autoHarvest = useCallback(() => {
    setState((prev) => {
      if (!prev.img) return { ...prev, lastMessage: 'No image loaded' };

      const tw = prev.img.width;
      const th = prev.img.height;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = tw;
      tempCanvas.height = th;
      const tc = tempCanvas.getContext('2d');
      if (!tc) return prev;

      tc.drawImage(prev.img, 0, 0);
      const data = tc.getImageData(0, 0, tw, th).data;

      const gridX = 24;
      const gridY = 24;
      const cellW = tw / gridX;
      const cellH = th / gridY;
      const occupied: { gx: number; gy: number; density: number }[] = [];

      let totalLuma = 0;
      let pixelCount = 0;
      const lumaHistogram = new Array(256).fill(0);
      for (let y = 0; y < th; y += 3) {
        for (let x = 0; x < tw; x += 3) {
          const i = (y * tw + x) * 4;
          const luma = Math.round(data[i]! * 0.3 + data[i + 1]! * 0.59 + data[i + 2]! * 0.11);
          lumaHistogram[luma] += 1;
          totalLuma += luma;
          pixelCount += 1;
        }
      }

      const avgLuma = totalLuma / Math.max(pixelCount, 1);
      let backgroundThreshold = avgLuma;
      let maxHistogramCount = 0;
      for (let i = 0; i < 256; i++) {
        if (lumaHistogram[i]! > maxHistogramCount) {
          maxHistogramCount = lumaHistogram[i]!;
          backgroundThreshold = i;
        }
      }
      backgroundThreshold = Math.min(backgroundThreshold + 20, 220);

      for (let gy = 0; gy < gridY; gy++) {
        for (let gx = 0; gx < gridX; gx++) {
          let dark = 0;
          let totalSamples = 0;
          const lumaValues: number[] = [];

          for (let sy = 0; sy < cellH; sy += 1) {
            for (let sx = 0; sx < cellW; sx += 1) {
              const px = Math.round(gx * cellW + sx);
              const py = Math.round(gy * cellH + sy);
              if (px < tw && py < th) {
                const i = (py * tw + px) * 4;
                const luma = data[i]! * 0.3 + data[i + 1]! * 0.59 + data[i + 2]! * 0.11;
                lumaValues.push(luma);
                if (luma < backgroundThreshold) dark += 1;
                totalSamples += 1;
              }
            }
          }

          let variance = 0;
          if (lumaValues.length > 0) {
            const cellAvg = lumaValues.reduce((a, b) => a + b, 0) / lumaValues.length;
            variance = lumaValues.reduce((a, b) => a + (b - cellAvg) ** 2, 0) / lumaValues.length;
          }

          const density = dark / Math.max(totalSamples, 1);
          const minDensity = 0.12;
          const maxVarianceForBackground = 120;
          if (dark > 1 && density >= minDensity && variance > maxVarianceForBackground) {
            occupied.push({ gx, gy, density });
          }
        }
      }

      const merged: { x: number; y: number; w: number; h: number; avgDensity: number }[] = [];
      const used = new Set<string>();
      occupied.forEach((c) => {
        const k = `${c.gx},${c.gy}`;
        if (used.has(k)) return;
        used.add(k);

        let minX = c.gx;
        let minY = c.gy;
        let maxX = c.gx;
        let maxY = c.gy;
        let totalDensity = c.density;
        let cellCount = 1;

        occupied.forEach((c2) => {
          if (Math.abs(c2.gx - c.gx) <= 1 && Math.abs(c2.gy - c.gy) <= 1) {
            used.add(`${c2.gx},${c2.gy}`);
            minX = Math.min(minX, c2.gx);
            minY = Math.min(minY, c2.gy);
            maxX = Math.max(maxX, c2.gx);
            maxY = Math.max(maxY, c2.gy);
            totalDensity += c2.density;
            cellCount += 1;
          }
        });

        merged.push({
          x: minX * cellW,
          y: minY * cellH,
          w: (maxX - minX + 1) * cellW,
          h: (maxY - minY + 1) * cellH,
          avgDensity: totalDensity / Math.max(cellCount, 1),
        });
      });

      const minArea = (tw * th) / 800;
      const filtered = merged.filter((region) => region.w * region.h >= minArea && region.avgDensity >= 0.15);

      const newParts: Part[] = [];
      const addAuto = (role: AnatomicalRole, x: number, y: number, w: number, h: number) => {
        const parentRole = AUTO_PARENTS[role];
        let parentId: number | null = null;
        if (parentRole) {
          const match = newParts.find((p) => p.role === parentRole);
          if (match) parentId = match.id;
        }
        newParts.push({
          id: partIdCounter++,
          name: `${role}_${String(partIdCounter).padStart(2, '0')}`,
          role,
          bbox: bbox(Math.round(x), Math.round(y), Math.round(w), Math.round(h)),
          pivot: { x: x + w / 2, y: y + h * 0.15, isAuto: true },
          rotation: 0,
          parent: parentId,
        });
      };

      if (filtered.length === 0) {
        const cx = tw / 2;
        const cy = th / 2;
        const demoData: Array<[AnatomicalRole, number, number, number, number]> = [
          ['Thoracic', cx - 40, cy - 60, 80, 100],
          ['Cranium', cx - 25, cy - 140, 50, 60],
          ['Pelvis', cx - 35, cy + 45, 70, 55],
          ['Humerus_L', cx - 90, cy - 50, 45, 80],
          ['Humerus_R', cx + 45, cy - 50, 45, 80],
          ['Femur_L', cx - 30, cy + 100, 28, 90],
          ['Femur_R', cx + 5, cy + 100, 28, 90],
        ];
        demoData.forEach(([role, x, y, w, h]) => addAuto(role, x, y, w, h));
        return { ...prev, parts: newParts, selectedId: null, lastMessage: 'Demo skeleton created' };
      }

      const sortedRegions = filtered.sort((a, b) => b.w * b.h * b.avgDensity - a.w * a.h * a.avgDensity);
      const roleList: AnatomicalRole[] = [
        'Thoracic',
        'Cranium',
        'Pelvis',
        'Humerus_L',
        'Humerus_R',
        'Femur_L',
        'Femur_R',
        'Tibia_L',
        'Tibia_R',
        'Radius_L',
        'Radius_R',
        'Carpal_L',
        'Carpal_R',
        'Tarsal_L',
        'Tarsal_R',
        'Cervical',
        'Lumbar',
        'Sacrum',
        'Mandible',
        'Custom',
        'Custom',
        'Custom',
        'Custom',
        'Custom',
        'Custom',
      ];

      sortedRegions.slice(0, 25).forEach((b, i) => addAuto(roleList[i] || 'Custom', b.x, b.y, b.w, b.h));
      return {
        ...prev,
        parts: newParts,
        selectedId: null,
        lastMessage: `Auto-cut ${Math.min(sortedRegions.length, 25)} piece(s)`,
      };
    });
  }, []);

  const selectedPart = useMemo(() => state.parts.find((p) => p.id === state.selectedId) ?? null, [state.parts, state.selectedId]);

  return {
    state,
    selectedPart,
    setMode,
    loadImage,
    clearParts,
    autoHarvest,
    selectPart,
    updatePart,
    updatePartParent,
    startDraggingPivot,
    dragPivot,
    stopDraggingPivot,
    startDraggingPart,
    dragPart,
    stopDraggingPart,
    startCut,
    updateCut,
    cancelCut,
    completeCut,
    toggleMergeSelection,
    mergeSelected,
    exportProject,
    notify,
  };
}
