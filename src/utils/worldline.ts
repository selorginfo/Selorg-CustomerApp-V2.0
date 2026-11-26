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
    // Production callbacks are HTTPS. HTTP is only the local / LAN API, not an arbitrary site.
    if (/^https:\/\//i.test(raw)) return true;
    if (host === 'localhost' || host === '127.0.0.1' || isSelorgHost(host)) return true;
    // Device Metro builds rewrite returnUrl to the PC LAN IP (e.g. 192.168.x.x:3333).
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  }
  if (!lower.includes('paynimo_bridge=1')) return false;
  return isSelorgHost(host);
}

/**
 * When the WebView may close after a card return.
 * - Form submit / bare return-path probes fire before the POST body reaches the API.
 * - Closing then cancels the request → rawGatewayReturn stays null (Android stuck state).
 * - Complete only after the API bridge document loads (`data-paynimo-bridge`) or load-end
 *   on the return/handoff URL (POST already processed).
 */
export function shouldCompleteAfterReturnSignal(signal: {
  kind: 'return-post-started' | 'return-nav' | 'page-probe';
  bridge?: boolean;
}): boolean {
  if (signal.kind === 'return-post-started') return false;
  if (signal.kind === 'page-probe') return !!signal.bridge;
  // return-nav from the API HTML runs after processGatewayReturn stored the capture.
  return signal.kind === 'return-nav';
}

/**
 * Official Android/Web docs: first segment of pipe `msg` is txn_status
 * (0300 / 0398 / 0399 / 0396 / 0392). Native Android callbacks often send only `{ msg }`.
 */
export function txnStatusFromPaynimoMsg(msg: unknown): string {
  const raw = String(msg || '').trim();
  if (!raw.includes('|')) return '';
  return raw.split('|')[0]?.trim() || '';
}

/**
 * True only when the body still has gateway crypto fields to send to `/worldline/complete`.
 * A redirect or `paynimo_bridge` hint is not a capture. The app must poll `/worldline/status`.
 */
export function gatewayStatusCode(detail: Record<string, unknown> | null | undefined): string {
  if (!detail) return '';
  const method = detail.paymentMethod;
  const nested =
    method && typeof method === 'object'
      ? (method as { paymentTransaction?: { statusCode?: unknown } }).paymentTransaction?.statusCode
      : '';
  // Prefer explicit fields, then pipe msg (Android SDK / return POST shape).
  return String(
    detail.statusCode ||
      detail.txn_status ||
      detail.txnStatus ||
      nested ||
      txnStatusFromPaynimoMsg(detail.msg) ||
      detail.error_code ||
      '',
  ).trim();
}

export type HostedGatewayDecision = 'ignore' | 'complete' | 'keep_open';

/**
 * Paynimo docs status codes:
 * 0300 Success, 0398 Initiated, 0399 Failure, 0396 Awaited, 0392 Aborted.
 * In-page responseHandler is not the issuer OTP result — bare 0399 before a
 * verified pipe used to close the WebView before 3-D Secure.
 */
export function hostedGatewayDecision(
  detail: Record<string, unknown> | null | undefined,
  handoffStarted: boolean,
): HostedGatewayDecision {
  if (!detail || typeof detail !== 'object') return 'ignore';
  const code = gatewayStatusCode(detail);
  // statusCode alone is not a verified gateway body. A pipe msg or hash is.
  const hasPayload = String(detail.msg || '').includes('|') || String(detail.hash || '').trim().length > 0;
  if (!code && !hasPayload) return 'ignore';
  // Official: Initiated / Awaited — keep checkout open and wait for final capture.
  if (code === '0396' || code === '0398') return 'keep_open';
  if (handoffStarted && code !== '0300' && !hasPayload) return 'keep_open';
  if (handoffStarted && code !== '0300' && code !== '0392' && code !== '0399') return 'keep_open';
  if (code === '0399' && !hasPayload) return 'keep_open';
  // Success, abort, or verified failure (pipe msg) — leave WebView and poll/verify on server.
  if (code === '0300' || code === '0392' || code === '0399' || hasPayload) return 'complete';
  return 'ignore';
}

export function shouldSubmitGatewayResponse(response: Record<string, unknown> | null | undefined): boolean {
  if (!response || typeof response !== 'object') return false;
  if (String(response.paynimo_bridge || '') === '1') return false;
  if (hasWorldlineGatewayPayload(response)) return true;
  if (response.paymentMethod && typeof response.paymentMethod === 'object') return true;
  return false;
}

type WorldlineAttemptLike = {
  status?: string;
  verificationError?: string;
};

function attemptIsVerifiedSuccess(attempt: WorldlineAttemptLike | null | undefined): boolean {
  if (!attempt || typeof attempt !== 'object') return false;
  const st = String(attempt.status || '').toLowerCase();
  const ve = String(attempt.verificationError || 'none').toLowerCase();
  return st === 'success' && ve === 'none';
}

/**
 * Paid when the order row is paid, ui says PAID, or any Worldline attempt is a
 * verified success — even if a newer cancelled/failed retry made uiState noisy.
 */
export function isWorldlinePaidStatus(status: {
  paymentStatus?: string;
  status?: string;
  orderPaymentStatus?: string;
  uiState?: string;
  walletCredited?: boolean;
  latestPayment?: WorldlineAttemptLike | null;
  allAttempts?: WorldlineAttemptLike[] | null;
}): boolean {
  // Order payment status is the source of truth across Web / Mobile / Admin.
  const orderPay = String(status.orderPaymentStatus || '').toLowerCase();
  if (orderPay === 'paid') return true;

  const pay = String(status.paymentStatus || '').toLowerCase();
  if (pay === 'paid') return true;
  // Do not treat order-level failed as paid; gateway success on a failed order is handled by refunds.
  if (pay === 'failed' || pay === 'cancelled' || orderPay === 'failed' || orderPay === 'cancelled') {
    return false;
  }

  if (status.walletCredited && pay !== 'pending' && orderPay !== 'pending') return true;
  if (String(status.uiState || '').toUpperCase() === 'PAID') return true;

  if (attemptIsVerifiedSuccess(status.latestPayment || undefined)) return true;
  if (Array.isArray(status.allAttempts) && status.allAttempts.some(attemptIsVerifiedSuccess)) {
    return true;
  }

  const st = String(status.status || '').toLowerCase();
  return st === 'success' || st === 'paid';
}

export function isWorldlinePendingStatus(status: {
  uiState?: string;
  paymentStatus?: string;
  orderPaymentStatus?: string;
  paymentOutcome?: string;
  latestPayment?: WorldlineAttemptLike | null;
  allAttempts?: WorldlineAttemptLike[] | null;
  walletCredited?: boolean;
  status?: string;
}): boolean {
  // Never keep polling as "pending" once capture is confirmed.
  if (isWorldlinePaidStatus(status)) return false;

  const outcome = String(status.paymentOutcome || '').toUpperCase();
  if (
    outcome === 'PENDING' ||
    outcome === 'TIMEOUT' ||
    outcome === 'INITIATED' ||
    outcome === 'AWAITING_PAYMENT'
  ) {
    return true;
  }
  const ui = String(status.uiState || '').toUpperCase();
  return ui === 'PENDING_VERIFICATION' || ui === 'WAITING_FOR_PAYMENT' || ui === 'UNKNOWN';
}

export function isWorldlineFailedStatus(status: {
  paymentStatus?: string;
  orderPaymentStatus?: string;
  uiState?: string;
  paymentOutcome?: string;
  latestPayment?: WorldlineAttemptLike | null;
  allAttempts?: WorldlineAttemptLike[] | null;
  walletCredited?: boolean;
  status?: string;
}): boolean {
  // Timeout / pending outcomes are not declines — keep reconciling.
  if (isWorldlinePendingStatus(status) || isWorldlinePaidStatus(status)) return false;
  const outcome = String(status.paymentOutcome || '').toUpperCase();
  if (outcome === 'TIMEOUT' || outcome === 'PENDING' || outcome === 'INITIATED' || outcome === 'AWAITING_PAYMENT') {
    return false;
  }
  // Bank decline / hard fail / cancel — leave verifying UI.
  if (
    outcome === 'FAILED' ||
    outcome === 'DECLINED' ||
    outcome === 'CANCELLED' ||
    outcome === 'CANCELED' ||
    outcome === 'USER_CANCELLED' ||
    outcome === 'ABORTED'
  ) {
    return true;
  }
  const ui = String(status.uiState || '').toUpperCase();
  if (ui === 'FAILED' || ui === 'RETRY_AVAILABLE') return true;
  const pay = String(status.orderPaymentStatus || status.paymentStatus || status.status || '').toLowerCase();
  return (
    pay === 'failed' ||
    pay === 'declined' ||
    pay === 'cancelled' ||
    pay === 'canceled'
  );
}

/** User-facing copy for a terminal Worldline failure / decline. */
export function worldlineFailureMessage(status?: {
  paymentOutcome?: string;
  uiState?: string;
  paymentStatus?: string;
  orderPaymentStatus?: string;
  status?: string;
} | null): string {
  const outcome = String(status?.paymentOutcome || '').toUpperCase();
  const pay = String(
    status?.orderPaymentStatus || status?.paymentStatus || status?.status || '',
  ).toLowerCase();
  if (outcome === 'DECLINED' || pay === 'declined') {
    return 'Payment declined by the bank. No amount was charged. You can try again or choose another method.';
  }
  if (outcome === 'USER_CANCELLED' || outcome === 'CANCELLED' || outcome === 'CANCELED' || outcome === 'ABORTED') {
    return 'Payment was cancelled. No amount was charged.';
  }
  return 'Payment failed. No amount was charged. You can retry or choose another method.';
}

/** Result-screen title for a failure message, so every path that settles a failure shows the same one. */
export function worldlineFailureTitle(message: string): string {
  if (/declined/i.test(message)) return 'Payment declined';
  if (/cancelled/i.test(message)) return 'Payment cancelled';
  return 'Payment failed';
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
  if (!statusKnown || !status) {
    // Online can reopen the same unpaid attempt. Cash/wallet must not stay blocked
    // when the status call fails after an abandoned card/UPI session.
    return method === 'online' ? 'reuse_online' : 'clear_and_continue';
  }
  if (isWorldlinePaidStatus(status)) return 'already_paid';
  if (isWorldlineFailedStatus(status)) return 'clear_and_continue';
  return method === 'online' ? 'reuse_online' : 'block_other_method';
}

/**
 * Explicit switch away from online (COD / wallet).
 * - Paid → finish that order (do not place COD).
 * - Failed / waiting-before-capture / unknown → abort and continue with the new method.
 * - PENDING_VERIFICATION → block (bank may already have authorized).
 */
export function switchFromOnlineDecision(
  status: {
    paymentStatus?: string;
    status?: string;
    orderPaymentStatus?: string;
    uiState?: string;
    walletCredited?: boolean;
  } | null | undefined,
  statusKnown: boolean,
): HeldPaymentRetry {
  if (!statusKnown || !status) return 'clear_and_continue';
  if (isWorldlinePaidStatus(status)) return 'already_paid';
  if (isWorldlineFailedStatus(status)) return 'clear_and_continue';
  const ui = String(status.uiState || '').toUpperCase();
  // Pending / unknown / verifying — bank may already have debited. Never cancel.
  if (ui === 'PENDING_VERIFICATION' || ui === 'UNKNOWN' || isInFlightGatewayStatus(status)) {
    return 'block_other_method';
  }
  // WAITING_FOR_PAYMENT / created — shopper left before capture.
  return 'clear_and_continue';
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
