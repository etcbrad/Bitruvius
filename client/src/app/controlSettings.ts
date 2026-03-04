import type { ControlMode, SkeletonState } from '../engine/types';
import { clamp } from '../utils';
import { CONTROL_SETTINGS_KEY } from './constants';

export type ControlSettingsGroup = 'fk' | 'ik';
export type ControlSettingsSnapshot = Pick<
  SkeletonState,
  'bendEnabled' | 'stretchEnabled' | 'leadEnabled' | 'hardStop' | 'snappiness'
>;
export type ControlSettingsCache = Record<ControlSettingsGroup, ControlSettingsSnapshot>;

export const controlGroupForMode = (mode: ControlMode): ControlSettingsGroup =>
  mode === 'Cardboard' ? 'fk' : 'ik';

export const snapshotControlSettings = (s: SkeletonState): ControlSettingsSnapshot => ({
  bendEnabled: Boolean(s.bendEnabled),
  stretchEnabled: Boolean(s.stretchEnabled),
  leadEnabled: Boolean(s.leadEnabled),
  hardStop: Boolean(s.hardStop),
  snappiness: Number.isFinite(s.snappiness) ? clamp(s.snappiness, 0.05, 1.0) : 1.0,
});

const sameSnapshot = (a: ControlSettingsSnapshot, b: ControlSettingsSnapshot): boolean =>
  a.bendEnabled === b.bendEnabled &&
  a.stretchEnabled === b.stretchEnabled &&
  a.leadEnabled === b.leadEnabled &&
  a.hardStop === b.hardStop &&
  a.snappiness === b.snappiness;

const coerceControlSettingsSnapshot = (
  raw: unknown,
  fallback: ControlSettingsSnapshot,
): ControlSettingsSnapshot => {
  const input = raw as Partial<Record<keyof ControlSettingsSnapshot, unknown>> | null | undefined;
  return {
    bendEnabled: typeof input?.bendEnabled === 'boolean' ? input.bendEnabled : fallback.bendEnabled,
    stretchEnabled:
      typeof input?.stretchEnabled === 'boolean' ? input.stretchEnabled : fallback.stretchEnabled,
    leadEnabled: typeof input?.leadEnabled === 'boolean' ? input.leadEnabled : fallback.leadEnabled,
    hardStop: typeof input?.hardStop === 'boolean' ? input.hardStop : fallback.hardStop,
    snappiness: Number.isFinite(input?.snappiness)
      ? clamp(input!.snappiness as number, 0.05, 1.0)
      : fallback.snappiness,
  };
};

export const loadControlSettingsCache = (fallback: ControlSettingsCache): ControlSettingsCache => {
  try {
    const txt = localStorage.getItem(CONTROL_SETTINGS_KEY);
    if (!txt) return fallback;
    const parsed = JSON.parse(txt) as unknown;
    const input = parsed as { fk?: unknown; ik?: unknown } | null | undefined;
    return {
      fk: coerceControlSettingsSnapshot(input?.fk, fallback.fk),
      ik: coerceControlSettingsSnapshot(input?.ik, fallback.ik),
    };
  } catch {
    return fallback;
  }
};

export const updateControlSettingsCache = (
  cache: ControlSettingsCache,
  prevState: SkeletonState,
  nextState: SkeletonState,
): ControlSettingsCache => {
  const prevGroup = controlGroupForMode(prevState.controlMode);
  const nextGroup = controlGroupForMode(nextState.controlMode);

  if (prevGroup !== nextGroup) {
    const prevSnap = snapshotControlSettings(prevState);
    const nextSnap = snapshotControlSettings(nextState);
    const prevSame = sameSnapshot(cache[prevGroup], prevSnap);
    const nextSame = sameSnapshot(cache[nextGroup], nextSnap);
    if (prevSame && nextSame) return cache;
    return { ...cache, [prevGroup]: prevSnap, [nextGroup]: nextSnap };
  }

  const nextSnap = snapshotControlSettings(nextState);
  if (sameSnapshot(cache[nextGroup], nextSnap)) return cache;
  return { ...cache, [nextGroup]: nextSnap };
};

export const saveControlSettingsCache = (cache: ControlSettingsCache): void => {
  try {
    localStorage.setItem(CONTROL_SETTINGS_KEY, JSON.stringify(cache));
  } catch {
    // ignore
  }
};
