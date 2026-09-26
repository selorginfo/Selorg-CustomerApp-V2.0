# Selorg Customer App — UI Review

**Date:** 2026-08-22
**Screens reviewed:** Onboarding (slide 1, captured twice), Login ("Welcome back")
**Source:** `selorg-customer-app/src/screens/onboarding/Onboarding.tsx`, `selorg-customer-app/src/screens/auth/EnterMobile.tsx`

---

## Summary

Of the 3 screenshots, 2 are identical captures of the onboarding slide-1 screen, and 1 is the login screen. **One real bug found and confirmed against source**: the onboarding carousel image never renders, leaving a large blank white area. The login screen is in good shape with only minor polish notes.

---

## 1. Bug — Onboarding carousel image not rendering

**Screens:** Screenshot 1 & 2 (identical)
**Severity:** High — this is the very first screen a new user sees; it currently looks broken/unfinished.

**What's visible:** Below the "Good Food / Free Ride Home." title, subtitle, and progress dots, there is a large empty white space stretching almost to the "Next" button. The rounded-corner image card that should show the grocery/food photo (`onboard-1.png`) never appears.

**Confirmed this is a real bug, not a screenshot artifact:** the exact same image asset (`images.onboard1`) renders correctly elsewhere — in the small circular avatar on the Login screen (`EnterMobile.tsx`). So the PNG file itself is fine; the problem is isolated to how the `Onboarding.tsx` carousel lays it out.

**Root cause (in `Onboarding.tsx`):**

```tsx
<ScrollView ... style={styles.carousel}>
  {SLIDES.map((s, i) => (
    <View key={i} style={[styles.slideImageWrap, { width: CAROUSEL_WIDTH }]}>
      <Image source={s.img} style={styles.slideImage} resizeMode="cover" />
    </View>
  ))}
</ScrollView>
```
```js
carousel: { flex: 1, ... },
slideImageWrap: { flex: 1 },
slideImage: { width: '100%', height: '100%' },
```

The `ScrollView` itself gets a real height from `flex: 1` in the outer column layout — that part is fine. But **inside** a horizontal `ScrollView`, the content container's cross-axis size (height) is not driven by the scroll view's own height; it shrink-wraps to its children. Each slide's `flex: 1` only affects the main axis (width, since the content row is horizontal) — it does nothing for height. `slideImage`'s `height: '100%'` then resolves against a parent whose height was never actually set, so it collapses to 0. Net effect: the row of slides has no height, and nothing paints.

**Fix — give the image an explicit height instead of a percentage chain**, e.g.:

```js
carousel: {
  height: 320,          // explicit height instead of flex: 1
  marginTop: spacing.md + 2,
  marginHorizontal: spacing.md + 4,
  borderRadius: radii.xxl + 8,
  overflow: 'hidden',
},
slideImageWrap: { width: CAROUSEL_WIDTH, height: '100%' },
```

or alternatively set `contentContainerStyle={{ flexGrow: 1 }}` on the `ScrollView` **and** give `slideImageWrap` an explicit numeric height — either works, but an explicit `height` on `carousel` is the simplest, most predictable fix and avoids the shrink-wrap ambiguity entirely.

**Secondary note:** because screenshots 1 and 2 are pixel-identical, if these were captured after tapping "Next" / a dot, that would additionally suggest the slide isn't advancing — but this is unconfirmed since both could simply be duplicate captures of the same tap. Worth a quick manual check that swiping/tapping "Next" actually moves to slide 2 (`Right Here / All In One Place`) once the image bug above is fixed, since the blank carousel may have been masking whether paging works visually.

---

## 2. Login screen ("Welcome back") — minor notes

**Screen:** Screenshot 3
**Severity:** Low — mostly polish, nothing broken.

- Layout, spacing, and the hero image render correctly (confirms the asset pipeline itself is healthy).
- The **"Log In" primary button is greyed out** — this is expected/correct behavior (`disabled={!valid || loading}` in `EnterMobile.tsx`, since no 10-digit number has been entered yet), not a bug.
- No functional issues spotted in this screen from the static screenshot. Recommend a quick manual pass entering a valid number to confirm the button transitions to the active (dark green) state and OTP navigation fires correctly.

---

## Action items

| # | Item | File | Priority | Status |
|---|------|------|----------|--------|
| 1 | Fix carousel image collapsing to 0 height | `src/screens/onboarding/Onboarding.tsx` | High | **Fixed** |
| 2 | Manually verify slide paging (Next / swipe / dots) after fix #1 | `src/screens/onboarding/Onboarding.tsx` | Medium | Open |
| 3 | Manually verify Log In button enables + OTP nav on valid number | `src/screens/auth/EnterMobile.tsx` | Low | Open |
| 4 | Center OTP screen content vertically (`justifyContent: 'center'`) | `src/screens/auth/otp.tsx` | High | **Fixed** |
| 5 | Confirm floating menu bubble is a simulator/dev overlay, not app UI, on a real device | — | Low | Open |
| 6 | Remove duplicate "Add new address" button, keep header "+ Add" only | `src/screens/profile/addresses.tsx` | Medium | **Fixed** |
| 7 | Replace static map placeholder with real location search/picker | `src/screens/profile/AddAddress.tsx` | High | Open (requested) |
| 8 | Add recipient "Name" and "Phone number" fields to the address form | `src/screens/profile/AddAddress.tsx` | High | Open (requested) |
| 9 | Replace Home search bar with a header search icon → Search screen | `src/screens/home/index.tsx` | Medium | **Fixed** |
| 10 | Even out uneven vertical rhythm caused by variable-height category labels | `src/screens/home/index.tsx` | Low | **Fixed** |
| 11 | Remove "Popular Searches" section from Search screen | `src/screens/home/Search.tsx` | Medium | **Fixed** |
| 12 | Move back button and cancel (X) button inside the search input pill | `src/screens/home/Search.tsx`, `src/components/SearchBar.tsx` | Medium | **Fixed** |
| 13 | Restrict mobile login to valid Indian phone number format, not just any 10 digits | `src/screens/auth/EnterMobile.tsx` | High | Open (requested) |
| 14 | Product card image full-width (edge-to-edge, no inset) | `src/components/ProductCard.tsx` | Medium | Open (requested) |
| 15 | Reduce ADD button height on product card | `src/components/QuantityStepper.tsx` | Low | Open (requested) |
| 16 | Give ADD button a 3D style (raised/shadow, not flat outline) | `src/components/QuantityStepper.tsx` | Low | Open (requested) |

---

## 3. Bug — OTP screen content not vertically centered

**Screen:** OTP verification ("Enter OTP")
**Severity:** High — large dead space between the resend row and the footer, same class of issue as finding #1.

**Root cause (`otp.tsx`):**
```js
body: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.md + 10, paddingTop: spacing.xs },
```
`alignItems: 'center'` only centers horizontally; without `justifyContent: 'center'`, the icon/title/OTP boxes/resend row stack at the top of the `flex: 1` body instead of sitting mid-screen.

**Fix applied:**
```js
body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md + 10 },
```

**Note:** A floating circular hamburger/menu bubble was also visible on the left edge in one capture. Checked `otp.tsx` and every component it renders (`BackButton`, `OtpBoxInput`, `Icon`, `PrimaryButton`) — no such element exists in the source. This is almost certainly a simulator/OS debug overlay, not app UI; confirm it doesn't appear on a real device rather than changing code.

---

## 4. Bug — Duplicate "add address" buttons on the Select Address screen

**Screen:** Select address (`addresses.tsx`)
**Severity:** Medium — redundant UI, two different-looking buttons doing the exact same thing on one screen.

**What's visible:** A `+ Add` pill in the header (top-right) and a full-width `+ Add new address` button below the address list — both navigate to the same `AddAddress` screen. Only one entry point is needed.

**Fix applied:** Removed the bottom `+ Add new address` `PrimaryButton` block (and the now-unused `PrimaryButton` import and `addNewWrap` style) from `addresses.tsx`. The screen now has a single "add" action: the header `+ Add` pill. The empty-state CTA ("Add address", shown only when there are zero saved addresses) was left untouched since it's not a duplicate — it only appears when the list itself is empty.

---

## 5. Requested change — Add address screen needs real location search + recipient details

**Screen:** Add address (`AddAddress.tsx`)
**Severity:** High — form is currently missing functionality expected on a delivery address form.
**Status:** Documented only — no code changed per instruction; listed here as a pending requirement.

**What's currently there, confirmed in code:**

1. **Map is a literal placeholder, not a real picker.** Lines 73–76:
   ```tsx
   <View style={styles.mapPlaceholder}>
     <Icon name="pin" size={18} color={colors.primaryDark} />
     <Text style={styles.mapPlaceholderLabel}>Map pin (placeholder)</Text>
   </View>
   ```
   There is no location search box, no map view, and no way to drop/drag a pin — `latitude`/`longitude` are only ever set to `existing?.latitude ?? 0` / `existing?.longitude ?? 0` (line 63–64), so every new address effectively saves `0, 0` as its coordinates unless edited later some other way. This also lines up with the previously-reported delivery-fee/ETA bug (saved addresses without real lat/lng defaulting to the wrong pricing slab).

2. **No recipient Name or Phone number fields.** The form only collects `label`, `line1`, `line2`, `city`, `state`, `pincode` (lines 47–52), and `saveAddress()` (line 54–67) only sends those same fields. There's nowhere to capture who the address belongs to or a contact number for the delivery rider.

**Requested change:**
- Replace the map placeholder with a real location search + pin-drop/drag map (e.g. Google Places Autocomplete for search, a draggable map pin to confirm the exact point), writing real `latitude`/`longitude` into `saveAddress()`.
- Add two new fields to the form — **Name** (recipient) and **Phone number** (contact for delivery) — persisted alongside the rest of the address in `saveAddress()`, and surfaced on the address cards in `addresses.tsx` if useful for the courier.

**Note:** implementing real map search requires a maps/places provider (Google Maps Places API or similar) and its API key/config — flagging this as a dependency the team should confirm before implementation starts.

---

## 6. Requested change — Home screen: search bar replaced with header search icon

**Screen:** Home (`src/screens/home/index.tsx`)
**Severity:** Medium — layout/navigation simplification, requested by user.
**Status:** Applied.

**Before:** A full-width `SearchBar` sat below the header row (location + bell + profile), taking up its own row and pushing the promo banner further down.

**Change applied:**
- Removed the `SearchBar` block and its `searchWrap` wrapper entirely.
- Added a new search icon button (`Icon name="search"`) into the top-right header action row, placed before the notification bell, using the same `iconBtn` style as the bell/profile buttons for visual consistency.
- The new icon button reuses the exact same handler the old search bar already had: `onPress={() => navigation.navigate('Search')}` — no new navigation logic needed since the `Search` screen and route were already wired up.
- Removed the now-unused `SearchBar` import and `searchWrap` style.

Header row now reads: location selector (left) → **search icon**, bell, profile (right).

---

## 7. Home page — uneven spacing around "Shop by category"

**Screen:** Home (`src/screens/home/index.tsx`)
**Severity:** Low — visual polish.
**Status:** Applied.

**What's visible:** The vertical rhythm on the home page felt uneven, most noticeably around the category icon row — the gap before "Best deals today" looked inconsistent with the gap before "Shop by category".

**Root cause, confirmed in code:** every section on the page uses the same `section: { marginTop: 22 }` for spacing, so the section-to-section rhythm is actually consistent in code. The real cause is `catLabel` (the text under each category circle, e.g. "Fresh Fruits", "Fresh Vegetables"):
```js
catLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: colors.text, textAlign: 'center', lineHeight: 13 },
```
It has `numberOfLines={2}` at the call site but no fixed height, so a short one-line label ("Fresh Fruits") sits in a shorter box than a two-line label ("Fresh Vegetables", "Dairy, Bread & Eggs", "Atta, Rice & Dal"). That makes the bottom edge of the category row jagged instead of flat, which is what reads as "uneven spacing" before the next section.

**Fix applied:**
```js
catLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: colors.text, textAlign: 'center', lineHeight: 13, height: 26 },
```
`height: 26` reserves a fixed two-line height (`13 × 2`) for every label regardless of whether it wraps to one or two lines, so all category items are the same height and the row bottom is flat — giving the page an even, consistent rhythm.

---

## 8. Search screen — remove "Popular Searches", merge back/cancel into the search pill

**Screen:** Search (`src/screens/home/Search.tsx`)
**Severity:** Medium — layout simplification, requested by user.
**Status:** Applied.

**Change 1 — removed "Popular Searches":** Deleted the `POPULAR_SEARCHES` constant and the entire fallback block (`popularWrap` / `POPULAR SEARCHES` label / chip list) that rendered when the query was empty. Also removed its now-unused styles (`popularWrap`, `popularLabel`, `popularChips`, `popularChip`, `popularChipLabel`) and the `radii` import that only that block needed. The screen now shows nothing extra until the user starts typing (suggestions) or submits (results) — matching what was asked.

**Change 2 — back/cancel now live inside the search input box:** Previously the header was three separate elements in a row — a standalone back-chevron `Pressable`, the `SearchBar`, and (conditionally) a standalone `X` `Pressable` — so the back and cancel icons sat outside the white rounded pill.

To fix this properly rather than just visually faking it, extended `SearchBar` (`src/components/SearchBar.tsx`) with two new optional slot props, `left` and `right`, rendered directly inside its existing rounded `wrap` container (before the search glass icon / after the text input, respectively) — so any future screen can reuse the same pattern instead of everyone reinventing it.

`Search.tsx`'s header now renders a single `SearchBar`, passing the back button as `left` and the clear button as `right`:
```tsx
<SearchBar
  editable
  autoFocus
  placeholder="Search for products"
  value={query}
  onChangeText={onChangeText}
  onSubmit={() => runSearch(query)}
  left={<Pressable onPress={() => navigation.goBack()} hitSlop={8}><Icon name="chevronLeft" .../></Pressable>}
  right={query ? <Pressable onPress={clear} hitSlop={8}><Icon name="x" .../></Pressable> : undefined}
/>
```
The now-unused `backBtn`, `searchWrap`, and `clearBtn` styles were removed from `Search.tsx`. Both icons now sit inside the same white pill as the search icon and text input, instead of floating outside it.

---

## 9. Requested change — Login should only accept a valid Indian mobile number format

**Screen:** Login / Sign up — mobile entry (`EnterMobile.tsx`)
**Severity:** High — currently invalid numbers can pass validation and reach the OTP-send call.
**Status:** Documented only — no code changed per instruction; listed here as a pending requirement.

**What's currently there, confirmed in code (line 42):**
```ts
const valid =
  method === 'email' ? EMAIL_RE.test(email.trim()) : phone.trim().length === 10;
```
The country code `+91` is shown as a fixed, non-editable prefix (line 142: `<Text style={styles.prefix}>+91</Text>`), so the app is already India-only in intent. But the actual validation only checks **digit count (10)** — it does not check that the number is a plausible Indian mobile number. A value like the one in the screenshot, `2345678765`, passes `valid` and would be sent to `sendOtp()` even though real Indian mobile numbers always start with `6`, `7`, `8`, or `9`.

**Requested change:**
- Tighten the `valid` check (and ideally the `onChangeText` input mask) to require the standard Indian mobile pattern: 10 digits, first digit `6`–`9`, e.g. `/^[6-9]\d{9}$/`.
- Reject/mask input starting with `0`–`5` at entry time (or at minimum on submit), and surface an inline error message rather than silently keeping the "Log In" button disabled with no explanation.
- Since `+91` is already hardcoded and not user-editable, this is purely a validation tightening — no change to the country-code UI is needed.

---

## 10. Requested change — Product card: full-width image, shorter ADD button, 3D button style

**Screen:** Product grid card (`ProductCard.tsx`, button styling in `QuantityStepper.tsx`)
**Severity:** Medium — visual/layout polish, requested by user.
**Status:** Documented only — no code changed per instruction; listed here as a pending requirement.

**What's currently there, confirmed in code:**

1. **Image is inset, not full width.** The card (`styles.card`, line 82–90) has `padding: 10` on all sides, and the image sits inside that padding in its own rounded box (`imageWrap`, line 91–96: `height: 118`, `borderRadius: radii.xl - 1`). So the product photo (bananas/mangoes in the screenshot) has a visible white margin on all 4 sides and its own corner radius separate from the card's — it never touches the card edges.

2. **ADD button padding is tall.** In `QuantityStepper.tsx`, the empty-state "ADD" button (`styles.addBtn`, line 73–80) uses `paddingVertical: 8` (compact variant, used here since `ProductCard` defaults `addVariant = 'compact'`), giving it a noticeably tall pill relative to the price text next to it in the screenshot.

3. **ADD button is a flat outline, not "3D".** Same `addBtn` style: `borderWidth: 1.5`, transparent/white background, no `shadowColor`/`shadowOpacity`/`shadowRadius`/`elevation` — it reads as a flat 2D outlined pill, not a raised/tactile button.

**Requested change:**
- **Full-width image:** remove the card's side/top padding around the image specifically — e.g. move `padding: 10` off `card` and onto an inner content wrapper that excludes the image, and drop `imageWrap`'s own `borderRadius` on the sides that meet the card edge (or match it to the card's outer radius) so the image spans edge-to-edge at the top of the card.
- **Shorter ADD button:** reduce `addBtn.paddingVertical` (e.g. `8` → `5`–`6`) so the button height sits closer to the price/unit text block height instead of towering over it.
- **3D button style:** add a raised look to `addBtn` — e.g. `shadowColor`, `shadowOpacity`, `shadowRadius`, `shadowOffset` (iOS) plus `elevation` (Android), optionally a solid fill (`colors.white`/`colors.primary`) with a subtle bottom-edge highlight/shadow instead of the current flat bordered-outline look, consistent with the raised style already used elsewhere in the app (e.g. `pillToggle` in `EnterMobile.tsx` or `heroCircle`'s shadow).

---
