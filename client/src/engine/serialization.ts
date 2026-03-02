import type { SkeletonState } from './types';

export const ENGINE_STATE_SCHEMA_V1 = 'bitruvius-core-engine:state@1' as const;

export type PersistedEngineStateV1 = {
  schema: typeof ENGINE_STATE_SCHEMA_V1;
  savedAt: string;
  state: SkeletonState;
};

export type DeserializeResult =
  | {
      ok: true;
      rawState: unknown;
      schema: string | null;
      savedAt?: string;
    }
  | {
      ok: false;
      error: string;
    };

export const serializeEngineState = (
  state: SkeletonState,
  options: { pretty?: boolean } = {},
): string => {
  const payload: PersistedEngineStateV1 = {
    schema: ENGINE_STATE_SCHEMA_V1,
    savedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(payload, null, options.pretty ? 2 : undefined);
};

export const deserializeEngineState = (serialized: string): DeserializeResult => {
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: true, rawState: parsed, schema: null };
    }
    const maybe = parsed as { schema?: unknown; savedAt?: unknown; state?: unknown };
    if (maybe.schema === ENGINE_STATE_SCHEMA_V1 && 'state' in maybe) {
      const state = maybe.state as any;
      // Ensure camera settings are present for older saves
      if (state && typeof state === 'object') {
        if (state.viewScale === undefined) state.viewScale = 1;
        if (state.viewOffset === undefined) state.viewOffset = { x: 0, y: 0 };
      }
      return {
        ok: true,
        rawState: state,
        schema: ENGINE_STATE_SCHEMA_V1,
        savedAt: typeof maybe.savedAt === 'string' ? maybe.savedAt : undefined,
      };
    }
    // Legacy: stored directly as SkeletonState shape
    const state = parsed as any;
    if (state && typeof state === 'object') {
      if (state.viewScale === undefined) state.viewScale = 1;
      if (state.viewOffset === undefined) state.viewOffset = { x: 0, y: 0 };
    }
    return { ok: true, rawState: state, schema: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { ok: false, error: message };
  }
};

