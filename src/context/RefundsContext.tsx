import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { refundsApi, mapRefundReasonCode } from '../services/refunds.service';
import type { ApiRefund } from '../services/refunds.service';
import { Storage } from '../api/storage';
import { showToast } from '../utils/toast';
import type { Order } from './OrdersContext';
import { useAuth } from './AuthContext';
import { getErrorMessage } from '../utils/apiError';
import { usePager } from '../utils/usePager';

const REFUNDS_PAGE = 50;

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
  /** Resolves true only when the server accepted the request. */
  submitReturn: (order: Order, reasonText: string, reasonLabel?: string, amount?: number) => Promise<boolean>;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
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
  const { user } = useAuth();
  const userId = user?.id || '';
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRefundsPage = useCallback(
    async (page: number) => ((await refundsApi.listRefunds({ page, limit: REFUNDS_PAGE })) ?? []).map(toRefund),
    [],
  );
  const pager = usePager(fetchRefundsPage, REFUNDS_PAGE, setRefunds);
  const { firstPageLoaded } = pager;

  const loadRefunds = useCallback(async () => {
    if (!Storage.getItem('accessToken')) {
      setRefunds([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchRefundsPage(1);
      setRefunds(list);
      firstPageLoaded(list.length);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, [fetchRefundsPage, firstPageLoaded]);

  // Reload per account so a previous user's refunds never linger.
  useEffect(() => {
    setRefunds([]);
    if (!userId) return;
    loadRefunds();
  }, [userId, loadRefunds]);

  const submitReturn = useCallback(
    async (order: Order, reasonText: string, reasonLabel?: string, amount?: number): Promise<boolean> => {
      // Returns are only for delivered orders (the server enforces this too).
      if (order.status !== 'delivered') {
        showToast('Returns can be requested only after the order is delivered', 'err');
        return false;
      }
      try {
        const raw = await refundsApi.createRefundRequest({
          orderId: order.id,
          reasonCode: mapRefundReasonCode(reasonLabel || reasonText),
          reasonText,
          amount,
        });
        setRefunds(prev => [toRefund(raw), ...prev]);
        showToast('Return request submitted');
        return true;
      } catch (err) {
        showToast(getErrorMessage(err, 'Could not submit return request'), 'err');
        return false;
      }
    },
    [],
  );

  const value = useMemo<RefundsContextType>(() => ({
    refunds, loading, submitReturn, refresh: loadRefunds,
    hasMore: pager.hasMore, loadingMore: pager.loadingMore, loadMore: pager.loadMore,
  }), [refunds, loading, submitReturn, loadRefunds, pager.hasMore, pager.loadingMore, pager.loadMore]);

  return <RefundsContext.Provider value={value}>{children}</RefundsContext.Provider>;
};

export const useRefunds = () => {
  const ctx = useContext(RefundsContext);
  if (!ctx) throw new Error('useRefunds must be used within a RefundsProvider');
  return ctx;
};
