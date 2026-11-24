import type { ApiOrder } from '../services/orders.service';
import { paymentTypeOf } from './mappers';

export type AttemptMethod = 'online' | 'cod' | 'wallet';
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

export function isPayMethod(value: unknown): value is AttemptMethod {
  return value === 'online' || value === 'cod' || value === 'wallet';
}

/**
 * Pressable passes the tap event as the first argument. That object must not
 * be treated as a method — it used to be sent as UPI while skipping the gateway.
 */
export function resolvePayMethod(candidate: unknown, selected: AttemptMethod): AttemptMethod {
  if (isPayMethod(candidate)) return candidate;
  return isPayMethod(selected) ? selected : 'online';
}

/** Cash and wallet settle on the order itself. Online must open the gateway. */
export function settlesWithoutGateway(method: unknown): boolean {
  return method === 'cod' || method === 'wallet';
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

/**
 * "Payment not confirmed" after a card/UPI WebView must not stick when the
 * shopper picks COD or wallet — that looked like the card screen reloading.
 */
export function onlineInterruptsMethod(
  payState: AttemptState,
  failedMethod: AttemptMethod | null,
  method: AttemptMethod,
  unconfirmedMessage?: string,
): boolean {
  if (method !== 'online' && String(unconfirmedMessage || '').trim()) return false;
  if (onlineFailureBlocksMethod(payState, failedMethod, method)) return true;
  return method === 'online' && String(unconfirmedMessage || '').trim().length > 0;
}

/**
 * After a finished card order, payState often stays `success`. A brand-new
 * checkout must not inherit that — it blocked COD and kept the processing UI.
 */
export function shouldResetPayStateForNewCheckout(payState: AttemptState): boolean {
  return payState === 'success' || payState === 'failed' || payState === 'error';
}

/**
 * prepareFreshPaymentSession must not run while order create or Paynimo is open.
 * A focus-effect dependency loop (wallet reload) used to clear awaiting_gateway
 * and bounce the shopper on Choose Payment Method forever.
 */
export function shouldSkipPrepareFreshPaymentSession(payState: AttemptState): boolean {
  return payState === 'processing' || payState === 'awaiting_gateway';
}

/**
 * Cart identity without payment method — used so Card → COD on the *same*
 * checkout still sees the open online attempt, while a brand-new cart does not.
 * OrdersContext signatures use: items#address#coupon#tip#method
 */
export function cartContentsKey(signature: string): string {
  const raw = String(signature || '');
  if (raw.startsWith('resume:')) return raw;
  const idx = raw.lastIndexOf('#');
  if (idx < 0) return raw;
  return raw.slice(0, idx);
}

/**
 * True when the leftover online attempt belongs to this cart (any method).
 * False for a previous finished/different cart — those must not drive COD/WebView.
 */
export function unpaidBelongsToCurrentCart(
  unpaid: { id: string; signature: string } | null | undefined,
  currentSignature: string,
): boolean {
  if (!unpaid?.id) return false;
  if (unpaid.signature === currentSignature) return true;
  if (currentSignature === `resume:${unpaid.id}`) return true;
  if (unpaid.signature.startsWith('resume:') || currentSignature.startsWith('resume:')) {
    return false;
  }
  return cartContentsKey(unpaid.signature) === cartContentsKey(currentSignature);
}

/**
 * Reuse an unpaid online order for another *online* attempt only when the
 * signature still matches (same cart online retry) or this is an explicit resume.
 */
export function canReuseUnpaidOnlineAttempt(
  unpaid: { id: string; signature: string } | null | undefined,
  currentSignature: string,
): boolean {
  if (!unpaid?.id) return false;
  if (unpaid.signature === currentSignature) return true;
  if (currentSignature === `resume:${unpaid.id}`) return true;
  return false;
}
