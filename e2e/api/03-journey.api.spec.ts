import { test, expect, APIRequestContext } from "@playwright/test";
import { apiCall, createApiContext, extractProductId, loginWithTestOtp } from "../helpers/api";

/**
 * End-to-end API user journey matching customer-app screens:
 * Login → Profile → Address → Catalog → Cart → Checkout/Order → Wallet → Logout
 * Real backend only. Native Detox UI E2E is not configured — this is the flow layer.
 */
test.describe.configure({ mode: "serial" });

let ctx: APIRequestContext;
let token: string;
let productId: string | undefined;
let addressId: string | undefined;
let orderId: string | undefined;
let createdAddressId: string | undefined;

test.beforeAll(async () => {
  ctx = await createApiContext();
});

test.afterAll(async () => {
  if (createdAddressId && token) {
    await apiCall(ctx, "DELETE", `/addresses/${createdAddressId}`, { token }).catch(() => undefined);
  }
  if (token) {
    await apiCall(ctx, "DELETE", "/cart/clear", { token }).catch(() => undefined);
  }
  await ctx.dispose();
});

test("1. Login / OTP (EnterMobile → OTP screens)", async () => {
  const auth = await loginWithTestOtp(ctx);
  token = auth.token;
  expect(token).toBeTruthy();
});

test("2. Session — profile load (AuthContext persistence shape)", async () => {
  const res = await apiCall(ctx, "GET", "/user/profile", { token });
  expect(res.status).toBe(200);
  expect(res.json?.data).toBeTruthy();
  expect((res.json?.data as { _id?: string })._id).toBeTruthy();
});

test("3. Address create/list (AddAddress / AddressContext)", async () => {
  const list = await apiCall<Array<{ _id: string }>>(ctx, "GET", "/addresses", { token });
  expect(list.status).toBe(200);
  const existing = (list.json?.data as Array<{ _id: string }> | undefined) || [];
  if (existing.length) {
    addressId = existing[0]._id;
    return;
  }
  const created = await apiCall<{ _id: string }>(ctx, "POST", "/addresses", {
    token,
    body: {
      label: "Home",
      line1: "Customer E2E Flow Street",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600001",
      latitude: 13.0827,
      longitude: 80.2707,
    },
  });
  expect([200, 201], JSON.stringify(created.json)).toContain(created.status);
  addressId = created.json!.data!._id;
  createdAddressId = addressId;
});

test("4. Product / category / search (Home / Search / Categories)", async () => {
  const home = await apiCall(ctx, "GET", "/home");
  expect(home.status).toBeLessThan(500);
  const search = await apiCall(ctx, "GET", "/products/search?q=organic&page=1&limit=10");
  productId = extractProductId(search.json?.data);
  if (!productId) {
    const cats = await apiCall(ctx, "GET", "/categories");
    const cat = (cats.json?.data as Array<{ _id?: string; slug?: string }> | undefined)?.[0];
    const key = cat?._id || cat?.slug;
    if (key) {
      const prods = await apiCall(ctx, "GET", `/categories/${key}/products?limit=5`);
      productId = extractProductId(prods.json?.data);
    }
  }
  test.skip(!productId, "BLOCKED: no catalog products available");
  const detail = await apiCall(ctx, "GET", `/products/${productId}`);
  expect(detail.status).toBeLessThan(500);
});

test("5. Cart add / read (Cart screen)", async () => {
  test.skip(!productId, "no product");
  await apiCall(ctx, "DELETE", "/cart/clear", { token });
  const add = await apiCall(ctx, "POST", "/cart/items", {
    token,
    body: { productId, quantity: 1 },
  });
  expect(add.status, JSON.stringify(add.json)).toBe(200);
  const cart = await apiCall<{ items: unknown[]; total?: number; itemTotal?: number }>(ctx, "GET", "/cart", {
    token,
  });
  expect(cart.status).toBe(200);
  expect(((cart.json?.data as { items?: unknown[] })?.items || []).length).toBeGreaterThan(0);
});

test("6. Checkout — create order COD (checkout screen)", async () => {
  test.skip(!productId || !addressId, "missing product or address");
  const res = await apiCall<{ _id?: string; id?: string; orderNumber?: string; requiresOnlinePayment?: boolean }>(
    ctx,
    "POST",
    "/orders",
    {
      token,
      body: {
        items: [{ productId, quantity: 1 }],
        addressId,
        paymentMethodType: "cash",
        deliveryNotes: "Customer-app Playwright audit — do not fulfill",
      },
      headers: { "Idempotency-Key": `rn-order-${Date.now()}` },
    },
  );
  if (res.status >= 500) {
    expect(res.status, `Server error creating order: ${JSON.stringify(res.json)}`).toBeLessThan(500);
  }
  // Backend returns 201 Created with `id` (formatOrderForApp), not always 200/`_id`.
  if ((res.status === 200 || res.status === 201) && res.json?.success) {
    orderId = res.json.data?._id || res.json.data?.id;
    expect(orderId || res.json.data?.orderNumber).toBeTruthy();
  } else {
    expect(
      res.status,
      `Order create returned ${res.status}: ${JSON.stringify(res.json)}. Treat as domain/config if 4xx.`,
    ).toBeLessThan(500);
  }
});

test("7. Order status / tracking / invoice / can-cancel", async () => {
  test.skip(!orderId, "No order created in previous step (domain rejection or empty catalog)");
  const detail = await apiCall(ctx, "GET", `/orders/${orderId}`, { token });
  expect(detail.status).toBe(200);
  const status = await apiCall(ctx, "GET", `/orders/${orderId}/status`, { token });
  expect(status.status).toBeLessThan(500);
  const tracking = await apiCall(ctx, "GET", `/orders/${orderId}/tracking`, { token });
  expect(tracking.status).toBeLessThan(500);
  const canCancel = await apiCall(ctx, "GET", `/orders/${orderId}/can-cancel`, { token });
  expect(canCancel.status).toBeLessThan(500);
  const invoice = await apiCall(ctx, "GET", `/orders/${orderId}/invoice`, { token });
  expect(invoice.status).toBeLessThan(500);
});

test("8. Payment Worldline session (android platform — payments.service)", async () => {
  test.skip(!orderId, "No order");
  const session = await apiCall(ctx, "POST", "/payments/worldline/session", {
    token,
    body: { orderId, platform: "android" },
  });
  expect(session.status).toBeLessThan(500);
  if (session.status === 200) {
    expect(session.json?.success).toBe(true);
  }
});

test("9. Wallet balance / transactions (Wallet screen)", async () => {
  const res = await apiCall(ctx, "GET", "/wallet/balance", { token });
  expect(res.status).toBe(200);
  expect(typeof (res.json?.data as { balance?: number })?.balance === "number" || res.json?.data).toBeTruthy();
  const tx = await apiCall(ctx, "GET", "/wallet/transactions?limit=10", { token });
  expect(tx.status).toBe(200);
});

test("10. Logout + token post-logout probe", async () => {
  const res = await apiCall(ctx, "POST", "/auth/logout", { token });
  expect(res.status).toBeLessThan(500);
  const after = await apiCall(ctx, "GET", "/user/profile", { token });
  expect([401, 403], `Expected revoked token to fail; got ${after.status}`).toContain(after.status);
});

test("11. CRITICAL: re-login after logout must return a usable NEW token", async () => {
  const oldToken = token;
  // Backend bug observed: verify-otp may re-issue the same JWT that was just revoked.
  const auth = await loginWithTestOtp(ctx);
  token = auth.token;
  const profile = await apiCall(ctx, "GET", "/user/profile", { token });
  expect(
    profile.status,
    `AUTH SESSION BUG: after logout, re-login token unusable (${profile.status}). ` +
      `sameJwtAsRevoked=${token === oldToken}. body=${JSON.stringify(profile.json)}`,
  ).toBe(200);
  expect(token === oldToken, "Re-login must mint a distinct accessToken after logout revoke").toBe(false);
});
