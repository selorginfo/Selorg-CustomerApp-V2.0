import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import LoadMoreFooter from '../../components/LoadMoreFooter';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheet, Header, Icon, ScreenContainer, StateView } from '../../components';
import type { IconName } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { formatCurrency } from '../../utils/format';
import WorldlineCheckoutWebView from '../../components/WorldlineCheckoutWebView';

const TOPUP_PRESETS = [100, 250, 500];
import type { WalletTxn } from '../../context/WalletContext';
import { TOPUP_MAX, TOPUP_MIN, useWallet } from '../../context/WalletContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Method = 'upi' | 'cards' | 'wallets' | 'netbanking';

const SRC_ICON: Record<string, IconName> = {
  refund: 'refund',
  order_payment: 'cart',
  payment_topup: 'plus',
};

const METHODS: { id: Method; label: string; icon: IconName }[] = [
  { id: 'upi', label: 'UPI', icon: 'card' },
  { id: 'cards', label: 'Cards', icon: 'card' },
  { id: 'wallets', label: 'Wallets', icon: 'wallet' },
  { id: 'netbanking', label: 'Net Banking', icon: 'bank' },
];

function shortDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function WalletScreen() {
  const navigation = useNavigation<Nav>();
  const { wallet, refreshWallet, reloadWallet, hasMore, loadingMore, loadMore, topUp, topUpSessionPayload, completeTopUp, cancelTopUp, topUpProcessing } = useWallet();

  // Re-fetch every time the screen is shown so status changes made elsewhere
  // (admin, rider, another device) appear without restarting the app.
  useFocusEffect(
    React.useCallback(() => {
      reloadWallet();
    }, [reloadWallet]),
  );

  const [amount, setAmount] = useState<number>(TOPUP_PRESETS[0]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [processing, setProcessing] = useState(false);

  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshWallet();
    } finally {
      setRefreshing(false);
    }
  };

  const selectChip = (a: number) => {
    setAmount(a);
    setCustomOpen(false);
  };

  const openCustom = () => {
    setCustomOpen(true);
    setCustomVal('');
    setAmount(0);
  };

  const onCustomChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setCustomVal(digits);
    setAmount(Number(digits) || 0);
  };

  const amountOk = amount >= TOPUP_MIN && amount <= TOPUP_MAX;
  const amountHint =
    customOpen && customVal && !amountOk
      ? `Enter ₹${TOPUP_MIN} – ₹${TOPUP_MAX.toLocaleString('en-IN')}`
      : null;

  const onSelectMethod = async (method: Method) => {
    if (!amountOk || processing) return;
    setProcessing(true);
    try {
      const started = await topUp(amount, method);
      if (started) {
        setSheetVisible(false);
        setCustomOpen(false);
        setCustomVal('');
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ScreenContainer>
      <View testID="wallet-screen" style={styles.flex}>
      <Header title="Selorg Wallet" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.heroWatermark} pointerEvents="none">
            <Icon name="wallet" size={120} color={colors.white} strokeWidth={1.2} />
          </View>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>Selorg Wallet Balance</Text>
            <Pressable onPress={onRefresh} disabled={refreshing} style={styles.refreshBtn}>
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Icon name="refresh" size={14} color={colors.white} strokeWidth={2.4} />
              )}
              <Text style={styles.refreshLabel}>Refresh</Text>
            </Pressable>
          </View>
          <Text style={styles.heroBalance} testID="wallet-balance">{formatCurrency(wallet.balance)}</Text>

          <View style={styles.chipRow}>
            {TOPUP_PRESETS.map((a: number) => {
              const active = amount === a && !customOpen;
              return (
                <Pressable key={a} onPress={() => selectChip(a)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{formatCurrency(a)}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={openCustom} style={[styles.chip, customOpen && styles.chipActive]}>
              <Text style={[styles.chipLabel, customOpen && styles.chipLabelActive]}>Custom</Text>
            </Pressable>
          </View>

          {customOpen ? (
            <View style={styles.customWrap}>
              <Text style={styles.customPrefix}>₹</Text>
              <TextInput
                autoFocus
                value={customVal}
                onChangeText={onCustomChange}
                keyboardType="number-pad"
                placeholder="Amount"
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={styles.customInput}
                maxLength={6}
              />
            </View>
          ) : null}
          {amountHint ? <Text style={styles.amountHint}>{amountHint}</Text> : null}

          <View style={styles.addWrap}>
            <Pressable
              onPress={() => amountOk && setSheetVisible(true)}
              disabled={!amountOk}
              style={[styles.addBtn, !amountOk && styles.addBtnDisabled]}
              testID="wallet-add-money"
              accessibilityRole="button"
              accessibilityLabel="Add money to wallet"
            >
              <Icon name="plus" size={16} color={colors.primaryDark} strokeWidth={2.4} />
              <Text style={styles.addLabel}>Add {formatCurrency(amount || 0)}</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Text style={styles.txnTitle}>Transaction History</Text>
        {wallet.txns.length === 0 ? (
          <View testID="wallet-transactions">
          <StateView
            kind="empty"
            title="No transactions yet"
            message="Add money or place an order to see your wallet activity here."
            icon="wallet"
          />
          </View>
        ) : (
          <View style={styles.txnGroup} testID="wallet-transactions">
            {wallet.txns.map((t: WalletTxn, i: number) => (
              <View key={t.id} style={[styles.txnRow, i < wallet.txns.length - 1 && styles.txnRowBorder]}>
                <View style={styles.txnIcon}>
                  <Icon name={SRC_ICON[t.source] || 'card'} size={18} color={colors.primary} />
                </View>
                <View style={styles.txnTextWrap}>
                  <Text style={styles.txnNote}>{t.note}</Text>
                  <Text style={styles.txnDate}>{shortDate(t.ts)}</Text>
                </View>
                <Text style={[styles.txnAmount, { color: t.type === 'credit' ? colors.primary : colors.text }]}>
                  {t.type === 'credit' ? '+' : '−'}{formatCurrency(t.amount)}
                </Text>
              </View>
            ))}
          </View>
        )}
        <LoadMoreFooter hasMore={hasMore} loading={loadingMore} onPress={loadMore} />
      </ScrollView>

      <BottomSheet visible={sheetVisible} onClose={() => !processing && setSheetVisible(false)}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.sheetHeader}
        >
          <View style={styles.sheetHeaderIcon}>
            <Icon name="wallet" size={22} color={colors.white} />
          </View>
          <View style={styles.sheetHeaderText}>
            <Text style={styles.sheetMerchant}>SELORG TECH PRIVATE LTD</Text>
            <Text style={styles.sheetAmount}>{formatCurrency(amount)}</Text>
          </View>
          {!processing ? (
            <Pressable
              onPress={() => setSheetVisible(false)}
              style={styles.sheetClose}
              hitSlop={8}
              testID="wallet-cancel"
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Icon name="x" size={16} color={colors.white} />
            </Pressable>
          ) : null}
        </LinearGradient>

        <View style={styles.secureStrip}>
          <Icon name="lock" size={14} color={colors.primaryDark} />
          <Text style={styles.secureLabel}>Secured with industry-standard encryption</Text>
        </View>

        {processing ? (
          <View style={styles.processingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.processingTitle}>Processing…</Text>
            <Text style={styles.processingSub}>Adding {formatCurrency(amount)} to your Selorg wallet.</Text>
          </View>
        ) : (
          <View style={styles.methodSection}>
            <Text style={styles.methodHeading}>All Payment Options</Text>
            <View style={styles.methodGrid}>
              {METHODS.map(m => (
                <Pressable key={m.id} onPress={() => onSelectMethod(m.id)} style={styles.methodBtn}>
                  <View style={styles.methodIconTile}>
                    <Icon name={m.icon} size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.methodLabel}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.poweredBy}>Powered by Worldline · BHIM UPI supported</Text>
          </View>
        )}
      </BottomSheet>

      {topUpSessionPayload ? (
        <WorldlineCheckoutWebView
          visible
          sessionPayload={topUpSessionPayload}
          cancelTestID="wallet-cancel"
          onComplete={async ({ url, response }) => {
            if (!topUpProcessing) await completeTopUp(response ?? url);
          }}
          onCancel={cancelTopUp}
        />
      ) : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  hero: { borderRadius: radii.xxl + 2, padding: 20, marginBottom: spacing.lg, overflow: 'hidden' },
  heroWatermark: { position: 'absolute', right: -10, bottom: -8, opacity: 0.18 },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: 'rgba(255,255,255,0.85)' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: radii.round,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  refreshLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.white },
  heroBalance: { fontFamily: fontFamily.bold, fontSize: 38, color: colors.white, marginTop: 6 },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radii.round,
    paddingVertical: 7,
    paddingHorizontal: 15,
  },
  chipActive: { backgroundColor: colors.white },
  chipLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.white },
  chipLabelActive: { color: colors.primaryDark },
  customWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    maxWidth: 200,
  },
  customPrefix: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.white },
  customInput: { flex: 1, fontFamily: fontFamily.bold, fontSize: 17, color: colors.white, paddingVertical: 10 },
  addWrap: { marginTop: 14 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  addBtnDisabled: { opacity: 0.6 },
  addLabel: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.primaryDark },
  txnTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text, marginBottom: 12 },
  txnGroup: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  txnRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  txnIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnTextWrap: { flex: 1 },
  txnNote: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.text },
  txnDate: { fontFamily: fontFamily.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  txnAmount: { fontFamily: fontFamily.bold, fontSize: 14 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: -20,
    marginTop: -6,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  sheetHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderText: { flex: 1, minWidth: 0 },
  sheetMerchant: { fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.white },
  sheetAmount: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.white, marginTop: 1 },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: -20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.tint,
  },
  secureLabel: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.primaryDark },
  methodSection: { paddingTop: 18 },
  amountHint: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.white, marginTop: 6, opacity: 0.9 },
  methodHeading: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text, marginBottom: 12 },
  poweredBy: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  methodBtn: {
    width: '48%',
    minWidth: 0,
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  methodIconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text },
  processingWrap: { alignItems: 'center', gap: 14, paddingVertical: 40 },
  processingTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text },
  processingSub: { fontFamily: fontFamily.medium, fontSize: 12.5, color: colors.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
});
