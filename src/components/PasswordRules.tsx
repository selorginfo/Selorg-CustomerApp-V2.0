import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '../theme';
import Icon from './Icon';

export interface PasswordRule {
  ok: boolean;
  label: string;
}

export function getPasswordRules(pw: string): PasswordRule[] {
  const value = pw || '';
  return [
    { ok: value.length >= 8, label: 'At least 8 characters' },
    { ok: /[0-9!@#$%^&*]/.test(value), label: 'Include number or special character' },
    { ok: /[A-Z]/.test(value), label: 'Must contain uppercase letter' },
  ];
}

export function isPasswordValid(pw: string): boolean {
  return getPasswordRules(pw).every((r) => r.ok);
}

interface Props {
  password: string;
}

export default function PasswordRules({ password }: Props) {
  const rules = getPasswordRules(password);
  return (
    <View style={styles.wrap}>
      {rules.map((r, i) => (
        <View key={i} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: r.ok ? colors.primary : '#DCE0D8' }]}>
            <Icon name="check" size={11} color={colors.white} strokeWidth={3} />
          </View>
          <Text style={[styles.label, { color: r.ok ? colors.text : colors.textMuted }]}>{r.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'column', gap: 9, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
});
