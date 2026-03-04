import { useCallback, useEffect, useRef } from 'react';

import type { SkeletonState } from '../engine/types';
import { serializeEngineState } from '../engine/serialization';
import type { StorageLike } from './storage';

export const useAutosaveEngineState = (opts: {
  enabled: boolean;
  storage: StorageLike | null;
  key: string;
  delayMs?: number;
}) => {
  const { enabled, storage, key, delayMs = 350 } = opts;

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveLatestRef = useRef<SkeletonState | null>(null);

  const queueAutosave = useCallback(
    (next: SkeletonState) => {
      if (!enabled || !storage) return;
      autosaveLatestRef.current = next;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        const latest = autosaveLatestRef.current;
        autosaveLatestRef.current = null;
        if (!latest) return;
        try {
          const json = serializeEngineState(latest, { pretty: false });
          storage.setItem(key, json);
        } catch {
          // ignore
        }
      }, delayMs);
    },
    [delayMs, enabled, key, storage],
  );

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
      autosaveLatestRef.current = null;
    };
  }, []);

  return { queueAutosave };
};

