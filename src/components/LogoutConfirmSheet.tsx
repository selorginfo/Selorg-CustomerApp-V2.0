import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, spacing } from '../theme';
import BottomSheet from './BottomSheet';
import Icon from './Icon';
import PrimaryButton from './PrimaryButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Clean white logout confirmation sheet — replaces the native Alert. */
export default function LogoutConfirmSheet({ visible, onClose, onConfirm }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Log out" showClose>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Icon name="logout" size={28} color={colors.danger} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>Log out of Selorg?</Text>
        <Text style={styles.sub}>
          You can always log back in with your mobile number. Your cart will stay saved on this device.
        </Text>
        <View style={styles.actions}>
          <View style={styles.btn}>
            <PrimaryButton testID="logout-cancel" label="Cancel" kind="ghost" onPress={onClose} />
          </View>
          <View style={styles.btn}>
            <PrimaryButton
              testID="logout-confirm"
              label="Log out"
              kind="danger"
              onPress={() => {
                onClose();
                onConfirm();
              }}
            />
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fontFamily.medium,
    fontSize: 13.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    marginBottom: spacing.lg,
    maxWidth: 300,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btn: { flex: 1, minWidth: 0 },
});
