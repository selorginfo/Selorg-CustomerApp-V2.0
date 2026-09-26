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

export function isWorldlineReturnUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('worldline/return') ||
    lower.includes('payment-result') ||
    lower.includes('payment_status') ||
    lower.includes('paynimo-return') ||
    lower.includes('paynimo_bridge=1') ||
    lower.includes('status=success') ||
    lower.includes('status=failed') ||
    lower.includes('status=cancelled') ||
    lower.includes('txnstatus')
  );
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
