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

export const loadControlSettingsCache = (fallback: ControlSettingsSnapshot): ControlSettingsCache => {
  try {
    const txt = localStorage.getItem(CONTROL_SETTINGS_KEY);
    if (!txt) return { fk: fallback, ik: fallback };
    const parsed = JSON.parse(txt) as unknown;
    const input = parsed as { fk?: unknown; ik?: unknown } | null | undefined;
    return {
      fk: coerceControlSettingsSnapshot(input?.fk, fallback),
      ik: coerceControlSettingsSnapshot(input?.ik, fallback),
    };
  } catch {
    return { fk: fallback, ik: fallback };
  }
};
