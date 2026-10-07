import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AvatarUpload, Header, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services';
import { showToast } from '../../utils/toast';
import { getErrorMessage } from '../../utils/apiError';
import { isValidEmail, isValidPersonName } from '../../utils/validation';
import type { RootStackParamList } from '../../navigation/types';
import { normalizeApiAssetUrl } from '../../config/api';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileDetailsScreen() {
  const navigation = useNavigation<Nav>();
  const { user, refreshProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const avatarUri = user?.avatarUrl ? normalizeApiAssetUrl(user.avatarUrl) : undefined;

  // Same rules as signup: name 2–60 letters/spaces/.'-; email optional but valid.
  const nameError = isValidPersonName(name) ? null : 'Enter your full name (2–60 letters)';
  const emailError = !email.trim() || isValidEmail(email) ? null : 'Enter a valid email address';
  const canSave = !nameError && !emailError && !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // An empty email is sent as "" so clearing the field removes it server-side.
      await authApi.updateProfile({ name: name.trim(), email: email.trim() });
      await refreshProfile();
      showToast('Profile updated');
      navigation.goBack();
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not update profile'), 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <Header title="Edit profile" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <AvatarUpload
          uri={avatarUri}
          nameInitial={name || user?.name || 'U'}
          size={96}
          onPress={() => showToast('Photo upload coming soon', 'info')}
          style={styles.avatar}
        />

        <View style={styles.field}>
          <Text style={styles.label}>FULL NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, !!nameError && styles.inputError]}
          />
          {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, !!emailError && styles.inputError]}
          />
          {emailError ? <Text style={styles.errorText}>{emailError}</Text> : <Text style={styles.caption}>Optional · leave empty to remove</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>MOBILE NUMBER</Text>
          <View style={[styles.input, styles.inputDisabled]}>
            <Text style={styles.disabledValue}>{user?.phoneNumber || '—'}</Text>
          </View>
          <Text style={styles.caption}>Verified · link a new number to change</Text>
        </View>

        <View style={styles.saveWrap}>
          <PrimaryButton label={saving ? 'Saving…' : 'Save changes'} onPress={onSave} loading={saving} disabled={!canSave} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 32 },
  avatar: { marginBottom: spacing.lg },
  field: { marginBottom: spacing.md },
  label: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text,
  },
  inputDisabled: { backgroundColor: colors.white },
  inputError: { borderColor: colors.danger },
  errorText: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.danger, marginTop: 6 },
  disabledValue: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textMuted },
  caption: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, marginTop: 6 },
  saveWrap: { marginTop: spacing.md },
});
