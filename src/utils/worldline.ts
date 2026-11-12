/** Parse query string from a Worldline/Paynimo return URL into a plain object. */
export function parseReturnUrl(url: string): Record<string, unknown> {
  try {
    const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
    const out: Record<string, unknown> = {};
    if (!query) return out;
    query.split('&').forEach(pair => {
      const eq = pair.indexOf('=');
      const k = eq >= 0 ? pair.slice(0, eq) : pair;
      const v = eq >= 0 ? pair.slice(eq + 1) : '';
      if (k) out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent((v || '').replace(/\+/g, ' '));
    });
    return out;
  } catch {
    return { rawUrl: url };
  }
}

const GATEWAY_PAYLOAD_KEYS = [
  'msg',
  'hash',
  'tpsl_txn_id',
  'clnt_txn_ref',
  'txn_status',
  'txnStatus',
  'TXN_STATUS',
  'statusCode',
  'bankTransactionId',
  'BankTransactionID',
] as const;

/**
 * True when the parsed return payload looks like a real Paynimo gateway callback
 * (crypto/msg fields). Presentation redirects from our API (`paynimo_bridge=1`)
 * only carry UI hints and must NOT be posted to `/worldline/complete`.
 */
export function hasWorldlineGatewayPayload(response: Record<string, unknown>): boolean {
  if (!response || typeof response !== 'object') return false;
  if (String(response.paynimo_bridge || '') === '1') return false;
  return GATEWAY_PAYLOAD_KEYS.some(key => {
    const value = response[key];
    return value != null && String(value).trim() !== '';
  });
}

/** Host from an absolute http(s) URL. React Native's URL lacks hostname, so parse by hand. */
export function httpHost(url: string): string {
  const match = String(url || '').trim().match(/^https?:\/\/([^/?#:]+)/i);
  return (match?.[1] || '').toLowerCase();
}

function isSelorgHost(host: string): boolean {
  return host === 'selorg.com' || host.endsWith('.selorg.com') || host === 'localhost' || host === '127.0.0.1';
}

/**
 * Merchant return only. Bank OTP / 3-D Secure URLs often contain `txnStatus`
 * or `status=success` and must not be treated as our callback.
 * A POST to `/worldline/return` has the payload in the body, so an empty query still counts.
 */
export function isWorldlineReturnUrl(url: string): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  const path = lower.split('?')[0].split('#')[0];
  const host = httpHost(raw);
  const returnPath =
    /\/payments\/worldline\/return\/?$/.test(path) ||
    /\/worldline\/return\/?$/.test(path) ||
    /\/paynimo-return(?:\.html)?\/?$/.test(path);
  if (returnPath) {
    // Production callbacks are HTTPS. HTTP is only the local API, not an arbitrary site.
    if (/^https:\/\//i.test(raw)) return true;
    return host === 'localhost' || host === '127.0.0.1' || isSelorgHost(host);
  }
  if (!lower.includes('paynimo_bridge=1')) return false;
  return isSelorgHost(host);
}

/**
 * True only when the body still has gateway crypto fields to send to `/worldline/complete`.
 * A redirect or `paynimo_bridge` hint is not a capture. The app must poll `/worldline/status`.
 */
export function shouldSubmitGatewayResponse(response: Record<string, unknown> | null | undefined): boolean {
  if (!response || typeof response !== 'object') return false;
  if (String(response.paynimo_bridge || '') === '1') return false;
  if (hasWorldlineGatewayPayload(response)) return true;
  if (response.paymentMethod && typeof response.paymentMethod === 'object') return true;
  return false;
}

export function isWorldlinePaidStatus(status: {
  paymentStatus?: string;
  status?: string;
  orderPaymentStatus?: string;
  uiState?: string;
  walletCredited?: boolean;
}): boolean {
  const pay = String(status.paymentStatus || status.orderPaymentStatus || '').toLowerCase();
  if (pay === 'failed' || pay === 'cancelled') return false;
  if (status.walletCredited && pay !== 'pending') return true;
  if (status.uiState === 'PAID') return true;
  if (pay === 'paid') return true;
  const st = String(status.status || '').toLowerCase();
  return st === 'success' || st === 'paid';
}

export function isWorldlinePendingStatus(status: { uiState?: string; paymentStatus?: string }): boolean {
  const ui = String(status.uiState || '').toUpperCase();
  return ui === 'PENDING_VERIFICATION' || ui === 'WAITING_FOR_PAYMENT' || ui === 'UNKNOWN';
}

export function isWorldlineFailedStatus(status: {
  paymentStatus?: string;
  orderPaymentStatus?: string;
  uiState?: string;
}): boolean {
  const ui = String(status.uiState || '').toUpperCase();
  if (ui === 'FAILED' || ui === 'RETRY_AVAILABLE') return true;
  const pay = String(status.paymentStatus || status.orderPaymentStatus || '').toLowerCase();
  return pay === 'failed';
}

export type GatewayDismissAction = 'finish_paid' | 'hold' | 'abort' | 'close_failed';

/** Bank has the payment, or we cannot prove it does not. Do not abort these. */
export function isInFlightGatewayStatus(status: {
  paymentStatus?: string;
  status?: string;
  orderPaymentStatus?: string;
  uiState?: string;
}): boolean {
  if (isWorldlinePaidStatus(status) || isWorldlineFailedStatus(status)) return false;
  const ui = String(status.uiState || '').toUpperCase();
  if (ui === 'PENDING_VERIFICATION' || ui === 'UNKNOWN') return true;
  const pay = String(status.paymentStatus || status.orderPaymentStatus || status.status || '').toLowerCase();
  return pay === 'pending' || pay === 'unknown';
}

/**
 * What Close may do after `/worldline/status`.
 * Paid is never aborted. Pending and unknown are never aborted.
 * A customer who is already on the bank OTP page is held even if our row is still "created",
 * because the issuer may have authorized before the return POST lands.
 * Abort is only for a checkout that never left Paynimo.
 */
export function gatewayDismissAction(
  status: {
    paymentStatus?: string;
    status?: string;
    orderPaymentStatus?: string;
    uiState?: string;
    walletCredited?: boolean;
  } | null | undefined,
  options: { statusKnown: boolean; bankAuthenticationStarted?: boolean },
): GatewayDismissAction {
  if (!options.statusKnown || !status) return 'hold';
  if (isWorldlinePaidStatus(status)) return 'finish_paid';
  if (isInFlightGatewayStatus(status)) return 'hold';
  if (isWorldlineFailedStatus(status)) return 'close_failed';
  if (options.bankAuthenticationStarted) return 'hold';
  return 'abort';
}

export type HeldPaymentRetry = 'already_paid' | 'reuse_online' | 'block_other_method' | 'clear_and_continue';

/**
 * While a gateway attempt can still capture, do not cancel that order or open a second one.
 * Online retry reuses it. Cash and wallet are blocked until the attempt is terminal.
 */
export function retryWhileHeld(
  status: {
    paymentStatus?: string;
    status?: string;
    orderPaymentStatus?: string;
    uiState?: string;
    walletCredited?: boolean;
  } | null | undefined,
  statusKnown: boolean,
  method: 'online' | 'cod' | 'wallet',
): HeldPaymentRetry {
  if (!statusKnown || !status) return method === 'online' ? 'reuse_online' : 'block_other_method';
  if (isWorldlinePaidStatus(status)) return 'already_paid';
  if (isWorldlineFailedStatus(status)) return 'clear_and_continue';
  return method === 'online' ? 'reuse_online' : 'block_other_method';
}

/** Prefer a human message from a bridge/result URL when present. */
export function presentationMessageFromReturn(response: Record<string, unknown>): string {
  const message = String(response.message || response.msg || '').trim();
  if (message && !hasWorldlineGatewayPayload(response)) return message;
  const status = String(response.status || '').toLowerCase();
  if (status === 'cancelled' || status === 'canceled') {
    return 'You cancelled the payment. No amount has been charged.';
  }
  if (status === 'failed') {
    return 'Payment was not completed. You can retry from checkout.';
  }
  return '';
}
