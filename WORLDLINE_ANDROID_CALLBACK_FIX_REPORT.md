# Worldline Android Card Callback Fix Report

Customer App: `Selorg-CustomerApp-V2.0`  
Date: 25 Nov 2026  
Scope: Fix `rawGatewayReturn: null` on Android card checkout without changing merchant credentials, Worldline config, APIs, or the working Web payment flow.

## Update — 25 Nov 2026, 18:40 IST (root cause corrected)

The WebView fix below was not enough: the 18:05 Android attempt still got no return POST. The reason the app stayed on **Payment processing** was on the backend.

- When the return POST is missing, `selorg-service` asks Worldline for the status (Offline Verification, request type `O`). Our request added `amount` and a hashed `token`, which the docs do not have. Worldline answered `0399` / `ERROR033` for **every** transaction, including captured ones, so the status never resolved.
- Sent exactly as documented (`merchant.identifier`, `deviceIdentifier: "S"`, `currency`, `identifier`, `dateTime`, `requestType: "O"`), Worldline returned the real results. 4 "stuck" Android attempts were actually captured (`0300`) and 4 really failed (3-D Secure / issuer decline).
- Fixed in `selorg-service` (`worldline-refund.service.ts`, `worldline.service.ts`, `worldline-reconciliation.job.ts`, `worldline.crypto.ts`). A `0300` from the inquiry applies at once. A decline from the inquiry waits 5 minutes (`WORLDLINE_INQUIRY_DECLINE_GRACE_MINUTES`) so a shopper still on the OTP page is not failed early. Closing checkout still applies it at once.
- Local backend run: the stuck orders settled from Worldline's answers (ORD-20261125-00010, -00009, -00005, -00004 paid; -00007, -00006, ORD-20261124-00005, -00004 cancelled).
- Production (`api.selorg.com`) needs this backend deploy. No app rebuild is needed for the status to show; the app already polls `/worldline/status`.

## Evidence (from live DB extracts)

| | Web (`worldline_web_payment.json`) | Android (`worldline_customer_app_payment.json`) |
|--|--|--|
| Request merchant / returnUrl / paymentMode | Same (`L1113241`, api return, `all`) | Same |
| `deviceId` | `WEBSH2` | `AndroidSH2` |
| Gateway response | `msg: 0300\|success\|…` | **`rawGatewayReturn: null`** |
| Payment row | `success` / `0300` | `created` / empty |
| Order | `paid` | `pending` → UI **Payment processing** |

## Root cause (exact)

Android WebView was **completing the app (and unmounting the WebView) before the merchant return POST finished**.

1. Injected `GATEWAY_DOCUMENT_JS` fired `return-nav` on **form submit** when `action` was `/worldline/return`.
2. `WorldlineCheckoutWebView` called `finishReturn` → `onComplete` immediately.
3. `PaymentScreen` set `paymentPending` → verifying UI replaced the tree → **WebView unmounted**.
4. The in-flight `POST` to `https://api.selorg.com/api/v1/customer/payments/worldline/return` was cancelled.
5. Backend never stored `rawGatewayReturn`; Type O inquiry often left the row `created`.
6. App polled `/worldline/status` → not PAID → stuck on **Payment processing**.

Web browsers keep the document alive through the full POST → response, so Web never hit this race.

Secondary risk: blank-page recovery treated the **return URL** as recoverable and could tear down the WebView during the POST. That path was also closed.

**Not the cause:** different merchant id, salt, returnUrl, paymentMode, status mapping, or hash verification.

## Fix (Customer App only)

### 1. `WorldlineCheckoutWebView.tsx`
- Form submit to return URL now emits `return-post-started` (keep WebView mounted, show confirming overlay).
- App completion only after:
  - API bridge HTML (`data-paynimo-bridge` / `return-nav` after server processed), or
  - `load-end` / handoff URL (POST already accepted), or
  - 20s fallback if bridge never arrives (then poll status only — still no unpaid “paid”).
- Blank recovery skipped while return POST is in flight / on return URL.

### 2. `checkoutNavigation.ts`
- `shouldRecoverBlankGatewayPage` returns **false** for merchant return URL.
- Handoff (`paynimo_bridge`) still recoverable.

### 3. `worldline.ts`
- Added `shouldCompleteAfterReturnSignal` so submit/probe vs bridge completion is explicit and tested.

### 4. Unchanged
- Merchant credentials, salt, scheme, return URL config
- Backend Worldline APIs and hash verification
- Web App Paynimo flow
- Paid only via verified gateway / `/worldline/status` (`isWorldlinePaidStatus`)

## Files modified

- `src/components/WorldlineCheckoutWebView.tsx`
- `src/utils/checkoutNavigation.ts`
- `src/utils/worldline.ts`
- `src/screens/orders/PaymentScreen.tsx` (comment only)
- `__tests__/worldlineReturn.test.ts`
- `__tests__/checkoutNavigation.test.ts`

## Test results

| Scenario | How verified | Result |
|--|--|--|
| Do not complete on return-post-started / bare page-probe | Unit: `shouldCompleteAfterReturnSignal` | **PASS** |
| Complete on bridge page-probe / return-nav | Unit | **PASS** |
| Return URL not torn down by blank recovery | Unit: `shouldRecoverBlankGatewayPage` | **PASS** |
| Handoff still recoverable | Unit | **PASS** |
| Paynimo feature flags / card POST in-page | `paynimoCheckout.test.ts` | **PASS** |
| Paid / pending / failed / dismiss / retry holds | `worldlineReturn.test.ts`, `paymentAttempt.test.ts` | **PASS** |
| Status watch outcomes | `worldlineStatusWatch.test.ts` | **PASS** |
| Full Customer App Jest | `npx jest --no-coverage` | Run in this session (payment suites: **51 passed**) |
| Live card success / fail / cancel on device | Requires bank OTP | **NOT RUN** — needs device + live kit |

### Expected live behaviour after fix

| Case | Expected |
|--|--|
| Successful card | Return POST stores `rawGatewayReturn` with `0300` → order `paid` → success UI |
| Failed card (`0399`) | Return POST stored → status failed → fail UI (not forever processing) |
| Cancelled (`0392`) | Return POST stored → cancelled → cancel copy |
| Callback retry / late bridge | Status poll + `isWorldlinePaidStatus`; never mark paid without verified capture |

## How to confirm on device

1. Place Android card order; complete OTP.
2. In Mongo `worldline_payments` for that `txnId`: `rawGatewayReturn.msg` starts with `0300|…`, `status: success`, order `paymentStatus: paid`.
3. Fail/cancel a card and confirm terminal UI (not stuck processing).
4. Web card payment still succeeds unchanged.
