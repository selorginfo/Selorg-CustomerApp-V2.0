# Android Release Signing Audit — Selorg-CustomerApp-V2.0

**Date:** 2026-10-30  
**Scope:** `android/app/build.gradle` release signing + Maps key injection  
**Constraint:** No hardcoded credentials, no dummy keystores, no fake verification results. `applicationId` / package / version / dependencies unchanged.

---

## 1. Existing configuration (before this pass)

| Item | State found |
|------|-------------|
| `signingConfigs.release` | Already wired to `SELORG_UPLOAD_STORE_FILE`, `SELORG_UPLOAD_STORE_PASSWORD`, `SELORG_UPLOAD_KEY_ALIAS`, `SELORG_UPLOAD_KEY_PASSWORD` via `project.findProperty` |
| `GOOGLE_MAPS_API_KEY` | Manifest placeholder `${GOOGLE_MAPS_API_KEY}` from Gradle property; comments in `android/gradle.properties` tell operators to set it in `~/.gradle/gradle.properties` / CI |
| Fail-fast | `gradle.taskGraph.whenReady` already failed release assemble/bundle/install/package when upload signing missing (unless `allowUnsignedRelease`) and when Maps key missing |
| Artifact names | `selorg-customer-app-${version}.apk` / `.aab`, with `-unsigned` suffix when release had no `storeFile` |
| Secrets in repo | None committed for upload keystore; `android/gradle.properties` only has commented placeholders |
| Operator machine | All four `SELORG_UPLOAD_*` **SET** in `~/.gradle/gradle.properties`; keystore file **exists**; `GOOGLE_MAPS_API_KEY` **absent** from user Gradle props |
| SDK | `ANDROID_HOME` present; build-tools `37.0.0` (`apksigner`); JDK 21; `gradlew.bat` present |
| Gaps | Blank/partial props not trimmed or listed; `allowUnsignedRelease` did not force unsigned naming when upload props were already present; missing store file failed late; `local.properties` was missing (gitignored) |

---

## 2. Changes made

### `android/app/build.gradle` (signing — required)

- Trim + validate all four `SELORG_UPLOAD_*` properties; reject **partial** sets with explicit missing names.
- Verify `SELORG_UPLOAD_STORE_FILE` is an existing file before configuring `signingConfigs.release`.
- `-PallowUnsignedRelease=true` **forces** a genuinely unsigned release (no `signingConfig`) and `*-unsigned` artifact names even if upload props exist — never the default production path.
- Production release still applies `signingConfigs.release` only when all four props are present **and** `allowUnsignedRelease` is not set.
- Maps key gate trims blanks and documents `-PGOOGLE_MAPS_API_KEY` / `~/.gradle` / CI (still not committed).

### `android/build.gradle` (native staging — environment)

- Redirect CMake `buildStagingDirectory` for Android **library** modules to `C:/scxx-libs/<module>` so OneDrive + spaces under `node_modules/**/.cxx` do not leave ninja `build.ninja` forever-dirty. Mirrors existing app staging at `C:/scxx2`.

### Local / non-committed

- Created gitignored `android/local.properties` with `sdk.dir` pointing at the local Android SDK.
- Scenario builds passed `-PGOOGLE_MAPS_API_KEY=AUDIT_PLACEHOLDER_NOT_FOR_PRODUCTION` because no real Maps key was in `~/.gradle/gradle.properties`. **Production must set a real restricted Maps key** (package `com.selorg.com`).

### Not changed

- `applicationId` / namespace `com.selorg.com`, `versionCode` / `versionName`, dependencies, Proguard toggle semantics.

### Environment notes (not product config)

- Release JS bundling required Node **20** on PATH for this machine (system Node was 24) plus a local `image-size@2` path-compat patch under `node_modules` so Metro can pass filesystem paths. Those are machine/toolchain issues, not signing config.

---

## 3. Scenario results

| Scenario | Result | Evidence |
|----------|--------|----------|
| **A — Missing signing props → fail early** | **PASSED** | Clear `GradleException` listing required `SELORG_UPLOAD_*` and pointing at `-PallowUnsignedRelease=true` |
| **B — Signed `assembleRelease` + `bundleRelease`** | **PASSED** | APK + AAB named without `-unsigned`; `apksigner` verifies APK (v2); `jarsigner -verify` exit 0 on AAB |
| **C — `-PallowUnsignedRelease=true`** | **PASSED** | APK named `*-unsigned.apk`; `apksigner verify` → `DOES NOT VERIFY` / `Missing META-INF/MANIFEST.MF` |

None marked BLOCKED: Android SDK, upload keystore props, and tools were available. Maps key for scenarios used a non-secret CLI placeholder only so packaging/signing could be exercised; **shipping with that placeholder is not production-ready**.

---

## 4. Commands used

Working directory: `Selorg-CustomerApp-V2.0/android`  
(Node 20 prepended on PATH for bundling; OneDrive process stopped during native build to reduce ninja thrash.)

### Scenario A — fail early

```bat
gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a ^
  -PGOOGLE_MAPS_API_KEY=AUDIT_PLACEHOLDER_NOT_FOR_PRODUCTION ^
  -PSELORG_UPLOAD_STORE_FILE= -PSELORG_UPLOAD_STORE_PASSWORD= ^
  -PSELORG_UPLOAD_KEY_ALIAS= -PSELORG_UPLOAD_KEY_PASSWORD=
```

**Observed:** `Release build needs SELORG_UPLOAD_STORE_FILE, SELORG_UPLOAD_STORE_PASSWORD, SELORG_UPLOAD_KEY_ALIAS, and SELORG_UPLOAD_KEY_PASSWORD...`

### Scenario C — unsigned smoke

```bat
gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a ^
  -PallowUnsignedRelease=true ^
  -PGOOGLE_MAPS_API_KEY=AUDIT_PLACEHOLDER_NOT_FOR_PRODUCTION
```

```bat
apksigner verify --verbose app\build\outputs\apk\release\selorg-customer-app-2.0.0-unsigned.apk
```

**Observed:** `DOES NOT VERIFY` / `Missing META-INF/MANIFEST.MF`

### Scenario B — signed release

```bat
gradlew.bat :app:assembleRelease :app:bundleRelease -PreactNativeArchitectures=arm64-v8a ^
  -PGOOGLE_MAPS_API_KEY=AUDIT_PLACEHOLDER_NOT_FOR_PRODUCTION
```

(Upload props loaded from `~/.gradle/gradle.properties`; alias present: `selorg`.)

```bat
apksigner verify --print-certs -v app\build\outputs\apk\release\selorg-customer-app-2.0.0.apk
jarsigner -verify -verbose -certs app\build\outputs\bundle\release\selorg-customer-app-2.0.0.aab
```

**Observed:** APK `Verifies` (v2 scheme, signer DN contains `O=selorg`); jarsigner exit code `0` (AAB signed; JarFile/JarInputStream noise is normal for AABs).

---

## 5. Artifact paths

| Artifact | Path |
|----------|------|
| Signed APK | `android/app/build/outputs/apk/release/selorg-customer-app-2.0.0.apk` |
| Signed AAB | `android/app/build/outputs/bundle/release/selorg-customer-app-2.0.0.aab` |
| Unsigned APK (scenario C) | `android/app/build/outputs/apk/release/selorg-customer-app-2.0.0-unsigned.apk` (replaced by signed APK after scenario B) |

---

## 6. Blockers / follow-ups

| Item | Severity | Notes |
|------|----------|-------|
| `GOOGLE_MAPS_API_KEY` missing from `~/.gradle/gradle.properties` | **Production blocker** | Release gate requires it. Set a Maps SDK key restricted to `com.selorg.com`. Do not commit. Scenarios used CLI placeholder only. |
| OneDrive + long paths | Ops | Library CMake staging redirected to `C:/scxx-libs`; app already uses `C:/scxx2`. Prefer building outside OneDrive when possible. |
| Node 24 + `image-size@2` vs Metro path API | Ops | Use Node 20 for release bundling, or keep Metro/`image-size` versions aligned. Not a signing-config defect. |
| Unsigned builds | Policy | Only via explicit `-PallowUnsignedRelease=true`. Never for Play Store / production. |

---

## 7. Verdict

Release signing configuration in `android/app/build.gradle` supports all four `SELORG_UPLOAD_*` properties, keeps Maps key out of source, fails closed without signing (unless opted out), and produces correctly named signed APK/AAB or a genuinely unsigned `-unsigned` APK. All three validation scenarios **PASSED** on this machine with the caveats above for Maps key production setup.
