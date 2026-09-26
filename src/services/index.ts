/**
 * API service layer barrel.
 */
export { default as SelorgApi, setUnauthorizedHandler } from '../api';
export { Storage } from '../api/storage';
export { default as apiConfigs } from '../api/configs';
export {
  normalizeApiError,
  getErrorMessage,
  getErrorCode,
  STATUS_TITLES,
  STATUS_FALLBACK_MESSAGES,
} from '../utils/apiError';
export type { ApiError } from '../utils/apiError';

export { authApi } from './auth.service';
export { catalogApi } from './catalog.service';
export type { ApiProduct, ApiProductDetail, ApiCategory, SearchResult, HomePayload } from './catalog.service';
export { ordersApi } from './orders.service';
export type {
  CreateOrderPayload,
  ApiOrder,
  OrderTracking,
  OrderInvoice,
  PaymentMethodType,
} from './orders.service';
export { paymentsApi } from './payments.service';
export type { PaymentMethod, TopUpSession, WorldlineSession, WorldlineStatus } from './payments.service';
export { couponsApi } from './coupons.service';
export type { ApiCoupon, CouponValidationResult } from './coupons.service';
export { cartApi } from './cart.service';
export type { ApiCart, ApiCartLine, CartMergeItem } from './cart.service';
export { supportApi } from './support.service';
export type { SupportTicket, SupportMessage } from './support.service';
export { legalApi } from './legal.service';
export type { LegalDocument } from './legal.service';
export { deliveryApi } from './delivery.service';
export type { DeliveryEstimate } from './delivery.service';
export { bootstrapApi } from './bootstrap.service';
export { locationsApi } from './locations-api.service';
export type { LocationSuggestion } from './locations-api.service';
export { storeApi } from './store.service';
export type { StoreAssignment } from './store.service';
export { appConfigApi } from './app-config.service';
export { pushApi } from './push.service';
export { addressApi } from './address.service';
export type { ApiAddress, CreateAddressInput } from './address.service';
export { walletApi } from './wallet.service';
export type { WalletBalance, WalletTransaction } from './wallet.service';
export { notificationsApi } from './notifications.service';
export type { ApiNotification, NotificationPreferences } from './notifications.service';
export { refundsApi, mapRefundReasonCode } from './refunds.service';
export type { ApiRefund, CreateRefundInput, RefundReasonCode } from './refunds.service';
export {
  requestLocationPermission,
  getCurrentPosition,
  reverseGeocode,
  resolveCurrentPlace,
} from './location.service';
export type { Coordinates, ResolvedPlace } from './location.service';
