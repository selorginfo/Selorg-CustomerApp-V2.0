import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BillSummaryCard from '../../components/BillSummaryCard';
import WorldlineCheckoutWebView from '../../components/WorldlineCheckoutWebView';
import { Header, Icon, PrimaryButton, ScreenContainer, StateView } from '../../components';
import type { IconName } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { showToast } from '../../utils/toast';
import { parseReturnUrl } from '../../utils/worldline';
import { useCart } from '../../context/CartContext';
import { useOrders } from '../../context/OrdersContext';
import type { PayMethod } from '../../context/OrdersContext';
import { useWallet } from '../../context/WalletContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const METHODS: { id: PayMethod; icon: IconName; title: string }[] = [
  { id: 'online', icon: 'bank', title: 'UPI / Cards' },
  { id: 'wallet', icon: 'wallet', title: 'Selorg Wallet' },
  { id: 'cod', icon: 'cash', title: 'Cash on delivery' },
];

export default function PaymentScreen() {
  const navigation = useNavigation<Nav>();
  const { grandTotal } = useCart();
  const {
    payState,
    payError,
    placeOrder,
    retryPayment,
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

  const walletCovers = wallet.covers(grandTotal);

  const handlePay = async () => {
    if (payState === 'processing' || payState === 'awaiting_gateway') return;
    if (method === 'wallet' && !walletCovers) {
      return;
    }
    const result = await placeOrder(method, route.params?.receiver);
    if (result.success && result.order && !result.needsGateway) {
      await wallet.reloadWallet();
      goToOrderPlaced(result.order.id);
    }
  };

  // Once the order exists, Cart/Checkout/Payment must not stay on the stack:
  // backing out of the confirmation (or of Tracking, which replaces it) should
  // land on Main, never back inside a checkout the user already completed.
  const goToOrderPlaced = (orderId: string) => {
    navigation.reset({
      index: 1,
      routes: [{ name: 'Main' }, { name: 'OrderPlaced', params: { orderId } }],
    });
  };

  // Back to the method picker without losing the session or the order draft.
  const resetToMethodPicker = () => cancelGatewayPayment();

  const leaveCancelledPayment = () => {
    cancelGatewayPayment();
    showToast('Payment cancelled. No amount has been charged.', 'info');
    navigation.navigate('Checkout');
  };

  const handleGatewayComplete = async ({
    url,
    response,
  }: {
    url: string;
    response?: Record<string, unknown>;
  }) => {
    const orderId = pendingGatewayOrderId || activeOrder?.id;
    if (!orderId) {
      cancelGatewayPayment();
      showToast('We could not confirm this payment. Check Orders before paying again.', 'err');
      navigation.navigate('Checkout');
      return;
    }
    const result = await completeGatewayPayment(orderId, response ?? url);
    if (result.success && result.order) {
      await wallet.reloadWallet();
      goToOrderPlaced(result.order.id);
      return;
    }
    const status = String(
      (response?.status as string | undefined) || parseReturnUrl(url).status || '',
    ).toLowerCase();
    if (status === 'cancelled' || status === 'canceled' || status === 'cancel') {
      showToast('Payment cancelled. No amount has been charged.', 'info');
      navigation.navigate('Checkout');
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

  if (payState === 'failed' || payState === 'error') {
    return (
      <ScreenContainer background={colors.white}>
        <Header title="Payment" onBack={() => navigation.goBack()} />
        <View style={styles.retryStateWrap}>
          <StateView
            kind="error"
            title="Payment failed"
            message={payError || 'Something went wrong. Your order was not charged.'}
            icon="card"
          />
        </View>
        <View style={styles.retryWrap}>
          <PrimaryButton label="Retry payment" onPress={retryPayment} />
          <PrimaryButton label="Choose another method" kind="ghost" onPress={resetToMethodPicker} />
          <Text style={styles.retryNote}>You stay logged in — your cart and order draft are safe.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header title="Payment" subtitle={`To pay ${formatCurrency(grandTotal)}`} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>CHOOSE PAYMENT METHOD</Text>
        {METHODS.map(m => {
          const active = method === m.id;
          const low = m.id === 'wallet' && !walletCovers;
          const sub =
            m.id === 'online'
              ? 'Secured by Worldline'
              : m.id === 'wallet'
                ? `Balance ${formatCurrency(wallet.wallet.balance)}`
                : 'Pay when it arrives';
          return (
            <Pressable
              key={m.id}
              style={[styles.methodCard, active && styles.methodCardActive]}
              onPress={() => setMethod(m.id)}
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

        {method === 'wallet' && !walletCovers ? (
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
          label={method === 'cod' ? `Place order · ${formatCurrency(grandTotal)}` : `Pay ${formatCurrency(grandTotal)}`}
          icon={method === 'cod' ? 'box' : 'lock'}
          disabled={(method === 'wallet' && !walletCovers) || payState === 'awaiting_gateway'}
          onPress={handlePay}
        />
      </View>

      {gatewaySessionPayload && payState === 'awaiting_gateway' ? (
        <WorldlineCheckoutWebView
          visible
          sessionPayload={gatewaySessionPayload}
          onComplete={handleGatewayComplete}
          onCancel={leaveCancelledPayment}
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
