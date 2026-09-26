import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, shadows } from '../../theme';
import { ScreenContainer, Header, StateView } from '../../components';
import { useRefunds } from '../../context/RefundsContext';
import { formatCurrency } from '../../utils/format';
import { RootStackParamList } from '../../navigation/types';

const REFUND_STATUS_META: Record<string, { label: string; c: string; bg: string }> = {
  pending: { label: 'Pending', c: '#B5741A', bg: '#FAF1DF' },
  approved: { label: 'Approved', c: '#2B6C8C', bg: '#E4F0F6' },
  processed: { label: 'Processed', c: '#2F7D32', bg: '#EAF1E1' },
  completed: { label: 'Completed', c: '#2F7D32', bg: '#EAF1E1' },
  rejected: { label: 'Rejected', c: '#D32F2F', bg: '#FDECEC' },
};

const FALLBACK_META = REFUND_STATUS_META.pending;

export default function Refunds() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { refunds } = useRefunds();

  if (refunds.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Refunds & Returns" onBack={() => navigation.goBack()} />
        <StateView
          kind="empty"
          icon="refund"
          title="No refunds"
          message="Any refunds or returns you request will appear here."
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header title="Refunds & Returns" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {refunds.map(r => {
          const meta = REFUND_STATUS_META[r.status] || FALLBACK_META;
          const date = new Date(r.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          return (
            <Pressable
              key={r.id}
              style={styles.card}
              onPress={() => navigation.navigate('RefundDetail', { refundId: r.id })}
            >
              <View style={styles.topRow}>
                <View style={styles.flex1}>
                  <Text style={styles.amount}>{formatCurrency(r.amount)} · #{r.orderNumber}</Text>
                  <Text style={styles.reason}>{r.reasonText} · to {r.method === 'wallet' ? 'wallet' : 'original payment'}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.pillLabel, { color: meta.c }]}>{meta.label}</Text>
                </View>
              </View>
              <Text style={styles.date}>{date}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  flex1: { flex: 1 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.card,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  amount: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  reason: { fontFamily: fontFamily.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 3 },
  pill: { borderRadius: radii.md, paddingVertical: 5, paddingHorizontal: 10 },
  pillLabel: { fontFamily: fontFamily.bold, fontSize: 11 },
  date: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, marginTop: 10 },
});
