# Customer App API Integration

Base URL (development): `http://localhost:3333/api/v1/customer`  
Backend: `selorg-service`  
Client: `src/api/index.ts` (`SelorgApi`)

## Auth

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| Send OTP | POST | `/auth/send-otp` | Public | `auth.service.ts` |
| Verify OTP | POST | `/auth/verify-otp` | Public | `auth.service.ts` |
| Resend OTP | POST | `/auth/resend-otp` | Public | `auth.service.ts` |
| Logout | POST | `/auth/logout` | Optional | `auth.service.ts` |
| Profile | GET/PUT | `/user/profile` | Customer | `auth.service.ts` |

## Catalog

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| Home | GET | `/home` | Optional | `catalog.service.ts` |
| Collection products | GET | `/collections/:slug` | Public | `catalog.service.ts` |
| Categories | GET | `/categories` | Public | `catalog.service.ts` |
| Category products | GET | `/categories/:slug/products` | Public | `catalog.service.ts` |
| Search | GET | `/products/search` | Public | `catalog.service.ts` |
| Product detail | GET | `/products/:id` | Public | `catalog.service.ts` |

### Home response shape

`GET /home` returns `{ success, data }` with:

- `sectionDefinitions[]` — `{ key, label }` (product rails use keys like `collections_deal_in_lowest_price`)
- `sections` — keyed blocks (`section_categories`, `banner_main_hero`, etc.)
- Load product rails via `GET /collections/:slug` where slug = section key with `collections_` removed and `_` → `-`

Example: `collections_deal_in_lowest_price` → `GET /collections/deal-in-lowest-price`

## Cart

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| Get cart | GET | `/cart` | Customer | `cart.service.ts` |
| Add item | POST | `/cart/items` | Customer | `cart.service.ts` |
| Update qty | PUT | `/cart/items/:itemId` | Customer | `cart.service.ts` |
| Remove item | DELETE | `/cart/items/:itemId` | Customer | `cart.service.ts` |
| Clear | DELETE | `/cart/clear` | Customer | `cart.service.ts` |
| Merge guest cart | POST | `/cart/merge` | Customer | `cart.service.ts` |

## Coupons

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| List | GET | `/coupons` | Public | `coupons.service.ts` |
| Validate | POST | `/coupons/validate` | Public | `coupons.service.ts` |
| Redeem | POST | `/coupons/redeem` | Customer | `coupons.service.ts` |

## Orders & Payments

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| Create order | POST | `/orders` | Customer | `orders.service.ts` |
| List orders | GET | `/orders` | Customer | `orders.service.ts` |
| Order detail | GET | `/orders/:id` | Customer | `orders.service.ts` |
| Cancel | POST | `/orders/:id/cancel` | Customer | `orders.service.ts` |
| Tracking | GET | `/orders/:id/tracking` | Customer | `orders.service.ts` |
| Rate | POST | `/orders/:id/rate` | Customer | `orders.service.ts` |
| Reorder | POST | `/orders/:id/reorder` | Customer | `orders.service.ts` |
| Invoice | GET | `/orders/:id/invoice` | Customer | `orders.service.ts` |
| Worldline session | POST | `/payments/worldline/session` | Customer | `payments.service.ts` |
| Worldline complete | POST | `/payments/worldline/complete` | Customer | `payments.service.ts` |
| Worldline status | GET | `/payments/worldline/status?orderId=` | Customer | `payments.service.ts` |
| Worldline abort | POST | `/payments/worldline/abort` | Customer | `payments.service.ts` |

### Worldline / Paynimo session shape

Order checkout and wallet top-up return `{ orderId, txnId, sessionPayload }` (not `redirectUrl`).
The app loads Paynimo SDK in a WebView via `sessionPayload`, then calls `/payments/worldline/complete`
and polls `/payments/worldline/status` before crediting wallet or confirming order payment.

## Wallet

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| Balance | GET | `/wallet/balance` | Customer | `wallet.service.ts` |
| Transactions | GET | `/wallet/transactions` | Customer | `wallet.service.ts` |
| Top-up session | POST | `/wallet/top-up/session` | Customer | `wallet.service.ts` |

## Notifications

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| List | GET | `/notifications` | Customer | `notifications.service.ts` |
| Unread count | GET | `/notifications/unread-count` | Customer | `notifications.service.ts` |
| Mark read | PUT | `/notifications/:id/read` | Customer | `notifications.service.ts` |
| Preferences | GET/PUT | `/notifications/preferences` | Customer | `notifications.service.ts` |

Preferences use global `push` plus per-category `categories.{order|offers|promotional|wallet}.push`.
The Settings screen maps these to Push / Order updates / Offers & promos / Wallet toggles.

## Location & Store

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| Delivery estimate | GET | `/delivery/estimate` | Optional | `delivery.service.ts` |
| Store assign | POST | `/store/assign` | Optional | `store.service.ts` |
| Location suggestions | GET | `/locations/suggestions` | Optional | `locations-api.service.ts` |

## Legal & Config

| Feature | Method | Endpoint | Auth | Service |
|---------|--------|----------|------|---------|
| Terms | GET | `/legal/terms` | Public | `legal.service.ts` |
| Privacy | GET | `/legal/privacy` | Public | `legal.service.ts` |
| App config | GET | `/app-config` | Optional | `app-config.service.ts` |
| Bootstrap | GET | `/bootstrap` | Optional | `bootstrap.service.ts` |

## Not available on new backend

- Wishlist API (local-only in app)
- Product-level reviews (`POST /reviews` — use order rating only)
- Returns/exchanges API (use `/refunds/request`)
- Password login
- Live rider GPS map
- Razorpay (Worldline/Paynimo only)
