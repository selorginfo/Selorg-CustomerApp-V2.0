/**
 * Unwrap selorg-service `{ success, data }` envelopes returned by ResponseFormatter.
 */
export function unwrapApiData<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'data' in res) {
    return (res as { data: T }).data;
  }
  return res as T;
}

/** Extract a list from common paginated / nested response shapes. */
export function unwrapApiList<T>(res: unknown): T[] {
  const data = unwrapApiData<unknown>(res);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.list)) return obj.list as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.products)) return obj.products as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}
