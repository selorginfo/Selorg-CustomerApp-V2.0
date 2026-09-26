import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '../theme';
import Icon from './Icon';
import type { Order, OrderStatus } from '../context/OrdersContext';

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'getting-packed', 'on-the-way', 'arrived', 'delivered'];

const STEP_LABELS: Record<OrderStatus, string> = {
  pending: 'Order placed',
  confirmed: 'Order confirmed',
  'getting-packed': 'Getting packed',
  'on-the-way': 'On the way',
  arrived: 'Rider arrived',
  delivered: 'Delivered to your address',
  cancelled: 'Cancelled',
};

interface Props {
  order: Order;
  /** Smaller dots/spacing for use inside cards like OrderDetail. */
  compact?: boolean;
}

export default function OrderTimeline({ order, compact = false }: Props) {
  const cancelled = order.status === 'cancelled';

  if (cancelled) {
    return (
      <View style={styles.cancelledRow}>
        <View style={styles.cancelledDot}>
          <Icon name="x" size={16} color={colors.danger} strokeWidth={2.6} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.cancelledTitle}>Order cancelled</Text>
          <Text style={styles.cancelledSub}>Refund initiated if applicable</Text>
        </View>
      </View>
    );
  }

  const curIdx = STEPS.indexOf(order.status);
  const dotSize = compact ? 20 : 24;

  return (
    <View>
      {STEPS.map((step, idx) => {
        const done = idx <= curIdx;
        const isCurrent = idx === curIdx;
        const last = idx === STEPS.length - 1;
        const entry = order.timeline.find(t => t.status === step);
        const time = entry
          ? new Date(entry.timestamp).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
          : '';

        return (
          <View key={step} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: done ? colors.primary : colors.tint,
                  },
                ]}
              >
                {last ? (
                  <Icon name="pin" size={compact ? 11 : 13} color={done ? colors.white : colors.textMuted} strokeWidth={2.2} />
                ) : done ? (
                  <Icon name="check" size={compact ? 11 : 13} color={colors.white} strokeWidth={3} />
                ) : (
                  <View style={styles.dotInner} />
                )}
              </View>
              {!last ? (
                <View style={[styles.line, { backgroundColor: idx < curIdx ? colors.primary : colors.tint }]} />
              ) : null}
            </View>
            <View style={[styles.labelWrap, { paddingBottom: last ? 0 : compact ? 14 : 20 }]}>
              <Text
                style={[
                  styles.label,
                  {
                    fontFamily: done ? fontFamily.bold : fontFamily.semibold,
                    color: done ? colors.text : colors.textMuted,
                    fontSize: compact ? 12.5 : 13.5,
                  },
                ]}
              >
                {STEP_LABELS[step]}
              </Text>
              {done && time ? <Text style={styles.time}>{time}</Text> : null}
              {isCurrent && !time ? <Text style={styles.timeNow}>In progress</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  row: { flexDirection: 'row' },
  rail: { alignItems: 'center', width: 24 },
  dot: { alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  line: { width: 2, flex: 1, minHeight: 20 },
  labelWrap: { flex: 1, marginLeft: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  label: { flex: 1, paddingRight: 8 },
  time: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.text },
  timeNow: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.primary },
  cancelledRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cancelledDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelledTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.danger },
  cancelledSub: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
