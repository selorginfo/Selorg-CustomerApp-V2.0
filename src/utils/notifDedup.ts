/**
 * Shared message-ID deduplication store.
 *
 * Both the background handler (index.js) and the foreground handler (App.tsx)
 * import this module so they can skip a message that was already handled by
 * the other side — which can happen during foreground↔background transitions.
 */
const _seen = new Set<string>();

/** Returns true if the message was already handled (duplicate). Registers it if not. */
export function isDuplicate(messageId: string | undefined): boolean {
  if (!messageId) return false;
  if (_seen.has(messageId)) return true;
  _seen.add(messageId);
  // Auto-clean after 30 s to avoid unbounded growth
  setTimeout(() => _seen.delete(messageId), 30_000);
  return false;
}
