import SelorgApi from '../api';
import { refundsFromResponse, type ApiRefund } from './refunds.contract';

export type { ApiRefund } from './refunds.contract';

export type RefundReasonCode =
  | 'item_damaged'
  | 'expired'
  | 'late_delivery'
  | 'wrong_item'
  | 'customer_cancelled'
  | 'other';

export interface CreateRefundInput {
  orderId: string;
  reasonCode: RefundReasonCode;
  reasonText: string;
  amount?: number;
  currency?: string;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

/** Map UI reason labels to backend reasonCode values. */
export function mapRefundReasonCode(reason: string): RefundReasonCode {
  const normalized = reason.toLowerCase();
  if (normalized.includes('damage')) return 'item_damaged';
  if (normalized.includes('expir')) return 'expired';
  if (normalized.includes('late')) return 'late_delivery';
  if (normalized.includes('wrong')) return 'wrong_item';
  if (normalized.includes('cancel')) return 'customer_cancelled';
  return 'other';
}

export const refundsApi = {
  listRefunds: (params?: { page?: number; limit?: number }): Promise<ApiRefund[]> =>
    SelorgApi.get('/refunds', { query: params }).then((res) => refundsFromResponse<ApiRefund>(res)),

  getRefundById: (id: string): Promise<ApiRefund> =>
    SelorgApi.get(`/refunds/${id}`).then(unwrap<ApiRefund>),

  getRefundDetails: (id: string): Promise<ApiRefund> =>
    SelorgApi.get(`/refunds/${id}/details`).then(unwrap<ApiRefund>),

  createRefundRequest: (data: CreateRefundInput): Promise<ApiRefund> =>
    SelorgApi.post('/refunds/request', { data }).then(unwrap<ApiRefund>),
};
