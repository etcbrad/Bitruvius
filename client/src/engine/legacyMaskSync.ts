import type { CutoutAsset, CutoutSlot, SkeletonState } from './types';
import { INITIAL_JOINTS } from './model';

const LEGACY_HEAD_ASSET_ID = 'legacy_head_mask';
const legacyJointAssetId = (jointId: string) => `legacy_joint_mask:${jointId}`;

const ensureImageAsset = (assets: Record<string, CutoutAsset>, id: string, src: string): Record<string, CutoutAsset> => {
  const existing = assets[id];
  const prevW = existing?.kind === 'image' ? existing.image?.naturalWidth : undefined;
  const prevH = existing?.kind === 'image' ? existing.image?.naturalHeight : undefined;
  const next: CutoutAsset = {
    id,
    name: id,
    kind: 'image',
    image: {
      src,
      naturalWidth: prevW ?? 100,
      naturalHeight: prevH ?? 100,
    },
  };
  if (existing && JSON.stringify(existing) === JSON.stringify(next)) return assets;
  return { ...assets, [id]: next };
};

const ensureSlot = (
  slots: Record<string, CutoutSlot>,
  slotId: string,
  base: Omit<CutoutSlot, 'assetId' | 'visible' | 'opacity' | 'mode' | 'scale' | 'lengthScale' | 'volumePreserve' | 'offsetX' | 'offsetY' | 'rotation' | 'anchorX' | 'anchorY'>,
  patch: Pick<
    CutoutSlot,
    | 'assetId'
    | 'visible'
    | 'opacity'
    | 'mode'
    | 'scale'
    | 'lengthScale'
    | 'volumePreserve'
    | 'offsetX'
    | 'offsetY'
    | 'rotation'
    | 'anchorX'
    | 'anchorY'
  >,
): Record<string, CutoutSlot> => {
  const prev = slots[slotId];
  const next: CutoutSlot = {
    ...(prev ?? (base as CutoutSlot)),
    ...patch,
  };
  if (prev && JSON.stringify(prev) === JSON.stringify(next)) return slots;
  return { ...slots, [slotId]: next };
};

export const syncLegacyMasksToCutouts = (state: SkeletonState): SkeletonState => {
  let assets = state.assets;
  let cutoutSlots = state.cutoutSlots;
  let changed = false;

  const headMask = state.scene.headMask;
  if (headMask?.src) {
    const nextAssets = ensureImageAsset(assets, LEGACY_HEAD_ASSET_ID, headMask.src);
    if (nextAssets !== assets) {
      assets = nextAssets;
      changed = true;
    }

    const baseSlot: Omit<CutoutSlot, 'assetId' | 'visible' | 'opacity' | 'mode' | 'scale' | 'lengthScale' | 'volumePreserve' | 'offsetX' | 'offsetY' | 'rotation' | 'anchorX' | 'anchorY'> = {
      id: 'head',
      name: 'head',
      attachment: { type: 'bone', fromJointId: 'neck_base', toJointId: 'neck_base' },
      zIndex: cutoutSlots.head?.zIndex ?? 100,
      tint: cutoutSlots.head?.tint ?? null,
    };

    const nextSlots = ensureSlot(cutoutSlots, 'head', baseSlot, {
      assetId: LEGACY_HEAD_ASSET_ID,
      visible: typeof headMask.visible === 'boolean' ? headMask.visible : true,
      opacity: headMask.opacity,
      mode: headMask.mode,
      scale: headMask.scale,
      lengthScale: headMask.lengthScale,
      volumePreserve: headMask.volumePreserve,
      offsetX: headMask.offsetX,
      offsetY: headMask.offsetY,
      rotation: headMask.rotation,
      anchorX: headMask.anchorX,
      anchorY: headMask.anchorY,
    });
    if (nextSlots !== cutoutSlots) {
      cutoutSlots = nextSlots;
      changed = true;
    }
  } else if (cutoutSlots.head?.assetId === LEGACY_HEAD_ASSET_ID) {
    const nextSlots = ensureSlot(
      cutoutSlots,
      'head',
      {
        id: 'head',
        name: 'head',
        attachment: { type: 'bone', fromJointId: 'neck_base', toJointId: 'neck_base' },
        zIndex: cutoutSlots.head?.zIndex ?? 100,
        tint: cutoutSlots.head?.tint ?? null,
      },
      {
        assetId: null,
        visible: false,
        opacity: cutoutSlots.head?.opacity ?? 1,
        mode: cutoutSlots.head?.mode ?? 'cutout',
        scale: cutoutSlots.head?.scale ?? 1,
        lengthScale: cutoutSlots.head?.lengthScale ?? 1,
        volumePreserve: cutoutSlots.head?.volumePreserve ?? false,
        offsetX: cutoutSlots.head?.offsetX ?? 0,
        offsetY: cutoutSlots.head?.offsetY ?? 0,
        rotation: cutoutSlots.head?.rotation ?? 0,
        anchorX: cutoutSlots.head?.anchorX ?? 0.5,
        anchorY: cutoutSlots.head?.anchorY ?? 0.5,
      },
    );
    if (nextSlots !== cutoutSlots) {
      cutoutSlots = nextSlots;
      changed = true;
    }
  }

  for (const [jointId, mask] of Object.entries(state.scene.jointMasks)) {
    const assetId = legacyJointAssetId(jointId);
    if (mask?.src) {
      const nextAssets = ensureImageAsset(assets, assetId, mask.src);
      if (nextAssets !== assets) {
        assets = nextAssets;
        changed = true;
      }

      const fromJointId =
        state.joints[jointId]?.parent ?? INITIAL_JOINTS[jointId]?.parent ?? 'root';

      const baseSlot: Omit<CutoutSlot, 'assetId' | 'visible' | 'opacity' | 'mode' | 'scale' | 'lengthScale' | 'volumePreserve' | 'offsetX' | 'offsetY' | 'rotation' | 'anchorX' | 'anchorY'> = {
        id: jointId,
        name: jointId,
        attachment: { type: 'bone', fromJointId, toJointId: jointId },
        zIndex: cutoutSlots[jointId]?.zIndex ?? 50,
        tint: cutoutSlots[jointId]?.tint ?? null,
      };

      const nextSlots = ensureSlot(cutoutSlots, jointId, baseSlot, {
        assetId,
        visible: typeof mask.visible === 'boolean' ? mask.visible : true,
        opacity: mask.opacity,
        mode: mask.mode,
        scale: mask.scale,
        lengthScale: mask.lengthScale,
        volumePreserve: mask.volumePreserve,
        offsetX: mask.offsetX,
        offsetY: mask.offsetY,
        rotation: mask.rotation,
        anchorX: mask.anchorX,
        anchorY: mask.anchorY,
      });

      if (nextSlots !== cutoutSlots) {
        cutoutSlots = nextSlots;
        changed = true;
      }
    } else if (cutoutSlots[jointId]?.assetId === assetId) {
      const nextSlots = ensureSlot(
        cutoutSlots,
        jointId,
        {
          id: jointId,
          name: jointId,
          attachment: {
            type: 'bone',
            fromJointId: state.joints[jointId]?.parent ?? INITIAL_JOINTS[jointId]?.parent ?? 'root',
            toJointId: jointId,
          },
          zIndex: cutoutSlots[jointId]?.zIndex ?? 50,
          tint: cutoutSlots[jointId]?.tint ?? null,
        },
        {
          assetId: null,
          visible: false,
          opacity: cutoutSlots[jointId]?.opacity ?? 1,
          mode: cutoutSlots[jointId]?.mode ?? 'cutout',
          scale: cutoutSlots[jointId]?.scale ?? 1,
          lengthScale: cutoutSlots[jointId]?.lengthScale ?? 1,
          volumePreserve: cutoutSlots[jointId]?.volumePreserve ?? false,
          offsetX: cutoutSlots[jointId]?.offsetX ?? 0,
          offsetY: cutoutSlots[jointId]?.offsetY ?? 0,
          rotation: cutoutSlots[jointId]?.rotation ?? 0,
          anchorX: cutoutSlots[jointId]?.anchorX ?? 0.5,
          anchorY: cutoutSlots[jointId]?.anchorY ?? 0.5,
        },
      );
      if (nextSlots !== cutoutSlots) {
        cutoutSlots = nextSlots;
        changed = true;
      }
    }
  }

  if (!changed) return state;
  return { ...state, assets, cutoutSlots };
};
