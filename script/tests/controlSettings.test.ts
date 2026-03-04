import { strict as assert } from 'node:assert';

import { CONTROL_SETTINGS_KEY } from '../../client/src/app/constants';
import {
  loadControlSettingsCache,
  snapshotControlSettings,
  updateControlSettingsCache,
  type ControlSettingsCache,
} from '../../client/src/app/controlSettings';
import { makeDefaultState } from '../../client/src/engine/settings';

const makeLocalStorage = (initial: Record<string, string> = {}) => {
  let store: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

export const runControlSettingsTests = () => {
  const base = makeDefaultState();
  const snap = snapshotControlSettings(base);
  const fallback: ControlSettingsCache = { fk: { ...snap }, ik: { ...snap } };

  const originalLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = makeLocalStorage();

  try {
    // Corrupted JSON should return fallback.
    {
      (globalThis as any).localStorage = makeLocalStorage({ [CONTROL_SETTINGS_KEY]: '{not json' });
      const loaded = loadControlSettingsCache(fallback);
      assert.deepEqual(loaded, fallback);
    }

    // Missing group should be coerced from fallback; coercion clamps snappiness.
    {
      const fkOnly = {
        fk: {
          bendEnabled: true,
          stretchEnabled: false,
          leadEnabled: true,
          hardStop: false,
          snappiness: 100,
        },
      };
      (globalThis as any).localStorage = makeLocalStorage({
        [CONTROL_SETTINGS_KEY]: JSON.stringify(fkOnly),
      });

      const alt: ControlSettingsCache = {
        fk: { ...fallback.fk, bendEnabled: false },
        ik: { ...fallback.ik, bendEnabled: false, snappiness: 0.25 },
      };
      const loaded = loadControlSettingsCache(alt);
      assert.equal(loaded.fk.bendEnabled, true);
      assert.equal(loaded.fk.snappiness, 1.0);
      assert.deepEqual(loaded.ik, alt.ik);
    }

    // Group-switch should snapshot "leaving" group and not overwrite the entering group unexpectedly.
    {
      const initialCache: ControlSettingsCache = { fk: { ...fallback.fk }, ik: { ...fallback.ik } };
      const prev = {
        ...base,
        controlMode: 'IK' as const,
        bendEnabled: true,
        stretchEnabled: true,
        leadEnabled: false,
        hardStop: false,
        snappiness: 0.5,
      };
      const next = {
        ...prev,
        controlMode: 'Cardboard' as const,
        bendEnabled: false,
        stretchEnabled: false,
        leadEnabled: true,
        hardStop: true,
        snappiness: 1.0,
      };
      const updated = updateControlSettingsCache(initialCache, prev, next);
      assert.equal(updated.ik.bendEnabled, true);
      assert.equal(updated.ik.stretchEnabled, true);
      assert.equal(updated.ik.leadEnabled, false);
      assert.equal(updated.ik.hardStop, false);
      assert.equal(updated.ik.snappiness, 0.5);

      assert.equal(updated.fk.bendEnabled, false);
      assert.equal(updated.fk.stretchEnabled, false);
      assert.equal(updated.fk.leadEnabled, true);
      assert.equal(updated.fk.hardStop, true);
      assert.equal(updated.fk.snappiness, 1.0);
    }
  } finally {
    if (originalLocalStorage === undefined) delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = originalLocalStorage;
  }
};

