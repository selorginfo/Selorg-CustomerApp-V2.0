import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import Icon from './Icon';

interface Props {
  items: string[];
  compact?: boolean;
}

/** Row of "Pesticide-Free / Chemical-Free / Non-GMO" style pills used on product cards + PDP. */
export default function CleanBadges({ items, compact = false }: Props) {
  if (!items?.length) return null;
  return (
    <View style={styles.wrap}>
      {items.map(label => (
        <View key={label} style={[styles.pill, compact && styles.pillCompact]}>
          <Icon name="leaf" size={compact ? 10 : 13} color={colors.primary} strokeWidth={2} />
          <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.round,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  pillCompact: { paddingVertical: 2, paddingHorizontal: 7 },
  label: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.primaryDark },
  labelCompact: { fontSize: 9.5 },
});
