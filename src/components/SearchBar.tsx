import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import Icon from './Icon';

interface Props {
  placeholder?: string;
  onPress?: () => void;
  value?: string;
  onChangeText?: (v: string) => void;
  editable?: boolean;
  autoFocus?: boolean;
  onSubmit?: () => void;
  left?: React.ReactNode;
  right?: React.ReactNode;
  /** Green 1.5px border — the design's active search field. */
  focused?: boolean;
  testID?: string;
}

export default function SearchBar({
  placeholder = 'Search for products…',
  onPress,
  value,
  onChangeText,
  editable = false,
  autoFocus = false,
  onSubmit,
  left,
  right,
  focused = false,
  testID,
}: Props) {
  if (!editable) {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.wrap, focused && styles.wrapFocused]}
        testID={testID || 'search-bar'}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
      >
        {left}
        <Icon name="search" size={18} color={colors.textMuted} />
        <Text style={styles.placeholder} numberOfLines={1}>{placeholder}</Text>
        {right}
      </Pressable>
    );
  }
  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]} testID={testID || 'search-bar'}>
      {left}
      <Icon name="search" size={18} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        testID="search-input"
        accessibilityLabel="Search input"
      />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl - 2,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  wrapFocused: { borderWidth: 1.5, borderColor: colors.primary, paddingVertical: 12.5 },
  placeholder: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textMuted, flex: 1 },
  input: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.text, flex: 1, padding: 0 },
});
