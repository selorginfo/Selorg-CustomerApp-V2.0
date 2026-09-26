import { storage } from './storage';

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

export async function getCachedValue<T>(
  key: string,
  maxAgeMs: number,
  allowStale: boolean = true,
): Promise<{ value: T | null; source: 'memory' | 'storage' | 'none'; isStale: boolean }> {
  const now = Date.now();
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memoryEntry) {
    const isStale = now - memoryEntry.updatedAt > maxAgeMs;
    if (!isStale || allowStale) {
      return { value: memoryEntry.value, source: 'memory', isStale };
    }
  }

  try {
    const raw = storage.getString(key);
    if (!raw) return { value: null, source: 'none', isStale: false };
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || parsed.value === undefined || typeof parsed.updatedAt !== 'number') {
      return { value: null, source: 'none', isStale: false };
    }
    const isStale = now - parsed.updatedAt > maxAgeMs;
    if (!isStale || allowStale) {
      memoryCache.set(key, parsed);
      return { value: parsed.value, source: 'storage', isStale };
    }
  } catch (error) {
    if (__DEV__) { console.warn('getCachedValue error:', error); }
  }

  return { value: null, source: 'none', isStale: false };
}

export async function setCachedValue<T>(key: string, value: T): Promise<void> {
  const entry: CacheEntry<T> = {
    value,
    updatedAt: Date.now(),
  };
  memoryCache.set(key, entry as CacheEntry<unknown>);
  try {
    storage.set(key, JSON.stringify(entry));
  } catch (error) {
    if (__DEV__) { console.warn('setCachedValue error:', error); }
  }
}

export async function removeCachedValue(key: string): Promise<void> {
  memoryCache.delete(key);
  try {
    storage.delete(key);
  } catch (error) {
    if (__DEV__) { console.warn('removeCachedValue error:', error); }
  }
}

export function clearMemoryCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  Array.from(memoryCache.keys())
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => memoryCache.delete(key));
}
