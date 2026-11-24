# Worldline card payment — blank Secure Payment fix

**Date:** 13 Nov 2026  
**App:** Selorg-CustomerApp-V2.0  
**Backend:** selorg-service (return bridge HTML)  
**Symptom:** Credit/debit card debited at the bank; Customer App stuck on blank white “Secure payment” WebView; Close then shows “Order Placed”.

---

## Root cause

| Layer | Finding |
|-------|---------|
| Bank / Worldline | Charge succeeds. Not a merchant-hash or gateway-config failure for the reported cases. |
| Backend return | `POST /payments/worldline/return` verifies and marks the order paid, then previously **302’d to the website** (`/checkout/payment?paynimo_bridge=1`). |
| App WebView | After OTP the visible document often stays **blank** (bank waiting page, cancelled popup, or logged-out website checkout). Navigation events for the return/handoff URL never fire, so `onComplete` never runs. |
| Close path | Close polls `GET /payments/worldline/status`. When already `PAID`, it calls `completeGatewayPayment` → Order Placed. That matches “blank → Close → Order Placed”. |
| Progress flag bug | TPSL card URLs (`tpsl-india.in`) were classified as gateway hosts and **excluded** from `isBankAuthenticationUrl`, so Close could treat an in-flight card page as “left before bank” and the app never started status watching. |

**Classification:** App WebView completion + dismiss policy (primary). Backend 302-to-website made the blank sheet more likely (secondary). Not a Worldline credential defect.

Paid is still decided only by `GET /payments/worldline/status` (or atomic mark-paid on the return POST). No mock success paths.

---

## Fix implemented

1. **Status watch while Secure Payment is open** (`worldlineStatusWatch.ts` + `PaymentScreen` / wallet)  
   After the card/bank page is reached (`onGatewayProgress`), poll `/payments/worldline/status` until paid / failed / exhausted, then settle to Success, Pending, or Failure — without requiring Close.

2. **Treat TPSL / Worldline card pages as in-flight** (`checkoutNavigation.ts`)  
   `isBankAuthenticationUrl` includes gateway hosts except Paynimo’s own shell. Close will not abort after the card GET. Progress events start the status watch.

3. **Blank-page recovery**  
   Empty documents after gateway start (including empty Paynimo after the card GET) show “Confirming…” immediately and complete after ~1.2s. Periodic page probes + AppState resume re-inject probes.

4. **Handoff in any frame**  
   Website `paynimo_bridge` / `/auth` / confirmation URLs complete the app flow even from non-top frames.

5. **Backend return bridge HTML** (`payments.controller.ts`)  
   Return handler responds **200 HTML** on the API return URL (with meta refresh + `location.replace` to the website for browsers). Customer App can detect the return path before a blank website paint. Website users still land on checkout/wallet via refresh.

6. **App backgrounding**  
   On AppState `active`, if the card/bank page was already reached, status watching resumes.

UPI intents, net-banking `#bankFrmSubmit`, Selorg Wallet debit, and COD paths are unchanged in intent (shared WebView only gains safer completion for card/top-up).

---

## Files changed

### Customer App
- `src/utils/worldlineStatusWatch.ts` *(new)*
- `src/utils/checkoutNavigation.ts`
- `src/components/WorldlineCheckoutWebView.tsx`
- `src/screens/orders/PaymentScreen.tsx`
- `src/screens/wallet/index.tsx`
- `src/context/WalletContext.tsx` (export `pendingTopUpOrderId`)
- `__tests__/checkoutNavigation.test.ts`
- `__tests__/worldlineStatusWatch.test.ts` *(new)*

### Backend
- `selorg-service/src/modules/payments/payments.controller.ts`

---

## Test results

| Test | Result |
|------|--------|
| `npx jest` checkoutNavigation, worldlineReturn, paynimoCheckout, worldlineStatusWatch, paymentAttempt | **PASS** — 5 suites, 34 tests |
| Lint on edited app files | **PASS** (no new issues) |
| Live Android credit card (OTP → Success UI) | **NOT RUN** — no device attached (`adb devices` empty; wireless `192.168.0.14:42045` unreachable) |
| Live Android debit card | **NOT RUN** — same |
| UPI / Net Banking / Wallet / COD device regression | **NOT RUN** on device this session; unit coverage for UPI nav + paymentAttempt preserved |

### Unit coverage added/updated
- TPSL URL is bank-auth / checkout progress  
- Blank Paynimo after gateway start is recoverable  
- Status watch returns paid / failed / pending / stopped  

---

## Deploy notes

1. Ship the Customer App build with the WebView + status-watch changes.  
2. Deploy `selorg-service` so production return responses use `bridge-html-v3` (optional but recommended; app polling still works if the return POST already marked paid).  
3. On a real Android device: card pay → confirm bank debit → expect “Confirming your payment…” then Order Success without pressing Close. Retry failure and pending paths. Spot-check UPI, net banking, wallet, COD.

---

## Success criteria mapping

| Requirement | How addressed |
|-------------|----------------|
| WebView handles redirects / returns to app | Handoff any frame; return URL detection; blank recovery; backend 200 HTML on return |
| Verify with backend, not bank redirect | `watchWorldlineStatus` + `completeGatewayPayment` use `/worldline/status` only for paid |
| Success / Pending / Failure UI | Paid → OrderPlaced; pending/failed → Payment not confirmed / failed with retry |
| Exactly one order, no double charge | Existing idempotency + unpaid reuse; Close/abort only before bank; watch does not create orders |
| Delayed callbacks, timeouts, backgrounding | Poll up to ~2 min; AppState resume restarts watch after progress |
| Preserve UPI / NB / Wallet / COD | Shared WebView improvements; method-specific paths not mocked |
