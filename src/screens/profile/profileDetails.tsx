import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AvatarUpload, Header, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services';
import { showToast } from '../../utils/toast';
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

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await authApi.updateProfile({
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      await refreshProfile();
      showToast('Profile updated');
      navigation.goBack();
    } catch {
      showToast('Could not update profile', 'err');
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
            style={styles.input}
          />
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
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>MOBILE NUMBER</Text>
          <View style={[styles.input, styles.inputDisabled]}>
            <Text style={styles.disabledValue}>{user?.phoneNumber || '—'}</Text>
          </View>
          <Text style={styles.caption}>Verified · link a new number to change</Text>
        </View>

        <View style={styles.saveWrap}>
          <PrimaryButton label={saving ? 'Saving…' : 'Save changes'} onPress={onSave} loading={saving} />
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
  disabledValue: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textMuted },
  caption: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.textMuted, marginTop: 6 },
  saveWrap: { marginTop: spacing.md },
});
