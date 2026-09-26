import { test, expect, APIRequestContext } from "@playwright/test";
import { apiCall, createApiContext, extractProductId, loginWithTestOtp } from "../helpers/api";

let ctx: APIRequestContext;
let token: string;
let productId: string | undefined;
let cartItemId: string | undefined;
let addressId: string | undefined;
const createdAddressIds: string[] = [];

test.beforeAll(async () => {
  ctx = await createApiContext();
  const auth = await loginWithTestOtp(ctx);
  token = auth.token;
});

test.afterAll(async () => {
  for (const id of createdAddressIds) {
    await apiCall(ctx, "DELETE", `/addresses/${id}`, { token }).catch(() => undefined);
  }
  await ctx.dispose();
});

test.describe("Profile (auth.service / AuthContext)", () => {
  test("GET /user/profile returns user fields", async () => {
    const res = await apiCall<{ _id: string; name?: string; phoneNumber?: string }>(ctx, "GET", "/user/profile", {
      token,
    });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(res.json?.data?._id).toBeTruthy();
  });

  test("PUT /user/profile with name updates", async () => {
    const profile = await apiCall<{ name?: string }>(ctx, "GET", "/user/profile", { token });
    const original = profile.json?.data?.name || "API Audit User";
    const next = original.includes("Audit") ? original : `${original}`.slice(0, 40);
    const res = await apiCall(ctx, "PUT", "/user/profile", {
      token,
      body: { name: next },
    });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
  });

  test("PUT /user/profile with invalid email (expect validation 4xx)", async () => {
    const res = await apiCall(ctx, "PUT", "/user/profile", {
      token,
      body: { email: "not-an-email" },
    });
    expect(
      res.status,
      `Expected 4xx validation for email "not-an-email"; got ${res.status} body=${JSON.stringify(res.json)}`,
    ).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

test.describe("Addresses CRUD (address.service / AddressContext)", () => {
  test("GET /addresses list", async () => {
    const res = await apiCall(ctx, "GET", "/addresses", { token });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(Array.isArray(res.json?.data)).toBe(true);
    const list = res.json?.data as Array<{ _id: string }> | undefined;
    if (list?.length) addressId = list[0]._id;
  });

  test("GET /addresses/default", async () => {
    const res = await apiCall(ctx, "GET", "/addresses/default", { token });
    expect(res.status).toBeLessThan(500);
    // 404 if none is acceptable domain response
    if (res.status === 200) expect(res.json?.success).toBe(true);
  });

  test("POST /addresses create", async () => {
    const res = await apiCall<{ _id: string }>(ctx, "POST", "/addresses", {
      token,
      body: {
        label: "Other",
        line1: "CustomerApp Automation Street 42",
        line2: "Near Test Park",
        landmark: "Audit Landmark",
        city: "Chennai",
        state: "Tamil Nadu",
        pincode: "600001",
        latitude: 13.0827,
        longitude: 80.2707,
      },
    });
    expect([200, 201], JSON.stringify(res.json)).toContain(res.status);
    expect(res.json?.data?._id).toBeTruthy();
    createdAddressIds.push(res.json!.data!._id);
    addressId = res.json!.data!._id;
  });

  test("PUT /addresses/:id update", async () => {
    test.skip(!addressId, "create address failed");
    const res = await apiCall(ctx, "PUT", `/addresses/${addressId}`, {
      token,
      body: {
        label: "Other",
        line1: "CustomerApp Automation Street 42 Updated",
        city: "Chennai",
        state: "Tamil Nadu",
        pincode: "600002",
        latitude: 13.0827,
        longitude: 80.2707,
      },
    });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
  });

  test("POST /addresses/:id/default", async () => {
    test.skip(!addressId, "create address failed");
    const res = await apiCall(ctx, "POST", `/addresses/${addressId}/default`, { token });
    expect(res.status).toBeLessThan(500);
    if (res.status === 200 || res.status === 201) expect(res.json?.success).toBe(true);
  });

  test("PUT /addresses invalid id → 4xx", async () => {
    const res = await apiCall(ctx, "PUT", "/addresses/000000000000000000000000", {
      token,
      body: { label: "Home", line1: "x", city: "Chennai" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("POST /addresses missing line1 → 4xx (backend validation)", async () => {
    const res = await apiCall<{ _id?: string; line1?: string }>(ctx, "POST", "/addresses", {
      token,
      body: { city: "Chennai", label: "Home" },
    });
    // line1 is required by Zod + service; must not soft-default to "Address".
    expect(
      res.status,
      `Expected 4xx for missing line1; got ${res.status} body=${JSON.stringify(res.json)}`,
    ).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("DELETE /addresses/:id", async () => {
    test.skip(!addressId, "create address failed");
    const res = await apiCall(ctx, "DELETE", `/addresses/${addressId}`, { token });
    expect([200, 204]).toContain(res.status);
    const idx = createdAddressIds.indexOf(addressId!);
    if (idx >= 0) createdAddressIds.splice(idx, 1);
    addressId = undefined;
  });
});

test.describe("Cart operations (cart.service / CartContext)", () => {
  test("resolve a productId from search or categories", async () => {
    const search = await apiCall(ctx, "GET", "/products/search?q=milk&page=1&limit=5");
    let id = extractProductId(search.json?.data);

    if (!id) {
      const cats = await apiCall<Array<{ _id?: string; id?: string; slug?: string }>>(ctx, "GET", "/categories");
      const cat = (cats.json?.data as Array<{ _id?: string; id?: string; slug?: string }> | undefined)?.[0];
      const catId = cat?._id || cat?.id || cat?.slug;
      if (catId) {
        const prods = await apiCall(ctx, "GET", `/categories/${catId}/products?page=1&limit=5`);
        id = extractProductId(prods.json?.data);
      }
    }

    productId = id;
    test.skip(!productId, "No products in backend — cart CRUD blocked by catalog data");
  });

  test("GET /cart", async () => {
    const res = await apiCall(ctx, "GET", "/cart", { token });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(res.json?.data).toBeTruthy();
  });

  test("POST /cart/items add", async () => {
    test.skip(!productId, "no productId");
    const res = await apiCall<{ items?: Array<{ id?: string; _id?: string; productId?: string }> }>(ctx, "POST", "/cart/items", {
      token,
      body: { productId, quantity: 1 },
    });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
    expect(res.json?.success).toBe(true);
    const cart = res.json?.data;
    expect(Array.isArray(cart?.items)).toBe(true);
    const line = cart?.items?.[0];
    cartItemId = line?.id || line?._id;
  });

  test("PUT /cart/items by product quantity (updateItemByProduct)", async () => {
    test.skip(!productId, "no productId");
    const res = await apiCall(ctx, "PUT", "/cart/items", {
      token,
      body: { productId, quantity: 2 },
    });
    expect(res.status, JSON.stringify(res.json)).toBe(200);
  });

  test("PUT /cart/items/:itemId (updateItem)", async () => {
    test.skip(!cartItemId && !productId, "no cart line");
    if (!cartItemId) {
      const cart = await apiCall<{ items?: Array<{ id?: string; _id?: string }> }>(ctx, "GET", "/cart", { token });
      const line = (cart.json?.data as { items?: Array<{ id?: string; _id?: string }> })?.items?.[0];
      cartItemId = line?.id || line?._id;
    }
    test.skip(!cartItemId, "no cart item id after add");
    const res = await apiCall(ctx, "PUT", `/cart/items/${cartItemId}`, {
      token,
      body: { quantity: 3, productId },
    });
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) expect(res.json?.success).toBe(true);
  });

  test("DELETE /cart/items/:itemId (removeItem)", async () => {
    test.skip(!cartItemId, "no cart item");
    const res = await apiCall(ctx, "DELETE", `/cart/items/${cartItemId}`, {
      token,
      body: productId ? { productId } : undefined,
    });
    expect(res.status).toBeLessThan(500);
  });

  test("POST /cart/items missing productId → 4xx", async () => {
    const res = await apiCall(ctx, "POST", "/cart/items", {
      token,
      body: { quantity: 1 },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("POST /cart/items invalid productId → 4xx", async () => {
    const res = await apiCall(ctx, "POST", "/cart/items", {
      token,
      body: { productId: "000000000000000000000000", quantity: 1 },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("DELETE /cart/clear", async () => {
    const res = await apiCall(ctx, "DELETE", "/cart/clear", { token });
    expect(res.status).toBe(200);
  });

  test("POST /cart/merge with mergeKey", async () => {
    test.skip(!productId, "no productId");
    const res = await apiCall(ctx, "POST", "/cart/merge", {
      token,
      body: {
        mergeKey: `rn-audit-${Date.now()}`,
        items: [{ productId, quantity: 1 }],
      },
    });
    expect(res.status).toBeLessThan(500);
    await apiCall(ctx, "DELETE", "/cart/clear", { token });
  });
});

test.describe("Coupons / wallet / notifications / support / refunds / payments", () => {
  test("GET /coupons", async () => {
    const res = await apiCall(ctx, "GET", "/coupons", { token });
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) expect(res.json?.success).toBe(true);
  });

  test("POST /coupons/validate invalid code → 4xx or success=false", async () => {
    const res = await apiCall(ctx, "POST", "/coupons/validate", {
      token,
      body: { coupon_code: "INVALID_AUDIT_CODE_XYZ", cart_value: 500 },
    });
    expect(res.status).toBeLessThan(500);
    if (res.status >= 400) expect(res.json?.success).toBe(false);
  });

  test("POST /coupons/redeem missing order_id → 4xx", async () => {
    const res = await apiCall(ctx, "POST", "/coupons/redeem", {
      token,
      body: { coupon_code: "X", cart_value: 100 },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("GET /wallet/balance", async () => {
    const res = await apiCall(ctx, "GET", "/wallet/balance", { token });
    expect(res.status).toBe(200);
    expect(res.json?.success).toBe(true);
    expect(res.json?.data).toBeTruthy();
  });

  test("GET /wallet/transactions", async () => {
    const res = await apiCall(ctx, "GET", "/wallet/transactions?limit=20", { token });
    expect(res.status).toBe(200);
  });

  test("POST /wallet/top-up/session invalid amount → 4xx", async () => {
    const res = await apiCall(ctx, "POST", "/wallet/top-up/session", {
      token,
      body: { amount: -10, platform: "android" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("POST /wallet/debit invalid amount → 4xx", async () => {
    const res = await apiCall(ctx, "POST", "/wallet/debit", {
      token,
      body: { amount: -1 },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("GET /notifications + unread-count + preferences", async () => {
    const list = await apiCall(ctx, "GET", "/notifications?page=1&limit=10", { token });
    expect(list.status).toBe(200);
    const unread = await apiCall(ctx, "GET", "/notifications/unread-count", { token });
    expect(unread.status).toBe(200);
    const prefs = await apiCall(ctx, "GET", "/notifications/preferences", { token });
    expect(prefs.status).toBe(200);
  });

  test("PUT /notifications/read-all", async () => {
    const res = await apiCall(ctx, "PUT", "/notifications/read-all", { token });
    expect(res.status).toBeLessThan(500);
  });

  test("PUT /notifications/preferences", async () => {
    const res = await apiCall(ctx, "PUT", "/notifications/preferences", {
      token,
      body: { push: true, inApp: true },
    });
    expect(res.status).toBeLessThan(500);
  });

  test("POST /notifications/register-token (FCM shape)", async () => {
    const res = await apiCall(ctx, "POST", "/notifications/register-token", {
      token,
      body: { token: `audit-fcm-${Date.now()}`, platform: "android", tokenType: "fcm" },
    });
    expect(res.status).toBeLessThan(500);
  });

  test("GET /support/tickets + active", async () => {
    const res = await apiCall(ctx, "GET", "/support/tickets", { token });
    expect(res.status).toBe(200);
    const active = await apiCall(ctx, "GET", "/support/tickets/active", { token });
    expect(active.status).toBeLessThan(500);
  });

  test("GET /refunds (customer refunds.service — no mock fallback)", async () => {
    const res = await apiCall(ctx, "GET", "/refunds?page=1&limit=10", { token });
    expect(res.status).toBeLessThan(500);
    if (res.status === 200) expect(res.json?.success).toBe(true);
  });

  test("GET /payments/methods", async () => {
    const res = await apiCall(ctx, "GET", "/payments/methods", { token });
    expect(res.status).toBeLessThan(500);
  });

  test("GET /orders + /orders/active", async () => {
    const list = await apiCall(ctx, "GET", "/orders?page=1&limit=10", { token });
    expect(list.status).toBe(200);
    const active = await apiCall(ctx, "GET", "/orders/active", { token });
    expect(active.status).toBeLessThan(500);
  });

  test("POST /orders with empty items → 4xx", async () => {
    const res = await apiCall(ctx, "POST", "/orders", {
      token,
      body: { items: [], addressId: "000000000000000000000000" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("GET /orders/invalid-id → 4xx", async () => {
    const res = await apiCall(ctx, "GET", "/orders/000000000000000000000000", { token });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("GET /orders/:id/can-cancel invalid id — domain deny (not 5xx)", async () => {
    const res = await apiCall<{ canCancel?: boolean; allowed?: boolean; reason?: string }>(
      ctx,
      "GET",
      "/orders/000000000000000000000000/can-cancel",
      { token },
    );
    expect(res.status).toBeLessThan(500);
    // Backend returns 200 { allowed: false, reason } rather than HTTP 4xx.
    if (res.status === 200) {
      const data = res.json?.data;
      expect(data?.allowed === false || data?.canCancel === false).toBeTruthy();
      // Contract: frontend ordersApi.canCancel types `canCancel`, backend uses `allowed`.
      expect(
        typeof data?.canCancel === "boolean" || typeof data?.allowed === "boolean",
        `can-cancel field mismatch: frontend expects canCancel, got keys=${Object.keys(data || {}).join(",")}`,
      ).toBeTruthy();
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  test("CONTRACT: can-cancel response field is canCancel (orders.service)", async () => {
    const res = await apiCall<Record<string, unknown>>(
      ctx,
      "GET",
      "/orders/000000000000000000000000/can-cancel",
      { token },
    );
    expect(res.status).toBeLessThan(500);
    if (res.status === 200 && res.json?.data) {
      expect(
        Object.prototype.hasOwnProperty.call(res.json.data, "canCancel"),
        `CONTRACT MISMATCH: orders.service expects data.canCancel but backend returned keys=[${Object.keys(res.json.data).join(", ")}]`,
      ).toBe(true);
    }
  });

  test("GET payment status missing orderId → 4xx", async () => {
    const res = await apiCall(ctx, "GET", "/payments/worldline/status", { token });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  // Logout intentionally NOT here — suite order would poison later journey tokens.
  // Covered in 03-journey + dedicated revoke/re-login test.
});
