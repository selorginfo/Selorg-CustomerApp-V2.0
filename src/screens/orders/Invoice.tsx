import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, shadows } from '../../theme';
import { ScreenContainer, Header, PrimaryButton, StateView, SkeletonList } from '../../components';
import { useOrders } from '../../context/OrdersContext';
import { useAddress } from '../../context/AddressContext';
import { ordersApi } from '../../services/orders.service';
import type { OrderInvoice } from '../../services/orders.service';
import { formatCurrency } from '../../utils/format';
import { showToast } from '../../utils/toast';
import { RootStackParamList } from '../../navigation/types';

const PAY_LABEL: Record<string, string> = {
  paid: 'Paid',
  cod_pending: 'Cash on delivery',
  pending: 'Payment pending',
  failed: 'Payment failed',
};

export default function Invoice() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Invoice'>>();
  const { orders } = useOrders();
  const { addresses } = useAddress();
  const [invoice, setInvoice] = useState<OrderInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  const order = orders.find(o => o.id === route.params?.orderId);

  useEffect(() => {
    const orderId = route.params?.orderId;
    if (!orderId) {
      setLoading(false);
      return;
    }
    ordersApi
      .getInvoice(orderId)
      .then(setInvoice)
      .catch(() => setInvoice(null))
      .finally(() => setLoading(false));
  }, [route.params?.orderId]);

  if (!order) {
    return (
      <ScreenContainer>
        <Header title="Invoice" onBack={() => navigation.goBack()} />
        <StateView
          kind="empty"
          icon="file"
          title="Invoice not found"
          message="This order may have been removed."
          ctaLabel="Back to orders"
          onCta={() => navigation.navigate('Orders')}
        />
      </ScreenContainer>
    );
  }

  const address = addresses.find(a => a.id === order.addressId);
  const placedDate = new Date(order.placedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const items = invoice?.items?.length
    ? invoice.items.map((it, idx) => ({
        id: String(it._id || idx),
        name: String(it.name || 'Item'),
        quantity: Number(it.quantity || 1),
        price: Number(it.price || 0),
      }))
    : order.items;

  const total = invoice?.total ?? order.totalBill;
  const subtotal = invoice?.subtotal ?? order.itemTotal;

  return (
    <ScreenContainer>
      <Header title="Invoice" subtitle={`#${order.orderNumber}`} onBack={() => navigation.goBack()} />

      {loading ? (
        <SkeletonList count={3} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.sheet}>
            <View style={styles.topRow}>
              <View>
                <Text style={styles.brand}>Selorg</Text>
                <Text style={styles.brandSub}>Tax Invoice</Text>
              </View>
              <View style={styles.topRight}>
                <Text style={styles.orderNo}>#{invoice?.invoiceNumber || order.orderNumber}</Text>
                <Text style={styles.orderDate}>{placedDate}</Text>
              </View>
            </View>

            {address ? (
              <View style={styles.billedTo}>
                <Text style={styles.eyebrow}>BILLED TO</Text>
                <Text style={styles.addrLabel}>{address.label}</Text>
                <Text style={styles.addrText}>{address.line1}, {address.line2 ? `${address.line2}, ` : ''}{address.city} {address.pincode}</Text>
              </View>
            ) : null}

            <View style={styles.itemsTable}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.colName]}>Item</Text>
                <Text style={[styles.tableHeaderCell, styles.colQty]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, styles.colPrice]}>Price</Text>
                <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
              </View>
              {items.map((item, idx) => (
                <View key={item.id + idx} style={styles.tableRow}>
                  <Text style={[styles.tableCell, styles.colName]} numberOfLines={2}>{item.name}</Text>
                  <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
                  <Text style={[styles.tableCell, styles.colPrice]}>{formatCurrency(item.price)}</Text>
                  <Text style={[styles.tableCell, styles.colTotal]}>{formatCurrency(item.price * item.quantity)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.totalsBlock}>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Item total</Text>
                <Text style={styles.billValue}>{formatCurrency(subtotal)}</Text>
              </View>
              {order.discount > 0 ? (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Discount</Text>
                  <Text style={[styles.billValue, { color: colors.primary }]}>−{formatCurrency(order.discount)}</Text>
                </View>
              ) : null}
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery</Text>
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
                <Text style={styles.totalLabel}>Total paid</Text>
                <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
              </View>
            </View>

            <Text style={styles.payLabel}>Payment: {PAY_LABEL[order.paymentStatus] || order.paymentStatus}</Text>
          </View>

          <View style={styles.shareWrap}>
            <PrimaryButton
              label="Share / Download"
              icon="download"
              onPress={() => showToast('Invoice ready — download coming soon', 'info')}
            />
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  sheet: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    ...shadows.card,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 14,
  },
  brand: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.primaryDark },
  brandSub: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  topRight: { alignItems: 'flex-end' },
  orderNo: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.text },
  orderDate: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  billedTo: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  eyebrow: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.6 },
  addrLabel: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.text, marginTop: 4 },
  addrText: { fontFamily: fontFamily.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 2, lineHeight: 16 },
  itemsTable: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  tableHeaderRow: { flexDirection: 'row', paddingBottom: 8 },
  tableHeaderCell: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted, letterSpacing: 0.4 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, alignItems: 'center' },
  tableCell: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text },
  colName: { flex: 2.4, paddingRight: 6 },
  colQty: { flex: 0.7, textAlign: 'center' },
  colPrice: { flex: 1.1, textAlign: 'right' },
  colTotal: { flex: 1.2, textAlign: 'right' },
  totalsBlock: { paddingTop: 12 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  billLabel: { fontFamily: fontFamily.medium, fontSize: 12.5, color: colors.textMuted },
  billValue: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.text },
  dashedDivider: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.border, marginVertical: 8 },
  totalLabel: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text },
  totalValue: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text },
  payLabel: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 10 },
  shareWrap: { marginTop: 16 },
});
