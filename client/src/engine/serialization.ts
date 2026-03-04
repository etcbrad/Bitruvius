import type { SkeletonState } from './types';

export const ENGINE_STATE_SCHEMA_V1 = 'bitruvius-core-engine:state@1' as const;
export const ENGINE_STATE_SCHEMA_V2 = 'bitruvius-core-engine:state@2' as const;

export type PersistedEngineStateV1 = {
  schema: typeof ENGINE_STATE_SCHEMA_V1;
  savedAt: string;
  state: SkeletonState;
};

export type PersistedEngineStateV2 = {
  schema: typeof ENGINE_STATE_SCHEMA_V2;
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
  const payload: PersistedEngineStateV2 = {
    schema: ENGINE_STATE_SCHEMA_V2,
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

    const migrateCameraDefaults = (state: any) => {
      if (!state || typeof state !== 'object') return;
      if (state.viewScale === undefined) state.viewScale = 1;
      if (state.viewOffset === undefined) state.viewOffset = { x: 0, y: 0 };
    };

    // v1 stored mask offsets in screen-space pixels (and divided by viewScale at render time).
    // v2 stores offsets in canvas-space pixels (pre-zoom), so placement is stable across zoom
    // and exports match what you see.
    const migrateMaskOffsetsV1ToV2 = (state: any) => {
      if (!state || typeof state !== 'object') return;
      const viewScaleRaw = state.viewScale;
      const viewScale =
        typeof viewScaleRaw === 'number' && Number.isFinite(viewScaleRaw) && viewScaleRaw > 1e-6 ? viewScaleRaw : 1;

      const scene = state.scene;
      if (!scene || typeof scene !== 'object') return;

      const headMask = (scene as any).headMask;
      if (headMask && typeof headMask === 'object') {
        const ox = (headMask as any).offsetX;
        const oy = (headMask as any).offsetY;
        if (typeof ox === 'number' && Number.isFinite(ox)) (headMask as any).offsetX = ox / viewScale;
        if (typeof oy === 'number' && Number.isFinite(oy)) (headMask as any).offsetY = oy / viewScale;
      }

      const jointMasks = (scene as any).jointMasks;
      if (jointMasks && typeof jointMasks === 'object') {
        for (const mask of Object.values(jointMasks as Record<string, any>)) {
          if (!mask || typeof mask !== 'object') continue;
          const ox = (mask as any).offsetX;
          const oy = (mask as any).offsetY;
          if (typeof ox === 'number' && Number.isFinite(ox)) (mask as any).offsetX = ox / viewScale;
          if (typeof oy === 'number' && Number.isFinite(oy)) (mask as any).offsetY = oy / viewScale;
        }
      }
    };

    if ((maybe.schema === ENGINE_STATE_SCHEMA_V2 || maybe.schema === ENGINE_STATE_SCHEMA_V1) && 'state' in maybe) {
      const state = maybe.state as any;
      migrateCameraDefaults(state);
      if (maybe.schema === ENGINE_STATE_SCHEMA_V1) migrateMaskOffsetsV1ToV2(state);
      return {
        ok: true,
        rawState: state,
        schema: typeof maybe.schema === 'string' ? maybe.schema : null,
        savedAt: typeof maybe.savedAt === 'string' ? maybe.savedAt : undefined,
      };
    }

    // Legacy: stored directly as SkeletonState shape (treat as v1 for mask offsets).
    const state = parsed as any;
    migrateCameraDefaults(state);
    migrateMaskOffsetsV1ToV2(state);
    return { ok: true, rawState: state, schema: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON';
    return { ok: false, error: message };
  }
};
