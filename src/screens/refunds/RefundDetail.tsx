import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, shadows } from '../../theme';
import { ScreenContainer, Header, Icon, PrimaryButton, StateView } from '../../components';
import { useRefunds } from '../../context/RefundsContext';
import { refundsApi } from '../../services/refunds.service';
import { formatCurrency } from '../../utils/format';
import { showToast } from '../../utils/toast';
import { getErrorMessage } from '../../utils/apiError';
import { RootStackParamList } from '../../navigation/types';

const STEPS: { key: 'pending' | 'processing' | 'done'; title: string; desc: string }[] = [
  { key: 'pending', title: 'Requested', desc: 'Request received' },
  { key: 'processing', title: 'Processing', desc: 'Reviewed by support' },
  { key: 'done', title: 'Processed', desc: 'Money sent to your account' },
];

export default function RefundDetail() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'RefundDetail'>>();
  const { refunds, refresh } = useRefunds();
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [saving, setSaving] = useState(false);

  const refund = refunds.find(r => r.id === route.params?.refundId);

  if (!refund) {
    return (
      <ScreenContainer>
        <Header title="Refund details" onBack={() => navigation.goBack()} />
        <StateView
          kind="empty"
          icon="refund"
          title="Refund not found"
          message="This refund may have been removed."
          ctaLabel="Back to refunds"
          onCta={() => navigation.navigate('Refunds')}
        />
      </ScreenContainer>
    );
  }

  const rejected = refund.status === 'rejected';
  const curIdx = rejected ? 0 : refund.status === 'processed' ? 2 : refund.status === 'processing' ? 1 : 0;

  const submitAccount = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await refundsApi.submitBankAccount(refund.id, {
        accountHolder: holder.trim(),
        accountNumber: account.trim(),
        ifsc: ifsc.trim().toUpperCase(),
        bankName: bankName.trim(),
      });
      showToast('Bank account sent to support for verification');
      await refresh();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not save the bank account'));
    } finally {
      setSaving(false);
    }
  };
  const date = new Date(refund.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <ScreenContainer>
      <Header title="Refund details" subtitle={`#${refund.orderNumber}`} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.amountCard}>
          <Text style={styles.eyebrow}>REFUND AMOUNT</Text>
          <Text style={styles.amount}>{formatCurrency(refund.amount)}</Text>
          <Text style={styles.method}>
            To {refund.destination || (refund.method === 'wallet' ? 'Selorg Wallet' : 'original payment method')}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Order</Text>
            <Text style={styles.detailValue}>#{refund.orderNumber}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Reason</Text>
            <Text style={styles.detailValue}>{refund.reasonText}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Requested on</Text>
            <Text style={styles.detailValue}>{date}</Text>
          </View>
          {refund.transactionId ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Transaction ID</Text>
              <Text style={styles.detailValue}>{refund.transactionId}</Text>
            </View>
          ) : null}
        </View>

        {refund.needsBankAccount ? (
          <View style={styles.card}>
            <Text style={styles.stepTitle}>Bank account for the refund</Text>
            <Text style={styles.stepDesc}>The original payment could not be refunded. Support verifies this account before sending the money.</Text>
            <TextInput value={holder} onChangeText={setHolder} placeholder="Account holder" style={styles.input} />
            <TextInput value={account} onChangeText={setAccount} placeholder="Account number" keyboardType="number-pad" style={styles.input} />
            <TextInput value={ifsc} onChangeText={value => setIfsc(value.toUpperCase())} placeholder="IFSC" autoCapitalize="characters" style={styles.input} />
            <TextInput value={bankName} onChangeText={setBankName} placeholder="Bank name" style={styles.input} />
            <PrimaryButton label={saving ? 'Saving…' : 'Send account to support'} onPress={submitAccount} disabled={saving} />
          </View>
        ) : null}

        {rejected ? (
          <View style={styles.rejectedCard}>
            <Icon name="alert" size={20} color={colors.danger} strokeWidth={2.2} />
            <View style={styles.flex1}>
              <Text style={styles.rejectedTitle}>Request rejected</Text>
              <Text style={styles.rejectedDesc}>This refund request could not be approved. Contact support for details.</Text>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            {STEPS.map((step, idx) => {
              const done = idx <= curIdx;
              const last = idx === STEPS.length - 1;
              return (
                <View key={step.key} style={styles.timelineRow}>
                  <View style={styles.rail}>
                    <View style={[styles.dot, { backgroundColor: done ? colors.primary : colors.tint }]}>
                      {done ? <Icon name="check" size={12} color={colors.white} strokeWidth={3} /> : null}
                    </View>
                    {!last ? <View style={[styles.line, { backgroundColor: idx < curIdx ? colors.primary : colors.tint }]} /> : null}
                  </View>
                  <View style={{ paddingBottom: last ? 0 : 16 }}>
                    <Text style={[styles.stepTitle, { color: done ? colors.text : colors.textMuted }]}>{step.title}</Text>
                    <Text style={styles.stepDesc}>{step.desc}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  flex1: { flex: 1 },
  amountCard: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    alignItems: 'center',
    ...shadows.card,
  },
  eyebrow: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.textMuted, letterSpacing: 0.6 },
  amount: { fontFamily: fontFamily.bold, fontSize: 32, color: colors.text, marginTop: 6 },
  method: { fontFamily: fontFamily.medium, fontSize: 12.5, color: colors.textMuted, marginTop: 6 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.card,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { fontFamily: fontFamily.medium, fontSize: 12.5, color: colors.textMuted },
  detailValue: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.text, flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  rejectedCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.xl,
    padding: 16,
  },
  rejectedTitle: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.danger },
  rejectedDesc: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.danger, marginTop: 4, lineHeight: 17 },
  timelineRow: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center', width: 24 },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, minHeight: 18 },
  stepTitle: { fontFamily: fontFamily.bold, fontSize: 14 },
  stepDesc: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
    fontFamily: fontFamily.medium,
    color: colors.text,
  },
});
