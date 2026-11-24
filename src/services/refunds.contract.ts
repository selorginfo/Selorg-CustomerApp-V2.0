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
  destination?: string;
  transactionId?: string;
  needsBankAccount?: boolean;
  bankAccountLast4?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefundView {
  id: string;
  orderNumber: string;
  amount: number;
  status: 'pending' | 'processing' | 'processed' | 'rejected';
  method: string;
  destination: string;
  transactionId: string;
  needsBankAccount: boolean;
  bankAccountLast4: string;
  reasonText: string;
  ts: string;
}

const STATUS_MAP: Record<string, RefundView['status']> = {
  pending: 'pending',
  approved: 'processing',
  processing: 'processing',
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
    destination: raw.destination || (raw.method === 'wallet' ? 'Selorg Wallet' : raw.method === 'bank_transfer' ? 'Bank account' : 'Original payment method'),
    transactionId: raw.transactionId || '',
    needsBankAccount: Boolean(raw.needsBankAccount),
    bankAccountLast4: raw.bankAccountLast4 || '',
    reasonText: raw.reasonText || raw.reason || '',
    ts: raw.date || raw.createdAt || '',
  };
}
