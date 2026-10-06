import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import Icon from './Icon';
import PrimaryButton from './PrimaryButton';

interface Props {
  visible: boolean;
  orderNumber?: string;
  onRate: () => void;
  onClose: () => void;
}

const CONFETTI_COUNT = 14;
const CONFETTI_COLORS = ['#2F6B2F', '#8BC34A', '#FFC107', '#FF7043', '#4DD0E1'];

/**
 * One-shot "order delivered" celebration.
 *
 * Drawn with the Animated API rather than Lottie so it ships no extra asset and
 * renders identically offline. Every animation runs on the native driver, which
 * keeps it smooth while the tracking screen behind it is still settling.
 */
export default function DeliveredCelebration({ visible, orderNumber, onRate, onClose }: Props) {
  const { width } = useWindowDimensions();

  const pop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const copy = useRef(new Animated.Value(0)).current;
  const fall = useRef(new Animated.Value(0)).current;

  // Fixed per mount so the confetti does not re-randomise on every re-render.
  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }).map((_, i) => ({
        key: `c${i}`,
        x: (Math.random() - 0.5) * width * 0.8,
        delay: Math.random() * 320,
        size: 6 + Math.random() * 6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        spin: Math.random() > 0.5 ? 1 : -1,
      })),
    [width],
  );

  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      ring.setValue(0);
      copy.setValue(0);
      fall.setValue(0);
      return;
    }

    Animated.sequence([
      // Badge overshoots slightly, which reads as a "pop" rather than a fade.
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(copy, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    Animated.timing(ring, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    Animated.timing(fall, {
      toValue: 1,
      duration: 2200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, pop, ring, copy, fall]);

  const badgeScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] });
  const copyShift = copy.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon name="x" size={18} color={colors.textMuted} />
          </Pressable>

          <View style={styles.stage} pointerEvents="none">
            {confetti.map(c => {
              const translateY = fall.interpolate({
                inputRange: [0, 1],
                outputRange: [-40, 260],
              });
              const opacity = fall.interpolate({
                inputRange: [0, 0.75, 1],
                outputRange: [1, 1, 0],
              });
              const rotate = fall.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', `${c.spin * 420}deg`],
              });
              return (
                <Animated.View
                  key={c.key}
                  style={[
                    styles.confetti,
                    {
                      width: c.size,
                      height: c.size * 0.6,
                      backgroundColor: c.color,
                      transform: [{ translateX: c.x }, { translateY }, { rotate }],
                      opacity,
                    },
                  ]}
                />
              );
            })}

            <Animated.View
              style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            <Animated.View style={[styles.badge, { transform: [{ scale: badgeScale }] }]}>
              <Icon name="check" size={44} color={colors.white} strokeWidth={3} />
            </Animated.View>
          </View>

          <Animated.View style={{ opacity: copy, transform: [{ translateY: copyShift }] }}>
            <Text style={styles.title}>Delivered!</Text>
            <Text style={styles.message}>
              Enjoy your order — thanks for shopping fresh with Selorg.
            </Text>
            {orderNumber ? <Text style={styles.orderNo}>#{orderNumber}</Text> : null}
          </Animated.View>

          <View style={styles.actions}>
            <PrimaryButton label="Rate your order" icon="star" onPress={onRate} />
            <PrimaryButton label="Done" kind="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 17, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingTop: 12,
    paddingBottom: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  closeBtn: { alignSelf: 'flex-end', padding: 4 },
  stage: { height: 150, width: '100%', alignItems: 'center', justifyContent: 'center' },
  confetti: { position: 'absolute', borderRadius: 2 },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
  },
  badge: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
  message: {
    fontFamily: fontFamily.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 6,
  },
  orderNo: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
  },
  actions: { width: '100%', marginTop: 18, gap: 10 },
});
