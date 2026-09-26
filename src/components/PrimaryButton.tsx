import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import Icon, { IconName } from './Icon';

type Kind = 'primary' | 'dark' | 'ghost' | 'danger' | 'subtle';
type Size = 'lg' | 'sm';

interface Props {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  size?: Size;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  testID?: string;
}

const KIND_STYLES: Record<Kind, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.white },
  dark: { bg: colors.text, fg: colors.white },
  ghost: { bg: colors.white, fg: colors.primary, border: colors.border },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  subtle: { bg: colors.white, fg: colors.primaryDark, border: colors.border },
};

export default function PrimaryButton({
  label,
  onPress,
  kind = 'primary',
  size = 'lg',
  fullWidth = true,
  disabled = false,
  loading = false,
  icon,
  testID,
}: Props) {
  const style = KIND_STYLES[kind];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.sm,
        {
          width: fullWidth ? '100%' : undefined,
          alignSelf: fullWidth ? 'stretch' : 'center',
          backgroundColor: isDisabled ? colors.disabled : style.bg,
          borderWidth: style.border ? 1 : 0,
          borderColor: style.border,
          opacity: pressed && !isDisabled ? 0.85 : 1,
          shadowOpacity: kind === 'primary' && !isDisabled ? 0.25 : 0,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isDisabled ? colors.white : style.fg} size="small" />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={18} color={isDisabled ? colors.white : style.fg} strokeWidth={2.3} /> : null}
          <Text
            style={[
              styles.label,
              { color: isDisabled ? colors.white : style.fg, fontSize: size === 'lg' ? 15.5 : 13.5 },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.xl - 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  lg: { paddingVertical: 15, paddingHorizontal: 20 },
  sm: { paddingVertical: 10, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontFamily: fontFamily.bold, letterSpacing: 0.2 },
});
