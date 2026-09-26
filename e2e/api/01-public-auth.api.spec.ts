import { test, expect, APIRequestContext } from "@playwright/test";
import { apiCall, assertEnvelopeSuccess, createApiContext, loginWithTestOtp } from "../helpers/api";
import { API_BASE, APP_API_BASE } from "../helpers/env";

let ctx: APIRequestContext;

test.beforeAll(async () => {
  ctx = await createApiContext();
});

test.afterAll(async () => {
  await ctx.dispose();
});

test.describe("Environment & connectivity", () => {
  test("backend is reachable on configured API_BASE", async () => {
    const res = await apiCall(ctx, "GET", "/bootstrap");
    expect(res.networkError, `BLOCKED: backend unavailable at ${API_BASE} — ${res.networkError}`).toBeFalsy();
    expect(res.status).toBeGreaterThan(0);
    expect(res.status).toBe(200);
  });

  test("customer-app DEV_API_BASE_URL path resolves (APP_API_BASE)", async () => {
    const res = await ctx.fetch(`${APP_API_BASE}/bootstrap`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(res.status(), `APP_API_BASE=${APP_API_BASE}`).toBe(200);
  });

  test("OPTIONS preflight on bootstrap (WebView / hybrid checkout relevance)", async () => {
    const res = await ctx.fetch(`${API_BASE}/api/v1/customer/bootstrap`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    // RN fetch itself is not CORS-bound; Worldline WebView may be. Soft assert.
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe("Public / guest-tolerant APIs used by customer app", () => {
  const publicGets: Array<{ name: string; path: string; expectData?: boolean }> = [
    { name: "bootstrap", path: "/bootstrap", expectData: true },
    { name: "app-config", path: "/app-config" },
    { name: "home", path: "/home" },
    { name: "categories", path: "/categories", expectData: true },
    { name: "products search (short q)", path: "/products/search?q=ab&page=1&limit=5" },
    { name: "products search (valid q)", path: "/products/search?q=milk&page=1&limit=5" },
    { name: "search suggestions", path: "/products/search/suggestions?q=mi" },
    { name: "trending searches", path: "/products/search/trending" },
    { name: "legal terms", path: "/legal/terms" },
    { name: "legal privacy", path: "/legal/privacy" },
    { name: "legal config", path: "/legal/config" },
    { name: "legal license", path: "/legal/license" },
    { name: "locations approximate", path: "/locations/approximate" },
    { name: "locations suggestions", path: "/locations/suggestions?q=chennai" },
  ];

  for (const ep of publicGets) {
    test(`GET ${ep.path} — ${ep.name}`, async () => {
      const res = await apiCall(ctx, "GET", ep.path);
      assertEnvelopeSuccess(res, ep.name);
      expect(res.status, `${ep.name} status`).toBeLessThan(500);
      if (ep.expectData && res.status === 200) {
        expect(res.json?.data, `${ep.name} missing data`).toBeTruthy();
      }
    });
  }

  test("GET /categories then products + subcategories", async () => {
    const cats = await apiCall<{ _id?: string; id?: string; slug?: string }[]>(ctx, "GET", "/categories");
    assertEnvelopeSuccess(cats, "categories");
    const list = Array.isArray(cats.json?.data) ? cats.json!.data! : [];
    test.skip(list.length === 0, "No categories in backend — catalog empty (data issue, not contract)");
    const first = list[0] as { _id?: string; id?: string; slug?: string };
    const id = first._id || first.id || first.slug;
    expect(id).toBeTruthy();
    const byId = await apiCall(ctx, "GET", `/categories/${id}`);
    expect(byId.status).toBeLessThan(500);
    const products = await apiCall(ctx, "GET", `/categories/${id}/products?page=1&limit=5`);
    expect(products.status).toBeLessThan(500);
    const subs = await apiCall(ctx, "GET", `/categories/${id}/subcategories`);
    expect(subs.status).toBeLessThan(500);
  });

  test("GET /home then sections/collections used by Home screen", async () => {
    const home = await apiCall<Record<string, unknown>>(ctx, "GET", "/home");
    assertEnvelopeSuccess(home, "home");
    for (const key of ["hero_banner", "bestsellers", "trending"]) {
      const section = await apiCall(ctx, "GET", `/sections/${key}/products?page=1&limit=4`);
      expect(section.status, `section ${key}`).toBeLessThan(500);
    }
    const collection = await apiCall(ctx, "GET", "/collections/featured?page=1&limit=4");
    expect(collection.status).toBeLessThan(500);
  });

  test("POST /store/assign with Chennai coords", async () => {
    const res = await apiCall(ctx, "POST", "/store/assign", {
      body: { latitude: 13.0827, longitude: 80.2707 },
    });
    expect(res.networkError).toBeFalsy();
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) expect(res.json?.success).toBe(true);
  });

  test("GET delivery estimate/fee when store assign returns storeId", async () => {
    const assign = await apiCall<{
      storeId?: string;
      store?: { _id?: string; id?: string };
      serviceable?: boolean;
    }>(ctx, "POST", "/store/assign", {
      body: { latitude: 13.0827, longitude: 80.2707 },
    });
    // Backend returns top-level { serviceable, store } (not always nested under data).
    const payload = (assign.json?.data || assign.json) as
      | { storeId?: string; store?: { _id?: string; id?: string }; serviceable?: boolean }
      | undefined;
    const storeId = payload?.storeId || payload?.store?._id || payload?.store?.id;
    test.skip(!storeId, "No store assigned for test coords — blocked by geo/store data");
    const estimate = await apiCall(
      ctx,
      "GET",
      `/delivery/estimate?storeId=${storeId}&latitude=13.0827&longitude=80.2707&cartItemCount=2`,
    );
    expect(estimate.status).toBeLessThan(500);
    const fee = await apiCall(
      ctx,
      "GET",
      `/delivery/fee?storeId=${storeId}&latitude=13.0827&longitude=80.2707&orderTotal=500`,
    );
    expect(fee.status).toBeLessThan(500);
  });
});

test.describe("Auth-gated APIs without token (negative)", () => {
  const gated: Array<{ method: "GET" | "POST" | "PUT" | "DELETE"; path: string; body?: unknown }> = [
    { method: "GET", path: "/user/profile" },
    { method: "GET", path: "/addresses" },
    { method: "GET", path: "/addresses/default" },
    { method: "GET", path: "/cart" },
    { method: "GET", path: "/orders" },
    { method: "GET", path: "/wallet/balance" },
    { method: "GET", path: "/wallet/transactions?limit=10" },
    { method: "GET", path: "/notifications?page=1&limit=10" },
    { method: "GET", path: "/notifications/preferences" },
    { method: "GET", path: "/refunds?page=1&limit=10" },
    { method: "GET", path: "/support/tickets" },
    { method: "GET", path: "/payments/methods" },
    { method: "POST", path: "/orders", body: { items: [], addressId: "x" } },
    { method: "POST", path: "/wallet/debit", body: { amount: 1 } },
  ];

  for (const ep of gated) {
    test(`${ep.method} ${ep.path} without token → 401/403`, async () => {
      const res = await apiCall(ctx, ep.method, ep.path, { body: ep.body });
      expect(res.networkError).toBeFalsy();
      expect([401, 403], `${ep.path} got ${res.status} ${JSON.stringify(res.json)}`).toContain(res.status);
    });
  }

  test("POST /auth/logout without token is idempotent (200)", async () => {
    const res = await apiCall(ctx, "POST", "/auth/logout");
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
  });

  test("GET /coupons without token (auth-optional contract)", async () => {
    const res = await apiCall(ctx, "GET", "/coupons");
    expect(res.networkError).toBeFalsy();
    expect(res.status).toBeLessThan(500);
  });

  test("invalid Bearer token → 401", async () => {
    const res = await apiCall(ctx, "GET", "/user/profile", { token: "invalid.jwt.token" });
    expect([401, 403]).toContain(res.status);
  });

  test("malformed Authorization header → 401", async () => {
    const res = await apiCall(ctx, "GET", "/user/profile", {
      headers: { Authorization: "NotBearer abc" },
    });
    expect([401, 403]).toContain(res.status);
  });
});

test.describe("OTP auth contract (customer AuthContext)", () => {
  test("send-otp rejects missing identifier", async () => {
    const res = await apiCall(ctx, "POST", "/auth/send-otp", {
      body: { preferredChannel: "sms" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.json?.success).toBe(false);
  });

  test("send-otp rejects invalid phone", async () => {
    const res = await apiCall(ctx, "POST", "/auth/send-otp", {
      body: { phoneNumber: "123", preferredChannel: "sms" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("verify-otp rejects wrong otp", async () => {
    const send = await apiCall<{ sessionId: string }>(ctx, "POST", "/auth/send-otp", {
      body: { phoneNumber: "+919698790921", preferredChannel: "sms", intent: "login" },
    });
    expect(send.status).toBe(200);
    const sessionId = send.json?.data?.sessionId;
    const verify = await apiCall(ctx, "POST", "/auth/verify-otp", {
      body: { sessionId, otp: "0000" },
    });
    expect(verify.status).toBeGreaterThanOrEqual(400);
    expect(verify.status).toBeLessThan(500);
    expect(verify.json?.success).toBe(false);
  });

  test("verify-otp rejects missing fields", async () => {
    const res = await apiCall(ctx, "POST", "/auth/verify-otp", { body: {} });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("resend-otp with invalid session → 4xx", async () => {
    const res = await apiCall(ctx, "POST", "/auth/resend-otp", {
      body: { sessionId: "000000000000000000000000" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("login with fixed test OTP succeeds and returns accessToken + user", async () => {
    const { token, user } = await loginWithTestOtp(ctx);
    expect(token.split(".").length).toBe(3);
    expect(user._id).toBeTruthy();
  });
});
