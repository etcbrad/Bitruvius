import type { Bone, Skeleton } from '@shared/skeleton';
import { computeWorldTransforms } from './skeleton';

export type SpriteMap = Record<string, HTMLImageElement | undefined>;

export function renderSkeleton(ctx: CanvasRenderingContext2D, skeleton: Skeleton, sprites: SpriteMap) {
  const posed = computeWorldTransforms(skeleton);

  const bones = Object.values(posed.bones)
    .filter((b): b is Bone & Required<Pick<Bone, 'worldX' | 'worldY' | 'worldAngle'>> => {
      return Number.isFinite(b.worldX) && Number.isFinite(b.worldY) && Number.isFinite(b.worldAngle);
    })
    .sort((a, b) => a.zOrder - b.zOrder);

  for (const bone of bones) {
    if (!bone.spriteId) continue;
    const sprite = sprites[bone.spriteId];
    if (!sprite) continue;

    ctx.save();
    ctx.translate(bone.worldX, bone.worldY);
    ctx.rotate(bone.worldAngle);
    ctx.scale(bone.spriteScale.x, bone.spriteScale.y);
    ctx.drawImage(sprite, -bone.pivotOffset.x, -bone.pivotOffset.y, sprite.naturalWidth, sprite.naturalHeight);
    ctx.restore();
  }
}

