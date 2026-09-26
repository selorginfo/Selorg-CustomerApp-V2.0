import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import BottomSheet from './BottomSheet';
import PrimaryButton from './PrimaryButton';
import StateView from './StateView';
import { useOrders } from '../context/OrdersContext';
import type { Order } from '../context/OrdersContext';

const STATUS_LABELS: Record<string, string> = {
  'getting-packed': 'Getting packed',
  'on-the-way': 'On the way',
  arrived: 'Rider arrived',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const REASONS = [
  'Ordered by mistake',
  'Delivery taking too long',
  'Want to change items',
  'Found a better price',
  'Other',
];

interface Props {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
}

export default function CancelOrderSheet({ visible, order, onClose }: Props) {
  const { cancelOrder, canCancel } = useOrders();
  const [reason, setReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    if (loading) return;
    setReason(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!order || loading) return;
    setLoading(true);
    await cancelOrder(order, reason || undefined);
    setLoading(false);
    setReason(null);
    onClose();
  };

  // Design shows a blocked state rather than the reason list once the order
  // has moved past the free-cancellation window.
  if (order && !canCancel(order)) {
    return (
      <BottomSheet visible={visible} onClose={handleClose} title="Cancel order">
        <StateView
          kind="error"
          icon="alert"
          title="Can't cancel this order"
          message={`This order is already being fulfilled (${STATUS_LABELS[order.status] || order.status}). Contact support if you need help.`}
          ctaLabel="Close"
          onCta={handleClose}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title="Cancel order">
      {order ? <Text style={styles.orderNo}>#{order.orderNumber}</Text> : null}

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          You&apos;re within the free-cancellation window — no fee, full refund to your original payment method.
        </Text>
      </View>

      <Text style={styles.q}>Why are you cancelling?</Text>

      {REASONS.map(r => {
        const active = reason === r;
        return (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            style={[styles.reasonRow, { borderColor: active ? colors.primary : colors.border }]}
          >
            <View
              style={[
                styles.radio,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.white },
              ]}
            />
            <Text style={styles.reasonLabel}>{r}</Text>
          </Pressable>
        );
      })}

      <View style={styles.footer}>
        <PrimaryButton
          label={loading ? 'Cancelling…' : 'Confirm cancellation'}
          kind="danger"
          onPress={handleConfirm}
          disabled={loading}
          loading={loading}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  orderNo: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.textMuted, marginTop: -10, marginBottom: 14 },
  notice: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.primaryDark, lineHeight: 17 },
  q: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text, marginBottom: 12 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderRadius: radii.lg + 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  reasonLabel: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.text },
  footer: { marginTop: 6 },
});
