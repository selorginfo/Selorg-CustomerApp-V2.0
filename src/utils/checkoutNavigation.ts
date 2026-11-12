import { httpHost, isWorldlineReturnUrl } from './worldline';

const UPI_SCHEMES = ['upi:', 'phonepe:', 'paytmmp:', 'tez:', 'gpay:'];
const UPI_INTENT_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user',
  'com.phonepe.app',
  'net.one97.paytm',
  'in.org.npci.upiapp',
];

const GATEWAY_SUFFIXES = ['paynimo.com', 'worldline.com', 'tpsl-india.in', 'ingenico.com'];

/** Issuer ACS / OTP hostnames. HTTPS bank pages are allowed separately. */
const ACS_HOST_RE = /(^|\.)(acs|3ds|3dsecure|securecode|otp)([.-]|$)/i;
const ACS_PATH_RE = /\/(acs|3ds|3dsecure|otp|pareq|pares)(\/|$|\?)/i;

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
 * A page that is not Paynimo and not Selorg. Closing from here must not abort,
 * because the issuer may already have the card authorization.
 */
export function isBankAuthenticationUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (isWorldlineReturnUrl(url)) return false;
  const host = httpHost(url);
  if (!host || isGatewayHost(host) || isSelorgHost(host)) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return false;
  return classifyCheckoutNavigation(url) === 'allow';
}
