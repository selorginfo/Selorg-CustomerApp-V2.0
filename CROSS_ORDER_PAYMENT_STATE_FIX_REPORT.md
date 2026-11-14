# Cross-order payment state fix (Card order → new COD order)

**Date:** 13 Nov 2026  
**App:** Selorg-CustomerApp-V2.0  
**Scenario:** Finish a card order → start a **new** cart → choose COD → must place COD (no Worldline).

---

## Root cause

Not in-checkout method switching. Leftover **OrdersContext** state from the finished card order polluted the next checkout:

1. **`payState` stayed `success`** after `completeGatewayPayment`.  
   - Payment screen treated `success` like an in-flight payment (“Processing…”).  
   - `placeOrder` / `handlePay` bailed out, so COD never ran.

2. **Stale `gatewaySessionPayload` + `awaiting_gateway`** could still be present if the user closed/exited without a clean reset. Opening Payment again remounted the Worldline WebView.

3. **`unpaidOnlineOrderRef` from the previous order** could still point at that order. A new-cart COD path treated it as the current attempt (`already_paid` / block / abort), instead of starting a clean COD order.

4. **Status watch used `pendingGatewayOrderId || activeOrder?.id`**, so a watch could poll the **previous** finished order.

5. **Checkout `navigate('Payment', { method })` merged params**, so an old `orderId` on the Payment route could survive into the next visit.

No AsyncStorage/MMKV persistence of gateway state was found — this was React Context + navigation params.

---

## Fix

| Change | Purpose |
|--------|---------|
| `prepareFreshPaymentSession()` | On Payment focus for a new checkout: clear WebView session, reset terminal/`awaiting_gateway` payState, detach unpaid ref if it belongs to another cart. Does **not** cancel legitimate server orders blindly. |
| `unpaidBelongsToCurrentCart` / `cartContentsKey` | Same-cart Card→COD still sees the open attempt; a **new** cart does not inherit it. |
| `placeOrder` | Resets leftover `success`/`failed` before placing; COD never opens Worldline; cross-cart unpaid ref is detached only. |
| Status watch | Uses **only** `pendingGatewayOrderId`. |
| Checkout navigate | `merge: false` so prior `orderId` cannot stick. |
| Payment UI | Do not show the processing wall for stale `payState === 'success'`. |

---

## Files changed

- `src/context/OrdersContext.tsx`
- `src/screens/orders/PaymentScreen.tsx`
- `src/screens/cart/checkout.tsx`
- `src/utils/paymentAttempt.ts`
- `__tests__/paymentAttempt.test.ts`

---

## Test results

| Suite | Result |
|-------|--------|
| paymentAttempt (incl. new-cart vs same-cart + success reset) | PASS |
| worldlineReturn | PASS |
| checkoutNavigation | PASS |
| paynimoCheckout | PASS |
| worldlineStatusWatch | PASS |
| **Total** | **38/38 PASS** |
| Live: Card → Close/finish → new cart → COD | **NOT RUN** — no ADB device attached this session |

---

## Expected sequence after fix

1. Card order completes (or Close after capture) → Order Placed.  
2. New cart → Checkout → COD → Payment.  
3. Focus runs `prepareFreshPaymentSession` → no WebView, payState idle.  
4. Place order → COD `cod_pending` → Order Placed.  
5. History of the prior paid/unpaid online order remains on the server; only client session leakage is cleared.

**Issue status:** Code fix + unit regression done. **Not device-verified** for the exact live sequence until a phone is connected.
