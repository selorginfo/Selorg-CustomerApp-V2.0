export interface ApiRefund {
  id?: string;
  _id?: string;
  orderId?: string;
  orderNumber?: string;
  amount: number;
  status: string;
  statusText?: string;
  reason?: string;
  reasonText?: string;
  method?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefundView {
  id: string;
  orderNumber: string;
  amount: number;
  status: 'pending' | 'processed' | 'rejected';
  method: string;
  reasonText: string;
  ts: string;
}

const STATUS_MAP: Record<string, RefundView['status']> = {
  pending: 'pending',
  approved: 'pending',
  processed: 'processed',
  completed: 'processed',
  rejected: 'rejected',
  escalated: 'pending',
};

export function refundsFromResponse<T>(res: unknown): T[] {
  const data = res && typeof res === 'object' && 'data' in res ? (res as { data: unknown }).data : res;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as { list?: unknown; refunds?: unknown };
    if (Array.isArray(record.refunds)) return record.refunds as T[];
    if (Array.isArray(record.list)) return record.list as T[];
  }
  return [];
}

export function toRefund(raw: ApiRefund): RefundView {
  const id = String(raw.id || raw._id || '');
  const status = STATUS_MAP[String(raw.status || '').toLowerCase()] || 'pending';
  return {
    id,
    orderNumber: raw.orderNumber || raw.orderId || id,
    amount: raw.amount,
    status,
    method: raw.method || 'original_payment',
    reasonText: raw.reasonText || raw.reason || '',
    ts: raw.date || raw.createdAt || '',
  };
}
