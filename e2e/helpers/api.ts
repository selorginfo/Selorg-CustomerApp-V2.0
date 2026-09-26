import { APIRequestContext, expect, request } from "@playwright/test";
import { API_BASE, CUSTOMER_PREFIX, TEST_OTP, TEST_PHONE_E164, customerUrl } from "./env";

export type Envelope<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: { code?: string | number; appCode?: string; message?: string; details?: unknown } | null;
  pagination?: unknown;
  timestamp?: string;
};

export type ApiCallResult<T = unknown> = {
  status: number;
  ok: boolean;
  json: Envelope<T> | null;
  headers: Record<string, string>;
  url: string;
  method: string;
  durationMs: number;
  networkError?: string;
};

export async function createApiContext(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Accept: "application/json", "Content-Type": "application/json" },
    timeout: 30_000,
  });
}

export async function apiCall<T = unknown>(
  ctx: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  opts?: {
    body?: unknown;
    token?: string | null;
    headers?: Record<string, string>;
    skipPrefix?: boolean;
  },
): Promise<ApiCallResult<T>> {
  const url = opts?.skipPrefix
    ? path.startsWith("http")
      ? path
      : `${API_BASE}${path}`
    : path.startsWith("http")
      ? path
      : customerUrl(path);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(opts?.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    ...opts?.headers,
  };

  const started = Date.now();
  try {
    const res = await ctx.fetch(url, {
      method,
      headers,
      data: opts?.body !== undefined ? opts.body : undefined,
    });
    const text = await res.text();
    let json: Envelope<T> | null = null;
    try {
      json = text ? (JSON.parse(text) as Envelope<T>) : null;
    } catch {
      json = null;
    }
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers())) h[k.toLowerCase()] = v;
    return {
      status: res.status(),
      ok: res.ok(),
      json,
      headers: h,
      url,
      method,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      status: 0,
      ok: false,
      json: null,
      headers: {},
      url,
      method,
      durationMs: Date.now() - started,
      networkError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function loginWithTestOtp(ctx: APIRequestContext): Promise<{
  token: string;
  user: { _id: string; phoneNumber: string | null; email: string | null; name: string };
  sessionId: string;
}> {
  let send = await apiCall<{ sessionId: string }>(ctx, "POST", "/auth/send-otp", {
    body: { phoneNumber: TEST_PHONE_E164, preferredChannel: "sms", intent: "login" },
  });
  expect(send.networkError, `Backend unreachable: ${send.networkError}`).toBeFalsy();
  if (send.status === 404 && send.json?.error?.appCode === "USER_NOT_FOUND") {
    send = await apiCall<{ sessionId: string }>(ctx, "POST", "/auth/send-otp", {
      body: { phoneNumber: TEST_PHONE_E164, preferredChannel: "sms", intent: "signup" },
    });
  }
  expect(send.status, `send-otp failed: ${JSON.stringify(send.json)}`).toBe(200);
  expect(send.json?.success).toBe(true);
  const sessionId = send.json?.data?.sessionId;
  expect(sessionId).toBeTruthy();

  const verify = await apiCall<{
    accessToken: string;
    user: { _id: string; phoneNumber: string | null; email: string | null; name: string };
  }>(ctx, "POST", "/auth/verify-otp", {
    body: { sessionId, otp: TEST_OTP },
  });
  expect(verify.status, `verify-otp failed: ${JSON.stringify(verify.json)}`).toBe(200);
  expect(verify.json?.data?.accessToken).toBeTruthy();

  return {
    token: verify.json!.data!.accessToken,
    user: verify.json!.data!.user,
    sessionId: sessionId!,
  };
}

/** Mirrors frontend catalog/cart product id extraction. */
export function extractProductId(data: unknown): string | undefined {
  if (!data) return undefined;
  if (Array.isArray(data) && data[0]) {
    const p = data[0] as { _id?: string; id?: string; productId?: string };
    return p._id || p.id || p.productId;
  }
  if (typeof data === "object") {
    const obj = data as { products?: Array<{ _id?: string; id?: string }>; product?: { _id?: string; id?: string } };
    if (obj.products?.[0]) return obj.products[0]._id || obj.products[0].id;
    if (obj.product) return obj.product._id || obj.product.id;
  }
  return undefined;
}

export function assertEnvelopeSuccess(result: ApiCallResult, label: string) {
  expect(result.networkError, `${label}: network error ${result.networkError}`).toBeFalsy();
  expect(result.status, `${label}: unexpected status ${result.status} body=${JSON.stringify(result.json)}`).toBeLessThan(500);
  expect(result.json, `${label}: non-JSON body`).toBeTruthy();
  if (result.status >= 200 && result.status < 300) {
    expect(result.json!.success, `${label}: success=false`).toBe(true);
  }
}

export { API_BASE, CUSTOMER_PREFIX, customerUrl };
