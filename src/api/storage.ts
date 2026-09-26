/**
 * Sync-readable auth storage for the API layer.
 *
 * Mirrors UGEC's `src/api/storage.ts` API (`hydrate` / `getItem` / `setItem` /
 * `removeItem`), but is backed by MMKV (`src/lib/storage.ts`) which is already
 * synchronous — so `hydrate()` is a no-op kept only for interface parity and
 * call-site symmetry with the rest of the app's bootstrap.
 */
import { mmkvStorage } from '../lib/storage';

export type StorageKey = 'accessToken' | 'userId' | 'userData';

const KEYS: StorageKey[] = ['accessToken', 'userId', 'userData'];

export const Storage = {
  /** No-op — MMKV reads are synchronous. Present for parity with async stores. */
  hydrate: async (): Promise<void> => {},

  getItem: (key: StorageKey): string | null => mmkvStorage.getItem(key),

  setItem: (key: StorageKey, value: string): void => {
    mmkvStorage.setItem(key, value);
  },

  removeItem: (key: StorageKey): void => {
    mmkvStorage.removeItem(key);
  },

  /** Wipe every auth-related key — call on logout / 401. */
  clearAuth: (): void => {
    KEYS.forEach(key => mmkvStorage.removeItem(key));
  },
};
