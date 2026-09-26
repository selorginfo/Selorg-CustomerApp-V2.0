import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton, ScreenContainer } from '../../components';
import BackButton from '../../components/BackButton';
import PasswordField from '../../components/PasswordField';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';

type Method = 'mobile' | 'email';

export default function LoginPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'LoginPassword'>>();
  const { loginWithPassword } = useAuth();

  const [method, setMethod] = useState<Method>(route.params?.method || 'mobile');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const identifier = method === 'email' ? email.trim() : phone.trim();
  const valid = identifier.length > 0 && password.length > 0;

  const onSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      const res = await loginWithPassword(identifier, password, method);
      if (res.success) {
        navigation.navigate('AuthSuccess', { mode: 'login' });
      } else {
        showToast(res.message || 'Login failed', 'err');
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
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.sub}>Login to continue</Text>

          <View style={styles.methodToggle}>
            {(['mobile', 'email'] as Method[]).map((id) => {
              const on = method === id;
              return (
                <Pressable key={id} onPress={() => setMethod(id)} style={[styles.methodBtn, on && styles.methodBtnOn]}>
                  <Text style={[styles.methodLabel, on && styles.methodLabelOn]}>
                    {id === 'mobile' ? 'Mobile' : 'Email'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {method === 'email' ? (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email Address</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
          ) : (
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Mobile Number</Text>
              <View style={styles.phoneWrap}>
                <Text style={styles.prefix}>+91</Text>
                <TextInput
                  value={phone}
                  onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, '').slice(0, 10))}
                  keyboardType="number-pad"
                  placeholder="10-digit number"
                  placeholderTextColor={colors.textMuted}
                  style={styles.phoneInput}
                  maxLength={10}
                />
              </View>
            </View>
          )}

          <PasswordField label="Password" value={password} onChangeText={setPassword} />

          <Pressable onPress={() => navigation.navigate('Forgot')} style={styles.forgotWrap}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </Pressable>

          <View style={styles.ctaWrap}>
            <PrimaryButton
              label={loading ? 'Logging in…' : 'Login'}
              onPress={onSubmit}
              disabled={!valid || loading}
              loading={loading}
            />
          </View>
          <View style={styles.signupRow}>
            <Text style={styles.signupText}>New here? </Text>
            <Pressable onPress={() => navigation.navigate('EnterMobile', { mode: 'signup' })}>
              <Text style={styles.signupLink}>Create an account</Text>
            </Pressable>
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
  sub: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textMuted, marginTop: 6, marginBottom: spacing.md + 6 },
  methodToggle: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.placeholder,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 4,
    marginBottom: spacing.md + 2,
  },
  methodBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  methodBtnOn: {
    backgroundColor: colors.white,
    shadowColor: '#456e29',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  methodLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textMuted },
  methodLabelOn: { color: colors.primaryDark },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textMuted },
  input: {
    marginTop: 7,
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
  phoneWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 7,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.xl - 2,
    paddingHorizontal: 14,
  },
  prefix: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  phoneInput: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 16, color: colors.text, paddingVertical: 13 },
  forgotWrap: { marginTop: spacing.sm + 4, alignSelf: 'flex-start' },
  forgotText: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },
  ctaWrap: { marginTop: spacing.lg, alignItems: 'center' },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.md },
  signupText: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted },
  signupLink: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.primary },
});
