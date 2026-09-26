import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import BottomSheet from './BottomSheet';
import Icon, { type IconName } from './Icon';

export interface OrderOption {
  key: string;
  icon: IconName;
  label: string;
  description: string;
  onPress: () => void;
  danger?: boolean;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  options: OrderOption[];
}

/**
 * "Order options" sheet behind the ⋮ button on Order details, matching
 * `_orderMenuOverlay()`: each row is a 40px icon tile + title + one-line
 * description + chevron, with the destructive action tinted red.
 */
export default function OrderOptionsSheet({ visible, onClose, options }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Order options" maxHeightPct={70}>
      {options.map((o, i) => (
        <Pressable
          key={o.key}
          style={[styles.row, i === options.length - 1 && styles.rowLast]}
          onPress={() => {
            onClose();
            o.onPress();
          }}
        >
          <View style={[styles.iconTile, o.danger && styles.iconTileDanger]}>
            <Icon name={o.icon} size={19} color={o.danger ? colors.danger : colors.primary} strokeWidth={2} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.label, o.danger && styles.labelDanger]}>{o.label}</Text>
            <Text style={styles.description}>{o.description}</Text>
          </View>
          <Icon name="chevronRight" size={16} color={colors.textMuted} strokeWidth={2.4} />
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTileDanger: { backgroundColor: colors.dangerSoft },
  body: { flex: 1, minWidth: 0 },
  label: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text },
  labelDanger: { color: colors.danger },
  description: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
});
