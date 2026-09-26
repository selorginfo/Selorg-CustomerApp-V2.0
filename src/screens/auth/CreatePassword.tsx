import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton, ScreenContainer } from '../../components';
import BackButton from '../../components/BackButton';
import PasswordField from '../../components/PasswordField';
import PasswordRules, { isPasswordValid } from '../../components/PasswordRules';
import { colors, fontFamily, spacing } from '../../theme';
import { showToast } from '../../utils/toast';

export default function CreatePasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const valid = isPasswordValid(password) && confirm.length > 0 && confirm === password;

  const onSubmit = () => {
    if (!isPasswordValid(password)) {
      showToast('Password doesn’t meet the requirements', 'err');
      return;
    }
    if (confirm !== password) {
      showToast('Passwords do not match', 'err');
      return;
    }
    setLoading(true);
    // Password capture only — account creation already happened via OTP verify
    // for this signup path, so we just move on to the success screen.
    setTimeout(() => {
      setLoading(false);
      navigation.navigate('AuthSuccess', { mode: 'signup' });
    }, 400);
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <BackButton onPress={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create Password</Text>
          <Text style={styles.sub}>Set a strong password to secure your account</Text>

          <PasswordField label="Password" value={password} onChangeText={setPassword} />
          <View style={{ marginTop: spacing.md }}>
            <PasswordField label="Confirm Password" value={confirm} onChangeText={setConfirm} />
          </View>
          <PasswordRules password={password} />
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        <PrimaryButton
          label={loading ? 'Creating…' : 'Create Account'}
          onPress={onSubmit}
          disabled={!valid || loading}
          loading={loading}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.md + 8, paddingBottom: spacing.lg },
  title: { fontFamily: fontFamily.bold, fontSize: 24, color: colors.text },
  sub: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textMuted, marginTop: 8, lineHeight: 20, marginBottom: spacing.md + 6 },
  footer: { paddingHorizontal: spacing.md + 8, paddingBottom: spacing.md },
});
