import { paymentsApi, type WorldlineStatus } from '../services/payments.service';
import { ordersApi } from '../services/orders.service';
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

const CAPTURED_ORDER_STATUSES = new Set([
  'confirmed',
  'getting-packed',
  'on-the-way',
  'arrived',
  'delivered',
]);

/**
 * Poll GET /payments/worldline/status until paid, failed, or exhausted.
 * Also checks GET /orders/:id every other tick so a confirmed order cannot
 * leave the customer stuck on Payment processing when status uiState lags.
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

    // Every other poll, trust the order document (Admin/Web source of truth).
    if (attempt % 2 === 1) {
      try {
        const order = await ordersApi.getOrder(orderId);
        const pay = String(order.paymentStatus || '').toLowerCase();
        const st = String(order.status || '').toLowerCase();
        if (pay === 'paid' || CAPTURED_ORDER_STATUSES.has(st)) {
          return {
            outcome: 'paid',
            status: last || {
              orderId,
              orderPaymentStatus: 'paid',
              paymentStatus: 'paid',
              uiState: 'PAID',
            },
          };
        }
      } catch {
        /* ignore — status poll remains primary */
      }
    }

    await sleep(intervalMs);
  }
  return { outcome: 'pending', status: last };
}
