import React, {

  createContext,

  useCallback,

  useContext,

  useEffect,

  useMemo,

  useRef,

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

import {
  parseReturnUrl,
  isWorldlinePaidStatus,
  isWorldlinePendingStatus,
  isWorldlineFailedStatus,
  shouldSubmitGatewayResponse,
  gatewayDismissAction,
  type GatewayDismissAction,
} from '../utils/worldline';



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
  /** False until this account's balance has been fetched. ₹0 before that is not "low balance". */
  ready: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;

  refreshWallet: () => Promise<void>;

  /** Fresh balance, or null when the signed-in customer could not be read. */
  reloadWallet: () => Promise<number | null>;

  topUp: (amount: number, method?: TopUpMethod) => Promise<boolean>;

  completeTopUp: (returnUrlOrResponse: string | Record<string, unknown>) => Promise<boolean>;

  cancelTopUp: (info?: { bankAuthenticationStarted?: boolean }) => Promise<GatewayDismissAction>;

  topUpSessionPayload: Record<string, unknown> | null;

  /** Order id for the open Worldline top-up session (status polling). */
  pendingTopUpOrderId: string | null;

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
  const balanceRef = useRef(0);

  const [txns, setTxns] = useState<WalletTxn[]>([]);

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const accountRef = useRef(userId);

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

  /** Resolves the balance, or null when this signed-in customer could not be read. */
  const loadWallet = useCallback(async (): Promise<number | null> => {
    const forAccount = userId;
    if (!Storage.getItem('accessToken') || !forAccount) {
      if (accountRef.current === forAccount) {
        balanceRef.current = 0;
        setBalance(0);
        setTxns([]);
        setReady(true);
      }
      return null;
    }
    setLoading(true);
    try {
      // Balance is the payment gate. A transactions failure must not wipe it.
      const bal = await walletApi.getBalance();
      let transactions: WalletTxn[] = [];
      try {
        transactions = ((await walletApi.getTransactions({ page: 1, limit: TXNS_PAGE })) ?? []).map(toTxn);
      } catch {
        transactions = [];
      }
      if (accountRef.current !== forAccount) return null;
      const amount = bal.balance;
      balanceRef.current = amount;
      setBalance(amount);
      setTxns(transactions);
      firstPageLoaded(transactions.length);
      setReady(true);
      return amount;
    } catch {
      if (accountRef.current === forAccount) setReady(true);
      return null;
    } finally {
      if (accountRef.current === forAccount) setLoading(false);
    }
  }, [userId, firstPageLoaded]);

  // Reload per account: launch, login, logout and account switch.
  // Do not stamp ₹0 before the fetch — that made a just-logged-in wallet look empty.
  useEffect(() => {
    accountRef.current = userId;
    setReady(false);
    if (!userId) {
      balanceRef.current = 0;
      setBalance(0);
      setTxns([]);
      setReady(true);
      return;
    }
    loadWallet();
  }, [userId, loadWallet]);

  /** Silent re-fetch (screen focus, after paying). */
  const reloadWallet = useCallback(async () => loadWallet(), [loadWallet]);

  /** User-initiated refresh — reports the real outcome. */
  const refreshWallet = useCallback(async () => {
    const amount = await loadWallet();
    if (amount != null) showToast('Balance updated', 'info');
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

        if (shouldSubmitGatewayResponse(response)) {

          await paymentsApi.completeWorldlinePayment({

            orderId,

            txnId: pendingTopUpTxnId || undefined,

            response,

          });

        } else {

          await new Promise<void>(r => setTimeout(() => r(), 800));

        }



        let paid = false;

        let failed = false;

        for (let i = 0; i < 10; i += 1) {

          const status = await paymentsApi.getWorldlineStatus(orderId);

          if (isWorldlinePaidStatus(status)) {

            paid = true;

            break;

          }

          if (isWorldlineFailedStatus(status)) {

            failed = true;

            break;

          }

          if (!isWorldlinePendingStatus(status)) break;

          await new Promise<void>(r => setTimeout(() => r(), 1500));

        }



        clearTopUpSession();



        if (!paid && !failed) {

          showToast('Payment is still being verified. Your balance updates only after it is confirmed.', 'info');

          return false;

        }

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



  const cancelTopUp = useCallback(

    async (info?: { bankAuthenticationStarted?: boolean }): Promise<GatewayDismissAction> => {

      const orderId = pendingTopUpOrderId;

      const txnId = pendingTopUpTxnId;

      let action: GatewayDismissAction = orderId ? 'hold' : 'abort';

      if (orderId) {

        try {

          const status = await paymentsApi.getWorldlineStatus(orderId);

          action = gatewayDismissAction(status, {

            statusKnown: true,

            bankAuthenticationStarted: !!info?.bankAuthenticationStarted,

          });

        } catch {

          action = 'hold';

        }

      }

      if (action === 'finish_paid') {

        await completeTopUp('');

        return 'finish_paid';

      }

      if (action === 'abort' && orderId && txnId) {

        try {

          await paymentsApi.abortWorldlinePayment({

            orderId,

            txnId,

            reason: 'user_cancelled',

          });

        } catch {

          action = 'hold';

        }

      }

      clearTopUpSession();

      if (action === 'hold') {

        showToast('Payment is still being verified. Your balance updates only after it is confirmed.', 'info');

      } else if (action === 'close_failed') {

        showToast('Payment was not confirmed. No money was added.', 'err');

      } else {

        showToast('Top-up cancelled. No money was added.', 'info');

      }

      return action;

    },

    [pendingTopUpOrderId, pendingTopUpTxnId, clearTopUpSession, completeTopUp],

  );



  const covers = useCallback((amount: number) => ready && balance + 0.009 >= amount, [balance, ready]);



  const wallet: Wallet = useMemo(() => ({ balance, txns }), [balance, txns]);



  const value = useMemo<WalletContextType>(

    () => ({

      wallet,

      loading,
      ready,
      hasMore: pager.hasMore,
      loadingMore: pager.loadingMore,
      loadMore: pager.loadMore,

      refreshWallet,
      reloadWallet,

      topUp,

      completeTopUp,

      cancelTopUp,

      topUpSessionPayload,

      pendingTopUpOrderId,

      topUpProcessing,

      covers,

    }),

    [

      wallet,

      loading,
      ready,
      pager.hasMore,
      pager.loadingMore,
      pager.loadMore,

      refreshWallet,
      reloadWallet,

      topUp,

      completeTopUp,

      cancelTopUp,

      topUpSessionPayload,

      pendingTopUpOrderId,

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


