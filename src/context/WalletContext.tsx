import React, {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useState,

  ReactNode,

} from 'react';

import { walletApi } from '../services/wallet.service';
import { getErrorMessage } from '../utils/apiError';
import { usePager } from '../utils/usePager';

const TXNS_PAGE = 50;

export type TopUpMethod = 'upi' | 'cards' | 'wallets' | 'netbanking';
/** Client-side top-up bounds; the server may enforce a tighter range (its message is shown). */
export const TOPUP_MIN = 10;
export const TOPUP_MAX = 10000;

import type { WalletTransaction } from '../services/wallet.service';

import { paymentsApi } from '../services/payments.service';

import { Storage } from '../api/storage';

import { showToast } from '../utils/toast';
import { useAuth } from './AuthContext';

import { parseReturnUrl, hasWorldlineGatewayPayload, isWorldlinePaidStatus, isWorldlinePendingStatus, isWorldlineFailedStatus } from '../utils/worldline';



export interface WalletTxn {

  id: string;

  type: 'credit' | 'debit';

  source: string;

  amount: number;

  note: string;

  ts: string;

}



export interface Wallet {

  balance: number;

  txns: WalletTxn[];

}



interface WalletContextType {

  wallet: Wallet;

  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;

  refreshWallet: () => Promise<void>;

  reloadWallet: () => Promise<void>;

  topUp: (amount: number, method?: TopUpMethod) => Promise<boolean>;

  completeTopUp: (returnUrlOrResponse: string | Record<string, unknown>) => Promise<boolean>;

  cancelTopUp: () => void;

  topUpSessionPayload: Record<string, unknown> | null;

  topUpProcessing: boolean;

  covers: (amount: number) => boolean;

}



const WalletContext = createContext<WalletContextType | undefined>(undefined);



function toTxn(raw: WalletTransaction): WalletTxn {

  return {

    id: raw._id,

    type: raw.type,

    source: raw.description ? 'payment_topup' : 'order_payment',

    amount: raw.amount,

    note: raw.description || raw.note || (raw.type === 'credit' ? 'Money added' : 'Payment'),

    ts: raw.createdAt,

  };

}



export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || '';

  const [balance, setBalance] = useState(0);

  const [txns, setTxns] = useState<WalletTxn[]>([]);

  const [loading, setLoading] = useState(false);

  const [topUpSessionPayload, setTopUpSessionPayload] = useState<Record<string, unknown> | null>(null);

  const [pendingTopUpOrderId, setPendingTopUpOrderId] = useState<string | null>(null);

  const [pendingTopUpTxnId, setPendingTopUpTxnId] = useState<string | null>(null);

  const [topUpProcessing, setTopUpProcessing] = useState(false);



  const fetchTxnsPage = useCallback(
    async (page: number) => ((await walletApi.getTransactions({ page, limit: TXNS_PAGE })) ?? []).map(toTxn),
    [],
  );
  const pager = usePager(fetchTxnsPage, TXNS_PAGE, setTxns);
  const { firstPageLoaded } = pager;

  /** Resolves false when the balance could not be fetched. */
  const loadWallet = useCallback(async (): Promise<boolean> => {
    if (!Storage.getItem('accessToken')) {
      setBalance(0);
      setTxns([]);
      return false;
    }
    setLoading(true);
    try {
      const [bal, transactions] = await Promise.all([
        walletApi.getBalance(),
        walletApi.getTransactions({ page: 1, limit: TXNS_PAGE }),
      ]);
      setBalance(bal.balance ?? 0);
      setTxns((transactions ?? []).map(toTxn));
      firstPageLoaded((transactions ?? []).length);
      return true;
    } catch {
      // keep previous state
      return false;
    } finally {
      setLoading(false);
    }
  }, [firstPageLoaded]);

  // Reload per account: launch, login, logout and account switch.
  useEffect(() => {
    setBalance(0);
    setTxns([]);
    if (!userId) return;
    loadWallet();
  }, [userId, loadWallet]);

  /** Silent re-fetch (screen focus, after paying). */
  const reloadWallet = useCallback(async () => {
    await loadWallet();
  }, [loadWallet]);

  /** User-initiated refresh — reports the real outcome. */
  const refreshWallet = useCallback(async () => {
    const ok = await loadWallet();
    if (ok) showToast('Balance updated', 'info');
    else showToast('Could not refresh balance. Check your connection.', 'err');
  }, [loadWallet]);

  const clearTopUpSession = useCallback(() => {
    setTopUpSessionPayload(null);
    setPendingTopUpOrderId(null);
    setPendingTopUpTxnId(null);
  }, []);

  const topUp = useCallback(
    async (amount: number, method?: TopUpMethod): Promise<boolean> => {
      if (!Number.isFinite(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX) {
        showToast(`Enter an amount between ₹${TOPUP_MIN} and ₹${TOPUP_MAX.toLocaleString('en-IN')}`, 'err');
        return false;
      }
      try {
        // The chosen instrument scopes the hosted checkout (UPI / cards / …).
        const session = await walletApi.initiateTopUp(amount, undefined, method);
        if (!session.sessionPayload || !session.orderId) {
          showToast('Could not start top-up', 'err');
          return false;
        }
        setPendingTopUpOrderId(String(session.orderId));
        setPendingTopUpTxnId(session.txnId ? String(session.txnId) : null);
        setTopUpSessionPayload(session.sessionPayload);
        return true;
      } catch (err) {
        showToast(getErrorMessage(err, 'Could not start top-up'), 'err');
        return false;
      }
    },
    [],
  );



  const completeTopUp = useCallback(

    async (returnUrlOrResponse: string | Record<string, unknown>) => {

      const orderId = pendingTopUpOrderId;

      if (!orderId) {

        clearTopUpSession();

        showToast('Payment session expired', 'err');

        return false;

      }



      setTopUpProcessing(true);

      try {

        const response =
          typeof returnUrlOrResponse === 'string' ? parseReturnUrl(returnUrlOrResponse) : returnUrlOrResponse;

        if (hasWorldlineGatewayPayload(response) || response.msg || response.paymentMethod) {

          await paymentsApi.completeWorldlinePayment({

            orderId,

            txnId: pendingTopUpTxnId || undefined,

            response,

          });

        } else {

          await new Promise<void>(r => setTimeout(() => r(), 800));

        }



        let paid = false;

        for (let i = 0; i < 10; i += 1) {

          const status = await paymentsApi.getWorldlineStatus(orderId);

          if (isWorldlinePaidStatus(status)) {

            paid = true;

            break;

          }

          if (isWorldlineFailedStatus(status)) break;

          if (!isWorldlinePendingStatus(status)) break;

          await new Promise<void>(r => setTimeout(() => r(), 1500));

        }



        clearTopUpSession();



        if (!paid) {

          showToast('Payment was not confirmed. No money was added.', 'err');

          return false;

        }



        await loadWallet();

        showToast('Wallet topped up successfully');

        return true;

      } catch {

        clearTopUpSession();

        showToast('Could not confirm payment', 'err');

        return false;

      } finally {

        setTopUpProcessing(false);

      }

    },

    [pendingTopUpOrderId, pendingTopUpTxnId, clearTopUpSession, loadWallet],

  );



  const cancelTopUp = useCallback(() => {

    if (pendingTopUpOrderId && pendingTopUpTxnId) {

      paymentsApi

        .abortWorldlinePayment({

          orderId: pendingTopUpOrderId,

          txnId: pendingTopUpTxnId,

          reason: 'user_cancelled',

        })

        .catch(() => {});

    }

    clearTopUpSession();

    showToast('Top-up cancelled', 'info');

  }, [pendingTopUpOrderId, pendingTopUpTxnId, clearTopUpSession]);



  const covers = useCallback((amount: number) => balance >= amount, [balance]);



  const wallet: Wallet = useMemo(() => ({ balance, txns }), [balance, txns]);



  const value = useMemo<WalletContextType>(

    () => ({

      wallet,

      loading,
      hasMore: pager.hasMore,
      loadingMore: pager.loadingMore,
      loadMore: pager.loadMore,

      refreshWallet,
      reloadWallet,

      topUp,

      completeTopUp,

      cancelTopUp,

      topUpSessionPayload,

      topUpProcessing,

      covers,

    }),

    [

      wallet,

      loading,
      pager.hasMore,
      pager.loadingMore,
      pager.loadMore,

      refreshWallet,
      reloadWallet,

      topUp,

      completeTopUp,

      cancelTopUp,

      topUpSessionPayload,

      topUpProcessing,

      covers,

    ],

  );



  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;

};



export const useWallet = () => {

  const ctx = useContext(WalletContext);

  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');

  return ctx;

};


