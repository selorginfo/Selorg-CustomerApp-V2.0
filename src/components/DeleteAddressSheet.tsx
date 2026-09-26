import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii, spacing } from '../theme';
import BottomSheet from './BottomSheet';
import Icon from './Icon';
import PrimaryButton from './PrimaryButton';

interface Props {
  visible: boolean;
  label: string;
  addressLine: string;
  onClose: () => void;
  onConfirm: () => void;
}

/** In-app delete confirmation — replaces the native address Alert. */
export default function DeleteAddressSheet({
  visible,
  label,
  addressLine,
  onClose,
  onConfirm,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} showClose={false}>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Icon name="trash" size={26} color={colors.danger} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>Delete this address?</Text>
        <Text style={styles.sub}>This address will be removed from your saved places.</Text>

        {label || addressLine ? (
          <View style={styles.preview}>
            <View style={styles.previewIcon}>
              <Icon
                name={label === 'Work' ? 'building' : 'home'}
                size={18}
                color={colors.primary}
              />
            </View>
            <View style={styles.previewText}>
              {label ? <Text style={styles.previewLabel}>{label}</Text> : null}
              {addressLine ? (
                <Text style={styles.previewAddress} numberOfLines={2}>
                  {addressLine}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.btn}>
            <PrimaryButton testID="address-delete-cancel" label="Cancel" kind="ghost" size="sm" onPress={onClose} />
          </View>
          <View style={styles.btn}>
            <PrimaryButton
              testID="address-delete-confirm"
              label="Delete"
              kind="danger"
              size="sm"
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
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.dangerSoft,
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
    maxWidth: 280,
  },
  preview: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  previewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: { flex: 1 },
  previewLabel: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  previewAddress: {
    fontFamily: fontFamily.medium,
    fontSize: 12.5,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btn: { flex: 1, minWidth: 0 },
});
