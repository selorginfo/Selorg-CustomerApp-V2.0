import type { ApiOrder } from '../services/orders.service';
import { paymentTypeOf } from './mappers';

type AttemptMethod = 'online' | 'cod' | 'wallet';
type AttemptState = 'idle' | 'processing' | 'success' | 'failed' | 'error' | 'awaiting_gateway';

export type SettlementKind = 'cash' | 'wallet' | 'online' | 'unknown';

export function settlementKind(raw: ApiOrder): SettlementKind {
  const type = paymentTypeOf(raw);
  if (type === 'cash' || type === 'cod') return 'cash';
  if (type === 'wallet' || type === 'selorg_wallet') return 'wallet';
  if (type === 'upi' || type === 'card' || type === 'digital') return 'online';
  const status = String(raw.paymentStatus || '').toLowerCase();
  if (status === 'cod_pending') return 'cash';
  return 'unknown';
}

export function wantedSettlement(method: AttemptMethod): SettlementKind {
  if (method === 'cod') return 'cash';
  if (method === 'wallet') return 'wallet';
  return 'online';
}

/**
 * A failed UPI attempt must not keep the Payment Failed screen up after the
 * shopper switches to cash or wallet. A failure for the method they are on still blocks.
 */
export function onlineFailureBlocksMethod(
  payState: AttemptState,
  failedMethod: AttemptMethod | null,
  method: AttemptMethod,
): boolean {
  const failed = payState === 'failed' || payState === 'error';
  if (!failed) return false;
  if (failedMethod === 'online' && method !== 'online') return false;
  return true;
}
