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

import type { WalletTransaction } from '../services/wallet.service';

import { paymentsApi } from '../services/payments.service';

import { Storage } from '../api/storage';

import { showToast } from '../utils/toast';

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

  refreshWallet: () => Promise<void>;

  topUp: (amount: number, _method?: string) => Promise<void>;

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

  const [balance, setBalance] = useState(0);

  const [txns, setTxns] = useState<WalletTxn[]>([]);

  const [loading, setLoading] = useState(false);

  const [topUpSessionPayload, setTopUpSessionPayload] = useState<Record<string, unknown> | null>(null);

  const [pendingTopUpOrderId, setPendingTopUpOrderId] = useState<string | null>(null);

  const [pendingTopUpTxnId, setPendingTopUpTxnId] = useState<string | null>(null);

  const [topUpProcessing, setTopUpProcessing] = useState(false);



  const loadWallet = useCallback(async () => {

    if (!Storage.getItem('accessToken')) {

      setBalance(0);

      setTxns([]);

      return;

    }

    setLoading(true);

    try {

      const [bal, transactions] = await Promise.all([

        walletApi.getBalance(),

        walletApi.getTransactions({ limit: 50 }),

      ]);

      setBalance(bal.balance ?? 0);

      setTxns((transactions ?? []).map(toTxn));

    } catch {

      // keep previous state

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    loadWallet();

  }, [loadWallet]);



  const refreshWallet = useCallback(async () => {

    await loadWallet();

    showToast('Balance updated', 'info');

  }, [loadWallet]);



  const clearTopUpSession = useCallback(() => {

    setTopUpSessionPayload(null);

    setPendingTopUpOrderId(null);

    setPendingTopUpTxnId(null);

  }, []);



  const topUp = useCallback(

    async (amount: number) => {

      if (amount <= 0) return;

      try {

        const session = await walletApi.initiateTopUp(amount);

        if (!session.sessionPayload || !session.orderId) {

          showToast('Could not start top-up', 'err');

          return;

        }

        setPendingTopUpOrderId(String(session.orderId));

        setPendingTopUpTxnId(session.txnId ? String(session.txnId) : null);

        setTopUpSessionPayload(session.sessionPayload);

      } catch {

        showToast('Could not start top-up', 'err');

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

      refreshWallet,

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

      refreshWallet,

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


