import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { colors, fontFamily } from '../theme';
import { useReduceMotion } from '../utils/useReduceMotion';
import Icon, { IconName } from './Icon';
import PrimaryButton from './PrimaryButton';
import { SkeletonList } from './Skeleton';

type Kind = 'loading' | 'empty' | 'error';

interface Props {
  kind: Kind;
  title?: string;
  message?: string;
  ctaLabel?: string;
  ctaSize?: 'lg' | 'sm';
  onCta?: () => void;
  ctaTestID?: string;
  icon?: IconName;
  /** Optional illustration — replaces the Lucide icon when set. */
  imageSource?: ImageSourcePropType;
  /** Optional Lottie JSON (require(...)) — replaces the Lucide icon when set. */
  lottieSource?: object | number;
  /** Soft entrance for content. Defaults on for empty/error. */
  animated?: boolean;
}

export default function StateView({
  kind,
  title,
  message,
  ctaLabel,
  ctaSize = 'lg',
  onCta,
  ctaTestID,
  icon,
  imageSource,
  lottieSource,
  animated,
}: Props) {
  const shouldAnimate = animated ?? kind !== 'loading';
  const reduceMotion = useReduceMotion();
  const enter = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;

  useEffect(() => {
    if (!shouldAnimate || reduceMotion) {
      enter.setValue(1);
      return undefined;
    }
    const intro = Animated.timing(enter, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    intro.start();
    return () => intro.stop();
  }, [shouldAnimate, reduceMotion, enter]);

  if (kind === 'loading') {
    return (
      <View style={styles.loadingWrap}>
        <SkeletonList count={4} padBottom={0} />
      </View>
    );
  }

  const isError = kind === 'error';
  const iconName = icon || (isError ? 'wifiOff' : 'sparkles');
  const iconColor = isError ? colors.danger : colors.primary;
  const useLottie = !!lottieSource;

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={{
          width: '100%',
          alignItems: 'center',
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        {useLottie ? (
          <View style={styles.lottieStage}>
            <LottieView
              source={lottieSource as any}
              autoPlay={!reduceMotion}
              loop={!reduceMotion}
              style={styles.lottie}
            />
          </View>
        ) : imageSource ? (
          <Image source={imageSource} style={styles.emptyImage} resizeMode="contain" />
        ) : (
          <View
            style={[
              styles.iconTile,
              { borderColor: isError ? colors.danger : colors.border },
            ]}
          >
            <Icon name={iconName} size={36} color={iconColor} strokeWidth={1.9} />
          </View>
        )}

        {title ? <Text style={styles.title}>{title}</Text> : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        {ctaLabel ? (
          <View style={styles.ctaWrap}>
            <PrimaryButton
              testID={ctaTestID}
              label={ctaLabel}
              onPress={onCta}
              kind={isError ? 'danger' : 'primary'}
              size={ctaSize}
              fullWidth={false}
              icon={isError ? 'refresh' : undefined}
            />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flexGrow: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  wrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 28,
    backgroundColor: '#FFFFFF',
  },
  lottieStage: {
    width: 220,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  lottie: {
    width: 200,
    height: 180,
  },
  emptyImage: {
    width: 168,
    height: 168,
    marginBottom: 8,
  },
  iconTile: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    marginBottom: 18,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  message: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 290,
    marginTop: 10,
  },
  ctaWrap: {
    marginTop: 22,
    alignSelf: 'center',
    alignItems: 'center',
  },
});
