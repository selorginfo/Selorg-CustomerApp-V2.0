import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon, { type IconName } from './Icon';

/**
 * Motion presets for {@link AnimatedIcon}. All run on the native driver.
 *
 * One-shots (replay on `trigger` change / `active` flip / mount with `playOnMount`):
 *  - `pop`    – overshoot scale-in (success checks, wishlist heart, cart add)
 *  - `bounce` – upward hop (tab selection)
 *  - `ring`   – bell swing (notifications)
 *  - `shake`  – horizontal wiggle (errors)
 *
 * Loops (run while `active`, default on):
 *  - `spin`   – continuous 360° rotation (refresh / syncing)
 *  - `pulse`  – gentle breathing scale (attention / offline)
 *
 * `press` is auto-enabled when `onPress` is passed: squash on touch, spring back.
 */
export type IconMotion = 'press' | 'pop' | 'bounce' | 'ring' | 'shake' | 'spin' | 'pulse';

export interface AnimatedIconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
  /** One preset or several composed together, e.g. `['pop', 'bounce']`. */
  motion?: IconMotion | IconMotion[];
  /**
   * Loop presets run while this is true (default: running). One-shot presets
   * replay when it flips false -> true (e.g. tab became active, wishlisted).
   */
  active?: boolean;
  /** One-shot presets replay whenever this value changes (e.g. unread count). */
  trigger?: unknown;
  /** Play one-shot presets once when the icon mounts (success screens). */
  playOnMount?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export default function AnimatedIcon({
  name,
  size = 22,
  color = '#1A1A1A',
  strokeWidth = 2,
  fill = 'none',
  motion,
  active,
  trigger,
  playOnMount = false,
  onPress,
  disabled,
  hitSlop,
  style,
  testID,
  accessibilityLabel,
}: AnimatedIconProps) {
  // Independent channels so presets compose (press * pop * pulse, etc.).
  const pressScale = useRef(new Animated.Value(1)).current;
  const popScale = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const bounceY = useRef(new Animated.Value(0)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const ringRot = useRef(new Animated.Value(0)).current;
  const spinRot = useRef(new Animated.Value(0)).current;

  const motionKey = (Array.isArray(motion) ? motion.join(',') : motion ?? '') + (onPress ? ',press' : '');
  const presets = useMemo(() => new Set(motionKey.split(',').filter(Boolean)), [motionKey]);
  const has = useCallback((m: IconMotion) => presets.has(m), [presets]);

  const playOneShots = useCallback(() => {
    if (has('pop')) {
      popScale.setValue(0.3);
      Animated.spring(popScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 170 }).start();
    }
    if (has('bounce')) {
      bounceY.setValue(0);
      Animated.sequence([
        Animated.timing(bounceY, { toValue: -6, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(bounceY, { toValue: 0, useNativeDriver: true, friction: 4, tension: 160 }),
      ]).start();
    }
    if (has('shake')) {
      shakeX.setValue(0);
      Animated.sequence(
        [7, -7, 5, -5, 0].map(v =>
          Animated.timing(shakeX, { toValue: v, duration: 45, useNativeDriver: true }),
        ),
      ).start();
    }
    if (has('ring')) {
      ringRot.setValue(0);
      Animated.sequence(
        [16, -14, 9, -7, 0].map(v =>
          Animated.timing(ringRot, { toValue: v, duration: 70, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ),
      ).start();
    }
  }, [has, popScale, bounceY, shakeX, ringRot]);

  // Loops: spin / pulse run while `active` (default on).
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    if (has('spin') && active !== false) {
      spinRot.setValue(0);
      const loop = Animated.loop(
        Animated.timing(spinRot, { toValue: 360, duration: 1100, easing: Easing.linear, useNativeDriver: true }),
      );
      loop.start();
      loops.push(loop);
    }
    if (has('pulse') && active !== false) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.14, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loop.start();
      loops.push(loop);
    }
    return () => {
      loops.forEach(l => l.stop());
      spinRot.setValue(0);
      pulseScale.setValue(1);
    };
  }, [active, has, spinRot, pulseScale]);

  // One-shots: fire on mount (opt-in), on `active` false->true, on `trigger` change.
  const mounted = useRef(false);
  const prevActive = useRef(active);
  const prevTrigger = useRef(trigger);
  useEffect(() => {
    const first = !mounted.current;
    mounted.current = true;
    const becameActive = prevActive.current === false && active === true;
    const triggerChanged = prevTrigger.current !== trigger;
    prevActive.current = active;
    prevTrigger.current = trigger;
    if (first) {
      if (playOnMount) playOneShots();
      return;
    }
    if (becameActive || triggerChanged) playOneShots();
  }, [active, trigger, playOnMount, playOneShots]);

  const onPressIn = useCallback(() => {
    Animated.timing(pressScale, { toValue: 0.82, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [pressScale]);
  const onPressOut = useCallback(() => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 200 }).start();
  }, [pressScale]);

  const spin = spinRot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
  const swing = ringRot.interpolate({ inputRange: [-45, 45], outputRange: ['-45deg', '45deg'] });

  const content = (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { scale: pressScale },
            { scale: popScale },
            { scale: pulseScale },
            { translateY: bounceY },
            { translateX: shakeX },
            { rotate: has('spin') ? spin : swing },
          ],
        },
      ]}
    >
      <Icon name={name} size={size} color={color} strokeWidth={strokeWidth} fill={fill} />
    </Animated.View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </Pressable>
  );
}
