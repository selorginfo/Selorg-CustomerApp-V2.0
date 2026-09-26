import SelorgApi from '../api';

export type RefundReasonCode =
  | 'item_damaged'
  | 'expired'
  | 'late_delivery'
  | 'wrong_item'
  | 'customer_cancelled'
  | 'other';

export interface ApiRefund {
  _id: string;
  orderId?: string;
  orderNumber?: string;
  amount: number;
  status: 'pending' | 'approved' | 'processed' | 'rejected';
  reason?: string;
  reasonText?: string;
  method?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateRefundInput {
  orderId: string;
  reasonCode: RefundReasonCode;
  reasonText: string;
  amount?: number;
  currency?: string;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

const listFrom = <T,>(res: unknown): T[] => {
  const data = unwrap<{ list?: T[] } | T[]>(res);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as { list?: T[] }).list)) {
    return (data as { list: T[] }).list;
  }
  return [];
};

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
    SelorgApi.get('/refunds', { query: params }).then(listFrom<ApiRefund>),

  getRefundById: (id: string): Promise<ApiRefund> =>
    SelorgApi.get(`/refunds/${id}`).then(unwrap<ApiRefund>),

  getRefundDetails: (id: string): Promise<ApiRefund> =>
    SelorgApi.get(`/refunds/${id}/details`).then(unwrap<ApiRefund>),

  createRefundRequest: (data: CreateRefundInput): Promise<ApiRefund> =>
    SelorgApi.post('/refunds/request', { data }).then(unwrap<ApiRefund>),
};
