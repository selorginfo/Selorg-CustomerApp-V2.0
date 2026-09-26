import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '../theme';
import Icon from './Icon';
import SearchBar from './SearchBar';

interface Props {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  hideBack?: boolean;
  right?: ReactNode;
  search?: boolean;
  searchPlaceholder?: string;
  onSearchPress?: () => void;
}

export default function Header({
  title,
  subtitle,
  onBack,
  hideBack = false,
  right,
  search = false,
  searchPlaceholder,
  onSearchPress,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {!hideBack ? (
          <Pressable onPress={onBack} style={styles.backBtn} hitSlop={8}>
            <Icon name="chevronLeft" size={20} color={colors.text} strokeWidth={2.4} />
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right || <View style={styles.backSpacer} />}
      </View>
      {search ? (
        <View style={styles.searchWrap}>
          <SearchBar placeholder={searchPlaceholder} onPress={onSearchPress} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: {
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
  backSpacer: { width: 38 },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.text, letterSpacing: -0.1 },
  subtitle: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  searchWrap: { marginTop: 10 },
});
