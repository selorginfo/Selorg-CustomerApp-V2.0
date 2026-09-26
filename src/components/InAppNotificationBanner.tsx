import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { navigate } from '../utils/navigationRef';

const SCREEN_W = Dimensions.get('window').width;

const BANNER_OFFSCREEN = -200;
// Auto-dismiss after 6 s when no timer; keep visible while timer is running
const NO_TIMER_DISMISS_MS = 6000;

export interface NotificationPayload {
  title: string;
  body?: string;
  data?: {
    screen?: string;
    productId?: string;
    productName?: string;
    timerMinutes?: string;
    imageUrl?: string;
    [key: string]: string | undefined;
  };
}

interface Props {
  notification: NotificationPayload | null;
  onDismiss: () => void;
}

export default function InAppNotificationBanner({ notification, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(BANNER_OFFSCREEN)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalSecondsRef = useRef<number>(0);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Derive directly from notification data so it's correct on first render
  const timerMinutesRaw = notification?.data?.timerMinutes;
  const hasTimer = !!timerMinutesRaw && parseInt(timerMinutesRaw, 10) > 0;

  const clearAllTimers = () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const slideOut = (callback?: () => void) => {
    Animated.timing(translateY, {
      toValue: BANNER_OFFSCREEN,
      duration: 280,
      useNativeDriver: true,
    }).start(() => callback?.());
  };

  const dismiss = () => {
    clearAllTimers();
    slideOut(onDismiss);
  };

  useEffect(() => {
    if (!notification) {
      clearAllTimers();
      setSecondsLeft(null);
      return;
    }

    // Slide in
    Animated.spring(translateY, {
      toValue: insets.top + 8,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();

    const mins = timerMinutesRaw ? parseInt(timerMinutesRaw, 10) : 0;

    if (mins > 0) {
      const total = mins * 60;
      totalSecondsRef.current = total;
      setSecondsLeft(total);

      // Animate progress bar from full → empty over the timer duration
      progressAnim.setValue(1);
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: total * 1000,
        useNativeDriver: false,
      }).start();

      // Tick every second
      countdownRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev === null || prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            // Auto-dismiss 2 s after timer reaches 0
            dismissTimerRef.current = setTimeout(() => slideOut(onDismiss), 2000);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      // No fixed auto-dismiss — banner stays visible while timer runs
    } else {
      setSecondsLeft(null);
      progressAnim.setValue(0);
      // Auto-dismiss after 6 s when no timer
      dismissTimerRef.current = setTimeout(() => slideOut(onDismiss), NO_TIMER_DISMISS_MS);
    }

    return () => clearAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notification]);

  const handlePress = () => {
    const productId = notification?.data?.productId;
    clearAllTimers();
    slideOut(() => {
      onDismiss();
      if (productId) {
        navigate('ProductDetail', { productId });
      }
    });
  };

  const formatCountdown = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (!notification) return null;

  const imageUrl = notification.data?.imageUrl || null;
  const hasProduct = !!notification.data?.productId;
  const timerExpired = hasTimer && secondsLeft === 0;

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_W - 32], // banner has left/right 16 margin
  });

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={handlePress}
        style={styles.touchable}
      >
        {/* Left icon / product image */}
        <View style={styles.iconContainer}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>🔔</Text>
            </View>
          )}
        </View>

        {/* Text content */}
        <View style={styles.textContainer}>
          {/* Title row with inline timer (matches sample: "Under ₹299  4:24:29") */}
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {notification.title}
            </Text>
            {hasTimer && (
              <Text
                style={[
                  styles.timerInline,
                  secondsLeft !== null && secondsLeft <= 60 && styles.timerUrgent,
                  timerExpired && styles.timerExpired,
                ]}
              >
                {timerExpired
                  ? 'Ended'
                  : secondsLeft !== null
                    ? formatCountdown(secondsLeft)
                    : `${String(parseInt(timerMinutesRaw!, 10)).padStart(2, '0')}:00`}
              </Text>
            )}
          </View>

          {notification.body ? (
            <Text style={styles.body} numberOfLines={2}>
              {notification.body}
            </Text>
          ) : null}

          {hasProduct && !hasTimer && (
            <Text style={styles.productHint} numberOfLines={1}>
              Tap to view product
            </Text>
          )}
        </View>

        {/* Close button */}
        <TouchableOpacity
          onPress={dismiss}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Progress bar — shown only when timer is active */}
      {hasTimer && !timerExpired && (
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressBarWidth }]} />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  touchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 76,
  },
  iconContainer: {
    marginRight: 12,
  },
  productImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    flexShrink: 1,
    marginRight: 6,
  },
  // Inline timer shown right next to the title (matches sample "Under ₹299  4:24:29")
  timerInline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4169e1',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 12,
    color: '#595959',
    lineHeight: 17,
  },
  productHint: {
    fontSize: 11,
    color: '#1890ff',
    marginTop: 3,
    fontWeight: '500',
  },
  timerUrgent: {
    color: '#f5222d',
  },
  timerExpired: {
    color: '#8c8c8c',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 13,
    color: '#8c8c8c',
    fontWeight: '600',
  },
  // Progress bar at the bottom of the banner
  progressTrack: {
    height: 4,
    backgroundColor: '#e8e8e8',
    width: '100%',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#4169e1',
    borderRadius: 2,
  },
});
