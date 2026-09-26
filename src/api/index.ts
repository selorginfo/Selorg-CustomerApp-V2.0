// @ts-nocheck
/**
 * Core HTTP client for the Selorg customer app.
 *
 * Ported from UGEC's `src/api/index.ts` and extended with two Selorg needs:
 *   1. Multi-host fallback — retry the next candidate origin on a network error
 *      (handles wrong LAN IP / emulator loopback during local dev).
 *   2. Asset URL normalization — rewrite localhost/relative media URLs in the
 *      response body to the origin that actually answered.
 *
 * Uses native `fetch` (NOT axios) — axios uses XHR which breaks under the
 * React Native New Architecture.
 *
 * On success the parsed body is resolved directly. On failure it rejects with a
 * normalized `ApiError` (see `src/utils/apiError.ts`): `{ status, code, title,
 * message, detail?, fieldErrors?, isNetworkError, isTimeout, retryable }`.
 * `message` is always safe to show the user; `code` is for branching.
 */
import { Storage } from './storage';
import configs from './configs';
import { normalizeApiAssetUrl } from '../config/api';
import { normalizeApiError } from '../utils/apiError';

// Registered by App.tsx after the store is ready — avoids a circular import.
let _onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  _onUnauthorized = fn;
};

// ---------------------------------------------------------------------------
// Error shaping
// ---------------------------------------------------------------------------

// Error bodies vary in shape (validation errors, plain text, HTML from a
// gateway). Pull out a message that's safe to show a user instead of dumping
// the raw body. 5xx bodies can leak internals, so those never surface —
// callers fall back to their own copy when this returns undefined.
const friendlyErrorMessage = (errorBody: any, status: number) => {
  if (status >= 500) return undefined;
  if (typeof errorBody === 'string') {
    const trimmed = errorBody.trim();
    return trimmed && !trimmed.startsWith('<') && !trimmed.startsWith('{')
      ? trimmed
      : undefined;
  }
  if (errorBody && typeof errorBody === 'object') {
    return errorBody.message || errorBody.error || errorBody.detail || errorBody.title || undefined;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Response asset-URL normalization
// ---------------------------------------------------------------------------

const ASSET_KEY_PATTERN = /(image|images|video|thumbnail|avatar|logo|banner|icon|url)/i;

const normalizePayload = (value: any, keyName = ''): any => {
  if (typeof value === 'string') {
    return ASSET_KEY_PATTERN.test(keyName) ? normalizeApiAssetUrl(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map(entry =>
      typeof entry === 'string' && ASSET_KEY_PATTERN.test(keyName)
        ? normalizeApiAssetUrl(entry)
        : normalizePayload(entry),
    );
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc: Record<string, any>, [key, entry]) => {
      acc[key] = normalizePayload(entry, key);
      return acc;
    }, {});
  }
  return value;
};

// ---------------------------------------------------------------------------
// Query serialization
// ---------------------------------------------------------------------------

const serializeQueryParams = (url: string, params: Record<string, any> = {}) => {
  const entries = Object.keys(params).filter(
    key => params[key] !== undefined && params[key] !== null && params[key] !== '',
  );
  if (!entries.length) return url;
  const separator = url.includes('?') ? '&' : '?';
  const query = entries
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
  return `${url}${separator}${query}`;
};

// ---------------------------------------------------------------------------
// Dev-only logging (silent in production so we never leak OTPs / tokens)
// ---------------------------------------------------------------------------

const isDevLoggingEnabled = () => configs.APP_ENV === 'dev';

const redactHeaders = (headers: Record<string, string>) =>
  Object.keys(headers).reduce((acc: Record<string, string>, key) => {
    acc[key] = key.toLowerCase() === 'authorization' ? '[REDACTED]' : headers[key];
    return acc;
  }, {});

let requestSeq = 0;

const logRequest = (id: number, method: string, url: string, headers: any, body: any) => {
  if (!isDevLoggingEnabled()) return;
  console.log(`[API →] #${id} ${method} ${url}`, {
    headers: redactHeaders(headers),
    body: body instanceof FormData ? '[FormData]' : body,
  });
};

const logResponse = (id: number, status: number, url: string, body: any) => {
  if (!isDevLoggingEnabled()) return;
  console.log(`[API ←] #${id} ${status} ${url}`, body);
};

const logRequestError = (id: number, url: string, error: any) => {
  if (!isDevLoggingEnabled()) return;
  console.log(`[API ✕] #${id} ${url}`, error?.message || error);
};

// ---------------------------------------------------------------------------
// Request core
// ---------------------------------------------------------------------------

const isNetworkError = (err: any) =>
  err?.name === 'AbortError' ||
  err?.message?.includes('Network request failed') ||
  err?.message?.includes('Failed to fetch');

/** Upstream/gateway failures — try the next local/dev host when available. */
const isRetryableHostError = (err: any) =>
  isNetworkError(err) ||
  (err?.__apiError === true && (err.status === 502 || err.status === 503));

const buildRequestInit = (options: any) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    ...(options.header || {}),
  };

  const token = Storage.getItem('accessToken');
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: any = { method: options.method, headers };

  if (options.data !== undefined) {
    if (options.data instanceof FormData) {
      init.body = options.data;
      delete headers['Content-Type'];
    } else {
      init.body =
        typeof options.data !== 'string' ? JSON.stringify(options.data) : options.data;
    }
  } else if (options.body !== undefined) {
    init.body = options.body;
  }

  return { init, headers };
};

const performFetch = async (finalUrl: string, options: any, requestId: number) => {
  const { init, headers } = buildRequestInit(options);
  logRequest(requestId, init.method, finalUrl, headers, options.data);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? configs.REQUEST_TIMEOUT_MS,
  );
  init.signal = options.signal ?? controller.signal;

  try {
    const response = await fetch(finalUrl, init);
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    const isJson = /[/+]json/i.test(contentType);

    if (response.ok) {
      if (response.status === 204) {
        logResponse(requestId, 204, finalUrl, null);
        return null;
      }
      const raw = isJson ? await response.json() : await response.text();
      const result = typeof raw === 'string' ? raw : normalizePayload(raw);
      logResponse(requestId, response.status, finalUrl, result);
      return result;
    }

    let errorBody: any;
    try {
      errorBody = isJson ? await response.json() : await response.text();
    } catch {
      errorBody = `Server error: ${response.status} ${response.statusText}`;
    }
    logResponse(requestId, response.status, finalUrl, errorBody);

    if (response.status === 401) _onUnauthorized?.();

    return Promise.reject(
      normalizeApiError({
        status: response.status,
        statusText: response.statusText,
        message: friendlyErrorMessage(errorBody, response.status),
        body: errorBody,
      }),
    );
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.__apiError) return Promise.reject(err); // already normalized (HTTP error)
    throw err; // network error — bubble up so sendRequest can try a fallback host
  }
};

const sendRequest = async (url: string, options: any, fullURL = false): Promise<any> => {
  const hosts: string[] =
    fullURL || /^https?:\/\//i.test(url)
      ? ['']
      : Array.from(new Set([configs.API_HOST, ...configs.API_HOSTS].filter(Boolean)));

  const requestId = ++requestSeq;
  let lastError: any;

  for (let i = 0; i < hosts.length; i++) {
    const base = hosts[i];
    const path = base ? base + url : url;
    const finalUrl = options.query ? serializeQueryParams(path, options.query) : path;

    try {
      return await performFetch(finalUrl, options, requestId);
    } catch (err: any) {
      lastError = err?.__apiError ? err : normalizeApiError(err);
      const hasNext = i < hosts.length - 1;
      if (hasNext && isRetryableHostError(err)) {
        console.warn(
          `[API] ${base || finalUrl} failed (${lastError.status || 'network'}), trying next host…`,
        );
        continue;
      }
      if (err?.__apiError) return Promise.reject(err);
      logRequestError(requestId, finalUrl, err);
      return Promise.reject(lastError);
    }
  }

  logRequestError(requestId, url, lastError);
  return Promise.reject(normalizeApiError(lastError ?? { status: 0 }));
};

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------

const SelorgApi = {
  get: (url: string, options: any = {}) =>
    sendRequest(url, { ...options, method: 'GET' }),
  getURL: (url: string, options: any = {}) =>
    sendRequest(url, { ...options, method: 'GET' }, true),
  getBulk: (urlList: string[], options: any = {}) =>
    Promise.all(urlList.map(endpoint => sendRequest(endpoint, { ...options, method: 'GET' }))),
  post: (url: string, options: any = {}) =>
    sendRequest(url, { ...options, method: options.method || 'POST' }),
  update: (url: string, options: any = {}) =>
    sendRequest(url, { ...options, method: 'PUT' }),
  patch: (url: string, options: any = {}) =>
    sendRequest(url, { ...options, method: 'PATCH' }),
  delete: (url: string, options: any = {}) =>
    sendRequest(url, { ...options, method: 'DELETE' }),
};

export default SelorgApi;
