import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme';

/** Top-down delivery bike used as the moving Google Maps marker. */
export function RiderMapMarker({ size = 46 }: { size?: number }) {
  const icon = Math.round(size * 0.56);
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View style={styles.halo} />
      <View style={[styles.badge, { width: size - 8, height: size - 8 }]}>
        <Svg width={icon} height={icon} viewBox="0 0 24 24" fill="none">
          <Circle cx={6.5} cy={17} r={2.6} stroke="#fff" strokeWidth={1.7} />
          <Circle cx={17.2} cy={17} r={2.6} stroke="#fff" strokeWidth={1.7} />
          <Path d="M8.2 17h5.2l1.7-5.2H9.6L8.2 17Z" fill="#fff" opacity={0.95} />
          <Path
            d="M9.8 11.8h6.4l1.8-2.2h-4.2"
            stroke="#fff"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path d="M14.6 9.6V7.4h2.4" stroke="#fff" strokeWidth={1.7} strokeLinecap="round" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: 'rgba(3,71,3,0.22)',
  },
  badge: {
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.white,
  },
});
