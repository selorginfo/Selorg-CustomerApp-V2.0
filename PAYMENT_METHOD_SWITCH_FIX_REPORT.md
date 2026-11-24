# Payment method switch fix (Card → COD)

**Date:** 13 Nov 2026  
**App:** Selorg-CustomerApp-V2.0  
**Verdict:** Root cause fixed in code; unit regression **36/36 PASS**. Live device Card→COD still needs a connected phone.

---

## Root cause

Three bugs stacked after a Worldline card/UPI attempt:

1. **Sticky “Payment not confirmed” UI**  
   After a blank WebView / pending poll, `unconfirmed` stayed set. The failure sheet rendered whenever `unconfirmed` was truthy — **even after the shopper selected COD**. Tapping “Pay cash on delivery” looked like a reload back to the card payment screen.

2. **`block_other_method` for every non-terminal online status**  
   `retryWhileHeld(..., 'cod')` blocked COD for `WAITING_FOR_PAYMENT` / `created` as well as true `PENDING_VERIFICATION`. An abandoned card attempt left an unpaid online order that forever blocked COD.

3. **`placeOrder` race with `awaiting_gateway`**  
   Switching method cleared the WebView via `setPayState('idle')`, but `placeOrder` still closed over the previous `awaiting_gateway` and returned `{ success: false }` without placing COD — another “reload / nothing happens” path.

Cart, address, and line items were never the problem; stale gateway UI + guard logic were.

---

## Fix

| Area | Change |
|------|--------|
| `onlineInterruptsMethod` | Unconfirmed / online failure sheets only interrupt while method is **online**. |
| `switchFromOnlineDecision` | COD/wallet: clear abandoned `WAITING_FOR_PAYMENT`; block only `PENDING_VERIFICATION`; finish if already paid. |
| `placeOrder` (non-online) | Abort Worldline + cancel unpaid online order when clear is allowed; clear WebView session; new idempotency key; never open Paynimo for COD/wallet. |
| `payStateRef` | COD/wallet can place while a session was awaiting; online still cannot double-open. |
| `PaymentScreen` | Selecting COD/wallet or “Pay cash on delivery” clears `unconfirmed`, aborts status watch, dismisses WebView; then places COD. |

Paid status still comes only from the backend. No mock success.

---

## Files changed

- `src/utils/worldline.ts` — `switchFromOnlineDecision`
- `src/utils/paymentAttempt.ts` — `onlineInterruptsMethod`
- `src/context/OrdersContext.tsx` — method-switch abandon path, `payStateRef`, `retryPayment` clears session ids
- `src/screens/orders/PaymentScreen.tsx` — clear WebView/unconfirmed on switch; COD path
- `__tests__/worldlineReturn.test.ts`
- `__tests__/paymentAttempt.test.ts`

---

## Test results

| Test | Result |
|------|--------|
| `paymentAttempt` (incl. unconfirmed → COD) | PASS |
| `worldlineReturn` (incl. `switchFromOnlineDecision`) | PASS |
| `checkoutNavigation` | PASS |
| `paynimoCheckout` | PASS |
| `worldlineStatusWatch` | PASS |
| **Total** | **36/36 PASS** |
| Live Card → COD / Debit → COD / UPI → COD / Wallet → COD on device | **NOT RUN** (no ADB device) |

---

## Expected behaviour after fix

1. Card attempt fails / blank / Close → “Pay cash on delivery” places a **COD** order (or shows paid if the card already captured).  
2. Worldline WebView and pending callbacks are cleared; COD does **not** reopen Paynimo.  
3. Cart and address stay; one new COD order after aborting the unpaid online attempt (or reuse of paid online order — never two charges).  
4. If status is `PENDING_VERIFICATION`, COD stays blocked with a clear message (avoid double charge).
