import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton, ScreenContainer } from '../../components';
import BackButton from '../../components/BackButton';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ForgotScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { sendOtp } = useAuth();
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);

  const valid = contact.trim().length > 0;

  const onSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      const trimmed = contact.trim();
      const identifier = EMAIL_RE.test(trimmed) ? { email: trimmed } : { phone: trimmed };
      const res = await sendOtp(identifier, 'reset');
      if (res.success) {
        navigation.navigate('Otp');
      } else {
        showToast(res.message || 'Could not send code', 'err');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <BackButton onPress={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Forgot Password?</Text>
          <Text style={styles.sub}>Enter your registered mobile number or email address</Text>
          <TextInput
            value={contact}
            onChangeText={setContact}
            placeholder="Enter mobile number or email"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="none"
            style={styles.input}
          />
          <View style={styles.ctaWrap}>
            <PrimaryButton
              label={loading ? 'Sending…' : 'Send OTP'}
              onPress={onSubmit}
              disabled={!valid || loading}
              loading={loading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.md + 8, paddingBottom: spacing.lg },
  title: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.text },
  sub: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textMuted, marginTop: 8, lineHeight: 20, marginBottom: spacing.md + 6 },
  input: {
    width: '100%',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.xl - 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.text,
  },
  ctaWrap: { marginTop: spacing.lg - 4 },
});
