import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../theme';
import Icon from './Icon';

interface Props {
  onPress: () => void;
  testID?: string;
}

/** Standalone circular back chevron used atop the plain auth-flow screens
 * (login-password, create-password, forgot, reset-password, otp, profile-setup)
 * which in the prototype use an empty-title header (`_hdr('', {})`). */
export default function BackButton({ onPress, testID }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={styles.btn}
        hitSlop={8}
        testID={testID}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Icon name="chevronLeft" size={20} color={colors.text} strokeWidth={2.4} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.sm + 4, paddingTop: spacing.xs + 2, paddingBottom: spacing.sm },
  btn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#14231A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
});
