import React, { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface Props {
  children: ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  background?: string;
}

export default function ScreenContainer({ children, edges = ['top'], style, background = '#FFFFFF' }: Props) {
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: background }, style]}>
      <View style={styles.flex}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
