import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { AvatarUpload, PrimaryButton, ScreenContainer } from '../../components';
import BackButton from '../../components/BackButton';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { showToast } from '../../utils/toast';
import { isValidEmail, isValidPersonName } from '../../utils/validation';

export default function ProfileSetupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { completeSignupProfile } = useAuth();
  const { mergeGuestCartOnLogin } = useCart();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Web-parity: name 2–60 chars letters/spaces/.'-; email optional but valid
  // (selorg-web-app/src/lib/validation.ts).
  const valid = isValidPersonName(fullName) && (!email.trim() || isValidEmail(email));

  const onSubmit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    try {
      await completeSignupProfile(fullName.trim(), email.trim() || undefined);
      await mergeGuestCartOnLogin();
      navigation.navigate('LocationPermission');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <BackButton onPress={() => navigation.goBack()} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.headTextWrap}>
            <Text style={styles.title}>Let&rsquo;s get to know you</Text>
            <Text style={styles.sub}>This helps us serve you better</Text>
          </View>

          <AvatarUpload
            preferIconPlaceholder
            nameInitial={fullName}
            size={104}
            onPress={() => showToast('Photo upload coming soon', 'info')}
            style={styles.avatar}
          />

          <Text style={styles.fieldLabel}>Full Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Email (optional)</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        <PrimaryButton
          label={loading ? 'Creating…' : 'Continue'}
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
  headTextWrap: { alignItems: 'center' },
  title: { fontFamily: fontFamily.bold, fontSize: 23, color: colors.text },
  sub: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted, marginTop: 6 },
  avatar: { marginVertical: spacing.lg - 2 },
  fieldLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textMuted, letterSpacing: 0.2 },
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
  footer: { paddingHorizontal: spacing.md + 8, paddingBottom: spacing.md },
});
