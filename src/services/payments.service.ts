import SelorgApi from '../api';
import { apiPlatform } from '../utils/platform';

/**
 * Payments: Worldline/Paynimo hosted checkout — NOT Razorpay.
 */

export interface TopUpSession {
  redirectUrl?: string;
  sessionId?: string;
  txnId?: string;
  [key: string]: unknown;
}

export interface PaymentMethod {
  _id: string;
  type: string;
  label?: string;
  last4?: string;
  isDefault?: boolean;
}

export interface WorldlineSessionPayload {
  features?: Record<string, unknown>;
  consumerData?: Record<string, unknown>;
}

export interface WorldlineSession {
  paymentId?: string;
  orderId?: string;
  txnId?: string;
  attemptNo?: number;
  purpose?: string;
  sessionPayload?: WorldlineSessionPayload;
  redirectUrl?: string;
  [key: string]: unknown;
}

export interface WorldlineStatus {
  status?: string;
  orderId?: string;
  paymentStatus?: string;
  orderPaymentStatus?: string;
  uiState?: string;
  purpose?: string;
  walletCredited?: boolean;
  recommendedAction?: string;
  [key: string]: unknown;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

export const paymentsApi = {
  listPaymentMethods: (): Promise<PaymentMethod[]> =>
    SelorgApi.get('/payments/methods').then(unwrap<PaymentMethod[]>),

  addPaymentMethod: (data: { type: string; token?: string; [key: string]: unknown }): Promise<PaymentMethod> =>
    SelorgApi.post('/payments/methods', { data }).then(unwrap<PaymentMethod>),

  deletePaymentMethod: (id: string): Promise<void> =>
    SelorgApi.delete(`/payments/methods/${id}`).then(() => undefined),

  setDefaultPaymentMethod: (id: string): Promise<void> =>
    SelorgApi.post(`/payments/methods/${id}/default`).then(() => undefined),

  createWorldlineSession: (payload: {
    orderId: string;
    platform?: 'android' | 'ios' | 'web';
    consumerEmailId?: string;
    consumerMobileNo?: string;
    paymentMode?: string;
    checkoutOrigin?: string;
  }): Promise<WorldlineSession> =>
    SelorgApi.post('/payments/worldline/session', {
      data: { ...payload, platform: payload.platform ?? apiPlatform() },
    }).then(unwrap<WorldlineSession>),

  completeWorldlinePayment: (payload: {
    orderId?: string;
    txnId?: string;
    response: Record<string, unknown>;
    debug?: unknown;
  }): Promise<{ success: boolean; orderId?: string }> =>
    SelorgApi.post('/payments/worldline/complete', { data: payload }).then(
      unwrap<{ success: boolean; orderId?: string }>,
    ),

  abortWorldlinePayment: (payload: { orderId: string; txnId: string; reason?: string }): Promise<void> =>
    SelorgApi.post('/payments/worldline/abort', { data: payload }).then(() => undefined),

  getWorldlineStatus: (orderId: string): Promise<WorldlineStatus> =>
    SelorgApi.get('/payments/worldline/status', { query: { orderId } }).then(unwrap<WorldlineStatus>),
};
