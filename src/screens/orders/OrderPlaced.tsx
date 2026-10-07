import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { AnimatedIcon, CleanBadges, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { useOrders } from '../../context/OrdersContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'OrderPlaced'>;

const CLEAN_CHOICE = ['Pesticide-Free', 'Fertilizer-Free', 'Chemical-Free', 'Non-GMO'];

export default function OrderPlacedScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { orders } = useOrders();
  const order = orders.find(o => o.id === route.params.orderId);

  useEffect(() => {
    if (!order) {
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    }
  }, [order, navigation]);

  if (!order) return null;

  const unpaid = order.paymentStatus === 'pending' || order.paymentStatus === 'failed';
  if (unpaid) {
    return (
      <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.title}>Payment failed</Text>
          <Text style={styles.subtitle}>
            This order was not confirmed. No successful payment was recorded. You can retry payment.
          </Text>
        </View>
        <View style={styles.footer}>
          <PrimaryButton
            label="Retry payment"
            onPress={() => navigation.replace('Payment', { method: 'online' })}
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
