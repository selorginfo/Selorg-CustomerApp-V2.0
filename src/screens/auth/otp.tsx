import React, { useEffect, useState } from 'react';
import { BackHandler, Keyboard, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Icon, PrimaryButton, ScreenContainer } from '../../components';
import BackButton from '../../components/BackButton';
import OtpBoxInput from '../../components/OtpBoxInput';
import { colors, fontFamily, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { showToast } from '../../utils/toast';

export default function OtpScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { otpSession, resendCooldown, otpAttemptsLeft, verifyOtp, resendOtp } = useAuth();
  const { mergeGuestCartOnLogin } = useCart();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const secs = Math.max(resendCooldown, 0);
  const cooldownLabel = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const locked = otpAttemptsLeft <= 0;

  const contact = otpSession?.phone
    ? `+91 ${otpSession.phone}`
    : otpSession?.email || 'your contact';

  const goChangeContact = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('EnterMobile', { mode: otpSession?.mode === 'signup' ? 'signup' : 'login' });
    }
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goChangeContact();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpSession?.mode]);

  const onVerify = async () => {
    if (code.length !== 4 || loading || locked) return;
    Keyboard.dismiss();
    setError(null);
    setLoading(true);
    try {
      const res = await verifyOtp(code);
      if (res.success) {
        await mergeGuestCartOnLogin();
        // Reset stack so BACK cannot return to OTP / Onboarding.
        if (res.nextStep === 'profile') {
          navigation.reset({ index: 0, routes: [{ name: 'ProfileSetup' }] });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }
      } else {
        setError(res.message || 'Invalid code, please try again');
        setCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setError(null);
    setCode('');
    const res = await resendOtp();
    if (res.success) {
      showToast(res.message || 'A new code has been sent', 'ok');
    } else if (res.message) {
      setError(res.message);
      showToast(res.message, 'err');
    }
  };

  const trustItems: Array<{ icon: 'clock' | 'shield' | 'leaf'; label: string }> = [
    { icon: 'clock', label: '10-min delivery' },
    { icon: 'shield', label: 'Lab-tested' },
    { icon: 'leaf', label: '100% organic' },
  ];

  return (
    <ScreenContainer background={colors.card} edges={['top', 'bottom']}>
      <BackButton onPress={goChangeContact} testID="otp-back" />
      <View style={styles.body} testID="otp-screen">
        <View style={styles.iconOuter}>
          <Icon name="phone" size={46} color={colors.primary} strokeWidth={1.8} />
          <View style={styles.lockBadge}>
            <Icon name="lock" size={15} color={colors.white} strokeWidth={2.4} />
          </View>
        </View>

        <Text style={styles.title}>Enter OTP</Text>
        <Text style={styles.sub}>We&rsquo;ve sent a 4-digit OTP to</Text>
        <View style={styles.contactRow}>
          <Text style={styles.contactText} testID="otp-contact">{contact}</Text>
          <Text
            style={styles.changeLink}
            onPress={goChangeContact}
            testID="otp-change"
            accessibilityRole="button"
            accessibilityLabel="Change phone number"
          >
            Change
          </Text>
        </View>

        <View style={styles.otpWrap}>
          <OtpBoxInput value={code} onChange={setCode} error={!!error} autoFocus />
        </View>

        {error ? (
          <Text style={styles.errorText} testID="otp-error">
            {error}
          </Text>
        ) : null}
        {!locked && otpAttemptsLeft <= 2 ? (
          <Text style={styles.attemptsText} testID="otp-attempts">
            {otpAttemptsLeft} {otpAttemptsLeft === 1 ? 'attempt' : 'attempts'} left
          </Text>
        ) : null}

        <View style={styles.resendRow}>
          {resendCooldown > 0 ? (
            <Text style={styles.resendMuted} testID="otp-resend-cooldown">
              Didn&rsquo;t receive it? <Text style={styles.resendBold}>Resend in {cooldownLabel}</Text>
            </Text>
          ) : (
            <Text
              style={styles.resendLink}
              onPress={onResend}
              testID="otp-resend"
              accessibilityRole="button"
              accessibilityLabel="Resend OTP"
            >
              Resend OTP
            </Text>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          testID="otp-verify"
          label={loading ? 'Verifying…' : 'Verify OTP'}
          onPress={onVerify}
          disabled={code.length !== 4 || loading || locked}
          loading={loading}
        />
      </View>

      <View style={styles.trustRow}>
        {trustItems.map(t => (
          <View key={t.label} style={styles.trustItem}>
            <View style={styles.trustIconTile}>
              <Icon name={t.icon} size={17} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={styles.trustLabel}>{t.label}</Text>
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md + 10 },
  iconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  lockBadge: {
    position: 'absolute',
    right: 24,
    bottom: 22,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  title: { fontFamily: fontFamily.bold, fontSize: 24, color: colors.text, marginTop: spacing.md + 4 },
  sub: { fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 19 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  contactText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  changeLink: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.primary },
  otpWrap: { marginTop: spacing.lg + 2 },
  errorText: { color: colors.danger, fontFamily: fontFamily.bold, fontSize: 12.5, marginTop: spacing.sm + 6 },
  attemptsText: { color: colors.textMuted, fontFamily: fontFamily.semibold, fontSize: 12, marginTop: spacing.sm },
  resendRow: { marginTop: spacing.md + 2 },
  resendMuted: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted },
  resendBold: { fontFamily: fontFamily.bold, color: colors.text },
  resendLink: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.primary },
  footer: { paddingHorizontal: spacing.md + 10 },
  trustRow: { flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: spacing.md + 6, paddingBottom: spacing.md },
  trustItem: { alignItems: 'center', gap: 6 },
  trustIconTile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted },
});
