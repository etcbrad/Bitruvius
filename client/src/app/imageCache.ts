import { INITIAL_JOINTS } from '../engine/model';
import { IMAGE_CACHE_KEY } from './constants';

const convertBlobUrlToBase64 = async (blobUrl: string): Promise<string | null> => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Failed to convert blob URL to base64:', error);
    return null;
  }
};

export const cacheImageFromUrl = async (url: string, cacheKey: string): Promise<void> => {
  if (!url || !url.startsWith('blob:')) return;

  try {
    const base64 = await convertBlobUrlToBase64(url);
    if (base64) {
      const cache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}') as Record<string, string>;
      cache[cacheKey] = base64;
      localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (error) {
    console.warn('Failed to cache image:', error);
  }
};

export const restoreImageFromCache = (cacheKey: string): string | null => {
  try {
    const cache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}') as Record<string, string>;
    return cache[cacheKey] || null;
  } catch (error) {
    console.warn('Failed to restore image from cache:', error);
    return null;
  }
};

export const cleanupImageCache = () => {
  try {
    const cache = JSON.parse(localStorage.getItem(IMAGE_CACHE_KEY) || '{}') as Record<string, string>;
    const currentCacheKeys = new Set<string>([
      'background',
      'foreground',
      'head_mask',
      ...Object.keys(INITIAL_JOINTS).map((id) => `joint_mask_${id}`),
    ]);

    let hasChanges = false;
    for (const key of Object.keys(cache)) {
      if (!currentCacheKeys.has(key)) {
        delete cache[key];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (error) {
    console.warn('Failed to cleanup image cache:', error);
  }
};

