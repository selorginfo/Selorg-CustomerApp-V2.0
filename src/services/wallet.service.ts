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

/**
 * Balance lives on `data.balance` after login. Also accept a double envelope
 * and a nested wallet object. Missing or non-numeric values stay null so a
 * parse miss is not treated as ₹0 (which blocks wallet pay).
 */
export function readWalletBalance(payload: unknown): number | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): number | null => {
    if (!node || typeof node !== 'object' || depth > 4 || seen.has(node)) return null;
    seen.add(node);
    const rec = node as Record<string, unknown>;
    for (const key of ['balance', 'availableBalance', 'walletBalance']) {
      const n = typeof rec[key] === 'number' ? rec[key] : Number(rec[key]);
      if (typeof rec[key] === 'number' || (typeof rec[key] === 'string' && rec[key] !== '')) {
        if (Number.isFinite(n)) return Math.round(n * 100) / 100;
      }
    }
    if ('wallet' in rec) {
      const nested = walk(rec.wallet, depth + 1);
      if (nested != null) return nested;
    }
    if ('data' in rec) {
      const nested = walk(rec.data, depth + 1);
      if (nested != null) return nested;
    }
    return null;
  };
  return walk(payload, 0);
}

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
    SelorgApi.get('/wallet/balance').then(res => {
      const balance = readWalletBalance(res);
      if (balance == null) {
        throw new Error('Could not read wallet balance');
      }
      const body = unwrap<Partial<WalletBalance>>(res);
      return {
        ...(body && typeof body === 'object' ? body : {}),
        balance,
      };
    }),

  getTransactions: (params?: { limit?: number; page?: number }): Promise<WalletTransaction[]> =>
    SelorgApi.get('/wallet/transactions', { query: params }).then(listFrom<WalletTransaction>),

  /** `paymentMode` scopes the hosted checkout: upi | cards | wallets | netbanking (default all). */
  initiateTopUp: (
    amount: number,
    platform?: 'android' | 'ios' | 'web',
    paymentMode?: 'upi' | 'cards' | 'wallets' | 'netbanking',
  ): Promise<TopUpSession> =>
    SelorgApi.post('/wallet/top-up/session', {
      data: { amount, platform: platform ?? apiPlatform(), ...(paymentMode ? { paymentMode } : {}) },
    }).then(unwrap<TopUpSession>),
};
