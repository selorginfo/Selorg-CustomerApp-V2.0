import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fontFamily, radii } from '../theme';
import { statusMeta } from '../utils/format';

interface Props {
  status: string;
}

export default function StatusPill({ status }: Props) {
  const meta = statusMeta(status);
  return (
    <View style={[styles.pill, { backgroundColor: meta.bg }]}>
      <Text style={[styles.label, { color: meta.c }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Design uses a soft-rounded rect (radius 8), not a full pill.
  pill: { alignSelf: 'flex-start', borderRadius: radii.md, paddingVertical: 5, paddingHorizontal: 10 },
  label: { fontFamily: fontFamily.bold, fontSize: 11 },
});
