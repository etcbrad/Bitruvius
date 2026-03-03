import { useCallback, useMemo, useRef, useState } from 'react';

type HistoryState<T> = {
  history: T[];
  index: number;
};

export function useUndoRedo<T>(initial: T) {
  const maxEntriesRef = useRef(50);
  const [ctrl, setCtrl] = useState<HistoryState<T>>({ history: [initial], index: 0 });

  const state = ctrl.history[ctrl.index]!;

  const canUndo = ctrl.index > 0;
  const canRedo = ctrl.index < ctrl.history.length - 1;

  const setState = useCallback((newState: T, pushToHistory = true) => {
    setCtrl((prev) => {
      if (!pushToHistory) {
        const nextHistory = prev.history.slice();
        nextHistory[prev.index] = newState;
        return { history: nextHistory, index: prev.index };
      }

      const base = prev.history.slice(0, prev.index + 1);
      base.push(newState);

      const maxEntries = maxEntriesRef.current;
      const trimmed = base.length > maxEntries ? base.slice(base.length - maxEntries) : base;
      const nextIndex = trimmed.length - 1;

      return { history: trimmed, index: nextIndex };
    });
  }, []);

  const undo = useCallback(() => {
    setCtrl((prev) => ({ ...prev, index: Math.max(0, prev.index - 1) }));
  }, []);

  const redo = useCallback(() => {
    setCtrl((prev) => ({ ...prev, index: Math.min(prev.history.length - 1, prev.index + 1) }));
  }, []);

  return useMemo(
    () => ({ state, setState, undo, redo, canUndo, canRedo }),
    [canRedo, canUndo, redo, setState, state, undo],
  );
}

