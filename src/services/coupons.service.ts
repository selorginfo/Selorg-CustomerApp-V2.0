import SelorgApi from '../api';
import { couponsFromResponse, type ApiCoupon } from './coupons.contract';

export type { ApiCoupon } from './coupons.contract';

export interface CouponValidationResult {
  valid: boolean;
  coupon_code?: string;
  discount_amount?: number;
  coupon_type?: string;
  is_cashback?: boolean;
  error_code?: string;
  message?: string;
  error?: string;
}

export interface ValidateCouponInput {
  coupon_code: string;
  cart_value?: number;
  cart_items?: Array<Record<string, unknown>>;
  payment_method?: string;
  zone?: string;
  delivery_fee?: number;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

export const couponsApi = {
  list: (cartValue?: number): Promise<ApiCoupon[]> =>
    SelorgApi.get('/coupons', {
      query: cartValue != null ? { cart_value: cartValue } : undefined,
    }).then(couponsFromResponse),

  validate: (input: ValidateCouponInput): Promise<CouponValidationResult> =>
    SelorgApi.post('/coupons/validate', { data: input }).then(unwrap<CouponValidationResult>),
};
