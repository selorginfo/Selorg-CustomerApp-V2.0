import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BillSummaryCard from '../../components/BillSummaryCard';
import WorldlineCheckoutWebView, {
  type GatewayCloseInfo,
  type GatewayProgressInfo,
} from '../../components/WorldlineCheckoutWebView';
import { Header, Icon, PrimaryButton, ScreenContainer, StateView } from '../../components';
import type { IconName } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { showToast } from '../../utils/toast';
import { parseReturnUrl } from '../../utils/worldline';
import { watchWorldlineStatus } from '../../utils/worldlineStatusWatch';
import { onlineInterruptsMethod, resolvePayMethod } from '../../utils/paymentAttempt';
import { useCart } from '../../context/CartContext';
import { useOrders } from '../../context/OrdersContext';
import type { PayMethod } from '../../context/OrdersContext';
import { useWallet } from '../../context/WalletContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const METHODS: { id: PayMethod; icon: IconName; title: string }[] = [
  { id: 'online', icon: 'bank', title: 'Pay online' },
  { id: 'wallet', icon: 'wallet', title: 'Selorg Wallet' },
  { id: 'cod', icon: 'cash', title: 'Cash on delivery' },
];

export default function PaymentScreen() {
  const navigation = useNavigation<Nav>();
  const { grandTotal } = useCart();
  const {
    payState,
    payError,
    failedMethod,
    placeOrder,
    payExistingOrder,
    retryPayment,
    prepareFreshPaymentSession,
    gatewaySessionPayload,
    pendingGatewayOrderId,
    completeGatewayPayment,
    cancelGatewayPayment,
    activeOrder,
  } = useOrders();
  const wallet = useWallet();
  const route = useRoute<RouteProp<RootStackParamList, 'Payment'>>();
  // Honour the method picked on Checkout, defaulting to online.
  const [method, setMethod] = useState<PayMethod>(route.params?.method ?? 'online');
  const [unconfirmed, setUnconfirmed] = useState('');
  /** True while Worldline has not confirmed capture or decline — not a failure. */
  const [paymentPending, setPaymentPending] = useState(false);
  const [pendingVerifyOrderId, setPendingVerifyOrderId] = useState<string | null>(null);
  const [gatewayWatching, setGatewayWatching] = useState(false);
  const settlingRef = useRef(false);
  const watchAbortRef = useRef({ aborted: false });
  /** True only after the card/bank page (or blank recovery) — never poll on the Paynimo picker alone. */
  const gatewayProgressSeenRef = useRef(false);
  const payStateRef = useRef(payState);
  payStateRef.current = payState;
  const pendingGatewayOrderIdRef = useRef(pendingGatewayOrderId);
  pendingGatewayOrderIdRef.current = pendingGatewayOrderId;

  // Checkout can change the method and navigate back onto this screen.
  useEffect(() => {
    if (route.params?.method) setMethod(route.params.method);
  }, [route.params?.method]);

  // Hold latest fns in refs so this focus callback stays stable. Depending on
  // `wallet` / `reloadWallet` re-fired prepareFresh after every balance fetch and
  // cleared the Paynimo session — Choose Payment Method appeared to reload forever.
  const prepareFreshRef = useRef(prepareFreshPaymentSession);
  prepareFreshRef.current = prepareFreshPaymentSession;
  const reloadWalletRef = useRef(wallet.reloadWallet);
  reloadWalletRef.current = wallet.reloadWallet;
  const resumeOrderId = route.params?.orderId;

  useFocusEffect(
    React.useCallback(() => {
      prepareFreshRef.current({
        resumeOrderId,
      });
      setUnconfirmed('');
      // Do not clear paymentPending on focus — a bank debit may still be reconciling.
      // Resuming the app (SMS OTP, lock screen) re-fires this effect. Aborting the
      // status watch here left a captured payment on the blank Secure Payment sheet.
      if (payStateRef.current === 'awaiting_gateway') {
        if (gatewayProgressSeenRef.current && pendingGatewayOrderIdRef.current) {
          setGatewayWatching(true);
        }
        void reloadWalletRef.current();
        return;
      }
      watchAbortRef.current.aborted = true;
      setGatewayWatching(false);
      gatewayProgressSeenRef.current = false;
      settlingRef.current = false;
      void reloadWalletRef.current();
    }, [resumeOrderId]),
  );

  // Once the order exists, Cart/Checkout/Payment must not stay on the stack:
  // backing out of the confirmation (or of Tracking, which replaces it) should
  // land on Main, never back inside a checkout the user already completed.
  const goToOrderPlaced = React.useCallback(
    (orderId: string) => {
      navigation.reset({
        index: 1,
        routes: [{ name: 'Main' }, { name: 'OrderPlaced', params: { orderId } }],
      });
    },
    [navigation],
  );

  const settleFromStatusWatch = React.useCallback(
    async (orderId: string) => {
      if (settlingRef.current) return;
      settlingRef.current = true;
      watchAbortRef.current.aborted = true;
      try {
        const result = await completeGatewayPayment(orderId, '');
        if (result.success && result.order) {
          setUnconfirmed('');
          setPaymentPending(false);
          setPendingVerifyOrderId(null);
          goToOrderPlaced(result.order.id);
          void wallet.reloadWallet();
          return;
        }
        if (result.pendingVerification) {
          setPaymentPending(true);
          setPendingVerifyOrderId(orderId);
          setUnconfirmed('');
          return;
        }
        setPaymentPending(false);
        setPendingVerifyOrderId(null);
        setUnconfirmed(result.message || 'Payment was not completed. You can retry from checkout.');
      } finally {
        settlingRef.current = false;
        setGatewayWatching(false);
      }
    },
    [completeGatewayPayment, goToOrderPlaced, wallet],
  );

  // While Secure Payment is open after the card/bank page, poll server status.
  // The bank may already have captured while the WebView stays white.
  useEffect(() => {
    if (payState !== 'awaiting_gateway' || !gatewayWatching) return undefined;
    // Never fall back to activeOrder — that is often the previous finished order.
    const orderId = pendingGatewayOrderId;
    if (!orderId) return undefined;
    const signal = { aborted: false };
    watchAbortRef.current = signal;
    void (async () => {
      while (!signal.aborted) {
        const { outcome } = await watchWorldlineStatus({
          orderId,
          initialDelayMs: 1200,
          intervalMs: 2500,
          maxAttempts: 40,
          signal,
        });
        if (signal.aborted) return;
        // Only a verified capture or decline closes the WebView from this loop.
        // Pending, timeout, and a blank document are not a failure — blank-page
        // recovery calls onComplete, which shows Payment processing and keeps polling.
        if (outcome === 'paid' || outcome === 'failed') {
          await settleFromStatusWatch(orderId);
          return;
        }
      }
    })();
    return () => {
      signal.aborted = true;
    };
  }, [payState, gatewayWatching, pendingGatewayOrderId, settleFromStatusWatch]);

  // Keep reconciling after the WebView closes if the bank debit is still verifying.
  useEffect(() => {
    if (!paymentPending || method !== 'online') return undefined;
    const orderId = pendingVerifyOrderId || pendingGatewayOrderId || route.params?.orderId;
    if (!orderId) return undefined;
    const signal = { aborted: false };
    void (async () => {
      while (!signal.aborted) {
        const { outcome } = await watchWorldlineStatus({
          orderId,
          initialDelayMs: 2000,
          intervalMs: 4000,
          maxAttempts: 20,
          signal,
        });
        if (signal.aborted) return;
        await settleFromStatusWatch(orderId);
        if (outcome === 'paid' || outcome === 'failed') return;
        // Still pending — Worldline inquiry may confirm on the next pass.
      }
    })();
    return () => {
      signal.aborted = true;
    };
  }, [
    paymentPending,
    method,
    pendingVerifyOrderId,
    pendingGatewayOrderId,
    route.params?.orderId,
    settleFromStatusWatch,
  ]);

  // Resume / reopen: continue status watch after OTP / app switch, only once
  // the card or bank page has already been reached.
  useEffect(() => {
    if (payState !== 'awaiting_gateway') return undefined;
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      if (!pendingGatewayOrderId || settlingRef.current || !gatewayProgressSeenRef.current) return;
      setGatewayWatching(true);
    });
    return () => sub.remove();
  }, [payState, pendingGatewayOrderId]);

  useEffect(() => {
    if (payState !== 'awaiting_gateway') {
      setGatewayWatching(false);
      watchAbortRef.current.aborted = true;
      settlingRef.current = false;
      gatewayProgressSeenRef.current = false;
    }
  }, [payState]);

  // A failed / unconfirmed online attempt must not stay on screen after COD or wallet.
  useEffect(() => {
    if (method === 'online') return;
    if (unconfirmed) setUnconfirmed('');
    if (failedMethod === 'online' && (payState === 'failed' || payState === 'error')) {
      retryPayment();
    }
  }, [method, failedMethod, payState, retryPayment, unconfirmed]);

  const walletCovers = wallet.covers(grandTotal);

  const leaveGatewayForOtherMethod = async () => {
    watchAbortRef.current.aborted = true;
    setGatewayWatching(false);
    settlingRef.current = false;
    setUnconfirmed('');
    if (payState === 'awaiting_gateway' || gatewaySessionPayload) {
      // Drop WebView / session UI. Do not force-abort mid-OTP here — placeOrder
      // aborts+cancels only when status is safe to clear, or blocks if verifying.
      await cancelGatewayPayment({
        bankAuthenticationStarted: gatewayProgressSeenRef.current,
      });
    } else {
      retryPayment();
    }
  };

  const selectMethod = (next: PayMethod) => {
    if (next === method) return;
    setMethod(next);
    if (next !== 'online') {
      setUnconfirmed('');
      watchAbortRef.current.aborted = true;
      setGatewayWatching(false);
      if (payState === 'awaiting_gateway' || gatewaySessionPayload) {
        void leaveGatewayForOtherMethod();
      }
    }
  };

  const handlePay = async (nextMethod?: PayMethod) => {
    // A press event must not become the method. Only online | cod | wallet count.
    const paying = resolvePayMethod(nextMethod, method);
    if (paying !== method) setMethod(paying);

    if (paying !== 'online') {
      // COD / wallet must not reopen Worldline or keep the card failure sheet.
      setUnconfirmed('');
      watchAbortRef.current.aborted = true;
      setGatewayWatching(false);
      gatewayProgressSeenRef.current = false;
      if (payState === 'awaiting_gateway' || gatewaySessionPayload) {
        await leaveGatewayForOtherMethod();
      }
    }

    if (payState === 'processing') return;
    // After leaveGatewayForOtherMethod, awaiting_gateway is cleared. Do not block COD
    // on a stale awaiting flag from before the switch.
    if (paying === 'online' && payState === 'awaiting_gateway') return;

    if (paying === 'wallet') {
      const balance = await wallet.reloadWallet();
      if (balance == null) {
        showToast('Could not load your wallet balance. Please try again.', 'err');
        return;
      }
      if (balance + 0.009 < grandTotal) {
        showToast('Insufficient wallet balance. Add money or choose another method.', 'err');
        return;
      }
    }
    const resumeOrderId = paying === 'online' ? route.params?.orderId : undefined;
    const result = resumeOrderId
      ? await payExistingOrder(resumeOrderId)
      : await placeOrder(paying, route.params?.receiver);
    if (result.success && result.order && !result.needsGateway) {
      setUnconfirmed('');
      goToOrderPlaced(result.order.id);
      void wallet.reloadWallet();
      return;
    }
    if (!result.success && paying !== 'online' && result.message) {
      showToast(result.message, result.pendingVerification ? 'info' : 'err');
    }
  };

  const applyDismiss = async (info: GatewayCloseInfo | undefined, leave: boolean) => {
    watchAbortRef.current.aborted = true;
    settlingRef.current = true;
    const orderId = pendingGatewayOrderId || activeOrder?.id;
    try {
      const action = await cancelGatewayPayment({
        bankAuthenticationStarted: !!info?.bankAuthenticationStarted,
      });
      if (action === 'finish_paid' && orderId) {
        const result = await completeGatewayPayment(orderId, '');
        if (result.success && result.order) {
          await wallet.reloadWallet();
          goToOrderPlaced(result.order.id);
          return;
        }
      }
      if (action === 'hold' || action === 'finish_paid') {
        setUnconfirmed('');
        showToast('Payment is still being verified. Check Orders before paying again.', 'info');
        if (leave) navigation.navigate('Checkout');
        return;
      }
      if (action === 'close_failed') {
        setUnconfirmed('');
        if (leave) {
          showToast('Payment was not completed. You can retry from checkout.', 'err');
          navigation.navigate('Checkout');
        }
        return;
      }
      setUnconfirmed('');
      showToast('Payment cancelled. No amount has been charged.', 'info');
      if (leave) navigation.navigate('Checkout');
    } finally {
      settlingRef.current = false;
      setGatewayWatching(false);
    }
  };

  // Back to the method picker. Clear card/WebView UI first.
  const resetToMethodPicker = () => {
    setUnconfirmed('');
    watchAbortRef.current.aborted = true;
    setGatewayWatching(false);
    if (payState === 'awaiting_gateway' || gatewaySessionPayload) {
      applyDismiss({ bankAuthenticationStarted: gatewayProgressSeenRef.current }, false).catch(() => {});
    } else {
      retryPayment();
    }
  };

  const leaveCancelledPayment = (info: GatewayCloseInfo) => {
    applyDismiss(info, true).catch(() => {});
  };

  const handleGatewayProgress = (_info: GatewayProgressInfo) => {
    gatewayProgressSeenRef.current = true;
    if (payState === 'awaiting_gateway') setGatewayWatching(true);
  };

  const handleGatewayComplete = async ({
    url,
    response,
  }: {
    url: string;
    response?: Record<string, unknown>;
  }) => {
    if (settlingRef.current) return;
    settlingRef.current = true;
    watchAbortRef.current.aborted = true;
    const orderId = pendingGatewayOrderId || activeOrder?.id;
    try {
      if (!orderId) {
        showToast('We could not confirm this payment. Check Orders before paying again.', 'err');
        navigation.navigate('Checkout');
        return;
      }
      const result = await completeGatewayPayment(orderId, response ?? url);
      if (result.success && result.order) {
        setUnconfirmed('');
        setPaymentPending(false);
        setPendingVerifyOrderId(null);
        goToOrderPlaced(result.order.id);
        void wallet.reloadWallet();
        return;
      }
      if (result.pendingVerification) {
        setPaymentPending(true);
        setPendingVerifyOrderId(orderId);
        setUnconfirmed('');
        return;
      }
      const status = String(
        (response?.status as string | undefined) || parseReturnUrl(url).status || '',
      ).toLowerCase();
      if (status === 'cancelled' || status === 'canceled' || status === 'cancel') {
        showToast('Payment cancelled. No amount has been charged.', 'info');
        navigation.navigate('Checkout');
        return;
      }
      setPaymentPending(false);
      setUnconfirmed(result.message || 'Payment was not completed. You can retry from checkout.');
    } finally {
      settlingRef.current = false;
      setGatewayWatching(false);
    }
  };

  if (payState === 'processing') {
    return (
      <View style={styles.processingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.processingTitle}>Processing your payment…</Text>
        <Text style={styles.processingSub}>
          Creating your order and confirming with the gateway. Don’t close this screen.
        </Text>
      </View>
    );
  }

  if (paymentPending && method === 'online') {
    return (
      <ScreenContainer background={colors.white}>
        <Header title="Payment" onBack={() => navigation.goBack()} />
        <View style={styles.retryStateWrap}>
          <StateView
            kind="empty"
            title="Payment processing"
            message="We're confirming your payment with the bank. Do not pay again — this screen updates when the charge is verified."
            icon="card"
          />
        </View>
        <View style={styles.retryWrap}>
          <PrimaryButton
            label="Check payment status"
            onPress={() => {
              const orderId = pendingVerifyOrderId || pendingGatewayOrderId || route.params?.orderId;
              if (orderId) void settleFromStatusWatch(orderId);
            }}
          />
          <Text style={styles.retryNote}>
            If money was debited, keep this order — do not start another payment.
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  if (onlineInterruptsMethod(payState, failedMethod, method, unconfirmed)) {
    return (
      <ScreenContainer background={colors.white}>
        <Header title="Payment" onBack={() => navigation.goBack()} />
        <View style={styles.retryStateWrap}>
          <StateView
            kind="error"
            title="Payment failed"
            message={unconfirmed || payError || 'Something went wrong. Your order was not charged.'}
            icon="card"
          />
        </View>
        <View style={styles.retryWrap}>
          <PrimaryButton
            label="Retry payment"
            onPress={() => {
              setUnconfirmed('');
              setPaymentPending(false);
              retryPayment();
            }}
          />
          <PrimaryButton
            label="Pay cash on delivery"
            kind="ghost"
            onPress={() => {
              void handlePay('cod');
            }}
          />
          <PrimaryButton label="Choose another method" kind="ghost" onPress={resetToMethodPicker} />
          <Text style={styles.retryNote}>You stay logged in — your cart and order draft are safe.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header
        title="Payment"
        subtitle={`To pay ${formatCurrency(grandTotal)}`}
        onBack={() => {
          // Leaving Payment must drop any open gateway UI so the next visit
          // does not immediately re-open Worldline.
          if (payState === 'awaiting_gateway' || gatewaySessionPayload) {
            void leaveGatewayForOtherMethod().finally(() => navigation.goBack());
            return;
          }
          navigation.goBack();
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>CHOOSE PAYMENT METHOD</Text>
        {METHODS.map(m => {
          const active = method === m.id;
          const low = m.id === 'wallet' && wallet.ready && !walletCovers;
          const sub =
            m.id === 'online'
              ? 'UPI, cards & net banking'
              : m.id === 'wallet'
                ? !wallet.ready
                  ? 'Checking balance…'
                  : `Balance ${formatCurrency(wallet.wallet.balance)}`
                : 'Pay when it arrives';
          return (
            <Pressable
              key={m.id}
              style={[styles.methodCard, active && styles.methodCardActive]}
              onPress={() => selectMethod(m.id)}
              testID={`payment-method-${m.id}`}
              accessibilityRole="button"
              accessibilityLabel={m.title}
              accessibilityState={{ selected: active }}
            >
              <Icon name={m.icon} size={22} color={colors.text} />
              <View style={styles.methodBody}>
                <Text style={styles.methodTitle}>{m.title}</Text>
                <Text style={[styles.methodSub, low && styles.methodSubLow]}>{sub}</Text>
              </View>
              {low ? (
                <View style={styles.lowBadge}>
                  <Text style={styles.lowBadgeLabel}>Low</Text>
                </View>
              ) : (
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <Icon name="check" size={11} color={colors.white} strokeWidth={3} /> : null}
                </View>
              )}
            </Pressable>
          );
        })}

        {method === 'wallet' && wallet.ready && !walletCovers ? (
          <View style={styles.insufficientBanner}>
            <Text style={styles.insufficientText}>Insufficient balance for full payment</Text>
            <Pressable onPress={() => navigation.navigate('Wallet')} hitSlop={6}>
              <Text style={styles.topUpLink}>Top up</Text>
            </Pressable>
          </View>
        ) : null}

        <BillSummaryCard />
      </ScrollView>

      <View style={styles.bottomBar}>
        <PrimaryButton
          testID="payment-submit"
          label={
            method === 'wallet' && !wallet.ready
              ? 'Checking wallet…'
              : method === 'cod'
                ? `Place order · ${formatCurrency(grandTotal)}`
                : `Pay ${formatCurrency(grandTotal)}`
          }
          icon={method === 'cod' ? 'box' : 'lock'}
          disabled={(method === 'wallet' && (!wallet.ready || !walletCovers)) || payState === 'awaiting_gateway'}
          onPress={() => {
            void handlePay();
          }}
        />
      </View>

      {gatewaySessionPayload && payState === 'awaiting_gateway' && !unconfirmed ? (
        <WorldlineCheckoutWebView
          visible
          openAllPaymentModes
          sessionPayload={gatewaySessionPayload}
          onComplete={handleGatewayComplete}
          onCancel={leaveCancelledPayment}
          onGatewayProgress={handleGatewayProgress}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  sectionLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textMuted, letterSpacing: 0.3, marginBottom: 12 },
  methodCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 14,
    marginBottom: 10,
  },
  methodCardActive: { borderColor: colors.primary },
  methodBody: { flex: 1 },
  methodTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  methodSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  methodSubLow: { color: colors.danger },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  lowBadge: { backgroundColor: colors.amberSoft, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 7 },
  lowBadgeLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.amber },
  insufficientBanner: {
    backgroundColor: colors.amberSoft,
    borderRadius: radii.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  insufficientText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.amber, flex: 1 },
  topUpLink: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primaryDark },

  bottomBar: { padding: 16, paddingTop: 6, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },

  processingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 30, backgroundColor: colors.white },
  processingTitle: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.text, textAlign: 'center' },
  processingSub: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

  retryStateWrap: { flex: 1 },
  retryWrap: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  retryNote: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, textAlign: 'center' },
});
