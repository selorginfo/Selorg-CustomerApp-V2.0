import { MMKV } from 'react-native-mmkv';

// Fallback implementation for environments where MMKV is not supported (e.g. Remote Debugging)
const createMockStorage = () => {
  const data = new Map<string, string | number | boolean>();
  return {
    getString: (key: string) => data.get(key) as string | undefined,
    set: (key: string, value: string | number | boolean) => data.set(key, value),
    delete: (key: string) => data.delete(key),
    clearAll: () => data.clear(),
    contains: (key: string) => data.has(key),
  };
};

let storageInstance: any;
try {
  storageInstance = new MMKV();
} catch (e) {
  console.warn('MMKV initialization failed. Falling back to in-memory storage.', e);
  storageInstance = createMockStorage();
}

export const storage = storageInstance;

export const mmkvStorage = {
  getItem: (key: string): string | null => {
    try {
      const value = storage.getString(key);
      return value !== undefined ? value : null;
    } catch (e) {
      console.error('mmkvStorage.getItem error:', e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      storage.set(key, value);
    } catch (e) {
      console.error('mmkvStorage.setItem error:', e);
    }
  },
  removeItem: (key: string): void => {
    try {
      storage.delete(key);
    } catch (e) {
      console.error('mmkvStorage.removeItem error:', e);
    }
  },
};
