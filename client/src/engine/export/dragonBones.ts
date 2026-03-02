import type { SkeletonState, CutoutAsset, CutoutSlot, ViewPreset } from '../types';
import JSZip from 'jszip';
import { getWorldPosition } from '../kinematics';
import { INITIAL_JOINTS } from '../model';

export interface DragonBonesBone {
  name: string;
  parent?: string;
  length: number;
  transform: {
    x: number;
    y: number;
    skX: number;
    skY: number;
    scX: number;
    scY: number;
  };
}

export interface DragonBonesSlot {
  name: string;
  parent: string;
  displayIndex: number;
  zOrder: number;
  blendMode: 'add' | 'alpha' | 'darken' | 'difference' | 'erase' | 'hardlight' | 'invert' | 'layer' | 'lighten' | 'multiply' | 'normal' | 'overlay' | 'screen' | 'subtract';
  color: {
    a: number;
    b: number;
    g: number;
    r: number;
  };
}

export interface DragonBonesDisplay {
  name: string;
  type: 'image';
  path: string;
  transform: {
    x: number;
    y: number;
    skX: number;
    skY: number;
    scX: number;
    scY: number;
    pX: number;
    pY: number;
  };
}

export interface DragonBonesArmature {
  name: string;
  type: 'Armature';
  frameRate: number;
  animation: [];
  bone: DragonBonesBone[];
  slot: DragonBonesSlot[];
  skin: [{
    name: 'default',
    slot: Array<{
      name: string;
      display: DragonBonesDisplay[];
    }>;
  }];
}

export interface DragonBonesTextureAtlas {
  name: string;
  SubTexture: Array<{
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotated: boolean;
  }>;
}

export interface DragonBonesData {
  skeletonName?: string;
  armature: DragonBonesArmature[];
}

// Simple shelf packing algorithm for texture atlas
class ShelfPacker {
  private bins: Array<{ x: number; y: number; width: number; height: number }> = [];
  private width: number;
  private height: number;
  private padding: number;

  constructor(width: number, height: number, padding: number = 2) {
    this.width = width;
    this.height = height;
    this.padding = padding;
  }

  add(rectWidth: number, rectHeight: number): { x: number; y: number } | null {
    const paddedWidth = rectWidth + this.padding;
    const paddedHeight = rectHeight + this.padding;

    for (const bin of this.bins) {
      if (bin.width >= paddedWidth && bin.height >= paddedHeight) {
        const x = bin.x;
        const y = bin.y;
        
        // Split the remaining space
        if (bin.width - paddedWidth > bin.height - paddedHeight) {
          // Split vertically
          this.bins.push({
            x: x + paddedWidth,
            y,
            width: bin.width - paddedWidth,
            height: paddedHeight,
          });
          this.bins.push({
            x,
            y: y + paddedHeight,
            width: bin.width,
            height: bin.height - paddedHeight,
          });
        } else {
          // Split horizontally
          this.bins.push({
            x,
            y: y + paddedHeight,
            width: paddedWidth,
            height: bin.height - paddedHeight,
          });
          this.bins.push({
            x: x + paddedWidth,
            y,
            width: bin.width - paddedWidth,
            height: bin.height,
          });
        }

        // Remove the used bin
        this.bins.splice(this.bins.indexOf(bin), 1);
        return { x, y };
      }
    }

    return null;
  }
}

export const exportDragonBones = async (
  state: SkeletonState,
  viewId?: string
): Promise<JSZip> => {
  const activeView = viewId 
    ? state.views.find(v => v.id === viewId) || state.views.find(v => v.id === state.activeViewId)
    : state.views.find(v => v.id === state.activeViewId);

  if (!activeView) {
    throw new Error('No active view found');
  }

  // Apply view pose to get current joint positions
  const appliedJoints = { ...state.joints };
  Object.entries(activeView.pose.joints).forEach(([jointId, position]) => {
    if (appliedJoints[jointId]) {
      appliedJoints[jointId] = {
        ...appliedJoints[jointId],
        currentOffset: position,
      };
    }
  });

  // Create DragonBones bones
  const bones: DragonBonesBone[] = [];
  const boneMap: Record<string, number> = {};

  Object.entries(appliedJoints).forEach(([jointId, joint]) => {
    const pos = getWorldPosition(jointId, appliedJoints, INITIAL_JOINTS);
    const parentPos = joint.parent 
      ? getWorldPosition(joint.parent, appliedJoints, INITIAL_JOINTS)
      : { x: 0, y: 0 };

    const dx = pos.x - parentPos.x;
    const dy = pos.y - parentPos.y;
    const length = Math.hypot(dx, dy) * 100; // Convert to DragonBones units (100px per unit)
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    bones.push({
      name: jointId,
      parent: joint.parent || undefined,
      length: Math.max(1, length),
      transform: {
        x: parentPos.x * 100,
        y: -parentPos.y * 100, // DragonBones uses inverted Y
        skX: angle,
        skY: 0,
        scX: 1,
        scY: 1,
      },
    });

    boneMap[jointId] = bones.length - 1;
  });

  // Create slots and displays from cutout slots
  const slots: DragonBonesSlot[] = [];
  const displays: DragonBonesDisplay[] = [];
  const textureImages: Array<{ name: string; element: HTMLImageElement; width: number; height: number }> = [];

  // Sort slots by zIndex
  const sortedSlots = Object.entries(state.cutoutSlots)
    .filter(([_, slot]) => slot.visible && slot.assetId && state.assets[slot.assetId])
    .sort(([_, a], [__, b]) => {
      const aOverride = activeView.slotOverrides[a.id];
      const bOverride = activeView.slotOverrides[b.id];
      const aZ = aOverride?.zIndex !== undefined ? aOverride.zIndex : a.zIndex;
      const bZ = bOverride?.zIndex !== undefined ? bOverride.zIndex : b.zIndex;
      return aZ - bZ;
    });

  for (const [slotId, slot] of sortedSlots) {
    const asset = state.assets[slot.assetId!];
    const fromPos = getWorldPosition(slot.attachment.fromJointId, appliedJoints, INITIAL_JOINTS);
    const toPos = getWorldPosition(slot.attachment.toJointId, appliedJoints, INITIAL_JOINTS);

    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const boneAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    let displayWidth = 100;
    let displayHeight = 100;
    let imagePath = '';

    if (asset.kind === 'image' && asset.image) {
      displayWidth = asset.image.naturalWidth;
      displayHeight = asset.image.naturalHeight;
      imagePath = `${asset.id}.png`;
      
      // Load image for atlas
      const img = new Image();
      img.src = asset.image.src;
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
      
      textureImages.push({
        name: asset.id,
        element: img,
        width: displayWidth,
        height: displayHeight,
      });
    } else if (asset.kind === 'shape') {
      // For shapes, we'll rasterize them
      displayWidth = 100;
      displayHeight = 100;
      imagePath = `${asset.id}.png`;
      
      const canvas = document.createElement('canvas');
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      const ctx = canvas.getContext('2d')!;
      
      const shape = asset.shape!;
      ctx.fillStyle = shape.fill;
      ctx.strokeStyle = shape.stroke || 'transparent';
      ctx.lineWidth = shape.strokeWidth || 1;

      switch (shape.shapeType) {
        case 'circle':
          ctx.beginPath();
          ctx.arc(displayWidth / 2, displayHeight / 2, Math.min(displayWidth, displayHeight) / 2, 0, Math.PI * 2);
          ctx.fill();
          if (shape.stroke) ctx.stroke();
          break;
        case 'rect':
          ctx.fillRect(0, 0, displayWidth, displayHeight);
          if (shape.stroke) ctx.strokeRect(0, 0, displayWidth, displayHeight);
          break;
        case 'capsule':
          const radius = Math.min(displayWidth, displayHeight) / 2;
          ctx.fillRect(radius, 0, displayWidth - radius * 2, displayHeight);
          ctx.beginPath();
          ctx.arc(radius, displayHeight / 2, radius, -Math.PI / 2, Math.PI / 2);
          ctx.fill();
          if (shape.stroke) ctx.stroke();
          ctx.beginPath();
          ctx.arc(displayWidth - radius, displayHeight / 2, radius, Math.PI / 2, -Math.PI / 2);
          ctx.fill();
          if (shape.stroke) ctx.stroke();
          break;
      }

      const img = new Image();
      img.src = canvas.toDataURL();
      await new Promise((resolve) => {
        img.onload = resolve;
      });
      
      textureImages.push({
        name: asset.id,
        element: img,
        width: displayWidth,
        height: displayHeight,
      });
    }

    // Create slot
    slots.push({
      name: slotId,
      parent: slot.attachment.fromJointId,
      displayIndex: displays.length,
      zOrder: slots.length,
      blendMode: 'normal',
      color: { a: 255, r: 255, g: 255, b: 255 },
    });

    // Create display
    displays.push({
      name: asset.id,
      type: 'image',
      path: imagePath,
      transform: {
        x: (fromPos.x + toPos.x) * 50, // Midpoint in DragonBones units
        y: -(fromPos.y + toPos.y) * 50, // Inverted Y
        skX: boneAngle + slot.rotation,
        skY: 0,
        scX: slot.scale,
        scY: slot.scale,
        pX: displayWidth * slot.anchorX,
        pY: displayHeight * slot.anchorY,
      },
    });
  }

  // Create texture atlas
  const atlasSize = 2048;
  const packer = new ShelfPacker(atlasSize, atlasSize);
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = atlasSize;
  atlasCanvas.height = atlasSize;
  const atlasCtx = atlasCanvas.getContext('2d')!;

  const subTextures: DragonBonesTextureAtlas['SubTexture'] = [];

  for (const texture of textureImages) {
    const position = packer.add(texture.width, texture.height);
    if (!position) {
      console.warn(`Failed to pack texture: ${texture.name}`);
      continue;
    }

    atlasCtx.drawImage(texture.element, position.x, position.y, texture.width, texture.height);
    
    subTextures.push({
      name: texture.name,
      x: position.x,
      y: position.y,
      width: texture.width,
      height: texture.height,
      rotated: false,
    });
  }

  // Create DragonBones data structure
  const dragonBonesData: DragonBonesData = {
    skeletonName: 'Bitruvius Character',
    armature: [{
      name: 'Armature',
      type: 'Armature',
      frameRate: 24,
      animation: [],
      bone: bones,
      slot: slots,
      skin: [{
        name: 'default',
        slot: slots.map((slot, index) => ({
          name: slot.name,
          display: [displays[index]],
        })),
      }],
    }],
  };

  // Create zip file
  const zip = new JSZip();

  // Add skeleton JSON
  zip.file('skeleton.json', JSON.stringify(dragonBonesData, null, 2));

  // Add texture atlas JSON
  const textureAtlas: DragonBonesTextureAtlas = {
    name: 'texture',
    SubTexture: subTextures,
  };
  zip.file('texture.json', JSON.stringify(textureAtlas, null, 2));

  // Add texture PNG
  const textureBlob = await new Promise<Blob>((resolve) => {
    atlasCanvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
  zip.file('texture.png', textureBlob);

  return zip;
};

export const downloadDragonBones = async (state: SkeletonState, viewId?: string) => {
  try {
    const zip = await exportDragonBones(state, viewId);
    const blob = await zip.generateAsync({ type: 'blob' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dragonbones-export.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export DragonBones:', error);
    throw error;
  }
};
