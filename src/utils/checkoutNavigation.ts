import { httpHost, isWorldlineReturnUrl } from './worldline';

const UPI_SCHEMES = ['upi:', 'phonepe:', 'paytmmp:', 'tez:', 'gpay:'];
const UPI_INTENT_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user',
  'com.phonepe.app',
  'net.one97.paytm',
  'in.org.npci.upiapp',
];

const GATEWAY_SUFFIXES = ['paynimo.com', 'worldline.com', 'tpsl-india.in', 'ingenico.com'];

/** Issuer ACS / OTP hostnames. The TPSL card document is not an OTP page. */
const ACS_HOST_RE = /(^|\.)(acs|3ds|3dsecure|securecode|otp|arcot|cardinalcommerce|secureacs|vbv|rupayacs)([.-]|$)/i;
const ACS_PATH_RE = /\/(acs|3ds|3dsecure|otp|pareq|pares)(\/|$|\?)/i;
const ISSUER_DOMAIN_RE = /(^|\.)(arcot\.com|cardinalcommerce\.com|npci\.org\.in)$/i;

export type CheckoutNavDecision = 'allow' | 'block' | 'upi' | 'return';

export function allowedUpiUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  if (UPI_SCHEMES.some(scheme => lower.startsWith(scheme))) return true;
  if (!lower.startsWith('intent:')) return false;
  const packageName = lower.match(/;package=([^;]+)/)?.[1] || '';
  return UPI_INTENT_PACKAGES.includes(packageName);
}

function isGatewayHost(host: string): boolean {
  return GATEWAY_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * Bank OTP / 3-D Secure only. Paynimo and TPSL card pages are excluded —
 * those documents are often empty while the card form is still on screen.
 */
export function isIssuerAuthenticationUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  const host = httpHost(url);
  if (!host || isGatewayHost(host)) return false;
  if (ACS_HOST_RE.test(host) || ISSUER_DOMAIN_RE.test(host) || ACS_PATH_RE.test(url)) return true;
  return false;
}

function isSelorgHost(host: string): boolean {
  return host === 'selorg.com' || host.endsWith('.selorg.com');
}

/**
 * HTTP is not open. Only the merchant return, the payment gateway, and issuer ACS/OTP URLs.
 * Arbitrary http sites stay blocked.
 */
export function isAllowedHttpPaymentUrl(url: string): boolean {
  if (!/^http:\/\//i.test(url)) return false;
  if (isWorldlineReturnUrl(url)) return true;
  const host = httpHost(url);
  if (!host) return false;
  if (isGatewayHost(host)) return true;
  if (ACS_HOST_RE.test(host) || ACS_PATH_RE.test(url)) return true;
  return false;
}

/**
 * Top-level checkout navigation.
 * `return` must be allowed even when the query string is empty — the card result is in the POST body.
 */
export function classifyCheckoutNavigation(url: string): CheckoutNavDecision {
  const raw = String(url || '').trim();
  if (!raw) return 'block';
  if (allowedUpiUrl(raw)) return 'upi';
  if (isWorldlineReturnUrl(raw)) return 'return';
  if (/^(about|data|blob|javascript):/i.test(raw)) return 'allow';
  if (/^https:\/\//i.test(raw)) return 'allow';
  if (isAllowedHttpPaymentUrl(raw)) return 'allow';
  return 'block';
}

/**
 * Paynimo's card step is a GET on the popup (`bankWindow.location.assign` of
 * the gateway or issuer URL). The checkout document itself stays on paynimo.com.
 * Only that off-checkout HTTPS navigation should replace the visible WebView.
 * A return URL is left to the normal POST completion path.
 */
export function isPopupGatewayNavigation(url: string): boolean {
  const raw = String(url || '').trim();
  if (!/^https:\/\//i.test(raw)) return false;
  if (isWorldlineReturnUrl(raw)) return false;
  const host = httpHost(raw);
  if (!host || host === 'paynimo.com' || host.endsWith('.paynimo.com')) return false;
  return classifyCheckoutNavigation(raw) === 'allow';
}

function urlPath(url: string): string {
  return String(url || '').trim().toLowerCase().split('?')[0].split('#')[0];
}

export interface BlankGatewayRecovery {
  gatewayStarted: boolean;
  /** Shopper already opened an issuer ACS / OTP page. */
  sawIssuer: boolean;
  /** A gateway document painted real text (card form or OTP labels). */
  sawGatewayContent: boolean;
  /** Empty URL is not the document that painted that text. */
  leftPaintedDocument: boolean;
  /** How long the current document has stayed empty. */
  blankForMs: number;
}

/**
 * Recover a stuck post-debit sheet. Never tear down a live OTP page.
 *
 * A boolean `gatewayStarted` keeps the conservative rule: only about:blank and
 * an empty Paynimo shell. After OTP the visible document is often a blank TPSL
 * page or the logged-out website. Pass the progress object for that case so the
 * app can leave the WebView and verify with /worldline/status.
 */
export function shouldRecoverBlankGatewayPage(
  url: string,
  textLength: number,
  gatewayStartedOrProgress: boolean | BlankGatewayRecovery,
): boolean {
  const progress: BlankGatewayRecovery =
    typeof gatewayStartedOrProgress === 'boolean'
      ? {
          gatewayStarted: gatewayStartedOrProgress,
          sawIssuer: false,
          sawGatewayContent: false,
          leftPaintedDocument: false,
          blankForMs: 0,
        }
      : gatewayStartedOrProgress;
  if (!progress.gatewayStarted) return false;
  if (textLength > 1) return false;
  const raw = String(url || '').trim();
  if (!raw || /^about:blank$/i.test(raw)) return true;
  // Issuer OTP / 3DS — sparse DOM is normal. Keep it up until the URL changes.
  if (isIssuerAuthenticationUrl(raw)) return false;
  const host = httpHost(raw);
  if (!host) return false;
  if (isWorldlineReturnUrl(raw) || isPaymentResultHandoffUrl(raw)) return true;
  // Empty Paynimo shell after the card GET left checkout = stuck Secure Payment.
  if (host === 'paynimo.com' || host.endsWith('.paynimo.com')) return true;
  if (isSelorgHost(host)) return progress.blankForMs >= 1500;
  const gatewayDocument = isGatewayHost(host);
  if (!gatewayDocument && !progress.sawIssuer) return false;
  // Came back from the bank OTP page onto an empty gateway document.
  if (progress.sawIssuer && progress.blankForMs >= 4000) return true;
  // Left the painted card page for a different empty URL. The same URL staying
  // sparse is the card form or an in-page OTP widget — leave it up.
  if (progress.sawGatewayContent && progress.leftPaintedDocument && progress.blankForMs >= 4000) return true;
  return false;
}

/**
 * Page the API sends the browser to after it has already accepted the gateway POST.
 * The Customer App WebView must not render it: the website checkout returns null
 * without a website login, which is the blank screen after OTP.
 * The API return URL itself is not a handoff — that POST has to reach the server.
 */
export function isPaymentResultHandoffUrl(url: string): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;
  const path = urlPath(raw);
  if (
    /\/payments\/worldline\/return\/?$/.test(path) ||
    /\/worldline\/return\/?$/.test(path) ||
    /\/paynimo-return(?:\.html)?\/?$/.test(path)
  ) {
    return false;
  }
  const host = httpHost(raw);
  if (!host || host === 'api.selorg.com' || host.startsWith('api.')) return false;
  if (host !== 'selorg.com' && !host.endsWith('.selorg.com')) return false;
  const lower = raw.toLowerCase();
  if (lower.includes('paynimo_bridge')) return true;
  if (/\/checkout\/(payment|confirmation|failed)\/?$/.test(path)) return true;
  if (/\/account\/wallet\/?$/.test(path)) return true;
  if (/\/auth\/?$/.test(path)) return true;
  return false;
}

/**
 * Pages where the shopper may already be authorizing a charge.
 * Includes issuer ACS/OTP hosts and Worldline/TPSL card pages. Closing from
 * here must not abort — the bank may already have authorized.
 * Paynimo's own checkout shell is excluded until the card GET leaves it.
 */
export function isBankAuthenticationUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (isWorldlineReturnUrl(url)) return false;
  const host = httpHost(url);
  if (!host || isSelorgHost(host)) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false;
  if (host === 'paynimo.com' || host.endsWith('.paynimo.com')) return false;
  // Card / net-banking gateway hosts (tpsl-india.in, ingenico, worldline).
  if (isGatewayHost(host)) return true;
  return classifyCheckoutNavigation(url) === 'allow';
}

/**
 * True once checkout has handed off to a bank or Worldline card page.
 * Used to start server status polling while the WebView may still look blank.
 */
export function isCheckoutProgressUrl(url: string): boolean {
  return isBankAuthenticationUrl(url) || isPopupGatewayNavigation(url);
}
