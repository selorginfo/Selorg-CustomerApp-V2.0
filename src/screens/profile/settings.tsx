import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomSheet, Header, Icon, LogoutConfirmSheet, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { authApi } from '../../services/auth.service';
import { getErrorMessage } from '../../utils/apiError';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const { logout, user } = useAuth();
  const { prefs, togglePref } = useNotifications();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'otp'>('confirm');
  const [sessionId, setSessionId] = useState('');
  const [maskedContact, setMaskedContact] = useState('');
  const [otp, setOtp] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const closeDelete = () => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteStep('confirm');
    setOtp('');
    setDeleteError('');
    setSessionId('');
    setMaskedContact('');
  };

  const openDelete = () => {
    setDeleteStep('confirm');
    setDeleteError('');
    setOtp('');
    setDeleteOpen(true);
  };

  const sendDeleteCode = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const result = await authApi.sendDeleteAccountOtp();
      setSessionId(result.sessionId);
      setMaskedContact(result.maskedContact || user?.phoneNumber || 'your registered contact');
      setOtp('');
      setDeleteStep('otp');
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not send the confirmation code.'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = async () => {
    if (otp.trim().length < 4) {
      setDeleteError('Enter the 4-digit code.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await authApi.confirmDeleteAccount({ sessionId, otp: otp.trim() });
      setDeleteOpen(false);
      logout();
      navigation.reset({ index: 0, routes: [{ name: 'EnterMobile' }] });
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Could not delete your account.'));
      setDeleting(false);
    }
  };

  const confirmLogout = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: 'EnterMobile' }] });
  };

  const toggleRow = (label: string, value: boolean, onChange: () => void, sub?: string) => (
    <View key={label} style={styles.toggleRow}>
      <View style={styles.toggleTextWrap}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub ? <Text style={styles.toggleSub}>{sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#D3DAD2', true: colors.primary }}
        thumbColor={colors.white}
      />
    </View>
  );

  return (
    <ScreenContainer>
      <Header title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.group}>
          {toggleRow('Push notifications', !!prefs.push, () => togglePref('push'))}
          {toggleRow('Order updates', !!prefs.order, () => togglePref('order'), 'Status, delivery & tracking')}
          {toggleRow('Offers & promos', !!prefs.promo, () => togglePref('promo'))}
          {toggleRow('Wallet & refunds', !!prefs.wallet, () => togglePref('wallet'))}
        </View>

        <View style={styles.group}>
          <Pressable onPress={openDelete} style={[styles.linkRow, styles.linkRowLast]} testID="settings-delete">
            <Text style={styles.dangerLabel}>Delete account</Text>
          </Pressable>
        </View>

        <PrimaryButton testID="settings-logout" label="Log out" onPress={() => setLogoutOpen(true)} kind="danger" />
        <Text style={styles.versionLabel}>Selorg · v2.0.0</Text>
      </ScrollView>

      <LogoutConfirmSheet
        visible={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />

      <BottomSheet
        visible={deleteOpen}
        onClose={closeDelete}
        title={deleteStep === 'confirm' ? 'Delete account?' : 'Confirm with code'}
        showClose
      >
        {deleteStep === 'confirm' ? (
          <View style={styles.deleteBody}>
            <View style={styles.deleteIconWrap}>
              <Icon name="alert" size={28} color={colors.danger} strokeWidth={2.2} />
            </View>
            <Text style={styles.deleteTitle}>Delete your Selorg account?</Text>
            <Text style={styles.deleteSub}>
              Your name, mobile number, email, saved addresses, and cart are removed. This cannot be undone.
              Finish or cancel any open order first, and use any wallet balance. We will send a code to confirm
              it is you.
            </Text>
            {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
            <View style={styles.deleteActions}>
              <View style={styles.deleteBtn}>
                <PrimaryButton label="Cancel" kind="ghost" onPress={closeDelete} disabled={deleting} />
              </View>
              <View style={styles.deleteBtn}>
                <PrimaryButton
                  testID="settings-delete-send"
                  label={deleting ? 'Sending…' : 'Send code'}
                  kind="danger"
                  onPress={sendDeleteCode}
                  disabled={deleting}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.deleteBody}>
            <View style={[styles.deleteIconWrap, styles.deleteIconWrapOtp]}>
              <Icon name="shield" size={28} color={colors.primaryDark} strokeWidth={2.2} />
            </View>
            <Text style={styles.deleteTitle}>Enter the verification code</Text>
            <Text style={styles.deleteSub}>We sent a 4-digit code to {maskedContact}.</Text>
            <TextInput
              value={otp}
              onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="4-digit code"
              placeholderTextColor={colors.textMuted}
              style={styles.otpInput}
              testID="settings-delete-otp"
            />
            {deleteError ? <Text style={styles.deleteError}>{deleteError}</Text> : null}
            <View style={styles.deleteActions}>
              <View style={styles.deleteBtn}>
                <PrimaryButton label="Cancel" kind="ghost" onPress={closeDelete} disabled={deleting} />
              </View>
              <View style={styles.deleteBtn}>
                <PrimaryButton
                  testID="settings-delete-confirm"
                  label={deleting ? 'Deleting…' : 'Delete account'}
                  kind="danger"
                  onPress={confirmDelete}
                  disabled={deleting}
                />
              </View>
            </View>
          </View>
        )}
      </BottomSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  sectionLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textMuted, marginBottom: 8, marginLeft: 2 },
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xxl - 2,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleTextWrap: { flex: 1 },
  toggleLabel: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: colors.text },
  toggleSub: { fontFamily: fontFamily.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  linkRow: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkRowLast: { borderBottomWidth: 0 },
  dangerLabel: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: colors.danger },
  versionLabel: {
    textAlign: 'center',
    fontFamily: fontFamily.medium,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: spacing.md - 2,
  },
  deleteBody: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm },
  deleteIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF5F3',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  deleteIconWrapOtp: { backgroundColor: colors.tint },
  deleteTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  deleteSub: {
    fontFamily: fontFamily.medium,
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    maxWidth: 320,
  },
  deleteError: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.danger,
    marginTop: 10,
    textAlign: 'center',
  },
  deleteActions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg, width: '100%' },
  deleteBtn: { flex: 1, minWidth: 0 },
  otpInput: {
    marginTop: spacing.md,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: 6,
    color: colors.text,
    textAlign: 'center',
  },
});
