export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const getStorage = (): StorageLike | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

export const storageGet = (key: string): string | null => {
  const s = getStorage();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
};

export const storageSet = (key: string, value: string): void => {
  const s = getStorage();
  if (!s) return;
  try {
    s.setItem(key, value);
  } catch {
    // ignore
  }
};

export const storageRemove = (key: string): void => {
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    // ignore
  }
};

