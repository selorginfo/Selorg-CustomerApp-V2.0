# Worldline Android Docs Audit — Selorg Customer App (WebView)

**Date:** 25 Nov 2026  
**Official source:** [Paynimo Checkout Docs — Android Online](https://www.paynimo.com/paynimocheckout/docs/?device=android#online)  
**Architecture under audit:** React Native WebView + hosted Paynimo `checkout.js` (not `WLCheckoutActivity` native SDK)  
**Constraint:** No migration to native SDK; no merchant/API/Web-flow changes in this audit.

---

## Executive verdict

| Area | Vs official Android docs | Verdict |
|------|--------------------------|---------|
| AndroidSH2 + SHA-512 request token | Aligned with SDK sample (`AndroidSH2`) + SHA-512 | **PASS** |
| Request token pipe (17 fields + salt) | Matches documented pipe order | **PASS** |
| Response `msg` pipe + dual hash verify | Matches documented verify string | **PASS** |
| Status codes 0300 / 0398 / 0399 / 0396 / 0392 | Mapped correctly for capture semantics | **PASS** |
| Order paid only after verified success | Enforced (`hashOk` + `0300` + amount) | **PASS** |
| Checkout delivery surface | Docs show native `WLCheckoutActivity`; we use WebView hosted checkout | **DEVIATION (by design)** |
| Callback lifecycle | Docs: in-process SDK listener; we: `returnUrl` POST + `responseHandler` + status poll | **DEVIATION (by design)** |

Crypto, status mapping, and order sync match the official **payment contract**. Differences are in **how** checkout is presented (WebView hosted vs native activity), which you asked to keep.

---

## 1. AndroidSH2 and SHA-512 token generation

### Official docs

- Field table (Android): `ANDROIDSH1` → SHA-256, `ANDROIDSH2` → SHA-512.  
- Native Android **sample code** uses mixed case: `"deviceId": "AndroidSH2"` (comment: `"AndroidSH1"` or `"AndroidSH2"`).  
- Request token:  
  `merchantId|txnId|totalamount|accountNo|consumerId|consumerMobileNo|consumerEmailId|debitStartDate|debitEndDate|maxAmount|amountType|frequency|cardNumber|expMonth|expYear|cvvCode|SALT`  
  hashed with the algorithm implied by `deviceId`.  
- Token must be generated **server-side**; salt must not be on the client.

### Selorg implementation

| Item | Location | Value |
|------|----------|--------|
| Platform → deviceId | `selorg-service/.../worldline.crypto.ts` `deviceIdForPlatform('android')` | `AndroidSH2` (default `sh2`) |
| Hash | `hashForDeviceId` | `*SH2` → `sha512` hex |
| Request token | `computeToken` | Same 17-segment pipe; server-only (`WORLDLINE_SALT`) |
| Live DB (android) | `worldline_customer_app_payment.json` | `deviceId: "AndroidSH2"` |

### Deviations

| Finding | Severity | Notes |
|---------|----------|--------|
| Docs table spells `ANDROIDSH2`; SDK sample + our code use `AndroidSH2` | **Low / accepted** | Hash algo selection uppercases and checks `SH2` suffix; casing of the full string is not part of the token pipe. Aligns with official **sample**, not the table spelling. |
| Salt never on Customer App | **None** | Compliant |

**Result: PASS** for SHA-512 + AndroidSH2 request signing.

---

## 2. Merchant `returnUrl` and POST callback handling

### Official docs

- **Web** hosted checkout: `returnUrl` mandatory; response posted as `msg` (pipe) to that URL.  
- **Native Android SDK sample:** no `returnUrl` in the JSON; response delivered via  
  `wlCheckoutPaymentResponse(JSONObject)` / `wlCheckoutPaymentError(JSONObject)`.

### Selorg implementation

| Path | Behaviour |
|------|-----------|
| Session payload | Always includes `returnUrl` → `https://api.selorg.com/api/v1/customer/payments/worldline/return` (same as Web) |
| Hosted JS | `$.pnCheckout(sessionPayload)` inside WebView (`paynimoCheckout.ts`) |
| Gateway | POSTs `msg` to API return (web-style) |
| Backend | `worldlineReturn` → `processGatewayReturn` → hash verify → update payment/order → HTML bridge |
| App | Keeps WebView until return POST completes (see prior callback fix); then polls `/worldline/status` |

### Deviations

| Finding | Severity | Notes |
|---------|----------|--------|
| Uses web `returnUrl` POST instead of native activity callback | **By design** | Required for RN WebView + hosted checkout; not a crypto mismatch. |
| Native SDK also returns `{ msg, merchant_code }` in-process; we primarily persist via server return POST | **By design** | Dual path exists: `responseHandler` can postMessage to RN → optional `/complete`. Live successes were `gateway_return`. |

**Result: PASS** for merchant return POST contract (web pattern). **Documented deviation** from native SDK lifecycle only.

---

## 3. Worldline response handling

### Official docs (Android success path)

```json
{
  "msg": "txn_status|txn_msg|txn_err_msg|clnt_txn_ref|tpsl_bank_cd|tpsl_txn_id|txn_amt|clnt_rqst_meta|tpsl_txn_time|bal_amt|card_id|alias_name|BankTransactionID|mandate_reg_no|token|hash",
  "merchant_code": "L3348"
}
```

Error path (non-payment): `{ "error_code": "0399", "error_desc": "..." }` via `wlCheckoutPaymentError`.

### Selorg

- Parses pipe `msg` via `parsePipeMsg` / `normalizeWorldlineGatewayPayload` (same field order).  
- Accepts aliases (`tpslTxnId`, nested SDK objects, etc.).  
- App does **not** treat `paynimo_bridge=1` presentation redirects as capture (`shouldSubmitGatewayResponse`).  
- Paid UI requires `isWorldlinePaidStatus` / order `paymentStatus: paid`.

### Deviations

| Finding | Severity | Notes |
|---------|----------|--------|
| No dedicated `wlCheckoutPaymentError` activity hook | **Low** | WebView uses status poll + failed/cancelled mapping instead of native error listener. |
| Hosted `responseHandler` looks at `paymentMethod.paymentTransaction.statusCode` (web sample) in addition to `msg` | **None** | Compatible with hosted JS docs; still verifies on server before paid. |

**Result: PASS** on response field contract.

---

## 4. Response hash verification (dual verification)

### Official docs

Rebuild:  
`txn_status|…|mandate_reg_no|token|SALT`  
(hash algorithm same as request `deviceId`).  
Compare to `hash` segment of `msg`. Match → trust status; mismatch → technical failure UI / do not trust.

### Selorg

`verifyGatewayResponse` → `computeResponseHash` with identical field order + salt + `payment.deviceId`.  
Mismatch → `verificationError: hash_mismatch`, status forced to `unknown` (not hard-fail order as bank decline).  
Amount also checked against session `amountInr`.

### Deviations

| Finding | Severity | Notes |
|---------|----------|--------|
| On mismatch we keep `unknown` + reconcile instead of only showing “technical error” | **Low / safer** | Avoids voiding a possible debit; docs allow failure UI but do not require cancelling the order. |

**Result: PASS** (hash algorithm and pipe match docs).

---

## 5. Transaction status mappings

| Official `txn_status` | Official meaning | Selorg `mapStatus` | Order sync |
|----------------------|------------------|--------------------|------------|
| `0300` | Success | `success` | `markOrderPaidAtomically` only if hash+amount OK |
| `0398` | Initiated | `pending` | Not paid; poll / reconcile |
| `0399` | Failure | `failed` | May void unpaid online order |
| `0396` | Awaited | `pending` | Not paid; never treated as fail |
| `0392` | Aborted | `cancelled` | Not paid |

Labels (`mapStatusLabel`) match docs: Captured / Pending / Failed / Awaited / Cancelled by User.

### Deviations

| Finding | Severity | Notes |
|---------|----------|--------|
| Docs wording “Initiated/Awaited/Aborted” vs internal enums `pending`/`cancelled` | **None** | Semantics preserved for DB/UI. |
| Extra codes (`0002`, string aliases) | **None** | Defensive; outside Android table. |

**Result: PASS**.

---

## 6. Backend payment and order status synchronization

Flow after verified gateway body:

1. Update `worldline_payments` (`status`, `statusCode`, `tpslTxnId`, `verificationSource`, `rawGatewayReturn`).  
2. If `success` + `verificationError: none` → `markOrderPaidAtomically` → `paymentStatus: paid` + fulfillment release.  
3. Client polls `GET /worldline/status` (`uiState` PAID / PENDING_VERIFICATION / FAILED…).  
4. Reconciliation job / Type O inquiry can recover missing return POSTs.

**Never paid without verified capture** — matches docs dual-verification requirement.

### Deviations vs native docs only

- Native sample updates merchant DB in the activity callback; we update on **server** when return/`complete` arrives, then sync clients via status API. Preferable for Web + Admin consistency.

**Result: PASS**.

---

## 7. WebView lifecycle vs official Android SDK callback lifecycle

```text
OFFICIAL NATIVE ANDROID
  Activity → WLCheckoutActivity.setPaymentResponseListener(this)
          → WLCheckoutActivity.open(context, reqJson)   // no returnUrl in sample
          → wlCheckoutPaymentResponse({ msg, merchant_code })
          → verify hash locally / on server
          → wlCheckoutPaymentError({ error_code, error_desc })  // non-payment errors

SELORG CUSTOMER APP (WebView — intentional)
  RN → POST /worldline/session (server signs AndroidSH2 token)
     → WorldlineCheckoutWebView loads hosted checkout.js + pnCheckout(payload with returnUrl)
     → Card/OTP inside WebView
     → Gateway POST msg → API /worldline/return  (must complete before WebView unmount)
     → optional responseHandler → RN postMessage → /complete
     → GET /worldline/status until PAID / failed / cancelled
```

| Topic | Native docs | Selorg WebView | Gap? |
|-------|-------------|----------------|------|
| Entry | `WLCheckoutActivity.open` | `$.pnCheckout` in WebView | By design |
| `returnUrl` | Omitted in Android sample | Required (hosted) | By design |
| Success delivery | Activity listener JSON | Server POST `msg` (+ optional JS handler) | By design |
| Error delivery | `wlCheckoutPaymentError` | Status/failed UI + poll | Acceptable gap |
| SMS auto-read OTP | Manifest permissions / features | Not used (issuer page in WebView) | By design |
| `enableExpressPay` in sample | `true` | Forced `false` for orders | Intentional UX |
| `merchantLogoUrl` | In sample | Not set | Cosmetic |
| Amount formatting | Sample `"1"` | `"xx.00"` two decimals | Stricter / correct for token |
| `itemId` | Sample `"first"` | Scheme `FIRST` | Config-driven |

**Result:** Lifecycle **differs by architecture**; payment **security contract** still matches docs.

---

## Summary of actionable deviations (no change in this audit)

1. **By design — keep:** WebView + hosted checkout + `returnUrl` POST instead of `WLCheckoutActivity`.  
2. **By design — keep:** Server-centric verify + order sync + status poll.  
3. **Watch:** Ensure Android WebView never unmounts before return POST completes (already fixed in `WORLDLINE_ANDROID_CALLBACK_FIX_REPORT.md`). That issue was an integration bug vs web POST behaviour, not a hash/docs mismatch.  
4. **Optional later (not required for compliance):** surface native-style non-payment `error_desc` more explicitly if hosted SDK emits them without `msg`.  
5. **Do not change:** merchant id/salt, APIs, Web payment flow, or migrate to native SDK (per your constraint).

---

## Compliance checklist (requested items)

1. **AndroidSH2 + SHA-512 token** — Compliant (sample casing + SHA-512).  
2. **Merchant returnUrl + POST** — Compliant for hosted WebView pattern.  
3. **Response handling** — Compliant (`msg` pipe + safe client rules).  
4. **Response hash verification** — Compliant (dual verification).  
5. **Status maps 0300 / 0398 / 0399 / 0396 / 0392** — Compliant.  
6. **Backend payment/order sync** — Compliant; paid only after verified success.  
7. **Vs native SDK lifecycle** — Deviations documented; architecture unchanged.

---

## Remediation applied (25 Nov 2026) — docs alignment without native SDK

Kept React Native WebView + hosted `checkout.js` (no `WLCheckoutActivity` migration). Aligned Customer App handling with official Android online status/`msg` contract:

| Change | File | Why |
|--------|------|-----|
| Parse `txn_status` from pipe `msg` (`0300`/`0398`/`0399`/`0396`/`0392`) | `src/utils/worldline.ts` | Android docs callback is often `{ msg }` only; bare `hasPayload` previously treated Initiated/Awaited as complete |
| `hostedGatewayDecision` keeps open on `0398`/`0396`; completes on verified `0300`/`0392`/`0399` | same | Matches official status meanings |
| `responseHandler` accepts Android `{ msg, merchant_code }` and web nested `statusCode` | `src/utils/paynimoCheckout.ts` | Docs dual callback shapes |
| Features: `enableAbortResponse` + `enableMerTxnDetails` true (Android sample); express-pay still false | same | Sample alignment without empty-instrument UX regression |
| Viewport meta per docs (`user-scalable=no`) | same | Hosted checkout recommendation |
| Unit tests for all five msg status codes | `__tests__/worldlineReturn.test.ts` | Regression |

**Still by design (not changed):** native SDK migration, merchant credentials, backend APIs, Web payment flow, `AndroidSH2` casing (matches SDK sample + live captures), `returnUrl` (required for hosted WebView).

**Tests:** `worldlineReturn` + `paynimoCheckout` + `checkoutNavigation` — **37 passed**.
