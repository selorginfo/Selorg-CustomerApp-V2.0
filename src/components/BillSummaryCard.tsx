import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import { formatCurrency } from '../utils/format';
import { useCart } from '../context/CartContext';

interface RowProps {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}

function Row({ label, value, bold, valueColor }: RowProps) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, bold && styles.labelBold]}>{label}</Text>
      <Text style={[styles.value, bold && styles.valueBold, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Bill breakdown card shared by Cart, Checkout and Payment screens — item
 * total, coupon discount, delivery fee ("FREE" badge styling), tip and the
 * dashed-divider "To pay" grand total. Reads straight from CartContext so
 * every screen that renders it always shows the exact same numbers.
 */
export default function BillSummaryCard() {
  const { itemTotal, discount, deliveryFee, tip, grandTotal } = useCart();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Bill details</Text>
      <Row label="Item total" value={formatCurrency(itemTotal)} />
      {discount > 0 ? (
        <Row label="Coupon discount" value={`− ${formatCurrency(discount)}`} valueColor={colors.primary} />
      ) : null}
      <Row
        label="Delivery fee"
        value={deliveryFee === 0 ? 'FREE' : formatCurrency(deliveryFee)}
        valueColor={deliveryFee === 0 ? colors.primary : colors.text}
      />
      {tip > 0 ? <Row label="Delivery tip" value={formatCurrency(tip)} /> : null}
      <View style={styles.totalWrap}>
        <Row label="To pay" value={formatCurrency(grandTotal)} bold />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 16,
  },
  title: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  label: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.textMuted },
  labelBold: { fontFamily: fontFamily.bold, color: colors.text, fontSize: 14.5 },
  value: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.text },
  valueBold: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.text },
  totalWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderStyle: 'dashed',
    marginTop: 8,
    paddingTop: 8,
  },
});
