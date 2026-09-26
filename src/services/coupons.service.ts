import SelorgApi from '../api';

export interface ApiCoupon {
  _id: string;
  code: string;
  name?: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number | null;
  isActive?: boolean;
}

export interface CouponValidationResult {
  valid: boolean;
  coupon_code?: string;
  discount_amount?: number;
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
  list: (): Promise<ApiCoupon[]> =>
    SelorgApi.get('/coupons').then(unwrap<ApiCoupon[]>),

  validate: (input: ValidateCouponInput): Promise<CouponValidationResult> =>
    SelorgApi.post('/coupons/validate', { data: input }).then(unwrap<CouponValidationResult>),

  redeem: (input: ValidateCouponInput & { order_id: string }): Promise<CouponValidationResult> =>
    SelorgApi.post('/coupons/redeem', { data: input }).then(unwrap<CouponValidationResult>),
};
