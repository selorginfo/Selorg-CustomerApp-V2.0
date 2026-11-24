/**
 * Sync-readable auth storage. The access token is held in memory after
 * `hydrate()` and written to the platform Keychain/Keystore. Other keys stay
 * in MMKV. Until Keychain is linked, the token falls back to MMKV.
 */
import { mmkvStorage } from '../lib/storage';

export type StorageKey = 'accessToken' | 'userId' | 'userData';

const KEYS: StorageKey[] = ['accessToken', 'userId', 'userData'];
const TOKEN_SERVICE = 'selorg.accessToken';
/** Survives in MMKV for an upgrade, and is absent after uninstall. iOS Keychain is not. */
const INSTALL_MARKER = 'installMarker';

let memoryToken: string | null | undefined;
/** Bumped on every token write so a slow Keychain read cannot replace a login that just finished. */
let tokenEpoch = 0;

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

async function writeToken(value: string, epoch: number): Promise<void> {
  const keychain = loadKeychain();
  if (tokenEpoch !== epoch) return;
  if (!keychain) {
    if (memoryToken === value) mmkvStorage.setItem('accessToken', value);
    return;
  }
  try {
    await keychain.setGenericPassword('session', value, { service: TOKEN_SERVICE });
    if (tokenEpoch !== epoch || memoryToken !== value) {
      if (memoryToken) {
        await keychain.setGenericPassword('session', memoryToken, { service: TOKEN_SERVICE });
      }
      return;
    }
    mmkvStorage.removeItem('accessToken');
  } catch {
    if (tokenEpoch === epoch && memoryToken === value) mmkvStorage.setItem('accessToken', value);
  }
}

export const Storage = {
  /** Load the session token from Keychain before the first authenticated read. */
  hydrate: async (): Promise<void> => {
    const epoch = tokenEpoch;
    const keychain = loadKeychain();
    const legacy = mmkvStorage.getItem('accessToken');
    const seenThisInstall = mmkvStorage.getItem(INSTALL_MARKER);
    if (!seenThisInstall) {
      mmkvStorage.setItem(INSTALL_MARKER, '1');
      const keptSession = Boolean(legacy || mmkvStorage.getItem('userId') || mmkvStorage.getItem('userData'));
      if (!keptSession && keychain) {
        try {
          await keychain.resetGenericPassword({ service: TOKEN_SERVICE });
        } catch {
          // A missing native module must not block launch.
        }
        if (tokenEpoch !== epoch) return;
        memoryToken = null;
        return;
      }
    }
    if (tokenEpoch !== epoch) return;
    if (!keychain) {
      memoryToken = legacy;
      return;
    }
    try {
      const creds = await keychain.getGenericPassword({ service: TOKEN_SERVICE });
      if (tokenEpoch !== epoch) return;
      if (creds && creds.password) {
        memoryToken = creds.password;
        mmkvStorage.removeItem('accessToken');
        return;
      }
    } catch {
      if (tokenEpoch !== epoch) return;
      memoryToken = legacy;
      return;
    }
    if (tokenEpoch !== epoch) return;
    memoryToken = legacy;
    if (legacy) await writeToken(legacy, epoch);
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
      tokenEpoch += 1;
      memoryToken = value;
      void writeToken(value, tokenEpoch);
      return;
    }
    mmkvStorage.setItem(key, value);
  },

  removeItem: (key: StorageKey): void => {
    if (key === 'accessToken') {
      tokenEpoch += 1;
      memoryToken = null;
      const keychain = loadKeychain();
      keychain?.resetGenericPassword({ service: TOKEN_SERVICE }).catch(() => {});
    }
    mmkvStorage.removeItem(key);
  },

  /** Wipe every auth-related key — call on logout / 401. */
  clearAuth: (): void => {
    tokenEpoch += 1;
    memoryToken = null;
    const keychain = loadKeychain();
    keychain?.resetGenericPassword({ service: TOKEN_SERVICE }).catch(() => {});
    KEYS.forEach(key => mmkvStorage.removeItem(key));
  },
};
