# Payment Gateway Audit Report

**Date:** 12 Nov 2026  
**App:** Selorg-CustomerApp-V2.0  
**Backend:** selorg-service Worldline/Paynimo integration  
**Scope:** Card, wallet (Selorg balance + Paynimo wallets), COD, UPI, net banking  

## Status legend

| Label | Meaning |
|-------|---------|
| **ROOT CAUSE IDENTIFIED** | Confirmed from code and/or device logs |
| **FIX IMPLEMENTED** | Code changed; awaiting real-device confirmation |
| **DEVICE-VERIFIED** | Confirmed on physical Android sandbox payment |
| **NOT VERIFIED** | No successful end-to-end device result yet |
| **OUT OF SCOPE THIS SESSION** | No iOS device / no production charge |

---

## 1. Card payment — stuck on "Your payment is in process"

### Root cause (ROOT CAUSE IDENTIFIED)

Physical-device log (`192.168.0.14`, 12 Nov 2026 ~16:29):

1. Paynimo opened a blank popup (`window-open`, url blank).
2. Wrote the waiting page (`popup-write`, `hasBankForm: false`).
3. Called `bankWindow.location` → `https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg` (`popup-location`, **`followed: false`**).
4. No `bankFrmSubmit` / form POST.
5. Parent stayed on the processing overlay and polled `popup-post-message`.

The bank step for this sandbox card path is a **GET navigation on the popup**, not a POST of `#bankFrmSubmit`. The WebView shim previously ignored that GET, so the bank page never loaded. This is an **app WebView hand-off bug**, not merchant hash/credentials failure (Paynimo had already returned the gateway URL).

Paynimo also has a separate `#bankFrmSubmit` POST path for some ACS flows; that path remains handled by submitting once with `target="_self"` in the visible WebView.

### Second root cause, found on the phone after the GET was followed

Samsung SM-E075F, `192.168.0.14:42045`, 12 Nov 2026 17:58:46. The new shim was already in the live WebView (`window.open` contained `follow-get`). A popup `location.assign` of `txnreqcardvern.pg` logged:

- `popup-location` `"followed":true` (shim)
- `popup-location` `"followed":true` `"via":"popup-location"` (native)

`loadUrl` then stopped on Android’s **Confirm Navigation** dialog: “Changes that you made may not be saved. Are you sure you want to navigate away from this page?” Paynimo’s checkout script registers `beforeunload` and sets `event.returnValue`. The WebView stays on the Paynimo sheet until that dialog is accepted, so the bank page never appears and a later `followed:true` line is easy to miss if the dialog is in front. Staying on the page left the checkout up. No card number was entered.

### Fix

**Files:** `src/utils/paynimoCheckout.ts`, `src/components/WorldlineCheckoutWebView.tsx`, `src/utils/checkoutNavigation.ts`

- The popup GET is posted to React Native as `follow-get` with the full URL. The native WebView `source` becomes that URI (`loadUrl`). `location.assign` is not used for that GET, because on an HTML-sourced WebView it neither commits the cross-origin load nor reliably delivers the bridge message.
- `beforeunload` is ignored before `checkout.js` runs, so Paynimo cannot raise the Confirm Navigation dialog. The bank document is a new page and is not affected. Net-banking `#bankFrmSubmit` still posts once with `target="_self"`. UPI intents still stay on the top window.
- Only the first off-checkout HTTPS URL is followed. `paynimo.com` and the Worldline return URL are not replaced this way.

### Device evidence after the beforeunload fix (not a completed charge)

Same phone, order `6af5b36ab0891f2ac6b5acc2` reused (`GET /orders/:id`, `GET /payments/worldline/status`, `POST /payments/worldline/session`). No second `POST /orders`.

| Time | Evidence |
|------|----------|
| 18:09:56 | Session 200. Checkout opened. Ref `1794487146178-fbd4b7a6-1`, ₹94.00 |
| 18:12:05 | Live page had **0** `beforeunload` listeners. `popup-location` `followed:true`. `load-start` and `load-end` of `https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg`. No Confirm Navigation dialog |
| 18:13:38 | The visible WebView left the Paynimo method list. Navigation timing: HTTP **200**, 213 ms, host `txnreqcardvern.pg`. Body was empty because the probe URL had no card token |
| 18:18:03 | After Close: `orderPaymentStatus: pending`, `uiState: WAITING_FOR_PAYMENT`, attempt `status: created`. Not paid. No charge |

A real card number was not submitted. The issuer ACS / OTP page was not shown. Status is still `created`. **Card payment is not PASS.**

**Current label: gateway navigation DEVICE-VERIFIED; card payment NOT VERIFIED**

---

## 2. Wallet payment — keeps loading

### Two different “wallet” paths

| Path | Mechanism |
|------|-----------|
| **Selorg Wallet** (order pay) | `POST /orders` with `paymentMethodType: 'wallet'` → server `debitWalletForOrder` → `paymentStatus: paid` → no Paynimo WebView |
| **Paynimo wallets / wallet top-up** | Same WebView as card/UPI; uses popup GET or form POST |

### Root causes (ROOT CAUSE IDENTIFIED)

**A. Selorg Wallet confirmation race (shared with COD)**  
After a successful place, `OrderPlaced` only looked at `orders[]`. If the list had not flushed (or a refresh dropped the new row), the screen immediately `reset` to Main. The order existed on the server; a cold start / reload made it appear. That looks like “payment never completed” until reload.

**B. Abandoned online attempt blocked cash/wallet**  
If a prior card/UPI left `unpaidOnlineOrderRef`, COD/wallet called `getWorldlineStatus` (up to ~20s) then **blocked** other methods when status was unknown. Users saw long “Processing…” then an error, or could not finish wallet after a stuck card session.

**C. Paynimo wallet / top-up**  
Same popup-location bug as card when the gateway uses HTTPS popup navigation.

### Fix (FIX IMPLEMENTED — NOT DEVICE-VERIFIED)

| File | Change |
|------|--------|
| `src/screens/orders/OrderPlaced.tsx` | Use `activeOrder`; fetch `GET /orders/:id` before giving up; show “Confirming your order…” instead of bouncing to Main |
| `src/context/OrdersContext.tsx` | Cap stale-status poll at 8s for COD/wallet preamble |
| `src/utils/worldline.ts` | Unknown status → `clear_and_continue` for COD/wallet (still block while status is known-pending) |
| `src/services/payments.service.ts` | `getWorldlineStatus(orderId, { timeoutMs })` |
| `src/utils/paynimoCheckout.ts` | Card/wallet gateway GET follow (above) |

Paid status for Selorg Wallet still comes only from the create-order response / server debit — no frontend fake success.

**Device, 12 Nov 2026 18:09 and 18:18:** Payment screen showed Selorg Wallet “Balance ₹51” with a Low badge. Bill was ₹94. The pay control stayed on online “Pay ₹94”. `GET /wallet/balance` returned 200. No debit request was sent. The indefinite spinner was not reproduced. **Not PASS.**

**Current label: NOT DEVICE-VERIFIED**

---

## 3. COD — success only after reload

### Root cause (ROOT CAUSE IDENTIFIED)

`OrderPlaced.tsx` ran:

```ts
if (!order) navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
```

on first paint when `orders.find(orderId)` missed. Server had already created the COD order (`paymentStatus: cod_pending`) and cleared the cart. Reload → `loadOrders` → order visible.

Secondary: same abandoned-online preamble as wallet could delay or block COD.

### Fix (FIX IMPLEMENTED — NOT DEVICE-VERIFIED)

Same `OrderPlaced` + preamble changes as wallet.

**Device:** At 17:37, before this edit, COD placed `ORD-20261112-00024` (`cod_pending`) and the Order Success screen appeared. That attempt did not reload. This edit was not placed again: card order `6af5b36ab0891f2ac6b5acc2` is still `WAITING_FOR_PAYMENT`, so cash stays blocked, and the phone rotated to landscape during the next checkout tap. **Not PASS.**

**Current label: NOT DEVICE-VERIFIED**

---

## 4. Method-by-method audit

| Method | Root cause / notes | Code fix | Device sandbox result |
|--------|--------------------|----------|------------------------|
| **UPI** | External intent via `Linking`; historically working on device | Unchanged intentionally | Prior sessions: working; **re-test after card fix** |
| **Credit / Debit card** | Popup GET was ignored, then `beforeunload` blocked `loadUrl` | `paynimoCheckout.ts` + WebView `loadUrl` | Navigation to `txnreqcardvern.pg` HTTP 200. **Payment not completed. Not PASS** |
| **Net banking** | Usually `#bankFrmSubmit` POST in-page | Unchanged path preserved | Prior: working; **re-test** |
| **Selorg Wallet** | OrderPlaced race + optional status-block | OrderPlaced + worldline retry | **NOT DEVICE-VERIFIED** |
| **Paynimo wallets / top-up** | Same WebView popup GET as card | Shared `paynimoCheckout` fix | **NOT DEVICE-VERIFIED** |
| **COD** | OrderPlaced race | OrderPlaced + preamble | **NOT DEVICE-VERIFIED** |

Paid only via backend: Worldline `GET /payments/worldline/status` (online) or order create response (wallet/COD). No mock success paths added.

---

## 5. Third-party / Worldline configuration

| Check | Finding |
|-------|---------|
| Merchant credentials | Not modified; not logged |
| Sandbox vs production | Device debug build may use production API base (`api.selorg.com`) depending on `APP_MODE` — confirm before charging real cards |
| Enabled modes | Order checkout uses `paymentMode: 'all'` |
| Card URL returned | Yes (`txnreqcardvern.pg`) — merchant can process card initiation |
| Worldline support action | App must load the returned card URL. Device now reaches `txnreqcardvern.pg` (HTTP 200) when the popup GET is followed. Escalate to Worldline only if a real card submit returns a gateway error code |

---

## 6. Backend

| Area | Finding |
|------|---------|
| Session / hash | Not implicated by device stop before bank page |
| Return + status | Client must recognize return URL (LAN HTTP return path now allowed for private IPs) |
| Wallet debit | Server txn + idempotent ledger; client must not mark paid without `paid` / covered response |
| COD | `cod_pending` is correct success state |
| Duplicate prevention | Idempotency key + unpaid online order reuse preserved |
| PHASE10 / ALLOW_SEED | Not enabled |

**File (return URL):** `src/utils/worldline.ts` — HTTP return on `192.168.*` / `10.*` / `172.16–31.*` hosts accepted for the Worldline return path only.

---

## 7. Files changed

1. `src/utils/paynimoCheckout.ts` — hand the popup GET to native `loadUrl`; ignore Paynimo `beforeunload` so Android does not show Confirm Navigation; keep bank form POST  
2. `src/components/WorldlineCheckoutWebView.tsx` — `follow-get` / `onOpenWindow` replace the WebView document with the gateway URI  
3. `src/utils/checkoutNavigation.ts` — `isPopupGatewayNavigation` (off-checkout HTTPS only)  
4. `src/screens/orders/OrderPlaced.tsx` — do not `reset` to Main when the order lookup misses  
5. `src/context/OrdersContext.tsx` — do not await cart clear before success; ignore a second place while success is showing  
6. `src/screens/orders/PaymentScreen.tsx` — navigate to Order Success before wallet reload  
7. `__tests__/paynimoCheckout.test.ts` / `__tests__/checkoutNavigation.test.ts` — shim and navigation expectations (not a device pass)  

No payment credentials, merchant config, or database seeds were changed.

---

## 8. Sandbox test results (actual)

| Test | Result |
|------|--------|
| Android card 16:29 | Reproduced stuck. `popup-location followed:false`. No bank page |
| Android card 17:58 | `followed:true`, then Confirm Navigation dialog. Page stayed on Paynimo |
| Android card 18:12–18:13 | `beforeunload` count 0. `followed:true`. `load-start`/`load-end` `txnreqcardvern.pg` HTTP 200. No dialog. Probe had no card token, so the document was empty. Status stayed `created`. **Not PASS** |
| Android Selorg Wallet 18:09 and 18:18 | Balance ₹51, bill ₹94, Low badge, Pay button not a wallet debit. `GET /wallet/balance` 200. Infinite spinner **not reproduced**. Debit **not run**. **Not PASS** |
| Android COD 17:37 (bundle before this edit) | `POST /orders` 201, `ORD-20261112-00024`, `cod_pending`. Order Success shown. Reload **not reproduced** on that attempt |
| Android COD after this edit | **Not retested.** Open card order `6af5b36ab0891f2ac6b5acc2` is still `pending` / `WAITING_FOR_PAYMENT`, and the display rotated to landscape during the next attempt. **Not PASS** |
| Android UPI / net banking regression | **Not re-run this pass.** Those paths were not edited except that `beforeunload` is no longer registered on the checkout document |
| iOS all methods | **OUT OF SCOPE THIS SESSION** (no iOS device in wireless ADB session) |
| Refunds | Previously implemented; not re-run in this pass |

---

## 9. Remaining blockers

1. A real card submit (issuer page + `GET /payments/worldline/status`) was not run. No card number was entered. Order `6af5b36ab0891f2ac6b5acc2` is still `pending` / `created`.  
2. COD after this bundle was not placed. The open card order is held (`WAITING_FOR_PAYMENT`), so cash is blocked until that attempt is terminal. The earlier `ORD-20261112-00024` success was the previous bundle.  
3. Selorg Wallet debit was not run. Balance ₹51 does not cover ₹94, and the Pay control correctly stays off wallet.  
4. Debug app talks to production `https://api.selorg.com`. Do not treat the empty gateway body as a Worldline failure.  
5. iOS was not exercised.

**None of Card, Wallet, or COD is PASS.** Gateway navigation for the card GET is the only new device result.

---

## 10. Blank screen after OTP — 13 Nov 2026

**Classification: D. App WebView and backend redirect together. Not a Worldline defect.**

The bank OTP page is reached. The blank screen is the step after the issuer posts the result.

### What the web app does

`POST /payments/worldline/return` verifies the gateway body, then `302`s to `https://www.selorg.com/checkout/payment?paynimo_bridge=1&…` (`payments.controller.ts` `redirectToPaymentResultPage`). The website is already signed in, so `PaymentClient` polls status and routes to confirmation or failed.

### What the Customer App WebView did

1. `setSupportMultipleWindows` was on. Android creates that window hidden and `shouldOverrideUrlLoading` returns true, which **cancels** the load. A post-OTP form with `target=_blank` / `window.open` never delivers its POST. The visible page is left on the bank’s empty waiting document.
2. When the return does land, the same `302` loads the website inside the WebView. `PaymentClient` does `if (!loggedIn) return null` (`useRequireAuth` — the app WebView has no website cookie) and then `window.location.replace('/auth?redirect=…')`. That document is blank. The app only treated `/payments/worldline/return` and a `paynimo_bridge=1` URL as completion, so `/auth` stayed on screen and success/failure never ran.

Paid is still taken only from `GET /payments/worldline/status`. The website redirect is not a capture.

### Fix (app only — the website 302 is unchanged)

| File | Change |
|------|--------|
| `src/components/WorldlineCheckoutWebView.tsx` | `setSupportMultipleWindows={false}` so the OTP result POST stays in this WebView. A navigation to the website checkout, confirmation, wallet, or `/auth` is cancelled and the app polls status. Overlay: “Confirming your payment…” |
| `src/utils/checkoutNavigation.ts` | `isPaymentResultHandoffUrl`. The API return URL is not a handoff, so the POST body still reaches the server |

UPI still leaves through the checkout shim. Net banking `#bankFrmSubmit` still posts in this page. COD and Selorg Wallet do not use this WebView.

### Test

Unit tests: 29 passed (`checkoutNavigation`, `paynimoCheckout`, `worldlineReturn`, `paymentAttempt`).

The phone was not connected (`adb devices` empty on 13 Nov 2026). No card number was entered. No new order was created. **Card OTP → success/failure is not PASS.**

### Worldline ticket

Not warranted from this trace. The issuer OTP page is working, and the blank document is our WebView plus the website checkout rendered logged-out. Escalate only if a later device log shows the post-OTP POST leaving the bank and `https://api.selorg.com/api/v1/customer/payments/worldline/return` returning an error, with timestamp, HTTP status, and the path (query stripped).

---

## 11. BOI debit card attempt — 13 Nov 2026, 12:50

**Classification**

| Layer | Result |
|-------|--------|
| Bank card restriction | **Yes.** This attempt cannot succeed on this card. |
| Customer App WebView | **Yes.** The Secure Payment screen stayed white. Fixed in the app; not a completed payment. |
| Backend callback / status | **No failure observed.** Paid is still only `GET /payments/worldline/status`. This attempt did not produce a paid status. |
| Worldline gateway | **Not indicated.** The screenshots contain no Worldline error code, HTTP status, or failing gateway URL. |

### Bank restriction (separate from the app)

BOI SMS, card ending 4393:

- E-commerce transactions are disabled on the debit card. The message says to enable them through the bank (IVR, ATM, or BOI mobile / internet banking).
- A later SMS is an OTP for **Disable Transaction Rights**. That is a card-control change, not a payment authorization OTP. It was not entered anywhere and must not be used to change the card.

No code path enables or disables the card. The payment cannot be authorized until the bank allows e-commerce on a card the customer is allowed to use.

### Why the app stayed white

The 12:50 screenshot is the app’s own Secure Payment header with an empty WebView. The earlier handoff only left the WebView for a Selorg website URL. A blank gateway or bank document (no visible text) never matched that, so success and failure were never shown.

### App change

- An empty document after the gateway has started is reported without page text or query strings.
- The WebView then closes and the app polls `/payments/worldline/status`.
- Paid only if that status is paid.
- Otherwise the Payment screen shows **Payment not confirmed**, with retry. The order is not marked paid and is not created again.

### Device

The Samsung is connected again over wireless ADB (`SM_E075F`). This card cannot complete a charge while e-commerce is disabled. **Card payment is not PASS.**
