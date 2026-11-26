import { NativeModules, Platform } from 'react-native';
import { hasWorldlineGatewayPayload, txnStatusFromPaynimoMsg } from './worldline';

type SdkResult = Record<string, unknown>;

interface WeiplCheckoutNative {
  open: (options: SdkResult, onResponse: (result: SdkResult) => void, onError: (result: SdkResult) => void) => void;
}

function nativeCheckout(): WeiplCheckoutNative | null {
  const mod = (NativeModules as { WeiplCheckout?: Partial<WeiplCheckoutNative> }).WeiplCheckout;
  return mod && typeof mod.open === 'function' ? (mod as WeiplCheckoutNative) : null;
}

/** react-native-weipl-checkout is linked on Android only; iOS keeps the hosted WebView. */
export function isWorldlineSdkAvailable(): boolean {
  return Platform.OS === 'android' && nativeCheckout() !== null;
}

function asRecord(value: unknown): SdkResult {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as SdkResult) } : {};
}

/**
 * Paynimo's SDK parameters have no returnUrl: the signed result comes back through
 * the callback, not as a POST to our server.
 */
export function buildWorldlineSdkOptions(sessionPayload: SdkResult, overrides?: { paymentMode?: string }): SdkResult {
  const consumerData = asRecord(sessionPayload.consumerData);
  delete consumerData.returnUrl;
  delete consumerData.responseHandler;
  if (overrides?.paymentMode) consumerData.paymentMode = overrides.paymentMode;
  return {
    features: { ...asRecord(sessionPayload.features), enableAbortResponse: true },
    consumerData,
  };
}

export type WorldlineSdkOutcome =
  | { kind: 'verify'; response: SdkResult }
  | { kind: 'error'; message: string };

/** Only a signed gateway body goes to `/worldline/complete`; anything else is an SDK exit. */
export function classifyWorldlineSdkResult(result: unknown): WorldlineSdkOutcome {
  const record = asRecord(result);
  if (hasWorldlineGatewayPayload(record)) return { kind: 'verify', response: record };
  return { kind: 'error', message: String(record.error_desc || '').trim() };
}

/** Status code for logs. The msg itself carries the hash and must not be logged. */
export function worldlineSdkStatusCode(result: unknown): string {
  const record = asRecord(result);
  return txnStatusFromPaynimoMsg(record.msg) || String(record.error_code || '').trim();
}

export function openWorldlineSdk(
  options: SdkResult,
  onResponse: (result: SdkResult) => void,
  onError: (result: SdkResult) => void,
): boolean {
  const checkout = nativeCheckout();
  if (!checkout) return false;
  checkout.open(options, onResponse, onError);
  return true;
}
