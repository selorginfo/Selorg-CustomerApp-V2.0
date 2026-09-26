import React, { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, shadows } from '../../theme';
import {
  ScreenContainer,
  Header,
  StatusPill,
  PrimaryButton,
  StateView,
  Icon,
  OrderOptionsSheet,
  RateOrderPrompt,
} from '../../components';
import type { OrderOption } from '../../components';
import CancelOrderSheet from '../../components/CancelOrderSheet';
import OrderTimeline from '../../components/OrderTimeline';
import { useOrders } from '../../context/OrdersContext';
import { useSupport } from '../../context/SupportContext';
import { useAddress } from '../../context/AddressContext';
import { formatCurrency } from '../../utils/format';
import { RootStackParamList } from '../../navigation/types';

const PAY_LABEL: Record<string, string> = {
  paid: 'Paid',
  cod_pending: 'Cash on delivery',
  pending: 'Payment pending',
  failed: 'Payment failed',
};

export default function OrderDetail() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'OrderDetail'>>();
  const { orders, canCancel, reorder, rateOrder } = useOrders();
  const { newTicket } = useSupport();
  const { addresses } = useAddress();
  const [cancelVisible, setCancelVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [ratePromptVisible, setRatePromptVisible] = useState(false);

  const order = orders.find(o => o.id === route.params?.orderId);

  if (!order) {
    return (
      <ScreenContainer>
        <Header title="Order Details" onBack={() => navigation.goBack()} />
        <StateView
          kind="empty"
          icon="box"
          title="Order not found"
          message="This order may have been removed."
          ctaLabel="Back to orders"
          onCta={() => navigation.navigate('Orders')}
        />
      </ScreenContainer>
    );
  }

  const address = addresses.find(a => a.id === order.addressId);
  const placedDate = new Date(order.placedAt).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const delivered = order.status === 'delivered';

  const handleNeedHelp = async () => {
    const ticket = await newTicket();
    navigation.navigate('TicketDetail', { ticketId: ticket.id });
  };

  // Plain computation, not useMemo: this runs after an early return above,
  // so a hook here would violate the rules of hooks.
  const menuOptions: OrderOption[] = (() => {
    const list: OrderOption[] = [];
    if (canCancel(order)) {
      list.push({
        key: 'cancel',
        icon: 'x',
        label: 'Cancel order',
        description: 'Stop this order & get a refund',
        danger: true,
        onPress: () => setCancelVisible(true),
      });
    }
    if (delivered) {
      list.push({
        key: 'return',
        icon: 'refund',
        label: 'Return / report issue',
        description: 'Request a return or refund',
        onPress: () => navigation.navigate('ReturnRequest', { orderId: order.id }),
      });
    }
    list.push({
      key: 'invoice',
      icon: 'file',
      label: 'Download invoice',
      description: 'View & save your tax invoice',
      onPress: () => navigation.navigate('Invoice', { orderId: order.id }),
    });
    list.push({
      key: 'help',
      icon: 'chat',
      label: 'Need help',
      description: 'Chat with support about this order',
      onPress: handleNeedHelp,
    });
    return list;
  })();

  return (
    <ScreenContainer>
      <View testID="order-detail" style={styles.flex}>
      <Header
        title={`#${order.orderNumber}`}
        subtitle={placedDate}
        onBack={() => navigation.goBack()}
        right={
          <Pressable style={styles.menuBtn} onPress={() => setMenuVisible(true)} hitSlop={8} accessibilityLabel="Order options">
            <Icon name="moreVert" size={20} color={colors.text} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statusRow}>
          <StatusPill status={order.status} />
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{order.items.length} item{order.items.length === 1 ? '' : 's'}</Text>
          {order.items.map((item, idx) => (
            <View key={item.id + idx} style={[styles.itemRow, idx > 0 && styles.itemRowDivider]}>
              <View style={styles.thumbWrap}>
                <Image source={item.image as ImageSourcePropType} style={styles.thumb} resizeMode="contain" />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.itemMeta}>{item.unit} · Qty {item.quantity}</Text>
              </View>
              <Text style={styles.itemTotal}>{formatCurrency(item.price * item.quantity)}</Text>
            </View>
          ))}
        </View>

        {/* Mini timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order status</Text>
          <View style={styles.timelineWrap}>
            <OrderTimeline order={order} compact />
          </View>
        </View>

        {/* Bill summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bill summary</Text>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Item total</Text>
            <Text style={styles.billValue}>{formatCurrency(order.itemTotal)}</Text>
          </View>
          {order.discount > 0 ? (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Discount</Text>
              <Text style={[styles.billValue, { color: colors.primary }]}>−{formatCurrency(order.discount)}</Text>
            </View>
          ) : null}
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery fee</Text>
            <Text style={styles.billValue}>{order.deliveryFee === 0 ? 'FREE' : formatCurrency(order.deliveryFee)}</Text>
          </View>
          {order.tip > 0 ? (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Tip</Text>
              <Text style={styles.billValue}>{formatCurrency(order.tip)}</Text>
            </View>
          ) : null}
          <View style={styles.dashedDivider} />
          <View style={styles.billRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCurrency(order.totalBill)}</Text>
          </View>
          <Text style={styles.payLabel}>Payment: {PAY_LABEL[order.paymentStatus] || order.paymentStatus}</Text>
        </View>

        {/* Delivery address */}
        {address ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Delivery address</Text>
            <Text style={styles.addrLabel}>{address.label}</Text>
            <Text style={styles.addrText}>{address.line1}, {address.line2 ? `${address.line2}, ` : ''}{address.city} {address.pincode}</Text>
          </View>
        ) : null}

        {/* Actions — everything else lives in the ⋮ options sheet. */}
        {delivered ? (
          <View style={styles.actions}>
            <PrimaryButton
              label="Reorder"
              icon="cart"
              onPress={() => {
                void reorder(order).then(ok => {
                  if (ok) navigation.navigate('Checkout');
                });
              }}
            />
            <PrimaryButton
              label="Write a review"
              kind="ghost"
              icon="star"
              onPress={() => setRatePromptVisible(true)}
            />
          </View>
        ) : null}
      </ScrollView>

      <OrderOptionsSheet visible={menuVisible} onClose={() => setMenuVisible(false)} options={menuOptions} />

      <RateOrderPrompt
        visible={ratePromptVisible}
        order={order}
        onClose={() => setRatePromptVisible(false)}
        onSubmit={(stars, comment) => rateOrder(order.id, stars, comment || undefined)}
      />

      <CancelOrderSheet visible={cancelVisible} order={order} onClose={() => setCancelVisible(false)} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  flex1: { flex: 1 },
  statusRow: { flexDirection: 'row' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.card,
  },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  itemRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  thumbWrap: {
    width: 46,
    height: 46,
    borderRadius: radii.md + 2,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '80%', height: '80%' },
  itemName: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.text },
  itemMeta: { fontFamily: fontFamily.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  itemTotal: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  timelineWrap: { marginTop: 4 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  billLabel: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.textMuted },
  billValue: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.text },
  dashedDivider: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.border, marginVertical: 8 },
  totalLabel: { fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.text },
  totalValue: { fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.text },
  payLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 8 },
  addrLabel: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.text },
  addrText: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  actions: { gap: 10 },
  menuBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
