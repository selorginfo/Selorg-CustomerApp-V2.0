import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { Icon, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { showToast } from '../../utils/toast';
import { useAddress } from '../../context/AddressContext';
import { presentLocationFailure, resolveCurrentPlace } from '../../services/location.service';
import { storeApi } from '../../services/store.service';
import { mmkvStorage } from '../../lib/storage';
import { useReduceMotion } from '../../utils/useReduceMotion';

// Radar sweep behind the pin: three rings expanding out of the tile on a
// staggered loop, tightening while we're actually resolving a fix.
const RING_COUNT = 3;
const RING_MS_IDLE = 2400;
const RING_MS_ACTIVE = 1200;
const BOB_MS = 900;

function LocationPulse({ active }: { active: boolean }) {
  const reduceMotion = useReduceMotion();
  const rings = useRef(
    Array.from({ length: RING_COUNT }, () => new Animated.Value(0)),
  ).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      rings.forEach(v => v.setValue(0));
      return undefined;
    }
    // Every ring shares one cycle length and is offset by its start time, so
    // the stagger holds instead of drifting apart over repeats.
    const duration = active ? RING_MS_ACTIVE : RING_MS_IDLE;
    const loops = rings.map(v =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    );
    const timers = loops.map((loop, i) =>
      setTimeout(() => loop.start(), (duration / RING_COUNT) * i),
    );
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach(loop => loop.stop());
    };
  }, [active, reduceMotion, rings]);

  useEffect(() => {
    if (reduceMotion) {
      bob.setValue(0);
      return undefined;
    }
    const step = (toValue: number) =>
      Animated.timing(bob, {
        toValue,
        duration: BOB_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([step(1), step(0)]));
    loop.start();
    return () => loop.stop();
  }, [bob, reduceMotion]);

  return (
    <View style={styles.pinStage} pointerEvents="none">
      {rings.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              opacity: v.interpolate({
                inputRange: [0, 0.12, 1],
                outputRange: [0, 0.4, 0],
              }),
              transform: [
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 2.1] }) },
              ],
            },
          ]}
        />
      ))}
      <Animated.View
        style={[
          styles.iconTile,
          {
            transform: [
              { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) },
            ],
          },
        ]}
      >
        <Icon name="pin" size={44} color={colors.primary} strokeWidth={1.8} />
      </Animated.View>
    </View>
  );
}

export default function LocationPermissionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { saveAddress } = useAddress();
  const [locating, setLocating] = useState(false);

  const enterApp = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const onUseCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const place = await resolveCurrentPlace();
      const hasFullAddress =
        !!place.line1.trim() && !!place.city.trim() && !!place.pincode.trim();

      if (hasFullAddress) {
        await saveAddress({
          id: null,
          label: 'Home',
          line1: place.line1,
          line2: place.line2,
          landmark: '',
          city: place.city,
          state: place.state,
          pincode: place.pincode,
          latitude: place.latitude,
          longitude: place.longitude,
        });
      }

      const assignment = await storeApi.assign(place.latitude, place.longitude);
      if (assignment.store?._id) {
        mmkvStorage.setItem('assignedStoreId', assignment.store._id);
      }
      if (assignment.serviceable === false) {
        showToast(assignment.message || 'No serviceable store near your location', 'err');
      } else {
        showToast(hasFullAddress ? 'Location set · nearest store assigned' : 'Location detected · add address details anytime', 'ok');
      }
      enterApp();
    } catch (e: unknown) {
      presentLocationFailure(e);
    } finally {
      setLocating(false);
    }
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.body}>
        <LocationPulse active={locating} />
        <Text style={styles.title}>Deliver to your door</Text>
        <Text style={styles.sub}>
          Share your location so we can bind you to the nearest darkstore for the fastest delivery.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          testID="location-use-current"
          label={locating ? 'Getting location…' : 'Use current location'}
          onPress={onUseCurrentLocation}
          icon="pin"
          loading={locating}
        />
        <View style={{ height: spacing.sm + 4 }} />
        <PrimaryButton
          testID="location-manual"
          label="Enter address manually"
          onPress={() =>
            // Design enters the app and opens the address form on top of it, so
            // Back lands on Home rather than bouncing to the permission screen.
            navigation.reset({ index: 1, routes: [{ name: 'Main' }, { name: 'AddAddress' }] })
          }
          kind="ghost"
        />
        <Text style={styles.skipText} onPress={enterApp} testID="location-skip" accessibilityRole="button">
          Skip for now
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  pinStage: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  iconTile: {
    width: 90,
    height: 90,
    borderRadius: radii.xxl + 8,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.text, marginTop: spacing.sm },
  sub: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 260,
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center' },
  skipText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.textMuted,
    padding: 6,
    marginTop: spacing.sm,
  },
});
