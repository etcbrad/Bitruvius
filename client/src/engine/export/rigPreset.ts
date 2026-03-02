import type { SkeletonState, CutoutAsset, CutoutSlot, ViewPreset } from '../types';
import JSZip from 'jszip';

export interface RigPresetSchema {
  schema: string;
  version: string;
  metadata: {
    name: string;
    description?: string;
    createdAt: string;
    modelId: string;
  };
  data: {
    joints: Record<string, any>;
    assets: Record<string, CutoutAsset>;
    cutoutSlots: Record<string, CutoutSlot>;
    views: ViewPreset[];
  };
}

export const exportRigPreset = async (
  state: SkeletonState,
  name: string,
  description?: string
): Promise<string> => {
  const preset: RigPresetSchema = {
    schema: 'bitruvius-rig-preset',
    version: '1.0.0',
    metadata: {
      name,
      description,
      createdAt: new Date().toISOString(),
      modelId: 'human_v1',
    },
    data: {
      joints: state.joints,
      assets: state.assets,
      cutoutSlots: state.cutoutSlots,
      views: state.views,
    },
  };

  return JSON.stringify(preset, null, 2);
};

export const importRigPreset = async (
  presetJson: string,
  currentState: SkeletonState
): Promise<Partial<SkeletonState>> => {
  try {
    const preset: RigPresetSchema = JSON.parse(presetJson);
    
    // Validate schema
    if (preset.schema !== 'bitruvius-rig-preset') {
      throw new Error('Invalid preset schema');
    }

    return {
      joints: preset.data.joints,
      assets: preset.data.assets,
      cutoutSlots: preset.data.cutoutSlots,
      views: preset.data.views,
      activeViewId: preset.data.views.length > 0 ? preset.data.views[0].id : '',
    };
  } catch (error) {
    console.error('Failed to import rig preset:', error);
    throw error;
  }
};

export const downloadRigPreset = (state: SkeletonState, name: string = 'rig-preset') => {
  exportRigPreset(state, name).then((json) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
};

export const uploadRigPreset = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        resolve(content);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    };
    input.click();
  });
};
