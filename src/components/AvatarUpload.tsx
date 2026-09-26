import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fontFamily } from '../theme';
import { useReduceMotion } from '../utils/useReduceMotion';
import Icon from './Icon';

interface Props {
  /** Remote or local image URI. When empty, shows placeholder. */
  uri?: string | null;
  /** Fallback initial letter when no image (preferred over generic icon). */
  nameInitial?: string;
  /** When true and no uri, show user icon instead of initial. */
  preferIconPlaceholder?: boolean;
  size?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Circular profile image area with a modern ImagePlus upload chip.
 * Entrance + press scale use native driver; respects reduce-motion.
 */
export default function AvatarUpload({
  uri,
  nameInitial = '',
  preferIconPlaceholder = false,
  size = 104,
  onPress,
  style,
}: Props) {
  const reduceMotion = useReduceMotion();
  const enter = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const imageFade = useRef(new Animated.Value(uri ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 120,
    }).start();
  }, [enter, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      imageFade.setValue(uri ? 1 : 0);
      return;
    }
    Animated.timing(imageFade, {
      toValue: uri ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [uri, imageFade, reduceMotion]);

  const camSize = Math.max(30, Math.round(size * 0.3));
  const radius = size / 2;
  const initial = (nameInitial || '').trim().charAt(0).toUpperCase();
  const showInitial = !uri && !preferIconPlaceholder && !!initial;

  const animatePress = (to: number) => {
    if (reduceMotion) return;
    Animated.spring(press, {
      toValue: to,
      useNativeDriver: true,
      friction: 6,
      tension: 220,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.wrap,
        style,
        {
          opacity: enter,
          transform: [
            { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        },
      ]}
    >
      <Animated.View style={{ position: 'relative', transform: [{ scale: press }] }}>
        <Pressable
          onPress={onPress}
          onPressIn={() => animatePress(0.96)}
          onPressOut={() => animatePress(1)}
          accessibilityRole="button"
          accessibilityLabel="Upload profile photo"
          style={[styles.circle, { width: size, height: size, borderRadius: radius }]}
        >
          {uri ? (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: imageFade }]}>
              <Image source={{ uri }} style={styles.image} resizeMode="cover" />
            </Animated.View>
          ) : showInitial ? (
            <Text style={[styles.initial, { fontSize: Math.round(size * 0.34) }]}>{initial}</Text>
          ) : (
            <Icon name="user" size={Math.round(size * 0.4)} color={colors.textMuted} strokeWidth={1.6} />
          )}
        </Pressable>

        <Pressable
          onPress={onPress}
          onPressIn={() => animatePress(0.96)}
          onPressOut={() => animatePress(1)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          style={[
            styles.camBtn,
            {
              width: camSize,
              height: camSize,
              borderRadius: camSize / 2,
              right: -2,
              bottom: -2,
            },
          ]}
        >
          <Icon name="imagePlus" size={Math.round(camSize * 0.48)} color={colors.white} strokeWidth={2.2} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    position: 'relative',
  },
  circle: {
    overflow: 'hidden',
    backgroundColor: colors.placeholder,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: fontFamily.bold,
    color: colors.primaryDark,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  camBtn: {
    position: 'absolute',
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#14231A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});
