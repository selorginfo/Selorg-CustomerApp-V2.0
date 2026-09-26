import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { refundsApi, mapRefundReasonCode } from '../services/refunds.service';
import type { ApiRefund } from '../services/refunds.service';
import { Storage } from '../api/storage';
import { showToast } from '../utils/toast';
import type { Order } from './OrdersContext';

export interface Refund {
  id: string;
  orderNumber: string;
  amount: number;
  status: 'pending' | 'processed' | 'rejected';
  method: string;
  reasonText: string;
  ts: string;
}

interface RefundsContextType {
  refunds: Refund[];
  loading: boolean;
  submitReturn: (order: Order, reasonText: string, reasonLabel?: string, amount?: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const RefundsContext = createContext<RefundsContextType | undefined>(undefined);

function toRefund(raw: ApiRefund): Refund {
  const statusMap: Record<string, Refund['status']> = {
    pending: 'pending',
    approved: 'pending',
    processed: 'processed',
    rejected: 'rejected',
  };
  return {
    id: raw._id,
    orderNumber: raw.orderNumber || raw.orderId || raw._id,
    amount: raw.amount,
    status: statusMap[raw.status] || 'pending',
    method: raw.method || 'original_payment',
    reasonText: raw.reasonText || raw.reason || '',
    ts: raw.createdAt,
  };
}

export const RefundsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(false);

  const loadRefunds = useCallback(async () => {
    if (!Storage.getItem('accessToken')) {
      setRefunds([]);
      return;
    }
    setLoading(true);
    try {
      const raw = await refundsApi.listRefunds({ limit: 50 });
      setRefunds((raw ?? []).map(toRefund));
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRefunds(); }, [loadRefunds]);

  const submitReturn = useCallback(
    async (order: Order, reasonText: string, reasonLabel?: string, amount?: number) => {
      try {
        const raw = await refundsApi.createRefundRequest({
          orderId: order.id,
          reasonCode: mapRefundReasonCode(reasonLabel || reasonText),
          reasonText,
          amount,
        });
        setRefunds(prev => [toRefund(raw), ...prev]);
        showToast('Return request submitted');
      } catch {
        showToast('Could not submit return request', 'err');
      }
    },
    [],
  );

  const value = useMemo<RefundsContextType>(() => ({
    refunds, loading, submitReturn, refresh: loadRefunds,
  }), [refunds, loading, submitReturn, loadRefunds]);

  return <RefundsContext.Provider value={value}>{children}</RefundsContext.Provider>;
};

export const useRefunds = () => {
  const ctx = useContext(RefundsContext);
  if (!ctx) throw new Error('useRefunds must be used within a RefundsProvider');
  return ctx;
};
