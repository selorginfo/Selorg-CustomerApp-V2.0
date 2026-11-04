# Customer App – npm Security Audit Remediation Report

**Project:** `Selorg-CustomerApp-V2.0` (Selorg)  
**Branch:** `customerapp`  
**Date:** 2026-10-30  
**Approach:** Targeted `package.json` `overrides` only. **No** `npm audit fix --force`. React Native remains **0.83.10**. `@react-native-community/cli` remains **20.2.0**. No app source, navigation, Firebase, payment, or location code changes.

---

## 1. Original audit results

### 1.1 Production / omit=dev (`npm audit --omit=dev`)

**4 low severity vulnerabilities** — all from `deepmerge >=4.2.0` (CVE-2026-93753 / GHSA-gcqx-w48m-w2h4).

| Package | Severity | Why installed |
| --- | --- | --- |
| `deepmerge@4.3.1` | Low | `@react-native-community/cli@20.2.0` |
| `@react-native-community/cli` | Low | Direct `devDependency`; pulls `deepmerge` |
| `@react-native-community/cli-config` | Low | Via CLI; pulls `deepmerge` |
| `@react-native-community/cli-doctor` | Low | Via CLI; pulls `deepmerge` |

npm suggested `npm audit fix --force` → install `@react-native-community/cli@11.4.1` (breaking; incompatible with RN 0.83.10). **Not used.**

### 1.2 Full audit (`npm audit`) before remediation

**10 vulnerabilities (9 low, 1 high):**

| Package | Severity | Notes |
| --- | --- | --- |
| `deepmerge` (+ CLI / Jest chains) | Low | Same CVE as above; also via `jest-config` |
| `zod@4.4.3` | High | Via `@react-native/eslint-config` → `eslint-plugin-react-hooks` (dev-only) |

### 1.3 Project baseline

| Item | Value |
| --- | --- |
| React Native | `0.83.10` |
| React | `19.2.0` |
| `@react-native-community/cli` | `20.2.0` |
| Jest | `29.7.0` |
| Existing overrides | `@grpc/grpc-js@1.14.6`, `image-size@2.0.4` |
| Git status preserved | Pre-existing `android/*.gradle` mods + `ANDROID_RELEASE_SIGNING_AUDIT.md` left untouched |

---

## 2. Vulnerability root cause

- **Advisory:** [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) / CVE-2026-93753  
- **Issue:** `deepmerge` `mergeObject()` can allow prototype poisoning when merging objects containing `__proto__` keys.  
- **Affected upstream:** `deepmerge` `>=4.2.0` through latest **`4.3.1`** (last upstream publish ~March 2023).  
- **Official patched release:** **None.** Upstream issue remains open; no TehShrike `deepmerge` release fixes the CVE.  
- **Runtime exposure in this app:** `deepmerge` is used by RN CLI (config/doctor merge) and Jest config — **dev/tooling paths**, not shipped Customer App JS. Severity remains Low for omit=dev, but audit still fails compliance gates.

---

## 3. Remediation analysis (executed before implement)

### 3.1 Options evaluated

| Option | Verdict |
| --- | --- |
| `npm audit fix --force` → CLI `11.4.1` | **Rejected** — breaking; incompatible with RN 0.83 |
| Upgrade/downgrade React Native | **Rejected** — unnecessary; would not fix deepmerge (newer RN still depends on `deepmerge ^4.3.0`) |
| Wait for official `deepmerge` patch | **Not available** |
| `overrides`: `deepmerge` → `npm:@stackline/deepmerge@1.1.0` | **Accepted** after verification (same approach as Rider app) |
| `overrides`: `zod` → `4.6.7` | **Accepted** — patched within Zod 4.x; clears high advisory in full audit |

### 3.2 `@stackline/deepmerge@1.1.0` verification

| Check | Result |
| --- | --- |
| Identity | `@stackline/deepmerge@1.1.0`, MIT, Node `>=14.17.0`, zero runtime deps |
| Repository | Public `alexandroit/stackline-deepmerge` |
| Integrity | `sha512-bEQ1EpXrlu9PTTgKD9z85MWYGjDMv79fF2qn2LYdmukpuj6onkn5kZlRAu0PaZvUv9ZQerwtDVgIEn2LYtsE7w==` |
| Provenance | npm attestations present (SLSA provenance v1) |
| Exports | CJS `./dist/index.cjs` (callable), ESM `./dist/index.js`, types present |
| API parity | Pass — basic merge, array concat, CLI `arrayMerge` overwrite, `merge.all`, Babel `_interopRequireDefault` |
| CVE mitigation | Pass — `__proto__` dropped; `Object.prototype` not polluted; classic `constructor.prototype` payload blocked |
| Target compatibility | RN **0.83.10**, CLI **20.2.0**, Jest **29.7.0** |

**Note:** This is a third-party drop-in alias, not an official TehShrike release. Behavior matches `deepmerge@4.3.1` except where upstream is unsafe or crashes (prototype keys / cycles).

---

## 4. Dependency changes applied

### 4.1 Backups

- `.security-backups/package.json.20261030-174708.bak`
- `.security-backups/package-lock.json.20261030-174708.bak`

### 4.2 `package.json` overrides (current)

```json
"overrides": {
  "@grpc/grpc-js": "1.14.6",
  "deepmerge": "npm:@stackline/deepmerge@1.1.0",
  "image-size": "2.0.4",
  "zod": "4.6.7"
}
```

### 4.3 Before → after

| Package | Before | After | Notes |
| --- | --- | --- | --- |
| `deepmerge` | `4.3.1` | **`npm:@stackline/deepmerge@1.1.0`** | Alias override |
| `zod` | `4.4.3` | **`4.6.7`** | Dev ESLint chain |
| `react-native` | `0.83.10` | `0.83.10` | Unchanged |
| `@react-native-community/cli` | `20.2.0` | `20.2.0` | Unchanged |
| App source | — | — | **No source edits** |

---

## 5. Security verification (executed)

| Command | Result |
| --- | --- |
| `npm ls deepmerge` | All paths resolve to `deepmerge@npm:@stackline/deepmerge@1.1.0` (CLI, cli-config, cli-doctor, jest-config) |
| `npm ls @stackline/deepmerge` | Empty at top level (expected — installed **as** the `deepmerge` alias) |
| `npm audit --omit=dev` | **`found 0 vulnerabilities`** |
| `npm audit` | **`found 0 vulnerabilities`** |
| CLI merge smoke | `@react-native-community/cli/.../deepmerge` → `@stackline/deepmerge@1.1.0`; array overwrite merge OK |
| `npx react-native config` | Emitted project config JSON (CLI deepmerge path exercised) |

### Remaining vulnerabilities

**None reported by npm audit** at verification time.

---

## 6. Automated / regression testing (executed)

| Check | Result |
| --- | --- |
| `npm test` | **Pass** — 12 suites, **28 tests** passed |
| `npx tsc --noEmit` | **Fail (pre-existing)** — errors in coupons contract / Node types in tests; **not introduced by override** |
| `npm run lint` | **Pass** — 0 errors, 55 warnings (pre-existing style warnings) |
| `npx react-native config` | **Pass** |
| Android `:app:assembleDebug` | **Pass** — `BUILD SUCCESSFUL`; `android/app/build/outputs/apk/debug/selorg-customer-app-2.0.0.apk` |
| Android `:app:assembleRelease` | **Pass** — `BUILD SUCCESSFUL`; `android/app/build/outputs/apk/release/selorg-customer-app-2.0.0.apk` |
| Playwright / `test:automation` | **Not executed** in this session (requires live API/backend fixture) |

### Customer workflow checklist (Phase 3)

Interactive end-to-end workflows were **not executed** in this session (no emulator/device session started; override is tooling-only and does not alter app runtime bundles).

| # | Workflow | Status |
| --- | --- | --- |
| 1–25 | Launch, auth, Firebase/FCM, home, catalog, search, cart, address/GPS, darkstore, checkout, Paynimo, orders, profile, sockets, bg/fg | **Not executed on device** — manual QA still recommended |

Evidence that tooling paths still work: Jest (uses `jest-config` → deepmerge), RN CLI config, and Android packaging all succeeded after the override.

---

## 7. Device / emulator testing (Phase 5)

**Not executed.**

Evidence:

- `adb devices` → no devices/emulators attached  
- AVD `Pixel_9` is available but was **not** started in this session  
- No install/launch/OTP/payment/order flows were performed

Do not treat device regression as passed.

---

## 8. Breaking changes avoided

| Suggested by tooling | Action |
| --- | --- |
| CLI downgrade to 11.4.1 | **Not done** |
| `npm audit fix --force` | **Not used** |
| RN upgrade/downgrade | **Not done** |
| Feature / API / navigation / Firebase / payment / location code changes | **Not done** |

---

## 9. Known risks and limitations

1. **`@stackline/deepmerge` is a third-party fork.** Prefer switching back to official `deepmerge` if/when TehShrike publishes a patched release.  
2. **Override scope is global** for the package name `deepmerge` (CLI + Jest). Compatible with current consumers after smoke tests; re-verify after CLI/Jest major upgrades.  
3. **`zod` override** is limited to the ESLint/dev chain; no production Customer App Zod usage was changed.  
4. **TypeScript project errors** remain pre-existing and are unrelated to this remediation.  
5. **Device/manual E2E** and Playwright automation were not run here — schedule before production cutover if required by release process.  
6. **OneDrive path** can intermittently lock Gradle native-lib intermediates; a clean retry succeeded.

---

## 10. Files changed (this remediation)

- `package.json` — overrides for `deepmerge`, `zod`  
- `package-lock.json` — lockfile refresh after `npm install`  
- `.security-backups/*` — pre-change manifests  
- `CUSTOMER_APP_NPM_SECURITY_AUDIT_REPORT.md` — this report  

Unrelated pre-existing dirty files (`android/app/build.gradle`, `android/build.gradle`, `ANDROID_RELEASE_SIGNING_AUDIT.md`) were **not** modified for this task.

---

## 11. Verdict

**Task complete for security remediation + automated verification.**

- Original 4 low (`deepmerge`) and the additional full-audit high (`zod`) are cleared.  
- `npm audit` / `npm audit --omit=dev` → **0 vulnerabilities**.  
- RN/CLI versions preserved; no `--force` audit fix.  
- Jest, ESLint, RN config, Android debug + release builds verified.  
- Device/manual customer workflow regression remains **outstanding** and must not be assumed green.
