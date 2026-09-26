/**
 * Normalized API error — every rejected request from `src/api/index.ts` resolves
 * to this shape, so screens/contexts branch on one consistent object.
 *
 * Modeled on the backend's error catalogue (see api_error_handling_reference):
 *
 *   status  HTTP status code (0 = network failure, 408 = client timeout)
 *   code    machine-readable code (e.g. USER_NOT_FOUND, CONFLICT, VALIDATION_ERROR)
 *   title   broad category ("Bad Request", "Conflict", …)
 *   message user-safe text — server `detail`/`message` when safe, else a generic fallback
 *   detail  raw server detail (kept even for 5xx, which never surface to the user)
 *   fieldErrors  per-field validation messages (422)
 */
export interface ApiError {
  /** Marker so `normalizeApiError` is idempotent. */
  __apiError?: true;
  status: number;
  code: string;
  title: string;
  message: string;
  detail?: string;
  fieldErrors?: Array<{ field: string; message: string }>;
  isNetworkError: boolean;
  isTimeout: boolean;
  /** Safe to offer the user a "try again" affordance. */
  retryable: boolean;
  /** Original payload, for logging. */
  raw?: unknown;
}

/** Broad category per HTTP status — matches the API reference's "Title" column. */
export const STATUS_TITLES: Record<number, string> = {
  0: 'Network Error',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  408: 'Request Timeout',
  409: 'Conflict',
  422: 'Validation Error',
  429: 'Too Many Requests',
  500: 'An unexpected error occurred',
  502: 'Upstream service error',
  503: 'Service Unavailable',
};

/** User-facing fallback when the server gives no safe message (or hides it, for 5xx). */
export const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  0: 'Cannot connect to the server. Please check your internet connection.',
  400: 'Something in the request was invalid. Please check your input and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do this.',
  404: 'We could not find what you were looking for.',
  408: 'The request timed out. Please try again.',
  409: 'That already exists. Try signing in instead.',
  422: 'Please correct the highlighted fields and try again.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again shortly.',
  502: 'A required service is unavailable right now. Please try again later.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
};

const DEFAULT_TITLE = 'Something went wrong';
const DEFAULT_MESSAGE = 'Something went wrong. Please try again.';

const isPlainObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Pull the machine code from any of the shapes the backend / gateways emit. */
const extractCode = (body: any, _status: number): string | undefined => {
  if (!isPlainObject(body)) return undefined;
  const appCode = body.error?.appCode ?? body.appCode;
  if (typeof appCode === 'string' && appCode.trim()) return appCode.trim();
  const candidates = [body.error?.details?.code, body.details?.code, body.code, body.error?.code];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim() && !/^\d+$/.test(raw.trim())) return raw.trim();
  }
  return undefined;
};

/** Pull a human message. `{status,title,detail}` (RFC7807-ish) or the app envelope. */
const extractDetail = (body: any): string | undefined => {
  if (typeof body === 'string') {
    const t = body.trim();
    return t && !t.startsWith('<') && !t.startsWith('{') ? t : undefined;
  }
  if (!isPlainObject(body)) return undefined;
  return (
    body.detail ||
    body.error?.message ||
    body.message ||
    body.title ||
    undefined
  );
};

const extractFieldErrors = (body: any): ApiError['fieldErrors'] => {
  const raw = isPlainObject(body) ? body.error?.details ?? body.details ?? body.errors : undefined;
  if (Array.isArray(raw)) {
    return raw
      .map((e: any) => ({
        field: String(e?.field ?? e?.path ?? ''),
        message: String(e?.message ?? e),
      }))
      .filter((e) => e.message);
  }
  if (isPlainObject(raw)) {
    return Object.entries(raw)
      .filter(([k]) => k !== 'code')
      .map(([field, v]: [string, any]) => ({
        field,
        message: String(v?.message ?? v),
      }));
  }
  return undefined;
};

/**
 * Convert whatever a request threw — a shaped reject from `src/api/index.ts`, a
 * raw `fetch` TypeError, an AbortError, or an already-normalized ApiError — into
 * a single `ApiError`.
 */
export function normalizeApiError(input: any): ApiError {
  // Already normalized.
  if (isPlainObject(input) && input.__apiError === true) return input as ApiError;

  const name: string = input?.name || '';
  const rawMessage: string = typeof input?.message === 'string' ? input.message : '';

  // --- Client-side network / timeout (no HTTP response) ---
  const isAbort = name === 'AbortError' || input?.status === 408;
  const isNetwork =
    input?.status === 0 ||
    /network request failed|failed to fetch|network error/i.test(rawMessage);

  if (isAbort || isNetwork) {
    const status = isAbort ? 408 : 0;
    return {
      __apiError: true,
      status,
      code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
      title: STATUS_TITLES[status],
      message: STATUS_FALLBACK_MESSAGES[status],
      detail: rawMessage || undefined,
      isNetworkError: !isAbort,
      isTimeout: isAbort,
      retryable: true,
      raw: input,
    } as ApiError;
  }

  // --- HTTP error with a response body ---
  const status: number =
    Number(input?.status) ||
    Number(input?.body?.status) ||
    Number(input?.body?.error?.code) ||
    500;

  const body = input?.body ?? input;
  const code = extractCode(body, status) || `HTTP_${status}`;
  const detail = extractDetail(body) || (rawMessage && !rawMessage.startsWith('{') ? rawMessage : undefined);
  const fieldErrors = status === 422 ? extractFieldErrors(body) : undefined;

  // 5xx server messages can leak internals — never show them; keep for logs only.
  const safeMessage =
    status >= 500
      ? STATUS_FALLBACK_MESSAGES[status] || STATUS_FALLBACK_MESSAGES[500]
      : detail || STATUS_FALLBACK_MESSAGES[status] || DEFAULT_MESSAGE;

  return {
    __apiError: true,
    status,
    code,
    title: STATUS_TITLES[status] || DEFAULT_TITLE,
    message: safeMessage,
    detail,
    fieldErrors,
    isNetworkError: false,
    isTimeout: false,
    retryable: status === 429 || status === 502 || status === 503 || status >= 500,
    raw: input,
  } as ApiError;
}

/** Shorthand for screens: `catch (e) { showToast(getErrorMessage(e)) }`. */
export function getErrorMessage(err: unknown, fallback = DEFAULT_MESSAGE): string {
  try {
    return normalizeApiError(err).message || fallback;
  } catch {
    return fallback;
  }
}

/** Machine code, for branching (`if (getErrorCode(e) === 'USER_NOT_FOUND')`). */
export function getErrorCode(err: unknown): string | undefined {
  try {
    return normalizeApiError(err).code;
  } catch {
    return undefined;
  }
}
