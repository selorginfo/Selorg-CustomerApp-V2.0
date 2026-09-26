import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../theme';

interface Props {
  width?: ViewStyle['width'];
  height?: ViewStyle['height'];
  radius?: number;
  aspectRatio?: number;
  style?: ViewStyle;
}

/**
 * Shimmer placeholder — soft gray pulse on white screens.
 */
export default function Skeleton({ width = '100%', height, radius = 16, aspectRatio, style }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] });

  return (
    <Animated.View
      style={[
        styles.block,
        { width, height, borderRadius: radius, opacity },
        aspectRatio ? { aspectRatio } : null,
        style,
      ]}
    />
  );
}

/** Row of `count` equal-width skeleton blocks. */
export function SkeletonRow({
  count,
  gap = 10,
  radius = 16,
  aspectRatio = 1,
}: {
  count: number;
  gap?: number;
  radius?: number;
  aspectRatio?: number;
}) {
  return (
    <View style={[styles.row, { gap }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.rowItem}>
          <Skeleton aspectRatio={aspectRatio} radius={radius} />
        </View>
      ))}
    </View>
  );
}

/** Order / list-card style loading placeholders. */
export function SkeletonList({ count = 4, padBottom = 24 }: { count?: number; padBottom?: number }) {
  return (
    <View style={[styles.list, { paddingBottom: padBottom }]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.listCard}>
          <View style={styles.listTop}>
            <Skeleton width="42%" height={14} radius={7} />
            <Skeleton width={72} height={22} radius={11} />
          </View>
          <Skeleton width="58%" height={12} radius={6} style={{ marginTop: 10 }} />
          <View style={styles.listThumbs}>
            <Skeleton width={40} height={40} radius={9} />
            <Skeleton width={40} height={40} radius={9} />
            <Skeleton width={40} height={40} radius={9} />
          </View>
          <View style={styles.listBottom}>
            <Skeleton width="28%" height={14} radius={7} />
            <Skeleton width={88} height={32} radius={16} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Product grid loading placeholders. */
export function SkeletonGrid({
  count = 4,
  padBottom = 24,
}: {
  count?: number;
  padBottom?: number;
}) {
  const rows = Math.ceil(count / 2);
  return (
    <View style={[styles.grid, { paddingBottom: padBottom }]}>
      {Array.from({ length: rows }).map((_, r) => (
        <SkeletonRow key={r} count={2} gap={12} radius={20} aspectRatio={0.72} />
      ))}
    </View>
  );
}

/** Profile / form-style loading placeholders. */
export function SkeletonForm({ padBottom = 24 }: { padBottom?: number }) {
  return (
    <View style={[styles.form, { paddingBottom: padBottom }]}>
      <Skeleton width={96} height={96} radius={48} style={{ alignSelf: 'center', marginBottom: 20 }} />
      <Skeleton height={48} radius={14} style={{ marginBottom: 12 }} />
      <Skeleton height={48} radius={14} style={{ marginBottom: 12 }} />
      <Skeleton height={48} radius={14} style={{ marginBottom: 12 }} />
      <Skeleton width="60%" height={14} radius={7} style={{ marginBottom: 20 }} />
      <Skeleton height={52} radius={26} />
    </View>
  );
}

/** Product detail loading placeholders. */
export function SkeletonDetail() {
  return (
    <View style={styles.detail}>
      <Skeleton aspectRatio={1} radius={0} />
      <View style={styles.detailBody}>
        <Skeleton width="70%" height={22} radius={8} />
        <Skeleton width="40%" height={14} radius={7} style={{ marginTop: 10 }} />
        <Skeleton width="35%" height={28} radius={8} style={{ marginTop: 16 }} />
        <Skeleton height={80} radius={16} style={{ marginTop: 20 }} />
        <Skeleton height={80} radius={16} style={{ marginTop: 12 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#EDEDED',
  },
  row: { flexDirection: 'row' },
  rowItem: { flex: 1, minWidth: 0 },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 14,
  },
  listTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  listThumbs: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  listBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  grid: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 12,
    backgroundColor: '#FFFFFF',
  },
  form: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  detail: { flex: 1, backgroundColor: '#FFFFFF' },
  detailBody: { padding: spacing.md + 4, paddingTop: spacing.md },
});
