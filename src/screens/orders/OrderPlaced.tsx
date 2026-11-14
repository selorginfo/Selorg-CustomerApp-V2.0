import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'OrderPlaced'>;

const CLEAN_CHOICE = ['Pesticide-Free', 'Fertilizer-Free', 'Chemical-Free', 'Non-GMO'];

export default function OrderPlacedScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { orders, activeOrder } = useOrders();
  const orderId = route.params.orderId;
  const fromContext =
    orders.find(o => o.id === orderId) || (activeOrder?.id === orderId ? activeOrder : null);
  const [fetchedOrder, setFetchedOrder] = useState<Order | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const order = fromContext || fetchedOrder;

  // COD/wallet used to navigate here before `orders` flushed, or a concurrent
  // list refresh dropped the new row. Fetch that order instead of bouncing to Main.
  useEffect(() => {
    if (fromContext || fetchedOrder) return;
    let alive = true;
    (async () => {
      try {
        const detail = await ordersApi.getOrder(orderId);
        if (!alive) return;
        setFetchedOrder(toLocalOrder(detail));
      } catch {
        if (alive) setLookupFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fromContext, fetchedOrder, orderId]);

  if (!order) {
    return (
      <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {lookupFailed ? 'We could not open this order yet. It is saved — check Orders.' : 'Confirming your order…'}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  const unpaid = order.paymentStatus === 'pending' || order.paymentStatus === 'failed';
  if (unpaid) {
    const failed = order.paymentStatus === 'failed';
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
            onPress={() => navigation.replace('Payment', { method: 'online', orderId: order.id })}
          />
          <PrimaryButton
            label="Back to home"
            kind="ghost"
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
          />
        </View>
      </ScreenContainer>
    );
  }

  const cod = order.paymentStatus === 'cod_pending';

  return (
    <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.white, colors.white]} style={styles.gradient}>
      <View style={styles.content}>
        <View style={styles.badge}>
          <AnimatedIcon name="check" motion="pop" playOnMount size={48} color={colors.white} strokeWidth={3} />
        </View>

        <Text style={styles.title}>Order placed!</Text>
        <Text style={styles.subtitle}>
          {cod
            ? `Pay ${formatCurrency(order.totalBill)} in cash on delivery. We’re getting it ready.`
            : 'Payment successful. Your order is confirmed and being prepared.'}
        </Text>
        <Text style={styles.thankYou}>You’ve chosen life. Thank you.</Text>

        <View style={styles.choiceCard}>
          <Text style={styles.choiceLabel}>YOUR CLEAN-FOOD CHOICE</Text>
          <CleanBadges items={CLEAN_CHOICE} compact />
        </View>

        <View style={styles.orderNumberCard}>
          <Text style={styles.orderNumberLabel}>ORDER NUMBER</Text>
          <Text style={styles.orderNumberValue}>{order.orderNumber}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          testID="order-placed-track"
          label="Track order"
          icon="truck"
          onPress={() => navigation.replace('Tracking', { orderId: route.params.orderId })}
        />
        <PrimaryButton
          testID="order-placed-home"
          label="Back to home"
          kind="ghost"
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
        />
      </View>
      </LinearGradient>
    </ScreenContainer>
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
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamily.bold, fontSize: 24, color: colors.text, marginTop: 8 },
  subtitle: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  thankYou: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.primaryDark, marginTop: 2 },
  choiceCard: {
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 12,
    maxWidth: 300,
    gap: 6,
  },
  choiceLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted },
  orderNumberCard: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg + 2,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  orderNumberLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted },
  orderNumberValue: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text, letterSpacing: 0.3, marginTop: 2 },
  footer: { paddingHorizontal: 24, paddingBottom: 20, gap: 10 },
});
