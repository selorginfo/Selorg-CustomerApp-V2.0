import SelorgApi from '../api';
import { apiPlatform } from '../utils/platform';

export interface WalletBalance {
  balance: number;
  pendingCredits?: number;
  currency?: string;
  isActive?: boolean;
}

export interface WalletTransaction {
  _id: string;
  type: 'credit' | 'debit';
  amount: number;
  description?: string;
  note?: string;
  createdAt: string;
}

export interface TopUpSession {
  paymentId?: string;
  purpose?: string;
  orderId?: string;
  txnId?: string;
  attemptNo?: number;
  amount?: number;
  sessionPayload?: Record<string, unknown>;
  redirectUrl?: string;
  [key: string]: unknown;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

const listFrom = <T,>(res: unknown): T[] => {
  const data = unwrap<{ list?: T[]; transactions?: T[] } | T[]>(res);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray((data as { list?: T[] }).list)) return (data as { list: T[] }).list;
    if (Array.isArray((data as { transactions?: T[] }).transactions)) {
      return (data as { transactions: T[] }).transactions;
    }
  }
  return [];
};

export const walletApi = {
  getBalance: (): Promise<WalletBalance> =>
    SelorgApi.get('/wallet/balance').then(unwrap<WalletBalance>),

  getTransactions: (params?: { limit?: number; page?: number }): Promise<WalletTransaction[]> =>
    SelorgApi.get('/wallet/transactions', { query: params }).then(listFrom<WalletTransaction>),

  initiateTopUp: (amount: number, platform?: 'android' | 'ios' | 'web'): Promise<TopUpSession> =>
    SelorgApi.post('/wallet/top-up/session', {
      data: { amount, platform: platform ?? apiPlatform() },
    }).then(unwrap<TopUpSession>),

  debitForCheckout: (amount: number, orderId?: string): Promise<void> =>
    SelorgApi.post('/wallet/debit', { data: { amount, orderId } }).then(() => undefined),
};
