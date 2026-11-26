import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { AnimatedIcon, CleanBadges, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { useOrders, type Order } from '../../context/OrdersContext';
import { ordersApi } from '../../services/orders.service';
import { toLocalOrder } from '../../utils/mappers';
import type { RootStackParamList } from '../../navigation/types';
import { orderPlacedLayout } from '../../utils/orderPlacedLayout';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'OrderPlaced'>;

const CLEAN_CHOICE = ['Pesticide-Free', 'Fertilizer-Free', 'Chemical-Free', 'Non-GMO'];

type ReceiptRow = { label: string; value: string };

function ReceiptCard({ rows }: { rows: ReceiptRow[] }) {
  return (
    <View style={styles.orderNumberCard} testID="payment-success-receipt">
      {rows.map(row => (
        <View key={row.label} style={styles.receiptRow} testID={`receipt-row-${row.label}`}>
          <Text style={styles.orderNumberLabel}>{row.label}</Text>
          <Text style={styles.orderNumberValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SuccessActions({
  orderId,
  compact,
  onTrack,
  onHome,
}: {
  orderId: string;
  compact: boolean;
  onTrack: (orderId: string) => void;
  onHome: () => void;
}) {
  return (
    <View style={[styles.footer, compact && styles.footerCompact]} testID="order-placed-footer">
      <PrimaryButton
        testID="order-placed-track"
        label="Track order"
        icon="truck"
        onPress={() => onTrack(orderId)}
      />
      <PrimaryButton
        testID="order-placed-home"
        label="Continue shopping"
        kind="ghost"
        onPress={onHome}
      />
    </View>
  );
}

function SuccessLayout({
  subtitle,
  rows,
  orderId,
  onTrack,
  onHome,
}: {
  subtitle: string;
  rows: ReceiptRow[];
  orderId: string;
  onTrack: (orderId: string) => void;
  onHome: () => void;
}) {
  const { height } = useWindowDimensions();
  const layout = useMemo(() => orderPlacedLayout(height), [height]);

  return (
    <ScreenContainer background={colors.white} edges={['top', 'bottom']} keyboardAvoiding={false}>
      <LinearGradient colors={[colors.white, colors.white]} style={styles.gradient}>
        <View style={styles.root} testID="order-placed-success">
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              layout.compact && styles.scrollContentCompact,
            ]}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            testID="order-placed-scroll"
          >
            <View
              style={[
                styles.badge,
                {
                  width: layout.badgeSize,
                  height: layout.badgeSize,
                  borderRadius: layout.badgeSize / 2,
                },
              ]}
              testID="order-placed-badge"
            >
              <AnimatedIcon
                name="check"
                motion="pop"
                playOnMount
                size={layout.iconSize}
                color={colors.white}
                strokeWidth={3}
              />
            </View>
            <Text style={[styles.title, { fontSize: layout.titleSize }]}>Order placed!</Text>
            <Text style={[styles.subtitle, { fontSize: layout.subtitleSize }]}>{subtitle}</Text>
            <Text style={[styles.thankYou, { fontSize: layout.thankYouSize }]}>
              You’ve chosen life. Thank you.
            </Text>
            <View style={[styles.choiceCard, layout.compact && styles.choiceCardCompact]}>
              <Text style={styles.choiceLabel}>YOUR CLEAN-FOOD CHOICE</Text>
              <CleanBadges items={CLEAN_CHOICE} compact />
            </View>
            <ReceiptCard rows={rows} />
          </ScrollView>
          <SuccessActions
            orderId={orderId}
            compact={layout.compact}
            onTrack={onTrack}
            onHome={onHome}
          />
        </View>
      </LinearGradient>
    </ScreenContainer>
  );
}

export default function OrderPlacedScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { orders, activeOrder } = useOrders();
  const orderId = route.params?.orderId;
  const fromContext =
    orders.find(o => o.id === orderId) || (activeOrder?.id === orderId ? activeOrder : null);
  const [fetchedOrder, setFetchedOrder] = useState<Order | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const confirmedPaid = !!route.params?.confirmedPaid;
  const order = fromContext || fetchedOrder;
  // Payment flow already verified capture — do not flash "Payment not completed"
  // when the order row briefly still says pending.
  const displayOrder =
    order && confirmedPaid && (order.paymentStatus === 'pending' || order.paymentStatus === 'failed')
      ? { ...order, paymentStatus: 'paid' as const }
      : order;

  const goTrack = (id: string) => navigation.replace('Tracking', { orderId: id });
  const goHome = () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] });

  // COD/wallet used to navigate here before `orders` flushed, or a concurrent
  // list refresh dropped the new row. Fetch that order instead of bouncing to Main.
  useEffect(() => {
    if (!orderId) return;
    if (fromContext?.paymentStatus === 'paid' || fromContext?.paymentStatus === 'cod_pending') return;
    if (fetchedOrder) return;
    let alive = true;
    (async () => {
      try {
        const detail = await ordersApi.getOrder(orderId);
        if (!alive) return;
        setFetchedOrder(toLocalOrder(detail));
      } catch {
        if (alive && !fromContext) setLookupFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fromContext, fetchedOrder, orderId]);

  if (!orderId) {
    return (
      <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>
            We could not open this payment result. Check Orders for the latest status.
          </Text>
        </View>
        <View style={styles.footer}>
          <PrimaryButton label="Continue shopping" onPress={goHome} />
        </View>
      </ScreenContainer>
    );
  }

  // Paid path already verified — always show success (never unpaid / never stuck loading).
  if (confirmedPaid) {
    const amount = route.params?.paidAmount ?? displayOrder?.totalBill;
    const orderNumber = displayOrder?.orderNumber || orderId;
    const rows: ReceiptRow[] = [
      { label: 'PAYMENT STATUS', value: 'Completed' },
      ...(typeof amount === 'number' ? [{ label: 'AMOUNT', value: formatCurrency(amount) }] : []),
      { label: 'PAYMENT METHOD', value: route.params?.paymentMethodLabel || 'Online' },
      { label: 'ORDER ID', value: orderNumber },
      ...(route.params?.txnId
        ? [{ label: 'TRANSACTION ID', value: route.params.txnId }]
        : []),
    ];
    return (
      <SuccessLayout
        subtitle="Payment successful. Your order is confirmed and being prepared."
        rows={rows}
        orderId={orderId}
        onTrack={goTrack}
        onHome={goHome}
      />
    );
  }

  if (!displayOrder) {
    return (
      <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {lookupFailed
              ? 'We could not open this order yet. It is saved — check Orders.'
              : 'Confirming your order…'}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const unpaid =
    displayOrder.paymentStatus === 'pending' || displayOrder.paymentStatus === 'failed';
  if (unpaid) {
    const failed = displayOrder.paymentStatus === 'failed';
    return (
      <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.title}>{failed ? 'Payment failed' : 'Payment not completed'}</Text>
          <Text style={styles.subtitle}>
            {failed
              ? 'This order was not confirmed. No successful payment was recorded. You can retry payment.'
              : 'No payment was taken for this order. You can pay now without placing it again.'}
          </Text>
        </View>
        <View style={styles.footer}>
          <PrimaryButton
            label={failed ? 'Retry payment' : 'Pay now'}
            onPress={() =>
              navigation.replace('Payment', { method: 'online', orderId: displayOrder.id })
            }
          />
          <PrimaryButton label="Back to home" kind="ghost" onPress={goHome} />
        </View>
      </ScreenContainer>
    );
  }

  const cod = displayOrder.paymentStatus === 'cod_pending';
  const rows: ReceiptRow[] = [
    { label: 'PAYMENT STATUS', value: cod ? 'Pay on delivery' : 'Completed' },
    {
      label: 'AMOUNT',
      value: formatCurrency(route.params?.paidAmount ?? displayOrder.totalBill),
    },
    {
      label: 'PAYMENT METHOD',
      value:
        route.params?.paymentMethodLabel ||
        (cod ? 'Cash on delivery' : displayOrder.method === 'wallet' ? 'Selorg Wallet' : 'Online'),
    },
    { label: 'ORDER ID', value: displayOrder.orderNumber },
    ...(!cod && route.params?.txnId
      ? [{ label: 'TRANSACTION ID', value: route.params.txnId }]
      : []),
  ];

  return (
    <SuccessLayout
      subtitle={
        cod
          ? `Pay ${formatCurrency(displayOrder.totalBill)} in cash on delivery. We’re getting it ready.`
          : 'Payment successful. Your order is confirmed and being prepared.'
      }
      rows={rows}
      orderId={orderId}
      onTrack={goTrack}
      onHome={goHome}
    />
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  gradient: { flex: 1 },
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
  },
  scrollContentCompact: {
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  badge: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamily.bold, color: colors.text, marginTop: 4, textAlign: 'center' },
  subtitle: {
    fontFamily: fontFamily.medium,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
    paddingHorizontal: 4,
  },
  thankYou: { fontFamily: fontFamily.bold, color: colors.primaryDark, marginTop: 2, textAlign: 'center' },
  choiceCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 12,
    maxWidth: 360,
    gap: 6,
  },
  choiceCardCompact: { padding: 10 },
  choiceLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted },
  orderNumberCard: {
    alignSelf: 'stretch',
    marginTop: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg + 2,
    paddingVertical: 14,
    paddingHorizontal: 18,
    maxWidth: 360,
    gap: 10,
  },
  receiptRow: { alignItems: 'center', gap: 2 },
  orderNumberLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted },
  orderNumberValue: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.text,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  footerCompact: { paddingTop: 6, paddingBottom: 8, gap: 8 },
});
