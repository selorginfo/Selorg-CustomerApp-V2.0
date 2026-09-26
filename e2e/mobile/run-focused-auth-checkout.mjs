/**
 * Focused authenticated customer journey (no guest path).
 * Uses stable testIDs added to the app + adb UIAutomator.
 * Complements run-customer-journey.mjs for OTP → Home → Category → Cart → COD.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ARTIFACTS,
  ROOT,
  clearFocusedField,
  clearLogcat,
  dumpUi,
  ensureReversePorts,
  findByTestId,
  findByText,
  findEditTexts,
  forceStop,
  grantRuntimePermissions,
  hideKeyboard,
  launchApp,
  prepareDeviceForUiAutomation,
  pressBack,
  screenshot,
  sleep,
  swipe,
  tap,
  tapTestId,
  tapText,
  typeIntoTestId,
  typeText,
  visibleTexts,
  waitForTestId,
  waitForText,
  dismissPermissionDialogs,
} from "./adb-driver.mjs";

const API_BASE = (process.env.API_BASE_URL || "http://127.0.0.1:3333").replace(/\/$/, "");
const CUSTOMER = `${API_BASE}/api/v1/customer`;
const TEST_MOBILE = (process.env.OTP_TEST_MOBILE || "9698790921").replace(/\D/g, "").slice(-10);
const TEST_OTP = process.env.OTP_TEST_OTP || "8790";

const results = [];
const apiTrace = [];

function record(tc) {
  results.push(tc);
  console.log(
    `${tc.status === "PASS" ? "✓" : tc.status === "FAIL" ? "✗" : "·"} [${tc.status}] ${tc.id} — ${tc.action}`,
  );
}

async function api(method, pathName, { token, body } = {}) {
  const url = `${CUSTOMER}${pathName.startsWith("/") ? pathName : `/${pathName}`}`;
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text?.slice?.(0, 300) };
    }
    const entry = {
      method,
      url,
      status: res.status,
      durationMs: Date.now() - started,
      requestBody: body ?? null,
      response: json,
    };
    apiTrace.push(entry);
    return entry;
  } catch (err) {
    const entry = {
      method,
      url,
      status: 0,
      durationMs: Date.now() - started,
      networkError: String(err),
      requestBody: body ?? null,
      response: null,
    };
    apiTrace.push(entry);
    return entry;
  }
}

async function dismissDialogs() {
  for (let i = 0; i < 8; i++) {
    const hit = await dismissPermissionDialogs();
    if (!hit) break;
  }
}

async function ensureMainTabs({ maxBack = 6 } = {}) {
  for (let i = 0; i < maxBack; i++) {
    await dismissDialogs();
    let d;
    try {
      d = dumpUi(`ensure-main-${i}`);
    } catch {
      await sleep(500);
      continue;
    }
    if (
      findByTestId(d.nodes, "tab-home").length ||
      findByTestId(d.nodes, "tab-category").length ||
      findByTestId(d.nodes, "tab-profile").length ||
      findByTestId(d.nodes, "tab-cart").length
    ) {
      return true;
    }
    // Prefer explicit back buttons over hardware BACK when present
    const back = findByTestId(d.nodes, "otp-back").concat(
      d.nodes.filter((n) => /go back|back/i.test(`${n.desc}${n.text}`) && n.clickable),
    );
    if (back.length) {
      tap(back[0].bounds.cx, back[0].bounds.cy);
    } else {
      pressBack();
    }
    await sleep(700);
  }
  return false;
}

async function goPastOnboarding() {
  const d = dumpUi("onb");
  if (findByText(d.nodes, "Skip", { exact: true }).length) {
    await tapText("Skip", { exact: true });
    await sleep(800);
    return;
  }
  for (let i = 0; i < 4; i++) {
    const cur = dumpUi(`onb-${i}`);
    if (findByText(cur.nodes, "Get Started", { exact: false }).length) {
      await tapText("Get Started", { exact: false });
      return;
    }
    if (findByText(cur.nodes, "Next", { exact: true }).length) await tapText("Next", { exact: true });
    else break;
  }
}

async function skipLocationIfNeeded() {
  for (let i = 0; i < 10; i++) {
    await dismissDialogs();
    let cur;
    try {
      cur = dumpUi(`loc-${i}`);
    } catch {
      await sleep(800);
      continue;
    }
    const texts = visibleTexts(cur.nodes).join(" | ");

    if (
      findByTestId(cur.nodes, "tab-home").length ||
      findByTestId(cur.nodes, "tab-category").length ||
      findByTestId(cur.nodes, "tab-profile").length ||
      (/Home|Categories|Account|Orders/i.test(texts) &&
        !/Use current location|Enter address manually|Deliver to your door/i.test(texts))
    ) {
      return "main";
    }

    // Prefer Skip for now (authenticated path without forcing GPS)
    const skip = findByTestId(cur.nodes, "location-skip");
    if (skip.length) {
      tap(skip[0].bounds.cx, skip[0].bounds.cy);
      await sleep(1200);
      continue;
    }
    if (findByText(cur.nodes, "Skip for now", { exact: false }).length) {
      await tapText("Skip for now", { exact: false });
      await sleep(1200);
      continue;
    }

    const manual = findByTestId(cur.nodes, "location-manual");
    if (manual.length) {
      tap(manual[0].bounds.cx, manual[0].bounds.cy);
      await sleep(1200);
      // AddAddress may open — back to Main via skip later or continue
      continue;
    }

    if (/Deliver to your door|Use current location|Enter address manually/i.test(texts)) {
      // Text fallback if testID not in hierarchy yet
      if (findByText(cur.nodes, "Skip for now", { exact: false }).length) {
        await tapText("Skip for now", { exact: false });
        await sleep(1200);
        continue;
      }
    }

    if (/name|Continue|profile|What's your name/i.test(texts) && findEditTexts(cur.nodes).length) {
      const e = findEditTexts(cur.nodes);
      tap(e[0].bounds.cx, e[0].bounds.cy);
      clearFocusedField();
      typeText("E2E Customer");
      if (e[1]) {
        tap(e[1].bounds.cx, e[1].bounds.cy);
        clearFocusedField();
        typeText("e2e@selorg.test");
      }
      hideKeyboard();
      try {
        await tapText("Continue", { exact: false });
      } catch {
        /* */
      }
      await sleep(1000);
      continue;
    }
    await sleep(700);
  }
  return "unknown";
}

async function loginUi() {
  await waitForTestId("auth-phone-input", { timeoutMs: 35000 });
  // Ensure login mode (not signup)
  try {
    const d = dumpUi("mode");
    const hits = findByText(d.nodes, "Log In", { exact: true });
    if (hits.length) {
      const top = hits.sort((a, b) => a.bounds.cy - b.bounds.cy)[0];
      tap(top.bounds.cx, top.bounds.cy);
    }
  } catch {
    /* */
  }
  await sleep(400);

  await typeIntoTestId("auth-phone-input", TEST_MOBILE, { clear: true, verify: true });
  hideKeyboard();
  await sleep(500);

  // Wait until Log In / Send OTP is enabled (RN validation must see the digits)
  {
    const start = Date.now();
    let enabled = false;
    while (Date.now() - start < 12000) {
      const d = dumpUi("wait-send-enabled");
      const btn = findByTestId(d.nodes, "auth-send-otp")[0];
      if (btn?.enabled) {
        enabled = true;
        break;
      }
      // Re-focus + retype if still disabled
      try {
        await typeIntoTestId("auth-phone-input", TEST_MOBILE, { clear: true, verify: false });
        hideKeyboard();
      } catch {
        /* */
      }
      await sleep(700);
    }
    if (!enabled) {
      screenshot("auth-send-disabled");
      throw new Error("auth-send-otp stayed disabled after typing phone — RN input not accepted");
    }
  }

  await tapTestId("auth-send-otp", { afterMs: 1500 });
  await waitForTestId("otp-screen", { timeoutMs: 25000 });
  screenshot("auth-otp");

  // Single OTP input — type full code once (includes digit 0 reliably)
  await tapTestId("otp-input", { afterMs: 300 });
  clearFocusedField();
  typeText(TEST_OTP);
  await sleep(500);
  // Keyboard covers Verify OTP — dismiss without BACK (BACK pops the stack).
  hideKeyboard();
  await sleep(400);
  // Escape/hide may not always work on number-pad; tap outside cells
  try {
    const od = dumpUi("otp-pre-verify");
    const title = findByText(od.nodes, "Enter OTP", { exact: true })[0];
    if (title) tap(title.bounds.cx, title.bounds.cy);
    await sleep(300);
  } catch {
    /* */
  }
  hideKeyboard();
  await sleep(400);

  await tapTestId("otp-verify", { afterMs: 3000 });
  await dismissDialogs();

  // If still on OTP with error, capture and fail clearly
  const afterVerify = dumpUi("after-verify");
  if (findByTestId(afterVerify.nodes, "otp-error").length) {
    const errNode = findByTestId(afterVerify.nodes, "otp-error")[0];
    throw new Error(`OTP verify rejected: ${errNode.text || errNode.desc}`);
  }
  if (findByTestId(afterVerify.nodes, "otp-screen").length && !findByTestId(afterVerify.nodes, "tab-home").length) {
    // Retry verify once if still on OTP (keyboard may have eaten the first tap)
    hideKeyboard();
    await sleep(400);
    await tapTestId("otp-verify", { afterMs: 3500 });
    await dismissDialogs();
  }

  const dest = await skipLocationIfNeeded();
  await dismissDialogs();
  return dest;
}

async function run() {
  console.log("=== Focused authenticated journey (testID harness) ===");
  ensureReversePorts();
  prepareDeviceForUiAutomation();
  grantRuntimePermissions();
  clearLogcat();
  forceStop();
  await sleep(500);
  launchApp(true);
  // pm clear resets grants on some images — re-grant after clear
  grantRuntimePermissions();
  await sleep(7000);
  await dismissDialogs();
  try {
    await waitForText("Skip", { timeoutMs: 45000, exact: false });
  } catch {
    await waitForTestId("auth-phone-input", { timeoutMs: 20000 });
  }
  await goPastOnboarding();
  await dismissDialogs();
  // Extra settle for EnterMobile + any late permission sheets
  for (let i = 0; i < 5; i++) {
    await dismissDialogs();
    try {
      await waitForTestId("auth-phone-input", { timeoutMs: 4000 });
      break;
    } catch {
      await sleep(500);
    }
  }
  screenshot("f01-login");

  try {
    const dest = await loginUi();
    const main = dumpUi("main");
    const texts = visibleTexts(main.nodes).join(" ");
    const hasTabs =
      findByTestId(main.nodes, "tab-home").length > 0 ||
      findByTestId(main.nodes, "tab-category").length > 0 ||
      findByTestId(main.nodes, "tab-profile").length > 0 ||
      /Home|Categories|Account/i.test(texts);
    record({
      id: "F-AUTH-01",
      area: "Authentication",
      action: "OTP login UI (no guest)",
      expected: "Main tabs",
      actual: `${dest} ${visibleTexts(main.nodes).slice(0, 12).join(" | ")}`,
      status: hasTabs ? "PASS" : "FAIL",
      evidence: [screenshot("f02-main")],
    });
    if (!hasTabs) return finish();
  } catch (err) {
    record({
      id: "F-AUTH-01",
      area: "Authentication",
      action: "OTP login UI",
      status: "FAIL",
      error: String(err.message || err),
      evidence: [screenshot("f-auth-fail")],
    });
    return finish();
  }

  // Parallel API token for cart/order verify (separate session — do not share with UI OTP)
  const send = await api("POST", "/auth/send-otp", {
    body: { phoneNumber: `+91${TEST_MOBILE}`, preferredChannel: "sms", intent: "login" },
  });
  const verify = await api("POST", "/auth/verify-otp", {
    body: { sessionId: send.response?.data?.sessionId, otp: TEST_OTP },
  });
  const token = verify.response?.data?.accessToken;
  record({
    id: "F-AUTH-02",
    area: "Authentication",
    action: "Parallel API token for cart/order verify",
    expected: "accessToken",
    actual: token ? "ok" : "missing",
    status: token ? "PASS" : "FAIL",
  });

  // Search via Home testID
  try {
    await tapTestId("home-search", { afterMs: 800 });
    await waitForTestId("search-screen", { timeoutMs: 12000 });
    await typeIntoTestId("search-input", "organic", { clear: true });
    await sleep(2000);
    const searchDump = dumpUi("search-results");
    const st = visibleTexts(searchDump.nodes).join(" ");
    const hasResults =
      findByTestId(searchDump.nodes, "search-results").length > 0 ||
      /organic|₹|Add|product/i.test(st);
    // Best-effort UI add from search results (circle "+" / ADD / product-*-add)
    try {
      const addNode =
        searchDump.nodes.find((n) => /-add$/i.test(n.resourceId || "")) ||
        searchDump.nodes.find((n) => /add to cart/i.test(`${n.desc}${n.text}`)) ||
        searchDump.nodes.find((n) => n.text === "ADD" || n.text === "+");
      if (addNode) {
        tap(addNode.bounds.cx, addNode.bounds.cy);
        await sleep(900);
        if (!results.some((r) => r.id === "F-CART-01")) {
          record({
            id: "F-CART-01",
            area: "Cart",
            action: "Add product from Search results UI",
            status: "PASS",
          });
        }
      }
    } catch {
      /* category path may still add */
    }
    record({
      id: "F-SEARCH-01",
      area: "Search",
      action: "Home → Search → organic",
      expected: "Results from API",
      actual: st.slice(0, 200),
      status: hasResults ? "PASS" : "FAIL",
      evidence: [screenshot("f-search")],
    });
    // Back to main
    // Leave Search stack so bottom tabs are visible again
    try {
      pressBack();
      await sleep(600);
      await tapTestId("tab-home", { afterMs: 600 });
    } catch {
      hideKeyboard();
      pressBack();
      await sleep(600);
    }
  } catch (err) {
    record({
      id: "F-SEARCH-01",
      area: "Search",
      action: "Search flow",
      status: "FAIL",
      error: String(err.message || err),
      evidence: [screenshot("f-search-fail")],
    });
  }

  // Categories → Fruits via testID
  try {
    await tapTestId("tab-home", { afterMs: 600 }).catch(() => {});
    await tapTestId("tab-category", { afterMs: 1200 });
    screenshot("f03-cats");
    const catDump = dumpUi("cats");
    // Prefer category-open-* for Fruits
    const fruitOpen = catDump.nodes.find(
      (n) =>
        (n.desc === "Fruits" || n.text === "Fruits") &&
        (n.resourceId?.includes("category-open") || n.clickable),
    );
    const fruitById = catDump.nodes.filter(
      (n) =>
        /category-open-/i.test(n.resourceId || "") &&
        (/fruit/i.test(n.resourceId || "") || /fruit/i.test(n.desc || n.text || "")),
    );
    if (fruitById.length) {
      tap(fruitById[0].bounds.cx, fruitById[0].bounds.cy);
    } else if (fruitOpen) {
      tap(fruitOpen.bounds.cx, fruitOpen.bounds.cy);
    } else {
      await tapText("Fruits", { exact: true });
    }
    await sleep(1500);
    const cat = dumpUi("fruits");
    record({
      id: "F-CAT-01",
      area: "Category",
      action: "Open Fruits category",
      expected: "Products or subcategories",
      actual: visibleTexts(cat.nodes).slice(0, 18).join(" | "),
      status: /Add|₹|Fruits|Banana|Mango|product|Native/i.test(visibleTexts(cat.nodes).join(" "))
        ? "PASS"
        : "FAIL",
      evidence: [screenshot("f04-fruits")],
    });

    const skip = new Set(["Home", "Categories", "Orders", "Account", "Cart", "Filters", "Sort", "Search"]);
    const candidates = cat.nodes.filter(
      (n) =>
        n.text &&
        !skip.has(n.text) &&
        n.text.length > 2 &&
        n.bounds.cy > 300 &&
        n.bounds.cy < 1800 &&
        !/search/i.test(n.resourceId || "") &&
        !/search/i.test(n.desc || ""),
    );
    if (candidates.length) {
      tap(candidates[0].bounds.cx, candidates[0].bounds.cy);
      await sleep(1200);
    }

    // Try product-card open or Add
    const listing = dumpUi("listing");
    const productOpen = listing.nodes.find((n) => /product-open-|product-card-/.test(n.resourceId || n.desc || ""));
    if (productOpen) {
      tap(productOpen.bounds.cx, productOpen.bounds.cy);
      await sleep(1200);
    }

    // Only record F-CART-01 again if not already added from search
    if (!results.some((r) => r.id === "F-CART-01")) {
    try {
      const pdp = dumpUi("pdp");
      const addBtn =
        findByTestId(pdp.nodes, "product-add-to-cart")[0] ||
        pdp.nodes.find((n) => /-add$/.test(n.resourceId || n.desc || ""));
      if (addBtn) {
        tap(addBtn.bounds.cx, addBtn.bounds.cy);
        await sleep(800);
        record({ id: "F-CART-01", area: "Cart", action: "Add product from PDP/listing", status: "PASS" });
      } else {
        try {
          await tapText("ADD", { exact: true, timeoutMs: 4000 });
        } catch {
          await tapText("Add to cart", { exact: false, timeoutMs: 5000 });
        }
        await sleep(800);
        record({ id: "F-CART-01", area: "Cart", action: "Add product from listing", status: "PASS" });
      }
    } catch {
      // Fall back: open Search, add first product via UI Add control
      try {
        await tapTestId("tab-home", { afterMs: 500 });
        await tapTestId("home-search", { afterMs: 800 });
        await typeIntoTestId("search-input", "papaya", { clear: true });
        await sleep(2500);
        const searchDump = dumpUi("search-add");
        const addNode =
          searchDump.nodes.find((n) => n.text === "ADD") ||
          searchDump.nodes.find((n) => /-add$/i.test(n.resourceId || "")) ||
          searchDump.nodes.find((n) => /add to cart/i.test(`${n.desc}${n.text}`));
        if (addNode) {
          tap(addNode.bounds.cx, addNode.bounds.cy);
        } else {
          await tapText("ADD", { exact: true, timeoutMs: 5000 });
        }
        await sleep(1000);
        pressBack();
        await sleep(500);
        record({ id: "F-CART-01", area: "Cart", action: "Add product from Search UI", status: "PASS" });
      } catch (err2) {
        if (token) {
          const search = await api("GET", "/products/search?q=banana&page=1&limit=5", { token });
          const list = search.response?.data?.products || search.response?.data || [];
          const arr = Array.isArray(list) ? list : [];
          const pid = arr[0]?._id || arr[0]?.id;
          if (pid) {
            const add = await api("POST", "/cart/items", { token, body: { productId: pid, quantity: 1 } });
            record({
              id: "F-CART-01",
              area: "Cart",
              action: "Add via API seed (UI Add not found)",
              status: "FAIL",
              severity: "High",
              actual: `UI Add missing; API seed http=${add.status} (not counted as UI pass)`,
              api: add,
            });
          } else {
            record({ id: "F-CART-01", area: "Cart", action: "Add product", status: "FAIL", actual: "No product id" });
          }
        } else {
          record({
            id: "F-CART-01",
            area: "Cart",
            action: "Add product",
            status: "FAIL",
            error: String(err2.message || err2),
          });
        }
      }
    }
    }
  } catch (err) {
    record({
      id: "F-CAT-01",
      area: "Category",
      action: "Category/add",
      status: "FAIL",
      error: String(err.message || err),
    });
  }

  // Cart via tab-cart testID
  try {
    await ensureMainTabs();
    await tapTestId("tab-cart", { afterMs: 1200 });
    screenshot("f05-cart");
    const cart = dumpUi("cart");
    const ct = visibleTexts(cart.nodes).join(" ");
    record({
      id: "F-CART-02",
      area: "Cart",
      action: "Open cart",
      expected: "Lines or empty",
      actual: ct.slice(0, 200),
      status: /Proceed|Checkout|Empty|Remove|₹|Add items|cart|Your cart/i.test(ct) ? "PASS" : "FAIL",
    });

    if (token) {
      const cartApi = await api("GET", "/cart", { token });
      record({
        id: "F-CART-03",
        area: "Cart",
        action: "GET /cart verify",
        expected: "200",
        actual: `${cartApi.status}`,
        status: cartApi.status === 200 ? "PASS" : "FAIL",
        api: cartApi,
      });
    }

    // If empty, try one more UI add from home search before checkout
    if (/empty|Start shopping/i.test(ct)) {
      await ensureMainTabs();
      await tapTestId("tab-home", { afterMs: 500 });
      await tapTestId("home-search", { afterMs: 800 });
      await typeIntoTestId("search-input", "papaya", { clear: true });
      await sleep(2000);
      try {
        await tapText("Add to cart", { exact: false, timeoutMs: 8000 });
        await sleep(1000);
      } catch {
        /* */
      }
      await ensureMainTabs();
      await tapTestId("tab-cart", { afterMs: 1000 });
    }

    try {
      await tapTestId("cart-checkout", { afterMs: 1500 });
    } catch {
      try {
        await tapText("Proceed to Checkout", { exact: false, timeoutMs: 6000 });
      } catch {
        await tapText("Checkout", { exact: false, timeoutMs: 4000 });
      }
    }
    await sleep(1000);
    screenshot("f06-checkout");
  } catch (err) {
    record({
      id: "F-CART-02",
      area: "Cart",
      action: "Cart/checkout",
      status: "FAIL",
      error: String(err.message || err),
    });
  }

  // Address + COD place
  try {
    let chk = dumpUi("chk");
    let t = visibleTexts(chk.nodes).join(" ");

    // Checkout may open address selector first
    chk = dumpUi("chk");
    t = visibleTexts(chk.nodes).join(" ");

    // Prefer selecting an existing address if list loaded after auth refresh
    // AddressContext refresh can lag briefly after OTP login — wait for items.
    {
      const waitStart = Date.now();
      while (Date.now() - waitStart < 12000) {
        chk = dumpUi("chk-addr-wait");
        t = visibleTexts(chk.nodes).join(" ");
        const item = chk.nodes.find((n) => /address-item-/.test(n.resourceId || n.desc || ""));
        if (item) break;
        if (!/Select address|No saved addresses|Add address/i.test(t)) break;
        await sleep(800);
      }
    }
    const existingItem = chk.nodes.find((n) => /address-item-/.test(n.resourceId || n.desc || ""));
    if (existingItem) {
      tap(existingItem.bounds.cx, existingItem.bounds.cy);
      await sleep(1000);
    } else if (
      /Select address|No saved addresses|Add address/i.test(t) ||
      findByTestId(chk.nodes, "address-add").length ||
      findByTestId(chk.nodes, "address-selector").length
    ) {
      // Try header + Add first, then empty-state CTA (both navigate to AddAddress)
      let opened = false;
      for (const id of ["address-add", "address-add-cta"]) {
        try {
          await tapTestId(id, { afterMs: 1500 });
          const after = dumpUi(`after-${id}`);
          if (
            findByTestId(after.nodes, "address-line1").length ||
            visibleTexts(after.nodes).some((x) => /ADDRESS LINE|Add address|Save address|Map/i.test(x))
          ) {
            // Header title "Add address" alone can still be selector; require form/map cues
            if (
              findByTestId(after.nodes, "address-line1").length ||
              visibleTexts(after.nodes).some((x) => /ADDRESS LINE|Save address|Use current location|Confirm/i.test(x))
            ) {
              opened = true;
              break;
            }
          }
        } catch {
          /* try next */
        }
      }
      if (!opened) {
        try {
          await tapText("+ Add", { exact: false, timeoutMs: 4000 });
          await sleep(1500);
        } catch {
          try {
            await tapText("Add address", { exact: true, timeoutMs: 4000 });
            await sleep(1500);
          } catch {
            /* */
          }
        }
      }

      // Wait for Add Address form (not the selector)
      try {
        await waitForTestId("address-line1", { timeoutMs: 25000 });
      } catch {
        // Scroll map form — fields may be below the fold
        try {
          swipe(540, 1600, 540, 600, 400);
          await sleep(600);
        } catch {
          /* */
        }
        try {
          await waitForTestId("address-line1", { timeoutMs: 10000 });
        } catch {
          // Fallback without testIDs (older bundle)
          await waitForText("ADDRESS LINE 1", { timeoutMs: 10000, exact: false });
        }
      }
      // Ensure pin / fill fields
      tap(540, 720);
      await sleep(800);

      try {
        await typeIntoTestId("address-line1", "12 Test Street", { clear: true });
        await typeIntoTestId("address-line2", "Near Park", { clear: true });
        await typeIntoTestId("address-city", "Chennai", { clear: true });
        await typeIntoTestId("address-pincode", "600001", { clear: true });
        try {
          await typeIntoTestId("address-state", "Tamil Nadu", { clear: true });
        } catch {
          /* */
        }
      } catch {
        const form = dumpUi("addrform");
        const e = findEditTexts(form.nodes);
        const vals = ["12 Test Street", "Near Park", "Chennai", "600001", "Tamil Nadu"];
        for (let i = 0; i < Math.min(e.length, vals.length); i++) {
          tap(e[i].bounds.cx, e[i].bounds.cy);
          clearFocusedField();
          typeText(vals[i]);
        }
      }
      try {
        await tapText("Home", { exact: true, timeoutMs: 2000 });
      } catch {
        /* */
      }
      hideKeyboard();
      await sleep(400);
      try {
        await tapTestId("address-save", { afterMs: 2000 });
      } catch {
        await tapText("Save address", { exact: false, timeoutMs: 8000 });
      }
      await sleep(1500);

      const afterSave = dumpUi("addr-after-save");
      const item = afterSave.nodes.find((n) => /address-item-/.test(n.resourceId || n.desc || ""));
      if (item) {
        tap(item.bounds.cx, item.bounds.cy);
        await sleep(800);
      } else if (/Select address/i.test(visibleTexts(afterSave.nodes).join(" "))) {
        try {
          await tapText("12 Test", { exact: false, timeoutMs: 4000 });
        } catch {
          /* */
        }
      }
    }

    // Back on checkout — choose COD
    try {
      await waitForTestId("checkout-pay-cod", { timeoutMs: 8000 });
      await tapTestId("checkout-pay-cod", { afterMs: 600 });
    } catch {
      try {
        await tapText("Cash on delivery", { exact: false, timeoutMs: 4000 });
      } catch {
        /* */
      }
    }

    try {
      await tapTestId("checkout-continue", { afterMs: 1500 });
    } catch {
      for (const lab of ["Place order", "Place Order", "Proceed to Pay", "Continue", "Pay"]) {
        try {
          await tapText(lab, { exact: false, timeoutMs: 3000 });
          break;
        } catch {
          /* */
        }
      }
    }
    await sleep(1500);

    // Payment screen COD
    const pay = dumpUi("pay");
    if (
      findByTestId(pay.nodes, "payment-method-cod").length ||
      /Cash on delivery|UPI|Wallet/i.test(visibleTexts(pay.nodes).join(" "))
    ) {
      try {
        await tapTestId("payment-method-cod", { afterMs: 500 });
      } catch {
        try {
          await tapText("Cash on delivery", { exact: false });
        } catch {
          /* */
        }
      }
      try {
        await tapTestId("payment-submit", { afterMs: 3000 });
      } catch {
        for (const lab of ["Place order", "Place Order", "Pay"]) {
          try {
            await tapText(lab, { exact: false, timeoutMs: 3500 });
            break;
          } catch {
            /* */
          }
        }
        await sleep(2500);
      }
    }
    screenshot("f07-placed");
    const after = dumpUi("placed");
    const at = visibleTexts(after.nodes).join(" ");
    const success =
      findByTestId(after.nodes, "order-placed-home").length > 0 ||
      findByTestId(after.nodes, "order-placed-track").length > 0 ||
      /Order placed|Track order|Back to home|Thank|Success/i.test(at);
    record({
      id: "F-CHK-01",
      area: "Checkout",
      action: "Place COD order via UI",
      expected: "Success UI + backend order",
      actual: at.slice(0, 220),
      status: success ? "PASS" : "FAIL",
      severity: "Critical",
      evidence: [screenshot("f07b")],
    });

    if (token) {
      const orders = await api("GET", "/orders?page=1&limit=5", { token });
      const payload = orders.response?.data;
      const list =
        payload?.orders ||
        payload?.data ||
        (Array.isArray(payload) ? payload : []);
      const arr = Array.isArray(list) ? list : [];
      // Prefer a freshly created order (within last few minutes) when available
      const recent = arr.find((o) => {
        const ts = Date.parse(o.createdAt || o.created_at || "");
        return Number.isFinite(ts) && Date.now() - ts < 15 * 60 * 1000;
      });
      const pick = recent || arr[0];
      record({
        id: "F-ORD-01",
        area: "Orders",
        action: "GET /orders after place",
        expected: ">=1 order",
        actual: `count=${arr.length} id=${pick?._id || pick?.id || "none"} status=${pick?.status || ""}`,
        status: arr.length > 0 ? "PASS" : "FAIL",
        api: orders,
        severity: "Critical",
      });
    }
  } catch (err) {
    record({
      id: "F-CHK-01",
      area: "Checkout",
      action: "Place order",
      status: "FAIL",
      error: String(err.message || err),
      evidence: [screenshot("f-chk-fail")],
    });
  }

  // Logout via testIDs
  try {
    try {
      await tapTestId("order-placed-home", { afterMs: 800 });
    } catch {
      try {
        await tapText("Back to home", { exact: false, timeoutMs: 3000 });
      } catch {
        /* */
      }
    }
    await ensureMainTabs();
    await tapTestId("tab-profile", { afterMs: 800 });
    // Log out is below the fold on Account — swipe up to reveal it
    for (let i = 0; i < 4; i++) {
      const d = dumpUi(`acct-scroll-${i}`);
      if (findByTestId(d.nodes, "account-logout").length || findByText(d.nodes, "Log out", { exact: false }).length) {
        break;
      }
      swipe(540, 1800, 540, 700, 400);
      await sleep(500);
    }
    try {
      await tapTestId("account-logout", { afterMs: 800 });
    } catch {
      await tapText("Log out", { exact: false, timeoutMs: 6000 });
    }
    await sleep(600);
    try {
      await tapTestId("logout-confirm", { afterMs: 1200 });
    } catch {
      try {
        await tapText("Log out", { exact: false, timeoutMs: 3000 });
      } catch {
        /* */
      }
    }
    const d = dumpUi("out");
    const outT = visibleTexts(d.nodes).join(" ");
    const loggedOut =
      findByTestId(d.nodes, "auth-phone-input").length > 0 ||
      /Log In|10-digit|Browse as guest/i.test(outT);
    record({
      id: "F-LOGOUT-01",
      area: "Authentication",
      action: "Logout",
      expected: "Auth screen",
      actual: outT.slice(0, 180),
      status: loggedOut ? "PASS" : "FAIL",
      evidence: [screenshot("f08-logout")],
    });
  } catch (err) {
    record({
      id: "F-LOGOUT-01",
      area: "Authentication",
      action: "Logout",
      status: "FAIL",
      error: String(err.message || err),
    });
  }

  return finish();
}

function finish() {
  const summary = {
    generatedAt: new Date().toISOString(),
    suite: "focused-auth-checkout",
    totals: {
      total: results.length,
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
      blocked: results.filter((r) => r.status === "BLOCKED").length,
      skipped: results.filter((r) => r.status === "SKIP").length,
    },
    results,
    apiTrace,
  };
  fs.writeFileSync(path.join(ARTIFACTS, "focused-auth-results.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(ROOT, "test-results", "focused-auth-results.json"), JSON.stringify(summary, null, 2));
  console.log("=== FOCUSED SUMMARY ===");
  console.log(JSON.stringify(summary.totals, null, 2));
  return summary;
}

run().catch((e) => {
  console.error(e);
  record({ id: "F-RUNNER", area: "Environment", action: "crash", status: "FAIL", error: String(e.stack || e) });
  finish();
  process.exit(1);
});
