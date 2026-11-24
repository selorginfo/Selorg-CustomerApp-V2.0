# Worldline card payment fix report

Customer App: `Selorg-CustomerApp-V2.0`  
Date: 11 Nov 2026  
Scope: Paynimo card checkout in the in-app WebView. Backend merchant configuration was not changed.

## Confirmed root causes

1. Card **Next** never opened the card form. `paynimoCheckout.ts` set `enableNewWindowFlow` to `false` in the session features and again in the page script. Paynimo then replaced the page with `consumerData.returnUrl` before the card fields. The web app and the rider app both set this flag to `true`.
2. `WorldlineCheckoutWebView` cancelled that navigation when the URL had no query payload. A real card return is a POST: `msg` and `hash` are in the body, not the query string, so the return never reached `https://api.selorg.com/api/v1/customer/payments/worldline/return`.
3. `isWorldlineReturnUrl` matched any URL containing `txnstatus`, `status=success`, `status=failed`, or `status=cancelled`. Bank OTP and 3-D Secure pages were treated as the merchant callback.
4. Android `setSupportMultipleWindows` stayed at its default (`true`) and there was no iOS handler for `window.open`, so the bank page could open off-screen. Every non-HTTPS URL was rejected, including issuer ACS pages on `http`.
5. Close always called `abortWorldlinePayment`. During OTP the payment row is often still `created`, so abort cancelled an order the bank may already have authorized. The next Pay created another order. A redirect or SDK message was not itself marked paid (status is polled), but a pending poll used to land on the hard failure screen.

No backend defect was proven. Hash check, amount check, merchant id, salt, and return URL were left as they are.

## Fixes implemented

- Card checkout uses `enableNewWindowFlow: true`. `enableTopWindowRedirection` and `singleBankForceRedirect` stay `false`. The script no longer forces the flag back to `false`.
- The WebView keeps card and 3-D Secure windows in the same view: `setSupportMultipleWindows={false}` on Android. On iOS, `onOpenWindow` loads the allowed URL in that same view.
- Navigation is classified before it loads. UPI app links still open externally. HTTPS bank pages are allowed. HTTP is allowed only for the merchant return, Paynimo/Worldline hosts, and ACS/OTP hosts. Other HTTP URLs and unknown schemes are blocked.
- The Worldline return URL is recognized by path (`/payments/worldline/return`, `/paynimo-return`) or by `paynimo_bridge=1` on a Selorg host. The load is not cancelled. The app notifies the screen only after the document finishes, so the POST body can reach the API.
- Paid is taken only from `GET /payments/worldline/status` (`0300` / `PAID` / wallet credited). A `status=success` query or `paynimo_bridge` redirect is not posted to `/worldline/complete` and is not treated as a capture.
- Close reads that status first. Paid finishes the order. Pending, unknown, a status outage, or a checkout that already reached a bank host is held and not aborted. Abort runs only when the shopper leaves before the bank page. A gateway failure is closed without a second abort.
- While an attempt can still capture, online retry reuses that order. Cash and wallet are refused until the attempt is terminal, so a second order is not created beside an in-flight card charge.
- Wallet card top-up uses the same WebView. Balance reloads only after status says paid. A pending top-up is not aborted and is not credited locally.

## Modified files

- `src/utils/paynimoCheckout.ts`
- `src/utils/worldline.ts`
- `src/utils/checkoutNavigation.ts` (new)
- `src/components/WorldlineCheckoutWebView.tsx`
- `src/context/OrdersContext.tsx`
- `src/context/WalletContext.tsx`
- `src/screens/orders/PaymentScreen.tsx`
- `__tests__/paynimoCheckout.test.ts`
- `__tests__/worldlineReturn.test.ts` (new)
- `__tests__/checkoutNavigation.test.ts` (new)

`src/screens/wallet/index.tsx` was not edited. It already mounts `WorldlineCheckoutWebView` for card top-up, so it picks up the WebView and `cancelTopUp` behavior.

Backend files were not modified.

## Tests executed

| Command | Result |
|---|---|
| `npx jest --no-coverage` in `Selorg-CustomerApp-V2.0` | **PASS.** 22 suites, 84 tests, exit 0. Time 24.8s. |
| `npx eslint` on the files listed above | **PASS for the new code.** Exit 1 only because `PaymentScreen.tsx` already warned on `useFocusEffect` missing `wallet` and on existing `void` expressions. No new lint errors. |
| `npx tsc --noEmit` | **Payment files clean.** The project still exits 2 on older errors in coupons, home banners, YouTube URL parsing, and a few tests. None of those lines are in this change. |
| `npx react-native bundle --platform android --dev false` | **PASS.** Metro wrote the Android bundle and copied 43 assets. Exit 0. |
| `npx react-native bundle --platform ios --dev false` | **PASS.** Metro wrote the iOS bundle and copied 39 assets. Exit 0. |

The bundle output was deleted after the commands succeeded. It was a compile check, not an installed build.

### New regression tests (all passed inside the 84)

- `enableNewWindowFlow` is `true` in the payload and in the page script, and is not set back to `false`. The other two flags stay `false`.
- Bare `https://api.selorg.com/.../worldline/return` is a return URL and is not submitted as a capture.
- `paynimo_bridge=1&status=success` is not submitted to `/complete`.
- HDFC/ICICI-style ACS URLs with `txnStatus` or `status=success` are not merchant returns.
- `http://evil.example/...` is blocked. `http://acs.../3ds` and `upi://` / PhonePe intents are allowed.
- Dismiss: paid → `finish_paid`, pending/unknown/bank OTP → `hold`, left before the bank → `abort`, gateway failure → `close_failed`.
- Held payment: online retry reuses the order; cash and wallet are blocked; a failed attempt can continue; a paid attempt is not charged again.

## Card, UPI, wallet, and cash

| Scenario | Result | Evidence |
|---|---|---|
| Card form flag and script no longer force a same-page replace | **PASS** (unit) | `paynimoCheckout.test.ts` |
| Return POST URL is not classified as “no result, cancel” | **PASS** (unit) | `worldlineReturn.test.ts`, `checkoutNavigation.test.ts` |
| 3-D Secure / OTP URL is not mistaken for the merchant return, and HTTP ACS is allowed | **PASS** (unit) | both new suites |
| Success is not taken from a redirect | **PASS** (unit) | `shouldSubmitGatewayResponse` rejects `status=success` and `paynimo_bridge` |
| Close does not abort paid or pending | **PASS** (unit) | `gatewayDismissAction` |
| Retry does not start cash/wallet beside an open card attempt | **PASS** (unit) | `retryWhileHeld` |
| UPI intent is still handed to the UPI app | **PASS** (unit) | `classifyCheckoutNavigation('upi://...')` |
| Wallet balance still comes from the wallet API, not a hardcoded credit | **PASS** (existing) | `walletBalance.test.ts` still green. Top-up credit still waits on `isWorldlinePaidStatus` |
| Cash vs wallet vs online settlement labels | **PASS** (existing) | `paymentAttempt.test.ts` |
| Card number, expiry, CVV, and a live OTP on a device | **NOT RUN** | No authorized gateway session |
| UPI app open and return on a device | **NOT RUN** | |
| Wallet debit and card top-up against the live API | **NOT RUN** | |
| Cash on delivery order on a device | **NOT RUN** | No order was placed |

## Android and iOS

| Check | Android | iOS |
|---|---|---|
| JS bundle (`react-native bundle`, dev false) | **PASS** | **PASS** |
| `setSupportMultipleWindows={false}` so `window.open` stays in this WebView | In the component. **Not exercised on a device or emulator** | Not an Android API. iOS uses `onOpenWindow` instead |
| Bank page and return POST inside the native WebView | **NOT RUN** | **NOT RUN** |
| Native `assemble` / Xcode install | **NOT RUN** | **NOT RUN** |

## Live gateway

**Not tested.** No card was authorized, no Worldline callback was captured from a device, and no order row was written by this session. Do not treat this report as a live payment success.

## Remaining blockers

- A real card, UPI, wallet top-up, and cash order still need a device pass against the live or staging Worldline kit before those flows can be called passed.
- `npx tsc --noEmit` is still red on unrelated files (coupons contract, home layout, YouTube parsing, a few tests).
- `PaymentScreen` still has the pre-existing `react-hooks/exhaustive-deps` error on `wallet.reloadWallet`.
- HTTP issuer pages are allowed only when the host or path looks like ACS/OTP. An issuer that uses a plain `http://` host with none of those markers will still be blocked. HTTPS issuer pages are allowed.
