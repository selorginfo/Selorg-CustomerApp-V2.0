import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '../theme';
import BottomSheet from './BottomSheet';
import Icon from './Icon';

export interface CountryCode {
  code: string;
  name: string;
  iso: string;
}

/** The 8 dialling codes offered by the design's `_ccSheet`. */
export const COUNTRY_CODES: CountryCode[] = [
  { code: '+91', name: 'India', iso: 'in' },
  { code: '+971', name: 'UAE', iso: 'ae' },
  { code: '+65', name: 'Singapore', iso: 'sg' },
  { code: '+44', name: 'United Kingdom', iso: 'gb' },
  { code: '+1', name: 'United States', iso: 'us' },
  { code: '+61', name: 'Australia', iso: 'au' },
  { code: '+60', name: 'Malaysia', iso: 'my' },
  { code: '+94', name: 'Sri Lanka', iso: 'lk' },
];

export function flagUri(iso: string) {
  return `https://flagcdn.com/w40/${iso}.png`;
}

export function isoForCode(code: string) {
  return COUNTRY_CODES.find(c => c.code === code)?.iso ?? 'in';
}

/** Flag image with the design's 26x19 proportions, rounded corners and hairline. */
export function Flag({ iso, width = 26 }: { iso: string; width?: number }) {
  return (
    <Image
      source={{ uri: flagUri(iso) }}
      style={[styles.flag, { width, height: Math.round(width * 0.72) }]}
      resizeMode="cover"
    />
  );
}

interface Props {
  visible: boolean;
  value: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export default function CountryCodeSheet({ visible, value, onSelect, onClose }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Select country code" maxHeightPct={70}>
      {COUNTRY_CODES.map(c => {
        const on = value === c.code;
        return (
          <Pressable
            key={c.code}
            style={styles.row}
            onPress={() => {
              onSelect(c.code);
              onClose();
            }}
          >
            <View style={styles.rowLeft}>
              <Flag iso={c.iso} width={28} />
              <Text style={[styles.code, on && styles.codeOn]}>{c.code}</Text>
              <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
            </View>
            {on ? <Icon name="check" size={17} color={colors.primary} strokeWidth={2.6} /> : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flag: { borderRadius: 4, flexShrink: 0, backgroundColor: colors.placeholder },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  code: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text, minWidth: 46 },
  codeOn: { color: colors.primary },
  name: { flex: 1, minWidth: 0, fontFamily: fontFamily.semibold, fontSize: 13.5, color: colors.textMuted },
});
