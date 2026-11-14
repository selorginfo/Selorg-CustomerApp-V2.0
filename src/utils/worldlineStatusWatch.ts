import { paymentsApi, type WorldlineStatus } from '../services/payments.service';
import {
  isWorldlineFailedStatus,
  isWorldlinePaidStatus,
  isWorldlinePendingStatus,
} from './worldline';

export type WorldlineWatchOutcome = 'paid' | 'failed' | 'pending' | 'stopped';

export interface WorldlineStatusWatchOptions {
  orderId: string;
  /** First poll delay. Default 1500ms — give the return POST time to land. */
  initialDelayMs?: number;
  /** Interval between polls. Default 2500ms. */
  intervalMs?: number;
  /** Stop after this many polls without a terminal result. Default 48 (~2 min). */
  maxAttempts?: number;
  signal?: { aborted: boolean };
  onStatus?: (status: WorldlineStatus) => void;
}

/**
 * Poll GET /payments/worldline/status until paid, failed, or exhausted.
 * Used while the Secure Payment WebView is still open so a blank bank page
 * cannot hide a capture the server already recorded.
 */
export async function watchWorldlineStatus(
  options: WorldlineStatusWatchOptions,
): Promise<{ outcome: WorldlineWatchOutcome; status?: WorldlineStatus }> {
  const {
    orderId,
    initialDelayMs = 1500,
    intervalMs = 2500,
    maxAttempts = 48,
    signal,
    onStatus,
  } = options;
  if (!orderId) return { outcome: 'stopped' };

  const sleep = (ms: number) =>
    new Promise<void>(resolve => {
      setTimeout(resolve, ms);
    });

  if (initialDelayMs > 0) {
    await sleep(initialDelayMs);
    if (signal?.aborted) return { outcome: 'stopped' };
  }

  let last: WorldlineStatus | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) return { outcome: 'stopped', status: last };
    try {
      const status = await paymentsApi.getWorldlineStatus(orderId, { timeoutMs: 12000 });
      last = status;
      onStatus?.(status);
      if (isWorldlinePaidStatus(status)) return { outcome: 'paid', status };
      if (isWorldlineFailedStatus(status)) return { outcome: 'failed', status };
      // Still created / waiting — keep polling. Do not stop on "not pending"
      // enums that are really pre-capture (WAITING_FOR_PAYMENT).
      if (!isWorldlinePendingStatus(status)) {
        const pay = String(status.paymentStatus || status.orderPaymentStatus || status.status || '').toLowerCase();
        if (pay === 'paid') return { outcome: 'paid', status };
        if (pay === 'failed' || pay === 'cancelled' || pay === 'canceled') {
          return { outcome: 'failed', status };
        }
      }
    } catch {
      // Network blip — keep trying until maxAttempts.
    }
    await sleep(intervalMs);
  }
  return { outcome: 'pending', status: last };
}
