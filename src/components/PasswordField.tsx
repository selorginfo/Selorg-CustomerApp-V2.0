import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import Icon from './Icon';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}

export default function PasswordField({ label, value, onChangeText, placeholder = '••••••••' }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
        />
        <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8}>
          <Icon name={visible ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textMuted, letterSpacing: 0.2 },
  wrap: {
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
  input: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 13,
  },
});
