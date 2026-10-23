/**
 * Sync-readable auth storage. The access token is held in memory after
 * `hydrate()` and written to the platform Keychain/Keystore. Other keys stay
 * in MMKV. Until Keychain is linked, the token falls back to MMKV.
 */
import { mmkvStorage } from '../lib/storage';

export type StorageKey = 'accessToken' | 'userId' | 'userData';

const KEYS: StorageKey[] = ['accessToken', 'userId', 'userData'];
const TOKEN_SERVICE = 'selorg.accessToken';

let memoryToken: string | null | undefined;

type KeychainModule = {
  getGenericPassword: (options: { service: string }) => Promise<false | { password: string }>;
  setGenericPassword: (username: string, password: string, options: { service: string }) => Promise<unknown>;
  resetGenericPassword: (options: { service: string }) => Promise<unknown>;
};

function loadKeychain(): KeychainModule | null {
  try {
    return require('react-native-keychain') as KeychainModule;
  } catch {
    return null;
  }
}

async function writeToken(value: string): Promise<void> {
  const keychain = loadKeychain();
  if (!keychain) {
    mmkvStorage.setItem('accessToken', value);
    return;
  }
  try {
    await keychain.setGenericPassword('session', value, { service: TOKEN_SERVICE });
    mmkvStorage.removeItem('accessToken');
  } catch {
    mmkvStorage.setItem('accessToken', value);
  }
}

export const Storage = {
  /** Load the session token from Keychain before the first authenticated read. */
  hydrate: async (): Promise<void> => {
    const keychain = loadKeychain();
    const legacy = mmkvStorage.getItem('accessToken');
    if (!keychain) {
      memoryToken = legacy;
      return;
    }
    try {
      const creds = await keychain.getGenericPassword({ service: TOKEN_SERVICE });
      if (creds && creds.password) {
        memoryToken = creds.password;
        mmkvStorage.removeItem('accessToken');
        return;
      }
    } catch {
      memoryToken = legacy;
      return;
    }
    memoryToken = legacy;
    if (legacy) await writeToken(legacy);
  },

  getItem: (key: StorageKey): string | null => {
    if (key === 'accessToken') {
      if (memoryToken !== undefined) return memoryToken;
      return mmkvStorage.getItem('accessToken');
    }
    return mmkvStorage.getItem(key);
  },

  setItem: (key: StorageKey, value: string): void => {
    if (key === 'accessToken') {
      memoryToken = value;
      void writeToken(value);
      return;
    }
    mmkvStorage.setItem(key, value);
  },

  removeItem: (key: StorageKey): void => {
    if (key === 'accessToken') {
      memoryToken = null;
      const keychain = loadKeychain();
      keychain?.resetGenericPassword({ service: TOKEN_SERVICE }).catch(() => {});
    }
    mmkvStorage.removeItem(key);
  },

  /** Wipe every auth-related key — call on logout / 401. */
  clearAuth: (): void => {
    memoryToken = null;
    const keychain = loadKeychain();
    keychain?.resetGenericPassword({ service: TOKEN_SERVICE }).catch(() => {});
    KEYS.forEach(key => mmkvStorage.removeItem(key));
  },
};
