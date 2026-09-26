import React, { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, shadows } from '../../theme';
import { ScreenContainer, Header, PrimaryButton, StateView } from '../../components';
import { useOrders } from '../../context/OrdersContext';
import { useRefunds } from '../../context/RefundsContext';
import { RootStackParamList } from '../../navigation/types';

const REASONS = [
  'Damaged product',
  'Missing item',
  'Wrong item delivered',
  'Quality not as expected',
  'Other',
];

export default function ReturnRequest() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ReturnRequest'>>();
  const { orders } = useOrders();
  const { submitReturn } = useRefunds();

  const order = orders.find(o => o.id === route.params?.orderId);
  const [itemId, setItemId] = useState<string | null>(order?.items[0]?.id ?? null);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!order) {
    return (
      <ScreenContainer>
        <Header title="Return / report" onBack={() => navigation.goBack()} />
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

  const canSubmit = !!itemId && !!reason && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !reason) return;
    setSubmitting(true);
    const item = order.items.find(i => i.id === itemId);
    const reasonText = item ? `${reason} — ${item.name}${comment ? ` (${comment})` : ''}` : reason;
    await submitReturn(order, reasonText, reason);
    setSubmitting(false);
    navigation.navigate('Refunds');
  };

  return (
    <ScreenContainer>
      <Header title="Return / report" subtitle={`#${order.orderNumber}`} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Which item?</Text>
        <View style={styles.itemList}>
          {order.items.map(item => {
            const active = itemId === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setItemId(item.id)}
                style={[styles.itemRow, { borderColor: active ? colors.primary : colors.border }]}
              >
                <View style={[styles.radio, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.white }]} />
                <View style={styles.thumbWrap}>
                  <Image source={item.image as ImageSourcePropType} style={styles.thumb} resizeMode="contain" />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemMeta}>{item.unit} · Qty {item.quantity}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>What went wrong?</Text>
        <View style={styles.reasonList}>
          {REASONS.map(r => {
            const active = reason === r;
            return (
              <Pressable
                key={r}
                onPress={() => setReason(r)}
                style={[styles.reasonRow, active && styles.reasonRowOn]}
              >
                <View style={[styles.reasonRadio, active && styles.reasonRadioOn]} />
                <Text style={styles.reasonLabel}>{r}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.commentCard}>
          <Text style={styles.commentLabel}>ADD A NOTE (optional)</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Tell us more…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={comment}
            onChangeText={setComment}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={submitting ? 'Submitting…' : 'Submit request'}
          disabled={!canSubmit}
          onPress={handleSubmit}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  reasonList: { gap: 10 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg + 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  reasonRowOn: { borderColor: colors.primary },
  reasonRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  reasonRadioOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  reasonLabel: { flex: 1, minWidth: 0, fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  content: { padding: 16, paddingBottom: 24, gap: 14 },
  flex1: { flex: 1 },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  itemList: { gap: 10 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderRadius: radii.lg + 1,
    padding: 12,
  },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  thumbWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '80%', height: '80%' },
  itemName: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.text },
  itemMeta: { fontFamily: fontFamily.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderRadius: radii.round, paddingVertical: 9, paddingHorizontal: 14 },
  chipLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  commentCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.card,
  },
  commentLabel: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.textMuted, letterSpacing: 0.4, marginBottom: 8 },
  commentInput: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.text, minHeight: 70 },
  footer: { padding: 16, paddingTop: 6 },
});
