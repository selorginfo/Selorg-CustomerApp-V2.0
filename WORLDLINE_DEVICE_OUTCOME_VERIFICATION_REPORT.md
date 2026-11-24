# Worldline Credit/Debit Card — real-device outcome verification

**Date:** 13 Nov 2026, ~17:32 IST  
**App:** Selorg-CustomerApp-V2.0  
**Requirement:** Do not claim fully fixed until real Android device testing passes.

---

## Verdict: **NOT PASS — not fully fixed**

Real-device verification of Success / Failed / Pending card outcomes **did not run**. No Android device was attached to ADB.

| Outcome | Required | Device result |
|---------|----------|---------------|
| 1. Successful payment → auto Payment Success + Order Details (no Close) | Must PASS on device | **NOT RUN** |
| 2. Failed payment → auto Payment Failed + retry | Must PASS on device | **NOT RUN** |
| 3. Unconfirmed → Payment Pending + backend reconcile | Must PASS on device | **NOT RUN** |
| No blank white Secure Payment screen | Must PASS | **NOT RUN** |
| No infinite loading | Must PASS | **NOT RUN** |
| Bank OTP redirect + delayed callback + app resume | Must PASS | **NOT RUN** |

**Overall issue status: open / not fully fixed**

---

## Device connectivity (blocker)

| Check | Result |
|-------|--------|
| `adb devices` | Empty |
| mDNS `_adb-tls-connect` | None advertised at verification time |
| `192.168.0.12:42045` / `.14:42045` | Connection refused / timed out |
| USB Samsung debug device | Not present |
| Emulator `Pixel_9` | Available — **not used** (not a real bank OTP / debit path) |

Without a device, APK install, logcat (`paynimo` / status watch), and live card OTP cannot be executed.

### Unblock (then re-run this checklist)

1. Phone: **Developer options → Wireless debugging → ON** (toggle off/on).  
2. Note **IP address & Port** from that screen.  
3. PC: `adb connect <ip>:<port>` → `adb devices` must show `device`.  
   Or USB + authorize debugging.  
4. Install latest debug APK and run the three outcomes below.

```text
adb install -r "android\app\build\outputs\apk\debug\selorg-customer-app-2.0.0.apk"
adb logcat -c
adb logcat -v time ReactNativeJS:I *:S
```

Watch for: `paynimo`, `blank-page`, `handoff`, `Confirming`, status polls, navigation to Order Placed / Payment failed / Payment not confirmed.

---

## What is ready (not a substitute for device PASS)

| Item | Status |
|------|--------|
| Code fixes (WebView handoff, blank recovery, status watch, cross-order session reset, COD switch) | In tree |
| Unit regression (payment / Worldline suites) | Previously **38/34+ PASS** in this branch |
| Debug APK rebuild for device install | Attempted this session (see build log) |

Code readiness ≠ device PASS for Success / Failed / Pending.

---

## Device test plan (must all pass before “fully fixed”)

### A. Credit card — Success
1. New cart → Pay online → card → OTP authorize.  
2. Expect: “Confirming your payment…” then **Order placed** / order details **without Close**.  
3. Confirm `GET /payments/worldline/status` → PAID; one order; cart cleared.  
4. Background during OTP, resume — still settles correctly.

### B. Debit card — Success
Same as A on a card with e-commerce enabled (prior BOI 4393 had e-commerce disabled — that is a bank block, not an app PASS).

### C. Failed payment
Decline / wrong OTP / cancel at bank.  
Expect: **Payment failed** (or not confirmed) with **Retry** — no blank WebView stuck forever; no Close required to leave.

### D. Unconfirmed / delayed callback
Slow return or blank bank page after debit.  
Expect: Pending / not confirmed UI; backend reconcile via status poll; paid later → order paid once; no duplicate charge.

### E. Negatives
- No infinite spinner on Secure Payment.  
- No white Secure Payment with only Close as escape for a settled txn.  
- UPI / COD / Wallet still work after a card attempt (separate checks).

---

## Explicit non-claims

- This report does **not** claim Credit or Debit Success/Failed/Pending PASS.  
- Emulator was not used as a stand-in for real Worldline OTP.  
- Prior unit tests and code changes do **not** close this verification gate.

---

## Next step

Reconnect the Samsung so `adb devices` lists it, install the latest debug APK, and execute A–D above. Only then can the Worldline card flow be marked fully fixed.
