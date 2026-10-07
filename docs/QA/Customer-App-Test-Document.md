# Selorg Customer App V2.0 — Ready-to-Test Document

| Item | Value |
|---|---|
| App | Selorg Customer App (React Native, Android + iOS) |
| Version | v2.0.0 (as shown in Settings) |
| Source of truth | `src/navigation/RootNavigator.tsx` + every screen under `src/screens` |
| Prepared | 07 Oct 2026 |
| Backend base | `/api/v1/customer` (see `src/config/api.ts`) |
| Payment gateway | Worldline / Paynimo (WebView checkout) |
| Real-time | Socket.io on `/customer-socket.io` (order status + rider location) |

## How to read this document

- **Module** = a business area (e.g. Cart). **Sub-module** = one screen, bottom sheet or reusable block inside it.
- **Cards** = every visible card / section / block / list-item type / sheet on that screen.
- **Actions** = every user-interactive element (button, input, chip, toggle, link, swipe, star, etc.).
- Each sub-module lists: Cards → Actions (with `testID` where the code defines one) → Business rules → States → APIs.
- Each module ends with **Functionality list** and **User workflows** written as test cases (ID, steps, expected result) covering happy, alternate and negative paths.
- `⚠ KNOWN ISSUE` marks behaviour found in code that is likely a defect. The full defect list is in Section 22.

---

## 1. Summary — modules, sub-modules, cards and actions

| # | Module | Sub-modules (screens / sheets) | Sub-module count | Cards | Actions |
|---|---|---|---|---|---|
| 1 | App Launch & Onboarding | Splash, Onboarding, No Internet | 3 | 14 | 7 |
| 2 | Authentication | Enter Mobile (Login/Sign-up), OTP, Profile Setup | 3 | 26 | 23 |
| 3 | Location & Address | Location Permission, Addresses (+ Delete sheet), Add/Edit Address | 3 | 17 | 26 |
| 4 | Home & Navigation | Bottom Nav, Home | 2 | 15 | 21 |
| 5 | Search | Search | 1 | 6 | 9 |
| 6 | Categories & Listing | Categories tab, Category Products, Collection, Sort sheet, Filter sheet | 5 | 32 | 56 |
| 7 | Product | Product Card, Product Detail, Reviews, Write Review | 4 | 34 | 31 |
| 8 | Cart | Cart | 1 | 9 | 9 |
| 9 | Checkout & Payment | Checkout, Payment (+ Worldline WebView), Order Placed | 3 | 27 | 31 |
| 10 | Orders | Orders list, Order Detail, Order Options sheet, Cancel Order sheet, Invoice | 5 | 32 | 24 |
| 11 | Live Tracking | Tracking, Live Tracking Map, Delivered Celebration | 3 | 24 | 15 |
| 12 | Ratings | Rate Order, Rate Order Prompt sheet, Rating Success | 3 | 15 | 10 |
| 13 | Refunds & Returns | Refunds list, Refund Detail, Return Request | 3 | 12 | 7 |
| 14 | Account, Profile & Settings | Account, Edit Profile, Logout sheet, Settings (+ Delete account sheet) | 4 | 21 | 37 |
| 15 | Wallet | Wallet (+ method sheet + Worldline WebView) | 1 | 9 | 13 |
| 16 | Notifications | Notifications list, In-app push banner, Toast | 3 | 11 | 6 |
| 17 | Help & Support | Help & Support, Ticket Detail | 2 | 11 | 13 |
| 18 | Legal | Terms / Privacy | 1 | 4 | 2 |
| 19 | Wishlist | Wishlist | 1 | 4 | 7 |
| | **TOTAL** | | **51** | **323** | **347** |

**Not counted (not reachable in the build):** `LoginPassword`, `CreatePassword`, `Forgot`, `ResetPassword`, `AuthSuccess` (files exist but are not registered in the navigator) and `WriteReview` (registered, but no screen navigates to it — it is counted in Module 7 for completeness). See Section 21.

### 1.1 Navigation map

```
Splash ─┬─ (logged in / guest) ─────────────────────────────► Main (tabs)
        ├─ (onboarding done) ─► EnterMobile
        └─ (first launch) ────► Onboarding ─► EnterMobile

EnterMobile ─► Otp ─┬─ (new user / sign-up) ─► ProfileSetup ─► LocationPermission ─► Main
                    └─ (existing user) ──────────────────────────────────────────► Main
EnterMobile ─ "Browse as guest" ─► Main

Main tabs:  Home | Categories | [Cart FAB → Cart screen] | Orders | Account

Home ─► Search, Notifications, Addresses, Tracking, CategoryProducts, Collection, ProductDetail
Categories ─► CategoryProducts ─► ProductDetail ─► Reviews / Cart
Cart ─► Checkout ─► Addresses / AddAddress ─► Payment ─► (Worldline) ─► OrderPlaced ─► Tracking
Orders ─► OrderDetail ─► Invoice / ReturnRequest / TicketDetail / Cancel / Rate
Account ─► EditProfile, Wishlist, Addresses, Wallet, Refunds, Notifications, Support, Settings, Legal
```

### 1.2 Test environment pre-requisites

| # | Requirement |
|---|---|
| 1 | Android (10, 13+) and iOS physical devices; one Android emulator for location-reject tests |
| 2 | Test numbers: 1 new mobile (never registered), 1 registered mobile with name, 1 registered email |
| 3 | Backend with OTP visible (devNote / logs) and Worldline sandbox credentials |
| 4 | At least 1 serviceable address (near a dark store) and 1 non-serviceable address |
| 5 | Catalogue data: product with variants, product with stock 0, product with stock ≤ 3, product with `maxOrderLimit`, product with MRP > price |
| 6 | Valid coupon, expired coupon, coupon with min-order value |
| 7 | Wallet with balance ≥ order value and a second user with ₹0 balance |
| 8 | Ability to move an order through statuses from admin/rider apps (confirmed → getting-packed → on-the-way → arrived → delivered) |
| 9 | Firebase push sender (to test product push with/without `timerMinutes`) |
| 10 | Network throttling / airplane mode for offline cases |

---

## 2. Module 1 — App Launch & Onboarding

### 2.1 Splash — `src/screens/Splash/index.tsx`
Brand screen shown while auth state loads, then routes the user.

**Cards (5)**
1. Logo tile (120×120, rounded, shadow)
2. Wordmark "Selorg"
3. Tagline "Avoid poison on your plate"
4. Subtitle "India's first lab-tested organic grocery app"
5. Spinner

**Actions (0)** — no interactive elements.

**Business rules**
- Waits for `AuthContext.isLoading = false` + fixed 1200 ms.
- If a stored `accessToken` exists → calls `GET /user/profile`.
- Routing (always `replace`): logged-in user → `Main`; guest (`isGuest=1`) → `Main`; `onboardingComplete=1` → `EnterMobile {mode:'login'}`; else → `Onboarding`.

**States:** loading only. No error / timeout / offline state.

### 2.2 Onboarding — `src/screens/onboarding/Onboarding.tsx`
3-slide intro carousel.

**Cards (6)**
1. Skip link (top right)
2. Headline (2 lines, per slide)
3. Sub-copy (per slide)
4. Pagination dots ×3
5. Carousel — Slide 1 "Good Food / Free Ride Home.", Slide 2 category mosaic "Right Here / All In One Place.", Slide 3 "Ready For You / Fresh Vegetables."
6. Footer CTA button

**Actions (6)**

| # | Element | Expected result |
|---|---|---|
| 1 | Skip | Saves `onboardingComplete=1`, replaces with `EnterMobile {mode:'login'}` |
| 2 | Dot 1 | Scroll to slide 1, stop autoplay |
| 3 | Dot 2 | Scroll to slide 2, stop autoplay |
| 4 | Dot 3 | Scroll to slide 3, stop autoplay |
| 5 | Horizontal swipe | Change slide, stop autoplay |
| 6 | Next / Get Started | Slides 1–2: "Next" → next slide. Slide 3: "Get Started" → same as Skip |

**Business rules:** autoplay every 3200 ms, loops 3 → 1 until the user touches it. Android back exits app.

### 2.3 No Internet — `src/screens/common/NoInternet.tsx`
**Cards (3):** red wifi-off icon (pulse), title "No internet connection", message "We couldn't reach Selorg… your cart is saved."
**Actions (1):** "Try again" → `goBack()`.
⚠ KNOWN ISSUE: no code navigates to this screen and NetInfo is not used, so it is never shown.

### 2.4 Functionality list — Launch & Onboarding
1. Brand splash with 1.2 s minimum display.
2. Auto-login using stored token.
3. Guest session persists across launches.
4. Onboarding shown only on first launch.
5. Auto-playing carousel with manual swipe/dots.
6. Skip/Get Started marks onboarding complete.

### 2.5 User workflows / test cases — Launch & Onboarding

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| LAU-01 | First install | Fresh install → open app | Splash ~1.2 s → Onboarding slide 1 |
| LAU-02 | Autoplay | Wait on Onboarding without touching | Slides advance every ~3.2 s and loop 3 → 1 |
| LAU-03 | Manual swipe stops autoplay | Swipe to slide 2, wait 5 s | Stays on slide 2 |
| LAU-04 | Dot navigation | Tap dot 3 | Slide 3 shown, CTA reads "Get Started" |
| LAU-05 | Next → Get Started | Tap Next ×2, then Get Started | Opens Enter Mobile in Log In mode |
| LAU-06 | Skip | Tap Skip on slide 1 | Opens Enter Mobile in Log In mode |
| LAU-07 | Onboarding not repeated | Complete onboarding, kill app, reopen (not logged in) | Splash → Enter Mobile (no onboarding) |
| LAU-08 | Auto-login | Log in, kill app, reopen | Splash → Home |
| LAU-09 | Guest persists | Browse as guest, kill app, reopen | Splash → Home as guest |
| LAU-10 | Android back on Onboarding | Press hardware back | App exits |
| LAU-11 (neg) | Offline launch with token | Log in, go offline, relaunch | Record behaviour — no error/offline UI exists |
| LAU-12 (neg) | No Internet screen | Go offline anywhere | ⚠ No Internet screen never appears (known issue) |

---

## 3. Module 2 — Authentication

### 3.1 Enter Mobile (Log In / Sign Up) — `src/screens/auth/EnterMobile.tsx`
One screen for OTP login, sign-up and guest entry.

**Cards (10)**
1. Hero banner image
2. Hero copy (Login: "Welcome back" / Sign-up: "Create your account")
3. Log In / Sign Up pill toggle
4. Method toggle Mobile / Email (Log In only)
5. Input field (mobile with country-code button, or email)
6. Trust row ("We'll send a 4-digit verification code." / "Mobile verification is required…")
7. Primary CTA ("Log In" / "Create Account" / "Sending…")
8. Mode switch row ("New here? Sign up" / "Already have an account? Log in")
9. Guest link "Skip · Browse as guest"
10. Country code bottom sheet (8 countries: +91 India, +971 UAE, +65 Singapore, +44 UK, +1 US, +61 Australia, +60 Malaysia, +94 Sri Lanka)

**Actions (12)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Log In tab | — | Switch to login mode (fade animation) |
| 2 | Sign Up tab | — | Switch to sign-up; forces Mobile method |
| 3 | Mobile chip | — | Show phone field |
| 4 | Email chip | — | Show email field |
| 5 | Country code button | — | Opens country sheet |
| 6 | Country row (×8) | — | Sets code, closes sheet |
| 7 | Sheet close / backdrop | — | Closes sheet |
| 8 | Phone input | `auth-phone-input` | Digits only, max 10 |
| 9 | Email input | `auth-email-input` | Email keyboard, no auto-caps |
| 10 | CTA | `auth-send-otp` | `POST /auth/send-otp` → on success opens OTP |
| 11 | Sign up / Log in link | `auth-switch-mode` | Toggles mode |
| 12 | Skip · Browse as guest | `auth-guest` | Sets guest flag, resets to `Main` |

**Business rules / validations**
- Mobile: last 10 digits must match `^[6-9]\d{9}$`.
- Email: 6–254 chars, no `..`, must match `x@y.z`.
- Sign-up = Mobile/SMS only. Login = Mobile or Email.
- CTA disabled while input invalid or request in flight.
- Error handling on send-OTP:
  - `USER_NOT_FOUND` → switches to Sign Up + toast "No account found. Please sign up first."
  - `PHONE_EXISTS` / `EMAIL_EXISTS` → switches to Log In + toast "Account already exists. Please log in."
  - Other → server message or "Could not send the code. Please try again."
- ⚠ Country code is cosmetic: never sent to API; validation is Indian only.

**States:** disabled CTA, "Sending…" spinner, error toast (3.2 s).
**API:** `POST /auth/send-otp {phoneNumber|email, preferredChannel, intent}`.

### 3.2 OTP — `src/screens/auth/otp.tsx`
**Cards (10)**
1. Back button (`otp-back`)
2. Phone/lock illustration
3. Title "Enter OTP"
4. Sub-text + contact ("+91 XXXXXXXXXX" or email) + "Change" link
5. 4 OTP boxes
6. Error text (`otp-error`)
7. "N attempts left" (only when ≤ 2 and no error shown)
8. Resend row — "Resend in 00:SS" (`otp-resend-cooldown`) or "Resend OTP" (`otp-resend`)
9. "Verify OTP" button
10. Trust row: "10-min delivery", "Lab-tested", "100% organic"

**Actions (6)**

| # | Element | Expected result |
|---|---|---|
| 1 | Back button | `goBack()` or replace to Enter Mobile |
| 2 | Change link | Same as Back |
| 3 | Android hardware back | Same as Back |
| 4 | OTP input | Digits only, max 4, paste + SMS autofill supported, auto-focus after 250 ms. Does NOT auto-submit |
| 5 | Resend OTP | `POST /auth/resend-otp`, clears code + error, restarts cooldown |
| 6 | Verify OTP (`otp-verify`) | `POST /auth/verify-otp` → merge guest cart → new user: `ProfileSetup`; existing: `Main` |

**Business rules**
- OTP = exactly 4 digits; Verify disabled until 4 digits.
- Resend cooldown = server `resendCooldownSeconds` (default 30 s).
- Attempts counter starts at 5, decrements on wrong OTP. ⚠ No lockout at 0.
- Sign-up mode → always `ProfileSetup`. Login + server `isNewUser` → error "No account found. Please sign up first."
- Error texts: "Enter the 4-digit code", "Session expired, please retry", "Invalid OTP, please try again".

**States:** disabled verify, "Verifying…", error (red boxes + text), cooldown vs resend.
**APIs:** `POST /auth/verify-otp`, `POST /auth/resend-otp`, cart merge.

### 3.3 Profile Setup — `src/screens/auth/ProfileSetup.tsx`
**Cards (6):** back button, heading "Let's get to know you", avatar circle (initial), Full Name input, Email (optional) input, "Continue" button.

**Actions (5)**

| # | Element | Expected result |
|---|---|---|
| 1 | Back | `goBack()` — ⚠ stack was reset, nothing to go back to |
| 2 | Avatar | Toast "Photo upload coming soon" (stub) |
| 3 | Full Name input | Updates name + avatar initial |
| 4 | Email input | Optional email |
| 5 | Continue | `PUT /user/profile` → merge cart → `LocationPermission` |

**Validations:** Name 2–60 chars, letters / space / `. ' -`, must start with a letter. Email optional but must be valid if filled. Continue disabled until valid (no inline error).
⚠ If the profile API fails, the error is swallowed and data is saved locally only.

### 3.4 Functionality list — Authentication
1. OTP login by mobile (SMS) or email.
2. OTP sign-up by mobile only.
3. Smart redirect between Log In and Sign Up based on server errors.
4. Guest browsing.
5. 4-digit OTP with paste/autofill, resend cooldown, attempts counter.
6. New-user profile setup (name + optional email).
7. Guest cart merged into user cart after login.

### 3.5 User workflows / test cases — Authentication

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| AUTH-01 | New user sign-up (happy) | Sign Up → enter new valid mobile → Create Account → enter OTP → Verify → enter name → Continue | OTP sent; Profile Setup opens; then Location Permission |
| AUTH-02 | Existing user login (mobile) | Log In → registered mobile → Log In → OTP → Verify | Lands on Home; Location Permission skipped |
| AUTH-03 | Existing user login (email) | Log In → Email chip → registered email → OTP → Verify | Lands on Home |
| AUTH-04 | Guest | Tap "Skip · Browse as guest" | Home opens as guest |
| AUTH-05 | Mobile validation | Enter 9 digits; enter number starting 5; enter letters | CTA disabled; letters stripped |
| AUTH-06 | Email validation | Enter `abc@`, `a..b@x.com` | CTA disabled |
| AUTH-07 | Login with unregistered mobile | Log In → new mobile → Log In | Toast "No account found…", screen switches to Sign Up |
| AUTH-08 | Sign-up with registered mobile | Sign Up → registered mobile → Create Account | Toast "Account already exists…", switches to Log In |
| AUTH-09 | Sign Up hides Email | Select Email in Log In, switch to Sign Up | Method snaps to Mobile; Email chip hidden |
| AUTH-10 | Country code sheet | Tap country code → select +971 | Sheet closes, +971 shown. ⚠ OTP screen still shows +91 |
| AUTH-11 | Wrong OTP | Enter wrong 4 digits → Verify | Red boxes, error text, code cleared |
| AUTH-12 | Attempts counter | Enter wrong OTP 4 times | Record if "N attempts left" appears (⚠ hidden while error shown) |
| AUTH-13 | No lockout | Enter wrong OTP 6+ times | ⚠ Verify still allowed (known issue) |
| AUTH-14 | Resend cooldown | Wait on OTP | "Resend in 00:SS" counts down from 30, then "Resend OTP" link |
| AUTH-15 | Resend | Tap Resend OTP after cooldown | Code cleared, timer restarts, new OTP works, old OTP rejected |
| AUTH-16 | OTP paste / autofill | Paste 4-digit code / SMS autofill | Boxes fill; must still tap Verify |
| AUTH-17 | Verify disabled | Enter 3 digits | Verify button disabled |
| AUTH-18 | Change number | Tap "Change" on OTP | Back to Enter Mobile with input retained |
| AUTH-19 | Profile name validation | Enter "A", "123", "John1" | Continue disabled |
| AUTH-20 | Profile email optional | Name only → Continue | Proceeds |
| AUTH-21 | Profile invalid email | Name + "abc@" | Continue disabled |
| AUTH-22 | Avatar stub | Tap avatar | Toast "Photo upload coming soon" |
| AUTH-23 | Guest cart merge | As guest add 2 items → log in | Cart retains both items after login |
| AUTH-24 (neg) | Kill app on Profile Setup | Verify OTP as new user → kill app → reopen | ⚠ Goes to Home with empty name (known issue) |
| AUTH-25 (neg) | Back on Profile Setup | Tap back / hardware back | ⚠ No-op / app exits (known issue) |
| AUTH-26 (neg) | Send OTP offline | Airplane mode → Log In | Error toast shown, stays on screen |

---

## 4. Module 3 — Location & Address

### 4.1 Location Permission — `src/screens/location/LocationPermission.tsx`
**Cards (4):** animated location pulse (3 rings + bobbing pin), title "Deliver to your door", sub-text, footer with 3 buttons.

**Actions (3)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Use current location | `location-use-current` | Permission → GPS → reverse geocode → save "Home" address (if line1/city/pincode found) → `POST /store/assign` → toast → reset to `Main` |
| 2 | Enter address manually | `location-manual` | Reset to `[Main, AddAddress]` |
| 3 | Skip for now | `location-skip` | Reset to `Main` |

**Toasts:** not serviceable → "No serviceable store near your location"; full address → "Location set · nearest store assigned"; partial → "Location detected · add address details anytime".

**Failure alerts**

| Case | Title | Buttons |
|---|---|---|
| Permission denied | "Location permission needed" | Not now / Open Settings |
| Permission blocked | "Location permission blocked" | Not now / Open Settings |
| GPS off | "Location is turned off" | Not now / Turn on location |
| Timeout (20 s) | "Location timed out" | OK |
| Other | "Could not get your location" | OK |

**Rules:** high accuracy, 20 s timeout. Android emulator default (Googleplex) is rejected. Fallback: Google geolocate → `GET /locations/approximate`.
⚠ Even when not serviceable, the user still enters Main.

### 4.2 Addresses ("Select address") — `src/screens/profile/addresses.tsx` + `DeleteAddressSheet`
**Cards (4)**
1. Header "Select address" + "+ Add"
2. Empty state "No saved addresses"
3. Address card (icon, label, DEFAULT badge, full address, Edit / Set default / Delete row; selected = green border)
4. Delete confirmation sheet ("Delete this address?", preview, Cancel / Delete)

**Actions (9)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Header back | — | Back |
| 2 | + Add | `address-add` | Opens Add Address |
| 3 | Empty-state Add address | `address-add-cta` | Opens Add Address |
| 4 | Tap address card | `address-item-{id}` | Selects address; if opened from Checkout → goes back |
| 5 | Edit | `address-edit-{id}` | Opens Add Address in edit mode |
| 6 | Set default | — | `POST /addresses/:id/default`, toast "Default address updated" |
| 7 | Delete | `address-delete-{id}` | Opens delete sheet |
| 8 | Sheet Cancel | `address-delete-cancel` | Closes sheet |
| 9 | Sheet Delete | `address-delete-confirm` | `DELETE /addresses/:id`, toast "Address deleted" |

**Rules:** list reloads on focus. Selected = remembered → default → first. Guests always see an empty list.

### 4.3 Add / Edit Address — `src/screens/profile/AddAddress.tsx`
**Cards (9):** header ("Add address" / "Edit address"), label chips (Home / Work / Other), Address line 1, Address line 2 (optional), Landmark (optional), City + Pincode row, State, Map block (draggable pin, hint, "Use my location", geocoding spinner), "Save address" bar.

**Actions (14)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Header back | — | Back |
| 2 | Home chip | `address-label-home` | Select label |
| 3 | Work chip | `address-label-work` | Select label |
| 4 | Other chip | `address-label-other` | Select label |
| 5 | Line 1 input | — | Text |
| 6 | Line 2 input | — | Text |
| 7 | Landmark input | — | Text |
| 8 | City input | — | Text |
| 9 | Pincode input | — | Digits, max 6. At 6 digits → India Post lookup fills empty city/state/line 2 |
| 10 | State input | — | Text |
| 11 | Tap map | — | Drops pin → reverse geocode → overwrites fields |
| 12 | Drag pin | — | Same as tap on drag end |
| 13 | Use my location | `address-use-location` | GPS → pin + fields filled; follows device |
| 14 | Save address | `address-save` | Validate → serviceability → `POST`/`PUT /addresses` → toast "Address saved" → back |

**Save validations (in order, exact messages)**
1. Line 1: 3–120 chars → "Enter a house number and street (at least 3 characters)"
2. Line 2: 3–120 chars → "Enter the area or locality" ⚠ labelled optional but required
3. Landmark ≤ 80 → "Landmark must be 80 characters or less"
4. City valid name → "Enter a valid city"
5. State valid name → "Enter a valid state"
6. Pincode 6 digits → "Enter a valid 6-digit PIN code"
7. No pin and geocode fails → "Use current location or drop a pin before saving. Delivery needs a map pin."
8. Not serviceable → server message or "We don't deliver to this location yet."
9. API failure → "Could not save address"

**Rules:** "Use my location" auto-runs in Add mode only. ⚠ Save has no loading/disabled state (double tap risk).

### 4.4 Functionality list — Location & Address
1. GPS location capture with permission handling (denied / blocked / GPS off / timeout).
2. Auto-assign nearest dark store; serviceability check.
3. Manual address entry with map pin, reverse geocoding and pincode autofill.
4. Address list with select, edit, delete (confirm sheet) and set default.
5. Address selection from Checkout returns to Checkout.

### 4.5 User workflows / test cases — Location & Address

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| LOC-01 | Allow location (serviceable) | New user → Use current location → Allow | Address saved, toast "Location set · nearest store assigned", Home |
| LOC-02 | Location not serviceable | Use from non-serviceable area | Error toast; still enters Home |
| LOC-03 | Deny permission | Tap Use current location → Deny | Alert "Location permission needed" with Open Settings |
| LOC-04 | Permission blocked | Deny with "Don't ask again" → retry | Alert "Location permission blocked" |
| LOC-05 | GPS off | Turn off GPS → retry | Alert "Location is turned off" → Turn on location opens settings |
| LOC-06 | Manual entry | Tap Enter address manually | Add Address opens; back goes to Home |
| LOC-07 | Skip | Tap Skip for now | Home |
| ADR-01 | Add address (happy) | Addresses → + Add → GPS fills → choose Work → fill line 2 → Save | Toast "Address saved", appears in list and selected |
| ADR-02 | Pincode autofill | Clear city/state → type 600001 | City/State auto-filled |
| ADR-03 | Map pin | Tap different point on map | Pin moves, fields overwritten |
| ADR-04 | Each validation | Trigger each failing field from 4.3 list | Exact message shown, not saved |
| ADR-05 | Line 2 empty | Leave "optional" line 2 empty → Save | ⚠ "Enter the area or locality" (known issue) |
| ADR-06 | Non-serviceable save | Pin far outside service area → Save | "We don't deliver to this location yet." |
| ADR-07 | Edit address | Edit → change line 1 → Save | `PUT`, updated text shown |
| ADR-08 | Set default | Tap Set default on 2nd address | DEFAULT badge moves, toast |
| ADR-09 | Delete — cancel | Delete → Cancel | Address remains |
| ADR-10 | Delete — confirm | Delete → Delete | Removed, toast "Address deleted" |
| ADR-11 | Select from Checkout | Checkout → address card → tap another | Returns to Checkout with new address, bill re-priced |
| ADR-12 (neg) | Double tap Save | Tap Save rapidly twice | Check for duplicate addresses |
| ADR-13 (neg) | Guest addresses | As guest open Addresses | Empty list; save shows error |

---

## 5. Module 4 — Home & Navigation

### 5.1 Bottom Navigation — `src/components/AppBottomNav.tsx`
**Cards (3):** floating pill bar, 4 tabs (Home, Categories, Orders, Account), centre Cart FAB with red badge ("99+" above 99).

**Actions (5)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Home | `tab-home` | Home tab |
| 2 | Categories | `tab-category` | Categories tab |
| 3 | Cart FAB | `tab-cart` | Opens Cart (covers the bar) |
| 4 | Orders | `tab-order` | Orders tab |
| 5 | Account | `tab-profile` | Account tab |

**Rules:** badge = total quantity across lines; pops on change. Bar appears only on the 4 tab screens.

### 5.2 Home — `src/screens/home/index.tsx`
**Cards (12)**
1. Location selector ("Delivering to {label}" / "Set location")
2. Search icon button
3. Bell with unread badge ("9+")
4. Active order banner ("Order {no} · {status}" / "Tap to track live")
5. Loading skeleton
6. Error state ("Couldn't load Selorg")
7. Empty state ("Nothing to show yet")
8. Hero banner (CMS — only first banner rendered)
9. "Shop by category" rail
10. Promo banner rows (CMS)
11. Lifestyle / "Curated for you" rails (CMS)
12. Product grid sections (3 columns, max 8 products each, "See all")

**Actions (16)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Location | — | Logged in → Addresses; guest → Enter Mobile |
| 2 | Search icon | `home-search` | Search |
| 3 | Bell | `home-notifications` | Logged in → Notifications; guest → Enter Mobile |
| 4 | Active order banner | — | Tracking |
| 5 | Retry (error) | — | Reload |
| 6 | Reload (empty) | — | Reload |
| 7 | Hero banner | `home-hero-banner` | Banner redirect (product / category / collection / link / first category) |
| 8 | Categories "See all" | — | Categories tab |
| 9 | Category tile | `home-category-{slug}` | Category Products |
| 10 | Promo banner card | `home-banner-{id}` | Banner redirect |
| 11 | Lifestyle card | `home-lifestyle-item-{i}` | Category/product/collection (⚠ may do nothing) |
| 12 | Product section "See all" | — | Collection |
| 13 | Product image / name | — | Product Detail |
| 14 | Wishlist heart | — | Toggle wishlist |
| 15 | Circle + (add) | — | Add to cart (respects `maxOrderLimit`) |
| 16 | Stepper + / − | — | Increment / decrement |

**Rules:** banners with `/sample banner/` and category-looking/"moringa" sections are hidden. Section with error or 0 products is hidden. No pull-to-refresh.
**APIs:** `GET /home`, `GET /sections/{key}/products?limit=8`, `GET /collections/{slug}` (fallback), `GET /categories?isActive=true&limit=20` (fallback).

### 5.3 Functionality list — Home & Navigation
1. Floating bottom nav with cart FAB and live count badge.
2. Delivery location header with address switching.
3. Unread notification badge.
4. Active order banner → live tracking.
5. CMS-driven hero, category rail, promo banners, curated rails and product sections.
6. Quick add/increment/decrement from product cards.
7. Guest gating for location and notifications.
8. Skeleton, error (Retry) and empty (Reload) states.

### 5.4 User workflows / test cases — Home & Navigation

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| HOME-01 | Home loads | Open app logged in | Skeleton → hero, categories, banners, curated, product sections |
| HOME-02 | Quick add | Tap + on product card | Stepper appears with 1; cart badge +1 with pop animation |
| HOME-03 | Increment / decrement | Tap + then − twice | Qty 2 → 1 → removed (stepper back to +) |
| HOME-04 | Max order limit | Add product with limit N, tap + past N | Toast "You can add only N of this item" |
| HOME-05 | Out of stock | View product with stock 0 | "SOLD OUT", + disabled |
| HOME-06 | Category tile | Tap a category | Category Products for that category |
| HOME-07 | Hero / banner redirect | Tap banners with product / category / collection redirect | Correct destination each time |
| HOME-08 | Section See all | Tap "See all" on product section | Collection with same products (⚠ may show empty for non-`collections_*` keys) |
| HOME-09 | Location (logged in) | Tap location | Addresses screen |
| HOME-10 | Guest gating | As guest tap location / bell | Enter Mobile |
| HOME-11 | Bell badge | Have 12 unread | Badge shows "9+" |
| HOME-12 | Active order banner | Place order → return Home | Banner with status; tap → Tracking |
| HOME-13 | Cart FAB badge | Add 120 units total | Badge "99+" |
| HOME-14 | Tab switching | Tap each tab | Correct screen, active tab highlighted |
| HOME-15 (neg) | API error | Block `/home` and `/categories` | Error state; Retry reloads |
| HOME-16 (neg) | Empty store | Store with no content | "Nothing to show yet" + Reload |
| HOME-17 (neg) | Pull to refresh | Pull down | ⚠ Not supported |

---

## 6. Module 5 — Search

### 6.1 Search — `src/screens/home/Search.tsx`
**Cards (6):** header search bar (autofocus, back, clear X), "BROWSE ALL PRODUCTS" 2-col grid, results count + grid, product card (compact ADD), skeleton ×6, empty states.

**Actions (9)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Type in search | `search-input` | Debounced (300 ms) `GET /products/search?q=` |
| 2 | Keyboard search key | — | Dismisses keyboard only |
| 3 | Back chevron | — | Back |
| 4 | Clear X | — | Clears query, browse grid returns |
| 5 | Product image / name | — | Product Detail |
| 6 | Heart | — | Toggle wishlist |
| 7 | ADD | — | Add to cart |
| 8 | + / − | — | Increment / decrement |
| 9 | Browse categories (no results) | — | Categories tab |

**Rules:** no min length (1 char searches); max 40 results, no pagination; no recent/trending searches; stale responses ignored.
**States:** skeleton, "Nothing to browse yet", "No results for "term"". ⚠ API errors look like "no results".

### 6.2 Functionality list — Search
1. Browse-all grid when query empty.
2. Search-as-you-type with 300 ms debounce.
3. Result count display.
4. Add to cart / wishlist from results.
5. No-results state with link to categories.

### 6.3 User workflows / test cases — Search

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| SRCH-01 | Open search | Home → search icon | Keyboard open, browse grid shown |
| SRCH-02 | Search happy | Type "apple" | After ~300 ms "N results for "apple"" + grid |
| SRCH-03 | Single character | Type "a" | Search fires |
| SRCH-04 | Fast typing | Type "tomato" quickly | Only final results shown |
| SRCH-05 | Clear | Tap X | Browse grid returns |
| SRCH-06 | Add from results | Tap ADD | Stepper; cart badge increments |
| SRCH-07 | Open product | Tap card | Product Detail |
| SRCH-08 | No results | Type "zzzzqq" | "No results…" + Browse categories → Categories tab |
| SRCH-09 | Result cap | Search a broad term | Max 40 results, no load more |
| SRCH-10 (neg) | Search offline | Airplane mode → type | ⚠ Shows "No results" instead of error |
| SRCH-11 (neg) | Stock mismatch | Product with catalog stock 0 but `availableStock` > 0 | ⚠ SOLD OUT here but addable on Home |

---

## 7. Module 6 — Categories & Listing

### 7.1 Categories tab — `src/screens/categories/index.tsx`
**Cards (8):** header "All Categories" + search toggle, search field, skeleton, category block header (icon, name, "See All (N) ›"), sub-category 4-column grid, error state, no-matches state, no-categories state.

**Actions (9)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Search toggle | `categories-search-toggle` | Show / hide + clear search field |
| 2 | Type in search | — | Local filter by category / sub-category name |
| 3 | Keyboard search | — | Opens global Search (⚠ query not carried) |
| 4 | Category header | `category-open-{id}` | Category Products |
| 5 | See All | `category-see-all-{id}` | Category Products |
| 6 | Sub-category tile | `subcategory-{slug}` | Category Products with sub-category |
| 7 | Retry | — | Reload |
| 8 | Clear search | — | Close search |
| 9 | Reload | — | Reload |

**APIs:** `GET /categories?isActive=true`, `GET /categories/{slug}/subcategories` (one per category).

### 7.2 Category Products — `src/screens/categories/CategoryProducts.tsx`
**Cards (11):** header (back + "Search in {category}…"), left sub-category sidebar ("All" + chips), sidebar skeleton, title + "N Products", filter button (badge), sort button, 2-col product grid, grid skeleton, error / no products / no matches states, Filter sheet, Sort sheet.

**Actions (13)**

| # | Element | Expected result |
|---|---|---|
| 1 | Back | Back |
| 2 | Search bar | Global Search |
| 3 | "All" chip | All products of category |
| 4 | Sub-category chip (`subcategory-{slug}`) | Refetch with `?subcategory=` |
| 5 | Filter button | Opens Filter sheet |
| 6 | Sort button | Opens Sort sheet |
| 7 | Product image / name | Product Detail |
| 8 | Heart | Toggle wishlist |
| 9 | ADD | Add to cart |
| 10 | + | Increment |
| 11 | − | Decrement |
| 12 | Retry (error) | ⚠ Does nothing (known issue) |
| 13 | Browse home / Show all | Home tab / reset filters + "All" |

**Rules:** max 80 products, no pagination. Sub-category filter on server; other filters and sort on device.

### 7.3 Sort sheet — `SortFilterSheet.tsx`
**Cards (1):** "Sort by" sheet. **Actions (6):** Popularity (default, keeps API order), Price: low to high, Price: high to low, Discount: high to low, close X, backdrop. Selecting applies and closes.

### 7.4 Filter sheet — `SortFilterSheet.tsx`
**Cards (5):** Price range (chips + dual slider ₹0–₹6,000+, "Reset price"), Discount pills (10/20/30/40/50 % and above), Customer rating pills (4/3/2/1 ★ & above), Availability (In Stock / Out of Stock), Footer ("Apply Filters" + "N products found").

**Actions (18):** Clear All, Close X, backdrop, low thumb, high thumb, Reset price, 5 discount pills, 4 rating pills, In Stock, Out of Stock, Apply.

**Rules:** price step ₹50; ≥ 6000 = no upper limit. Pills single-select (tap again to clear). Filters apply live; Apply only closes. Clear All also resets sort to Popularity. Badge counts active filters.

### 7.5 Collection — `src/screens/categories/Collection.tsx`
**Cards (7):** header (back, title, "N products", search bar), Filters + Sort row, 2-col grid, skeleton, empty state, Filter sheet, Sort sheet.
**Actions (10):** back, search bar, Filters, Sort, card open, heart, + add, + increment, −, "Go back" (empty).
**Rules:** max 40 products. ⚠ API error shows the empty state (no Retry). ⚠ `maxOrderLimit` not passed on add.
**API:** `GET /collections/{slug}?limit=40`.

### 7.6 Functionality list — Categories & Listing
1. All categories with sub-category tiles and local search.
2. Category product listing with sub-category sidebar.
3. Sort (4 options) and Filter (price, discount, rating, availability) with live result count and badge.
4. Curated collections with sort/filter.
5. Add to cart / wishlist from listing.
6. Skeleton, error, empty and no-match states.

### 7.7 User workflows / test cases — Categories & Listing

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| CAT-01 | Browse categories | Tap Categories tab | Category blocks with sub-category tiles |
| CAT-02 | Local search | Toggle search → type "fruit" | List filtered locally |
| CAT-03 | Open category | Tap category header / See All | Category Products, "All" active |
| CAT-04 | Open sub-category | Tap sub-category tile | Category Products with that chip active |
| CAT-05 | Sub-category switch | Tap chips in sidebar | Grid refetches, title and count update |
| CAT-06 | Sort price low→high | Sort → Price: low to high | Ascending prices, sheet closes |
| CAT-07 | Sort discount | Sort → Discount: high to low | Highest % first |
| CAT-08 | Price filter | Filter → drag slider ₹100–₹500 | Grid updates live; count in footer; badge 1 |
| CAT-09 | Discount filter | Tap "30% and above" | Only ≥ 30 % items; tap again clears |
| CAT-10 | Rating filter | Tap "4 ★ & above" | Only rating ≥ 4 |
| CAT-11 | Availability | Tap Out of Stock | Only stock 0 items |
| CAT-12 | Combined filters | Price + discount + rating | Badge 3, correct intersection |
| CAT-13 | Clear All | Tap Clear All | All filters reset; ⚠ sort also reset |
| CAT-14 | No matches | Filters to 0 results | "No products match" → Show all resets |
| CAT-15 | Collection | Home section See all | Collection grid, Filter + Sort work |
| CAT-16 | Search from listing | Tap "Search in…" | Global Search (not scoped) |
| CAT-17 (neg) | Category API error | Block products API → open category | Error state; ⚠ Retry does nothing |
| CAT-18 (neg) | Sub-category via search | Categories search → tap matched sub-category | ⚠ Sends name instead of slug; may show no products |
| CAT-19 (neg) | Empty category | Category with no products | "No products here yet" → Browse home |
| CAT-20 (neg) | Collection error | Block collection API | ⚠ "No products found", no Retry |

---

## 8. Module 7 — Product

### 8.1 Product Card (reusable) — `src/components/ProductCard.tsx`
**Cards (6):** square image (placeholder if none), "-N%" discount badge (when MRP > price), wishlist heart, name (2 lines) + rating pill (when > 0), price + "/unit", add control (circle "+" / "SOLD OUT" or compact "ADD" / "OUT").

**Actions (5):** tap image → Product Detail; tap name → Product Detail; heart → toggle wishlist; Add → add to cart (disabled when stock 0); − / + → decrement / increment.
**testIDs:** `product-card-{id}`, `product-open-{id}`, `product-{id}-add`, `-increment`, `-decrement`, `-value`.
**Rules:** out of stock only when `stockQuantity === 0`. ⚠ MRP strike-through not shown on card.

### 8.2 Product Detail — `src/screens/product/ProductDetail.tsx`
**Cards (17)**
1. Floating nav (back, heart, share; frosted title after 170 px scroll)
2. Image gallery (horizontal pager)
3. "x / N" image counter
4. "N% OFF" ribbon
5. Page dots
6. Brand (fallback "SELORG ORGANIC") + name
7. Rating row (stars, average, "· N reviews")
8. Description (hard-coded text)
9. Price row (price, MRP struck, % OFF pill, "Inclusive of all taxes")
10. "Select size" variant pills (when > 1 variant)
11. Delivery & stock card ("Delivery in 20–30 mins", "Delivering to {city}", stock label, "Free delivery on orders above ₹199")
12. "Why you'll love it" (4 benefits)
13. "CLEAN FOOD PROMISE" (4 badges)
14. Product information accordions (Product details, Nutrition, Storage & specifications, Return & refund)
15. Reviews summary (score, verdict, "Based on N verified reviews")
16. "You may also like" rail
17. Sticky footer (Total, stepper, main button) + image zoom modal

**Actions (18)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Back | — | Back |
| 2 | Heart | — | Toggle wishlist |
| 3 | Share | — | ⚠ Toast "Share link copied" only — nothing shared |
| 4 | Swipe gallery | — | Change image, counter/dots update |
| 5 | Tap image | — | Opens zoom modal |
| 6 | Close zoom (X / backdrop / back) | — | Closes modal |
| 7 | Rating row | — | Reviews |
| 8 | Variant pill | — | Switch price / MRP / unit |
| 9 | Accordion header | — | Expand / collapse (one at a time, "details" open by default) |
| 10 | Reviews "See all →" | — | Reviews |
| 11 | Related product open | — | Pushes another Product Detail |
| 12 | Related product + | — | Add to cart (icon becomes ✓) |
| 13 | Add to cart | `product-add-to-cart` | Adds selected variant |
| 14 | Footer + | — | Increment |
| 15 | Footer − | — | Decrement |
| 16 | Go to cart (qty > 0) | — | Cart |
| 17 | Notify me (stock 0) | — | ⚠ Toast only, no API |
| 18 | Go back (error) | — | Back |

**Rules:** stock label: 0 → "Currently out of stock" (red); ≤ 3 → "Only N left in stock"; else "In stock, ready to pack". Footer total = price × max(qty,1). Rating verdict: ≥ 4.5 Excellent, ≥ 4 Very good, ≥ 3 Good, else Mixed.
**API:** `GET /products/{id}`.

### 8.3 Reviews — `src/screens/product/Reviews.tsx`
**Cards (6):** header (product name), summary card, star histogram 5→1, review cards (initial, name, stars, "You"/"Verified" badge, text), empty state, "Back to product" footer.
**Actions (3):** header back, "Back to product", "Go back" (error).
**Rules:** no pagination; no "Write a review" entry point.

### 8.4 Write Review — `src/screens/product/WriteReview.tsx` (⚠ unreachable)
**Cards (5):** header, product card, 5 stars with label (Poor → Excellent), review text box, "Post review".
**Actions (5):** back, stars 1–5, text input, Post review, Go back.
**Rules:** Post disabled until ≥ 1 star. ⚠ Submits nothing — toast "Product reviews are coming soon · rate your order from Orders".

### 8.5 Functionality list — Product
1. Product card with discount badge, rating, wishlist and stepper.
2. Image gallery with counter, dots and zoom.
3. Variant (size) selection updating price/MRP/unit.
4. Stock indicator (out / low / in stock).
5. Add to cart, stepper and Go to cart from sticky footer.
6. Related products rail with quick add.
7. Reviews summary and full review list with histogram.
8. Accordions for product information.

### 8.6 User workflows / test cases — Product

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| PDP-01 | Open product | Tap any product card | Skeleton → full detail page |
| PDP-02 | Gallery | Swipe images | Counter "2 / N", dots update |
| PDP-03 | Zoom | Tap image → close via X / backdrop / back | Modal opens and closes |
| PDP-04 | Variant | Tap another size | Price, MRP, unit update with fade |
| PDP-05 | Add to cart | Tap Add to cart | Stepper appears, button → "Go to cart", total updates |
| PDP-06 | Variant lines | Add size A, switch to size B, add | Two separate cart lines |
| PDP-07 | Go to cart | Tap Go to cart | Cart screen |
| PDP-08 | Low stock | Product with stock 2 | "Only 2 left in stock" |
| PDP-09 | Out of stock | Product with stock 0 | Red label, "Notify me" (toast only) |
| PDP-10 | Max order limit | + beyond limit | Toast "You can add only N of this item" |
| PDP-11 | Related product | Tap related card | New Product Detail on top; back returns |
| PDP-12 | Related quick add | Tap + on related | Added, icon ✓ |
| PDP-13 | Accordions | Tap each header | Only one open at a time |
| PDP-14 | Reviews | Tap rating row / See all | Reviews with histogram and cards |
| PDP-15 | No reviews | Product with no rating | "No ratings yet…" / empty state |
| PDP-16 | Scroll header | Scroll > 170 px | Frosted header with product name |
| PDP-17 (neg) | Invalid product | Open deleted product (push/deep link) | "Product not found" + Go back |
| PDP-18 (neg) | Share | Tap share | ⚠ Toast only (known issue) |
| PDP-19 (neg) | Hard-coded content | Compare two products' description / accordions / ETA | ⚠ Identical text (known issue) |

---

## 9. Module 8 — Cart

### 9.1 Cart — `src/screens/cart/cart.tsx`
**Cards (9)**
1. Header "Your cart" + "N items"
2. Empty state (Lottie, "Your cart is empty")
3. Delivery banner "Delivery in 12–18 min / From your nearest darkstore" (hard-coded)
4. Items card — image, name, unit, line total, stepper (per line)
5. "CLEAN FOOD PROMISE" chips (5)
6. Coupon input + Apply
7. Coupon-applied card ("CODE applied", "You saved ₹x", Remove)
8. Bill summary card
9. Bottom bar "Proceed to Checkout"

**Actions (9)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Header back | — | Back |
| 2 | Start shopping (empty) | — | Main |
| 3 | Stepper + | — | `PUT /cart/items/:id` (guest: local) |
| 4 | Stepper − | — | Decrease; at 1 → remove (`DELETE`) |
| 5 | Stepper ADD | — | Not reachable in practice |
| 6 | Coupon input | — | Auto-capitalised |
| 7 | Apply | — | `POST /coupons/validate`; toast "Coupon CODE applied" / "Invalid or expired coupon" |
| 8 | Remove coupon | — | Clears coupon, re-prices |
| 9 | Proceed to Checkout | `cart-checkout` | Checkout |

**Bill summary rows:** Item total, Coupon discount (green, when > 0), Delivery fee ("FREE" when 0), Handling charge (when > 0), Delivery tip (when > 0), To pay. ⚠ No GST/tax row although tax is included in "To pay".
**Rules:** logged-in totals come from server `GET /cart`; guest totals computed on device with delivery/handling/tax = 0. One coupon at a time. No remove-item button (use − at qty 1).

### 9.2 Functionality list — Cart
1. Line items with quantity stepper and line total.
2. Remove by decrementing to 0.
3. Coupon apply / remove with savings display.
4. Bill summary (item total, discount, delivery, handling, tip, to pay).
5. Guest cart (local) and logged-in cart (server), merged on login.
6. Empty cart state.

### 9.3 User workflows / test cases — Cart

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| CART-01 | View cart | Add 3 items → Cart FAB | Lines, totals, bill summary correct |
| CART-02 | Increment | Tap + | Qty and line total update, bill re-priced |
| CART-03 | Decrement to remove | Tap − at qty 1 | Line removed |
| CART-04 | Empty cart | Remove all lines | Empty state; Start shopping → Home |
| CART-05 | Valid coupon | Enter valid code → Apply | "CODE applied", "You saved ₹x", discount row |
| CART-06 | Invalid coupon | Enter "XXXX" → Apply | Toast "Invalid or expired coupon" |
| CART-07 | Min order coupon | Apply coupon below its min value | Server error toast |
| CART-08 | Remove coupon | Tap Remove | Discount row gone, input back |
| CART-09 | Lowercase coupon | Enter "save10" | Sent as "SAVE10" |
| CART-10 | Empty Apply | Tap Apply with empty box | Nothing happens |
| CART-11 | Free delivery | Cart above free-delivery threshold | Delivery "FREE" |
| CART-12 | Bill maths | Compare rows with "To pay" | Rows + tax = To pay (⚠ tax not shown) |
| CART-13 | Proceed | Tap Proceed to Checkout | Checkout opens |
| CART-14 (neg) | Guest stock overrun | As guest, + past available stock | ⚠ Allowed (known issue) |
| CART-15 (neg) | Logged-in stock overrun | + past stock | Toast "You can add only N of this item" |
| CART-16 (neg) | Rapid taps | Tap + 10 times fast | Final qty consistent with server |
| CART-17 (neg) | Coupon + qty change | Apply coupon → change qty | Discount still applied (⚠ risk of reset) |

---

## 10. Module 9 — Checkout & Payment

### 10.1 Checkout — `src/screens/cart/checkout.tsx`
**Cards (12)**
1. Header "Checkout" + item count
2. Empty state
3. Delivery address card (with address: label + address + "Change"; without: red border "Select delivery address / Required to place order")
4. Expected delivery card ("Delivered in X to Y mins", window, km, delivery fee) or "Delivery time unavailable"
5. "This order is for someone else" checkbox
6. Receiver details (name, +91 phone)
7. Order summary (items)
8. Delivery tip chips (None, ₹10, ₹20, ₹30)
9. Payment method card (Pay online / Selorg Wallet / Cash on delivery)
10. Coupon input / applied card
11. Bill summary card
12. Bottom bar ("To pay ₹x" + main button)

**Actions (17)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Header back | — | Back |
| 2 | Browse products (empty) | — | Main |
| 3 | Address card | `checkout-address` | Addresses (`fromCheckout`) |
| 4 | Someone-else checkbox | — | Show/hide receiver; unticking clears fields |
| 5 | Receiver name | — | Text |
| 6 | Receiver phone | — | Digits, max 10 |
| 7 | Tip None | — | Tip 0 |
| 8 | Tip ₹10 | — | Tip 10 added |
| 9 | Tip ₹20 | — | Tip 20 added |
| 10 | Tip ₹30 | — | Tip 30 added |
| 11 | Pay online | `checkout-pay-online` | Select; re-price |
| 12 | Selorg Wallet | `checkout-pay-wallet` | Select; re-price |
| 13 | Cash on delivery | `checkout-pay-cod` | Select; re-price |
| 14 | Coupon input | — | Text |
| 15 | Apply coupon | — | Validate |
| 16 | Remove coupon | — | Clear |
| 17 | Main button | `checkout-continue` | No address → "Add address" → Addresses. Else "Place order" (COD) / "Pay with Wallet" / "Proceed to Pay" → Payment |

**Validations:** receiver name ≥ 2 chars → else "Enter the receiver's name"; receiver phone valid Indian mobile → else "Enter a valid 10-digit receiver number starting with 6–9".
**Rules:** re-prices on focus; default method = online; estimate needs assigned store + address lat/lng. ⚠ No serviceability, min-order or stock check here.
**APIs:** `GET /cart` (coupon, zone, payment method), `GET /delivery/estimate`, `POST /coupons/validate`.

### 10.2 Payment — `src/screens/orders/PaymentScreen.tsx` + `WorldlineCheckoutWebView`
**Cards (8)**
1. Header "Payment" + "To pay ₹x"
2. Method cards (UPI/Cards "Secured by Worldline", Selorg Wallet "Balance ₹x" / "Low" badge, Cash on delivery)
3. Insufficient balance banner + "Top up"
4. Bill summary card
5. Bottom bar ("Place order · ₹x" / "Pay ₹x")
6. Processing screen ("Processing your payment…", "Don't close this screen.")
7. Failed screen ("Payment failed", Retry payment, Choose another method)
8. Worldline WebView popup ("Secure payment", Close)

**Actions (10)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Header back | — | Back |
| 2 | Online method | `payment-method-online` | Select |
| 3 | Wallet method | `payment-method-wallet` | Select |
| 4 | COD method | `payment-method-cod` | Select |
| 5 | Top up | — | Wallet screen |
| 6 | Pay / Place order | `payment-submit` | `POST /orders` (Idempotency-Key). COD/Wallet → clear cart → Order Placed. Online → `POST /payments/worldline/session` → WebView |
| 7 | Retry payment | — | Back to method picker |
| 8 | Choose another method | — | `POST /payments/worldline/abort` if pending → idle |
| 9 | WebView Close / Android back | — | Abort → toast "Payment cancelled. No amount has been charged." → Checkout |
| 10 | Gateway result (auto) | — | `POST /payments/worldline/complete` → poll status ×10 every 1.5 s → paid → Order Placed; else Failed |

**Rules:** wallet must cover full amount (no split). Submit disabled when wallet low or processing.
**Messages:** "Payment was not completed. You can retry from checkout." / "Payment was not confirmed yet. Check Orders in a moment, or retry."

### 10.3 Order Placed — `src/screens/orders/OrderPlaced.tsx`
**Cards (7):** unpaid variant ("Payment failed"), success tick, "Order placed!" + subtitle (COD: "Pay ₹x in cash on delivery…", else "Payment successful…"), "You've chosen life. Thank you.", clean-food badges (4), "ORDER NUMBER" card, footer buttons.
**Actions (4):** Retry payment (unpaid) → Payment (online); Back to home (unpaid) → Main; Track order (`order-placed-track`) → Tracking; Back to home (`order-placed-home`) → Main.

### 10.4 Functionality list — Checkout & Payment
1. Address selection / mandatory address before placing order.
2. Delivery ETA and window from delivery estimate.
3. Order for someone else (receiver name + phone).
4. Delivery tip.
5. Payment methods: Online (Worldline UPI/cards/net banking), Wallet (full cover), COD.
6. Coupon on checkout.
7. Idempotent order creation.
8. Gateway session, completion and status polling.
9. Cancel / failure / retry payment handling.
10. Order confirmation screen with order number and Track order.

### 10.5 User workflows / test cases — Checkout & Payment

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| CHK-01 | COD order (happy) | Cart → Checkout → COD → Place order → Place order · ₹x | Order created, cart cleared, Order Placed "Pay ₹x in cash…" |
| CHK-02 | Wallet order | Wallet balance ≥ total → Pay with Wallet → Pay | Order Placed "Payment successful", wallet debited |
| CHK-03 | Online order | Proceed to Pay → Pay → complete UPI in sandbox | Processing → Order Placed |
| CHK-04 | No address | Checkout with no address | Red card; button "Add address" → Addresses |
| CHK-05 | Change address | Tap address card → select other | Back to Checkout, ETA and bill update |
| CHK-06 | Delivery ETA | Serviceable address with store assigned | "Delivered in X to Y mins" + window |
| CHK-07 | ETA unavailable | Address without lat/lng | "Delivery time unavailable" |
| CHK-08 | Tip | Select ₹20 | Tip row in bill, To pay +20 |
| CHK-09 | Someone else (valid) | Tick → name + valid phone → continue | Proceeds to Payment |
| CHK-10 | Someone else (invalid) | Name "A" / phone "12345" | Respective toast, stays |
| CHK-11 | Untick clears | Fill receiver → untick → tick again | Fields empty |
| CHK-12 | Method re-price | Switch online ↔ COD | Bill re-priced (COD fee if configured) |
| CHK-13 | Low wallet | Wallet < total → choose wallet → Payment | "Low" badge, banner, button disabled, Top up → Wallet |
| CHK-14 | Gateway cancel | Online → close WebView | Toast "Payment cancelled…", back to Checkout |
| CHK-15 | Gateway failure | Fail payment in sandbox | Failed screen; Retry / Choose another method |
| CHK-16 | Choose another method | On Failed → Choose another → COD → Place | Order placed with COD |
| CHK-17 | Track from confirmation | Order Placed → Track order | Tracking for this order |
| CHK-18 | Back to home | Order Placed → Back to home | Home with active order banner |
| CHK-19 (neg) | Retry creates duplicate | Fail online payment → Retry payment → pay | ⚠ Check Orders for duplicate pending order |
| CHK-20 (neg) | Payment not confirmed | Delay gateway confirmation > 15 s | "Payment was not confirmed yet…" |
| CHK-21 (neg) | Order API failure | Block `POST /orders` | Failed screen with server message |
| CHK-22 (neg) | Android back during processing | Press back while "Processing" | Record behaviour (no header) |
| CHK-23 (neg) | Non-serviceable old address | Select an old address now out of area → place order | ⚠ No client check; record server response |

---

## 11. Module 10 — Orders

### 11.1 Orders list — `src/screens/orders/index.tsx`
**Cards (8):** header "My Orders", filter chips row with counts, order card, card top (#no, "N items · ₹total", status pill), card thumbnails (max 4 + "+N"), card bottom ("Placed on…" + actions), skeleton, empty states.

**Actions (9)**

| # | Element | Expected result |
|---|---|---|
| 1 | All (n) | All orders |
| 2 | Active (n) | Not delivered / cancelled |
| 3 | Completed (n) | Delivered |
| 4 | Cancelled (n) | Cancelled |
| 5 | Order card | Order Detail |
| 6 | Track (active only) | Tracking ⚠ opens in-memory active order, not the tapped one |
| 7 | Reorder (delivered) | `POST /orders/:id/reorder` → toast "Items added to cart" → Checkout |
| 8 | Rate (delivered) | Rate Order |
| 9 | Start shopping (empty) | Main |

**Status labels:** pending "Order placed", confirmed "Confirmed", getting-packed "Getting packed", on-the-way "On the way", arrived "Arrived", delivered "Delivered", cancelled "Cancelled".
**API:** `GET /orders?limit=50` (once at app start). ⚠ No refresh on focus, no pull-to-refresh, no pagination.

### 11.2 Order Detail — `src/screens/orders/OrderDetail.tsx`
**Cards (10):** header (#no, date, ⋮), status pill, items card, "Order status" timeline, bill summary (item total, discount, delivery, tip, total, payment), delivery address, delivered-only actions, Order Options sheet, Rate prompt sheet, Cancel sheet.

**Actions (8)**

| # | Element | Expected result |
|---|---|---|
| 1 | Back | Back |
| 2 | ⋮ | Opens Order options |
| 3 | Cancel order (pending/confirmed only) | Opens Cancel sheet |
| 4 | Return / report issue (delivered only) | Return Request |
| 5 | Download invoice | Invoice |
| 6 | Need help | Creates generic ticket → Ticket Detail |
| 7 | Reorder (delivered) | Reorder → Checkout |
| 8 | Write a review (delivered) | Rate prompt sheet |

**States:** "Order not found" + Back to orders. Reads only cached list (no fetch).

### 11.3 Order Options sheet — `src/components/OrderOptionsSheet.tsx`
**Cards (2):** sheet header "Order options", option rows (icon, title, description, chevron; destructive in red).
**Actions (1):** close via X / backdrop / back (option rows counted in 11.2).

### 11.4 Cancel Order sheet — `src/components/CancelOrderSheet.tsx`
**Cards (5):** title "Cancel order", #no, free-cancellation notice, reason radios (Ordered by mistake, Delivery taking too long, Want to change items, Found a better price, Other), "Confirm cancellation" button. Blocked variant: "Can't cancel this order".
**Actions (4):** select reason (optional), Confirm (`POST /orders/:id/cancel` → toast "Order cancelled · refund initiated"), close (X/backdrop/back, blocked while cancelling), "Close" (blocked state).
**Rules:** cancel allowed only for `pending` / `confirmed`. ⚠ Sheet closes even when cancel fails. ⚠ Refund notice shown for COD too.

### 11.5 Invoice — `src/screens/orders/Invoice.tsx`
**Cards (7):** header "Invoice", skeleton, invoice top (Selorg / Tax Invoice, #invoice, date), Billed to, items table (Item, Qty, Price, Total), totals block, payment + "Share / Download" button.
**Actions (2):** back; Share / Download ("Preparing invoice…") → Android saves "Selorg-{no}.pdf" to Downloads with toast; iOS opens share sheet.
**API:** `GET /orders/:id/invoice`. ⚠ Tax breakdown not shown; GSTIN only in PDF footer.

### 11.6 Functionality list — Orders
1. Order history with filter chips and counts.
2. Order card with thumbnails, status pill and quick actions.
3. Order detail with items, timeline, bill and address.
4. Cancel order with reasons (pending / confirmed only).
5. Reorder delivered orders.
6. Tax invoice view and PDF download/share.
7. Need help → support ticket.
8. Return / report issue entry for delivered orders.

### 11.7 User workflows / test cases — Orders

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| ORD-01 | Orders list | Orders tab | Cards with #no, items, total, status, date |
| ORD-02 | Filters | Tap Active / Completed / Cancelled | Correct subset and counts |
| ORD-03 | Filter empty | Filter with no orders | "Nothing here" |
| ORD-04 | Order detail | Tap card | Items, timeline, bill, address |
| ORD-05 | Bill check | Compare detail bill with checkout | Values match |
| ORD-06 | Cancel (pending) | ⋮ → Cancel order → reason → Confirm | Toast "Order cancelled · refund initiated", status Cancelled |
| ORD-07 | Cancel without reason | Confirm without selecting | Cancelled (reason optional) |
| ORD-08 | Cancel not allowed | Order packed → open ⋮ | Cancel option hidden |
| ORD-09 | Reorder | Delivered order → Reorder | Toast, Checkout with items |
| ORD-10 | Invoice view | ⋮ → Download invoice | Invoice screen with items and totals |
| ORD-11 | Invoice PDF Android | Share / Download | "Saved to Downloads as Selorg-….pdf"; file opens |
| ORD-12 | Invoice PDF iOS | Share / Download | Share sheet opens |
| ORD-13 | Need help | ⋮ → Need help | Ticket created, Ticket Detail opens |
| ORD-14 | Return entry | Delivered → ⋮ → Return / report issue | Return Request |
| ORD-15 (neg) | Track wrong order | Have 2 active orders → tap Track on the older | ⚠ Shows in-memory active order |
| ORD-16 (neg) | List stale | Order status changes while on list | ⚠ List not updated until restart |
| ORD-17 (neg) | Login after launch | Launch as guest → log in → Orders | ⚠ List empty until restart |
| ORD-18 (neg) | Cancel failure | Block cancel API → Confirm | Error toast; ⚠ sheet closes |
| ORD-19 (neg) | Reorder failure | Block reorder API | Toast "Could not reorder items" |

---

## 12. Module 11 — Live Tracking

### 12.1 Tracking — `src/screens/orders/Tracking.tsx`
**Cards (13)**
1. Live map (≤ 340 px)
2. Map header overlay (back, "Tracking on Map", help)
3. Bottom sheet with handle
4. Headline ("Your order is coming in {mm}:00" / delivered / cancelled)
5. Order card (image, "Selorg Fresh Order", ID, items, status)
6. Rider row (avatar, name / "Your delivery partner", subtitle, Chat, Call)
7. "TRIP" label
8. Trip timeline (confirmed, getting-packed, on-the-way, arrived, delivered)
9. Cancelled row
10. "HOW IS YOUR SHIPPER?" stars (delivered)
11. Action buttons
12. Cancel sheet
13. Delivered Celebration modal

**Actions (11)**

| # | Element | Expected result |
|---|---|---|
| 1 | Map back | Back |
| 2 | Map help | Generic ticket → Ticket Detail |
| 3 | Rider Chat | Creates "Delivery support" ticket → Ticket Detail (not live rider chat) |
| 4 | Rider Call | Opens dialer `tel:` if phone; else toast "Calling {name}…" / "Rider contact unavailable" |
| 5 | Shipper star 1–5 | One tap submits rating → Rating Success |
| 6 | Cancel order | Cancel sheet (pending/confirmed only) |
| 7 | Report an issue / return (delivered) | Return Request |
| 8 | Need help with this order | Generic ticket → Ticket Detail |
| 9 | Celebration "Rate your order" | Rate Order |
| 10 | Celebration Done / X / back | Close modal |
| 11 | Map pan / zoom | Map moves |

**Real-time:** socket `subscribe:order`; events `order.confirmed`, `order.picking_started`, `order.handed_over`, `order.rider_accepted`, `order.out_for_delivery`, `order.delivered`, `order.cancelled` → refetch order + tracking. `rider:location` → moves rider marker with heading.
**ETA fallback:** pending 25, confirmed 20, packed 15, on-the-way 10, arrived 5, delivered 0 (displayed as "mm:00", not a countdown).
**States:** "No active order" + Shop now; "Map unavailable"; "Waiting for location".

### 12.2 Live Tracking Map — `src/components/orders/LiveTrackingMap.tsx`
**Cards (6):** store marker, destination marker, rider marker (rotated), route line (solid = Directions, dashed = fallback), header overlay slot, fallbacks.
**Actions (1):** pan/zoom.
**Rules:** route refetched only after rider moves ≥ 70 m; marker animates 900 ms.

### 12.3 Delivered Celebration — `src/components/DeliveredCelebration.tsx`
**Cards (5):** backdrop, confetti + check badge, "Delivered!" text, #order number, buttons.
**Actions (3):** X, "Rate your order", "Done". Shown once per order (while Tracking is open).

### 12.4 Functionality list — Live Tracking
1. Live map with store, destination and rider markers and route.
2. Real-time status updates via socket.
3. Real-time rider location with heading.
4. ETA headline and trip timeline with timestamps.
5. Rider call and support chat.
6. Cancel from tracking (eligible statuses).
7. One-time delivered celebration and rating entry.
8. Report issue / return after delivery.

### 12.5 User workflows / test cases — Live Tracking

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| TRK-01 | Open tracking | Place order → Track order | Map, headline with ETA, timeline at "Order placed/Confirmed" |
| TRK-02 | Status: confirmed | Admin confirms | Timeline updates without refresh |
| TRK-03 | Status: packed | Admin starts picking | "Getting packed" done |
| TRK-04 | Rider assigned / out for delivery | Rider accepts, goes out | Rider row with name; rider marker visible |
| TRK-05 | Rider movement | Rider app moves | Marker moves smoothly, heading rotates; route redraws after ≥ 70 m |
| TRK-06 | Call rider | Tap Call (phone available) | Dialer with rider number |
| TRK-07 | Call rider (no phone) | Tap Call | Toast "Calling …" / "Rider contact unavailable" (⚠ no call) |
| TRK-08 | Chat | Tap Chat | "Delivery support" ticket opens |
| TRK-09 | Delivered | Rider marks delivered | Celebration modal once; headline "Your order has been delivered"; shipper stars shown |
| TRK-10 | Celebration once | Close modal, leave and re-open Tracking | Modal not shown again |
| TRK-11 | Rate from celebration | Tap Rate your order | Rate Order screen |
| TRK-12 | Shipper stars | Tap 4th star | Immediately submits → Rating Success |
| TRK-13 | Cancel from tracking | Pending order → Cancel order → Confirm | Cancelled; ⚠ screen shows "No active order" |
| TRK-14 | Cancelled via admin | Admin cancels | Cancelled view "Order cancelled / Refund initiated if applicable" |
| TRK-15 | Report issue | Delivered → Report an issue / return | Return Request |
| TRK-16 (neg) | App restart | Active order → kill app → reopen | ⚠ Home banner gone, Tracking "No active order" |
| TRK-17 (neg) | Socket disconnect | Toggle network off/on | Reconnects (≤ 10 attempts), updates resume |
| TRK-18 (neg) | No coordinates | Address without lat/lng | "Waiting for location" |

---

## 13. Module 12 — Ratings

### 13.1 Rate Order — `src/screens/orders/RateOrder.tsx`
**Cards (5):** header (#no), "How was your experience?", 5 stars, comment card (optional), Submit footer.
**Actions (4):** back, star 1–5, comment input, "Submit rating" (disabled at 0 stars; `POST /orders/:id/rate` → Rating Success; failure toast "Could not submit rating").

### 13.2 Rate Order Prompt sheet — `src/components/RateOrderPrompt.tsx`
**Cards (6):** head row (thumbnail, title, #no · items, X), 5 stars, live label (Tap a star / Poor / Fair / Good / Very good / Excellent), comment box, "Submit review", "Maybe later".
**Actions (5):** star tap, comment, Submit (disabled at 0), X, Maybe later / backdrop.
⚠ No success toast; API error unhandled.

### 13.3 Rating Success — `src/screens/orders/RatingSuccess.tsx`
**Cards (4):** confetti, star badge, "Thanks for rating!", subtitle.
**Actions (1):** "Back to orders" → Orders.

### 13.4 Functionality list — Ratings
1. Full-screen order rating with optional comment.
2. In-sheet rating prompt from Order Detail.
3. One-tap shipper rating on Tracking.
4. Thank-you confirmation.

### 13.5 User workflows / test cases — Ratings

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| RAT-01 | Rate from Orders | Delivered order → Rate → 5 stars → comment → Submit | "Submitting…" → Rating Success |
| RAT-02 | Submit disabled | Open Rate Order without stars | Submit disabled |
| RAT-03 | Comment optional | 3 stars, no comment → Submit | Success |
| RAT-04 | Prompt sheet | Order Detail → Write a review → 4 stars → Submit | Sheet closes (no toast) |
| RAT-05 | Prompt label | Tap stars 1→5 | Label Poor → Excellent |
| RAT-06 | Maybe later | Tap Maybe later | Sheet closes, resets |
| RAT-07 | Back to orders | Rating Success → Back to orders | Orders screen |
| RAT-08 (neg) | API failure | Block rate API → Submit | Toast "Could not submit rating" (⚠ prompt sheet: no toast) |
| RAT-09 (neg) | Rate twice | Rate same order again | ⚠ Client allows; record server response |

---

## 14. Module 13 — Refunds & Returns

### 14.1 Refunds list — `src/screens/refunds/index.tsx`
**Cards (3):** header "Refunds & Returns", refund card (₹amount · #order, reason · to wallet/original, status pill, date), empty state.
**Actions (2):** back, tap card → Refund Detail.
**Statuses shown:** Pending, Processed, Rejected (API `approved` → Pending).
**API:** `GET /refunds?limit=50` (once at app start).

### 14.2 Refund Detail — `src/screens/refunds/RefundDetail.tsx`
**Cards (4):** amount card (to wallet / original method), details (Order, Reason, Requested on), 3-step progress (Requested, Processing, Processed), rejected card.
**Actions (1):** back.

### 14.3 Return Request — `src/screens/refunds/ReturnRequest.tsx`
**Cards (5):** header (#no), "Which item?" radio list, "What went wrong?" reasons, note (optional), Submit footer.
**Actions (4):** back, item radio (first preselected), reason radio, "Submit request" (`POST /refunds/request` → toast "Return request submitted" → Refunds).

| Reason | Code sent |
|---|---|
| Damaged product | `item_damaged` |
| Missing item | `other` |
| Wrong item delivered | `wrong_item` |
| Quality not as expected | `other` |
| Other | `other` |

⚠ No photo upload, quantity, refund-mode choice or return window.

### 14.4 Functionality list — Refunds & Returns
1. Return / issue request per item with reason and note.
2. Refund list with amount, destination and status.
3. Refund detail with progress or rejection.

### 14.5 User workflows / test cases — Refunds & Returns

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| REF-01 | Submit return | Delivered → Return → select item + "Damaged product" + note → Submit | Toast, Refunds list with new card on top |
| REF-02 | Submit disabled | Clear reason | Submit disabled |
| REF-03 | Reason codes | Submit each reason | Payload `reasonCode` per table |
| REF-04 | Refund detail pending | Tap pending refund | Step 1 done |
| REF-05 | Refund processed | Admin processes | All 3 steps done (after app restart ⚠) |
| REF-06 | Refund rejected | Admin rejects | Rejected card replaces timeline |
| REF-07 | Empty | New user → Refunds | "No refunds" |
| REF-08 (neg) | Submit failure | Block refund API → Submit | Error toast; ⚠ still navigates to Refunds |
| REF-09 (neg) | Non-delivered return | Open return for non-delivered order via Tracking | ⚠ No client check |

---

## 15. Module 14 — Account, Profile & Settings

### 15.1 Account — `src/screens/profile/index.tsx` (tab + stack route)
**Cards (7):** header "Account", guest card ("Guest" + Log in), profile card (avatar, name, phone, Edit), stat tiles (Wallet ₹, Orders N, Refunds N), top menu group (My Orders, Wishlist, Addresses, Wallet, Refunds, Notifications + badge), bottom menu group (Support, Edit profile, Settings, Terms & privacy), "Log out" button.

**Actions (17)** — "gated" = guest is sent to Enter Mobile.

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Guest Log in | — | Enter Mobile |
| 2 | Edit chip (gated) | — | Edit Profile |
| 3 | Wallet tile (gated) | — | Wallet |
| 4 | Orders tile (gated) | — | Orders |
| 5 | Refunds tile (gated) | — | Refunds |
| 6 | My Orders row (gated) | — | Orders |
| 7 | Wishlist row (gated) | — | Wishlist |
| 8 | Addresses row (gated) | — | Addresses |
| 9 | Wallet row (gated) | — | Wallet |
| 10 | Refunds row (gated) | — | Refunds |
| 11 | Notifications row (gated) | — | Notifications |
| 12 | Support row (gated) | — | Help & Support |
| 13 | Edit profile row (gated) | — | Edit Profile |
| 14 | Settings row (gated) | — | Settings |
| 15 | Terms & privacy (not gated) | — | Legal (terms) |
| 16 | Log out | `account-logout` | Logout sheet → confirm → `POST /auth/logout` → Enter Mobile |
| 17 | Header back (stack only) | — | Back |

### 15.2 Edit Profile — `src/screens/profile/profileDetails.tsx`
**Cards (6):** header, avatar (96 px), Full name, Email, Mobile (read-only, "Verified · link a new number to change"), "Save changes".
**Actions (6):** avatar circle (toast "Photo upload coming soon"), avatar camera chip (same), name input, email input, Save (`PUT /user/profile` → toast "Profile updated" → back; failure "Could not update profile"), back.
⚠ No client validation; empty name can be saved; email cannot be cleared.

### 15.3 Logout sheet — `src/components/LogoutConfirmSheet.tsx`
**Cards (1):** "Log out of Selorg?" sheet.
**Actions (3):** Cancel (`logout-cancel`), Log out (`logout-confirm`), X / backdrop.

### 15.4 Settings — `src/screens/profile/settings.tsx`
**Cards (7):** header, "NOTIFICATIONS" group (4 switches), Delete account row, Log out, version "Selorg · v2.0.0", Logout sheet, Delete account sheet (step 1 "Delete account?" / step 2 "Confirm with code").

**Actions (11)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Push notifications switch | — | `PUT /notifications/preferences` (`push`) |
| 2 | Order updates switch | — | `categories.order.push` |
| 3 | Offers & promos switch | — | `categories.promotional.push` + `offers.push` |
| 4 | Wallet & refunds switch | — | `categories.wallet.push` |
| 5 | Delete account row | `settings-delete` | Opens sheet step 1 |
| 6 | Send code | `settings-delete-send` | `POST /auth/account/delete/send-otp` → step 2 |
| 7 | Code input | `settings-delete-otp` | Digits only, max 4 |
| 8 | Delete account (confirm) | `settings-delete-confirm` | `POST /auth/account/delete/confirm` → logout → Enter Mobile |
| 9 | Cancel / X / backdrop | — | Close sheet (blocked while request running) |
| 10 | Log out | `settings-logout` | Logout sheet |
| 11 | Header back | — | Back |

**Rules:** switches default ON, optimistic update, ⚠ silent rollback on failure. Delete code 4 digits → "Enter the 4-digit code."

### 15.5 Functionality list — Account, Profile & Settings
1. Account hub with profile card, stat tiles and menus.
2. Guest gating to login for personal sections.
3. Edit name and email; mobile read-only.
4. Notification preference toggles synced with server.
5. Account deletion with OTP confirmation.
6. Logout with confirmation (from Account and Settings).

### 15.6 User workflows / test cases — Account, Profile & Settings

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| ACC-01 | Account logged in | Account tab | Profile card, stat tiles, menus, Log out |
| ACC-02 | Account guest | As guest open Account | Guest card; no tiles / logout |
| ACC-03 | Guest gating | As guest tap each gated row | Enter Mobile each time |
| ACC-04 | Terms as guest | Tap Terms & privacy | Legal opens (not gated) |
| ACC-05 | Every menu row | Tap each row as logged-in user | Correct screen (see 15.1 table) |
| ACC-06 | Stat tiles | Compare tiles with Wallet / Orders / Refunds screens | Values match |
| ACC-07 | Notification badge | Have unread notifications | Red count on Notifications row |
| PRF-01 | Edit profile | Edit → change name → Save | Toast "Profile updated", Account shows new name |
| PRF-02 | Add email | Enter valid email → Save | Saved |
| PRF-03 | Avatar | Tap avatar / camera chip | Toast "Photo upload coming soon" |
| PRF-04 (neg) | Empty name | Clear name → Save | ⚠ Sent to server; record result |
| PRF-05 (neg) | Invalid email | "abc" → Save | ⚠ No client error; record result |
| PRF-06 (neg) | Clear email | Remove email → Save | ⚠ Email not removed |
| SET-01 | Toggle prefs | Toggle each of 4 switches, kill app, reopen | States persist |
| SET-02 (neg) | Toggle offline | Airplane mode → toggle | ⚠ Silently reverts |
| SET-03 | Delete account | Delete → Send code → enter OTP → Delete | Logged out, Enter Mobile; login with same number = new user |
| SET-04 | Delete — short code | Enter 3 digits → Delete | "Enter the 4-digit code." |
| SET-05 | Delete — wrong code | Wrong 4 digits | Server error in sheet |
| SET-06 | Delete — cancel | Cancel at step 1 / step 2 | Sheet closes, account intact |
| LOG-01 | Logout cancel | Log out → Cancel | Still logged in |
| LOG-02 | Logout confirm | Log out → Log out | Enter Mobile; back doesn't return to app |
| LOG-03 (neg) | Data after re-login | Logout → login as different user → Wallet / Notifications / Support / Wishlist | ⚠ Previous user's data may remain |

---

## 16. Module 15 — Wallet

### 16.1 Wallet — `src/screens/wallet/index.tsx`
**Cards (9):** header "Selorg Wallet", balance card (balance + Refresh), amount chips (₹100, ₹250, ₹500, Custom), custom amount input (₹), "Add ₹X" button, transaction history (rows: icon, note, date, ±amount) / empty state, method sheet header ("SELORG TECH PRIVATE LTD", amount, close), method sheet body (UPI, Cards, Wallets, Net Banking / processing view), Worldline WebView.

**Actions (13)**

| # | Element | testID | Expected result |
|---|---|---|---|
| 1 | Refresh | — | Reload balance + transactions, toast "Balance updated" |
| 2 | ₹100 chip | — | Amount 100 |
| 3 | ₹250 chip | — | Amount 250 |
| 4 | ₹500 chip | — | Amount 500 |
| 5 | Custom chip | — | Shows input, amount 0 |
| 6 | Custom input | — | Digits only |
| 7 | Add ₹X | `wallet-add-money` | Opens method sheet (disabled when 0) |
| 8 | UPI | — | `POST /wallet/top-up/session` → WebView |
| 9 | Cards | — | Same as UPI (⚠ method ignored) |
| 10 | Wallets | — | Same |
| 11 | Net Banking | — | Same |
| 12 | Sheet close / backdrop | `wallet-cancel` | Close (not while processing) |
| 13 | Header back | — | Back |

**System actions:** WebView success → complete + poll ×10 → toast "Wallet topped up successfully"; WebView cancel → abort → toast "Top-up cancelled"; not paid → "Payment was not confirmed. No money was added."
**Rules:** presets 100/250/500 (default 100). ⚠ No min/max top-up. Transactions: credit "+" green, debit "−"; max 50, no filters.
**APIs:** `GET /wallet/balance`, `GET /wallet/transactions?limit=50`, `POST /wallet/top-up/session`, `POST /payments/worldline/complete`, `GET /payments/worldline/status`, `POST /payments/worldline/abort`.

### 16.2 Functionality list — Wallet
1. Balance display with manual refresh.
2. Top-up with preset or custom amount via Worldline.
3. Top-up cancel and failure handling.
4. Transaction history (credit / debit).
5. Wallet used as payment method at checkout (full cover only).

### 16.3 User workflows / test cases — Wallet

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| WAL-01 | View wallet | Account → Wallet | Balance and transactions |
| WAL-02 | Top-up preset | ₹250 → Add ₹250 → UPI → pay | Toast success; balance +250; credit row |
| WAL-03 | Top-up custom | Custom → "1a2b" | Input shows 12; Add ₹12 |
| WAL-04 | Add disabled | Custom → empty | Add disabled |
| WAL-05 | Cancel sheet | Add → close sheet | Nothing charged |
| WAL-06 | Cancel in WebView | Close gateway | Toast "Top-up cancelled", balance unchanged |
| WAL-07 | Payment failure | Fail in sandbox | "Payment was not confirmed. No money was added." |
| WAL-08 | Refresh | Tap Refresh | Spinner then "Balance updated" |
| WAL-09 | Wallet pay at checkout | Pay order with wallet | Debit row appears; balance reduced |
| WAL-10 | Empty history | New user | "No transactions yet" |
| WAL-11 (neg) | Huge amount | Custom 9999999 | ⚠ No client max; record gateway response |
| WAL-12 (neg) | Refresh offline | Airplane → Refresh | ⚠ Still shows "Balance updated" |

---

## 17. Module 16 — Notifications

### 17.1 Notifications list — `src/screens/profile/notification.tsx`
**Cards (4):** header + "Mark all read", empty state ("You're all caught up"), notification card (type icon, unread dot, title, body, time), close X on card.
**Actions (4):** Mark all read (`PUT /notifications/read-all` → toast "All marked read"), tap card (`PUT /notifications/:id/read`; ⚠ no navigation), X delete (`DELETE /notifications/:id`), back.
**Type icons:** order = truck, wallet = wallet, promo = tag, other = bell.

### 17.2 In-app push banner — `src/components/InAppNotificationBanner.tsx`
**Cards (6):** image / bell, title, countdown (when `timerMinutes`), body, "Tap to view product" hint, progress bar.
**Actions (2):** tap banner (→ Product Detail if `productId`), ✕ dismiss.
**Rules:** auto-dismiss 6 s (no timer); timer turns red ≤ 60 s, "Ended" then dismiss 2 s later. Background / cold-start taps navigate to Product Detail only.

### 17.3 Toast — `src/components/ToastHost.tsx`
**Cards (1):** toast (ok / err / info). **Actions (0).** 2.4 s (errors 3.2 s); new toast replaces old.

### 17.4 Functionality list — Notifications
1. Notification list with unread indicator and type icons.
2. Mark single / all as read; delete.
3. Unread badge on Home bell and Account.
4. FCM push registration on login.
5. Foreground banner with optional countdown; product deep link.
6. Background / cold-start push tap → Product Detail.

### 17.5 User workflows / test cases — Notifications

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| NOT-01 | List | Bell → Notifications | Cards, unread bold with dot |
| NOT-02 | Mark read | Tap unread card | Dot removed, badge −1 |
| NOT-03 | Mark all read | Tap Mark all read | Toast, link disappears, badge 0 |
| NOT-04 | Delete | Tap X | Removed |
| NOT-05 | Empty | No notifications | "You're all caught up" |
| NOT-06 | Foreground push (product) | Send push with productId | Banner; tap → Product Detail |
| NOT-07 | Foreground push (timer) | Send with timerMinutes=2 | Countdown + progress; red at ≤ 60 s; "Ended" → dismiss |
| NOT-08 | Auto dismiss | Push without timer | Dismisses after 6 s |
| NOT-09 | Background push tap | App in background → tap | Product Detail |
| NOT-10 | Cold-start push tap | Kill app → tap push | App opens to Product Detail |
| NOT-11 | Pref OFF | Turn off Offers & promos → send promo | Not received |
| NOT-12 (neg) | Order push tap | Push with order data only | ⚠ No navigation |
| NOT-13 (neg) | Delete failure | Block delete API | Item returns at end of list |
| NOT-14 (neg) | Push after logout | Logout → send push to old token | ⚠ Still received (token not removed) |

---

## 18. Module 17 — Help & Support

### 18.1 Help & Support — `src/screens/profile/helpSupport.tsx`
**Cards (6):** header, "New conversation" card ("Avg. reply in 2 min"), "QUICK HELP" FAQ card (4 rows), "YOUR CONVERSATIONS" label, ticket rows / empty state, status pill (Open / Resolved).
**Actions (8):** New conversation, FAQ "Where is my order?", FAQ "How do refunds work?", FAQ "Change delivery address", FAQ "Report a missing item", empty-state Start conversation, ticket row, back.
**Rules:** all create the same ticket (`POST /support/tickets {subject:'New conversation', description:'Hello'}`) → Ticket Detail. Max 30 tickets. `closed` shown as Resolved.

### 18.2 Ticket Detail — `src/screens/profile/TicketDetail.tsx`
**Cards (5):** header (subject, "Support · online" / "Resolved"), message bubbles, composer, "Reopen ticket" button, not-found state.
**Actions (5):** type message, Send (`POST /support/tickets/:id/messages`), auto-scroll, Reopen (`POST /support/tickets/:id/reopen`), back.
**Rules:** empty message ignored. ⚠ No live agent replies (only refreshed after sending).

### 18.3 Functionality list — Help & Support
1. Start new support conversation.
2. Quick-help FAQ entries.
3. Ticket list with status.
4. Chat thread with send and reopen.
5. Entry points from Order Detail and Tracking (help / rider chat).

### 18.4 User workflows / test cases — Help & Support

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| SUP-01 | New conversation | Support → New conversation | Ticket Detail opens; ticket in list |
| SUP-02 | Send message | Type → Send | Bubble on right with time |
| SUP-03 | Empty message | Send spaces | Nothing sent |
| SUP-04 | Agent reply | Agent replies from admin → user sends another | Agent bubble appears (⚠ only after sending) |
| SUP-05 | Resolved ticket | Admin resolves | Composer hidden, Reopen shown |
| SUP-06 | Reopen | Tap Reopen ticket | Composer returns |
| SUP-07 | FAQ row | Tap "Where is my order?" | ⚠ Generic "New conversation" ticket |
| SUP-08 (neg) | Send offline | Airplane → Send | Toast "Message could not be sent"; ⚠ message stays |
| SUP-09 (neg) | Create offline | Airplane → New conversation | ⚠ No feedback |
| SUP-10 (neg) | Double tap | Tap New conversation twice fast | ⚠ Duplicate tickets |

---

## 19. Module 18 — Legal

### 19.1 Terms / Privacy — `src/screens/profile/policy.tsx`
**Cards (4):** header ("Terms of Service" / "Privacy Policy"), skeleton (`legal-loading`), content card (`legal-content`), retry box (`legal-retry`).
**Actions (2):** Retry, back.
**Rules:** 404 → "…content is not available yet." (no retry). Other error → message + Retry. ⚠ Privacy Policy not reachable from UI. ⚠ HTML/markdown shown as raw text.
**APIs:** `GET /legal/terms`, `GET /legal/privacy`.

### 19.2 Functionality list — Legal
1. Terms of Service display.
2. Loading, not-published and error-with-retry states.

### 19.3 User workflows / test cases — Legal

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| LEG-01 | View terms | Account → Terms & privacy | Skeleton → content |
| LEG-02 | Not published | Remove terms in admin | "Terms of Service content is not available yet." |
| LEG-03 | Network error | Airplane → open | Error + Retry; Retry works when online |
| LEG-04 (neg) | Privacy | Look for Privacy Policy entry | ⚠ Not reachable |

---

## 20. Module 19 — Wishlist

### 20.1 Wishlist — `src/screens/profile/yourWishlist.tsx`
**Cards (4):** header "Wishlist", skeleton grid, empty state ("Your wishlist is empty" + Start shopping), 2-col product grid.
**Actions (7):** card open → Product Detail, heart (remove), Add, +, −, Start shopping → Main, back.
**Rules:** ⚠ stored in memory only — lost on restart, not cleared on logout. Loads each product via `GET /products/:id`.

### 20.2 Functionality list — Wishlist
1. Heart products from any card / Product Detail.
2. Wishlist grid with add to cart.
3. Remove from wishlist.

### 20.3 User workflows / test cases — Wishlist

| TC ID | Scenario | Steps | Expected result |
|---|---|---|---|
| WSH-01 | Add to wishlist | Heart 2 products → Account → Wishlist | Both shown |
| WSH-02 | Remove | Tap heart in Wishlist | Removed (skeleton flash) |
| WSH-03 | Add to cart | Tap Add / + / − | Cart updates |
| WSH-04 | Open product | Tap card | Product Detail |
| WSH-05 | Empty | No items | Empty state → Start shopping → Home |
| WSH-06 (neg) | Restart | Heart items → kill app → reopen | ⚠ Wishlist empty |
| WSH-07 (neg) | User switch | Logout → login as another user | ⚠ Previous wishlist visible |

---

## 21. Screens that exist but cannot be reached

| Screen | File | Status |
|---|---|---|
| Login with password | `src/screens/auth/LoginPassword.tsx` | Not registered; `loginWithPassword` always returns "Password login is not supported" |
| Create password | `src/screens/auth/CreatePassword.tsx` | Not registered; no API call |
| Forgot password | `src/screens/auth/Forgot.tsx` | Not registered; would log in instead of reset |
| Reset password | `src/screens/auth/ResetPassword.tsx` | Not registered; no-op |
| Auth success | `src/screens/auth/AuthSuccess.tsx` | Not registered |
| Write review | `src/screens/product/WriteReview.tsx` | Registered but no entry point; submits nothing |
| No internet | `src/screens/common/NoInternet.tsx` | Registered but never navigated to |

These are **out of scope** for functional testing; confirm with product whether they should be removed or wired up.

---

## 22. Known issues found during code review (log as defects before test start)

| # | Severity | Module | Issue |
|---|---|---|---|
| 1 | High | Orders / Tracking | "Track" on Orders list and Home banner open the in-memory active order, not the tapped order |
| 2 | High | Tracking | Active order is lost on app restart (`GET /orders/active` never called) |
| 3 | High | Orders / Refunds / Wallet / Notifications / Support | Lists load only once at app start; no refresh on focus or after login; previous user's data stays after logout |
| 4 | High | Checkout & Payment | "Retry payment" creates a new order (possible duplicate pending orders) |
| 5 | High | Categories | Category Products "Retry" does nothing |
| 6 | High | Auth | No OTP lockout after attempts reach 0 |
| 7 | High | Auth | Killing app on Profile Setup skips profile + location (user lands on Home with empty name) |
| 8 | Medium | Address | "Address line 2 (optional)" is actually required |
| 9 | Medium | Address | Save button has no loading/disabled state (duplicate addresses on double tap) |
| 10 | Medium | Cart | Guest "+" can exceed available stock |
| 11 | Medium | Cart / Invoice | GST/tax not shown as a row, though included in total; invoice has no tax breakdown |
| 12 | Medium | Catalog | Stock calculated differently in Home / Search / Product Detail (same product can be addable in one and sold out in another) |
| 13 | Medium | Catalog | `maxOrderLimit` not passed from Collection, related products and Wishlist |
| 14 | Medium | Location | User enters app even when location is not serviceable; conflicting toasts when address save fails |
| 15 | Medium | Orders | Cancel sheet closes even when cancel fails; refund notice shown for COD |
| 16 | Medium | Refunds | Return submit navigates to Refunds even on failure |
| 17 | Medium | Notifications | Tapping a list notification never navigates; push deep links only support Product Detail |
| 18 | Medium | Notifications | FCM token not removed on logout / account delete |
| 19 | Medium | Wishlist | Not persisted (lost on restart) and not cleared on logout |
| 20 | Medium | Support | FAQ rows create generic tickets; no error handling / double-tap guard on ticket creation |
| 21 | Medium | Profile | No name/email validation on Edit Profile; email cannot be cleared |
| 22 | Low | Auth | Country code selector is cosmetic (not sent, OTP screen always "+91") |
| 23 | Low | Auth | Resend OTP has no feedback; timer label wrong above 59 s |
| 24 | Low | Product | Share and Notify me are toast-only stubs |
| 25 | Low | Product | Description, ETA, benefits, accordions are hard-coded for all products |
| 26 | Low | Search | API error shown as "No results"; no recent/trending searches; max 40 results |
| 27 | Low | Home | Hero shows only first banner (not a carousel); no pull-to-refresh |
| 28 | Low | Tracking | ETA "mm:00" is static, not a countdown; Call without phone shows "Calling…" |
| 29 | Low | Tracking | Shipper stars submit on single tap without confirmation |
| 30 | Low | Wallet | Selected method (UPI/Cards/…) ignored; no min/max top-up; "Balance updated" shown on failure |
| 31 | Low | Legal | Privacy Policy not reachable; HTML/markdown shown raw |
| 32 | Low | Settings | Preference toggle failures roll back silently |
| 33 | Low | General | No offline detection anywhere; No Internet screen unused |
| 34 | Low | General | No pagination on any list (Search 40, Collection 40, Category 80, Orders 50, Refunds 50, Wallet 50, Notifications 50, Tickets 30) |

---

## 23. Test execution checklist (cross-cutting)

| # | Area | Check |
|---|---|---|
| 1 | Devices | Android 10, Android 13+ (notification permission), iOS latest; small (5") and large screens |
| 2 | Orientation | Portrait only — verify layout does not break |
| 3 | Network | 4G, slow 3G, offline → online transitions on Home, Cart, Payment, Tracking |
| 4 | Background / kill | Kill app during payment, OTP, profile setup and tracking |
| 5 | Accessibility | Reduce motion (pulse / celebration static), screen reader labels on tabs and cart |
| 6 | Keyboard | Inputs not hidden behind keyboard (OTP, address form, coupon, ticket composer) |
| 7 | Bottom nav overlay | Last row of every scrollable tab screen reachable above the floating nav |
| 8 | Currency / locale | ₹ formatting, en-IN dates on Orders, Invoice, Wallet, Notifications |
| 9 | Security | Token cleared on logout; back button after logout does not reopen app screens |
| 10 | Analytics of totals | Cart = Checkout = Payment = Order Detail = Invoice totals for same order |

**Total test cases in this document: 289** (LAU 12, AUTH 26, LOC/ADR 20, HOME 17, SRCH 11, CAT 20, PDP 19, CART 17, CHK 23, ORD 19, TRK 18, RAT 9, REF 9, ACC/PRF/SET/LOG 22, WAL 12, NOT 14, SUP 10, LEG 4, WSH 7).
