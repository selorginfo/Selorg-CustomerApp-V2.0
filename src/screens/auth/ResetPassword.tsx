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
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';

export default function ResetPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { resetPassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const valid = isPasswordValid(password) && confirm.length > 0 && confirm === password;

  const onSubmit = async () => {
    if (!isPasswordValid(password)) {
      showToast('Password doesn’t meet the requirements', 'err');
      return;
    }
    if (confirm !== password) {
      showToast('Passwords do not match', 'err');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(password);
      showToast('Password reset · please log in', 'ok');
      navigation.reset({ index: 0, routes: [{ name: 'EnterMobile' }] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <BackButton onPress={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.sub}>Create a new password for your account</Text>

          <PasswordField label="New Password" value={password} onChangeText={setPassword} />
          <View style={{ marginTop: spacing.md }}>
            <PasswordField label="Confirm Password" value={confirm} onChangeText={setConfirm} />
          </View>
          <PasswordRules password={password} />
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        <PrimaryButton
          label={loading ? 'Resetting…' : 'Reset Password'}
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
  title: { fontFamily: fontFamily.bold, fontSize: 26, color: colors.text },
  sub: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.textMuted, marginTop: 8, lineHeight: 20, marginBottom: spacing.md + 6 },
  footer: { paddingHorizontal: spacing.md + 8, paddingBottom: spacing.md },
});
