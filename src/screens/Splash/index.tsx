import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { colors, fontFamily } from '../../theme';
import { Spinner } from '../../components';
import { images } from '../../theme/images';
import { useAuth } from '../../context/AuthContext';
import { mmkvStorage } from '../../lib/storage';
import { brandAssets, brandConfig } from '../../brands';

export default function SplashScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isLoading, isAuthenticated, isGuest, onboardingStep } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    const timer = setTimeout(() => {
      // Signed in but signup was interrupted — resume where it stopped.
      if (onboardingStep === 'profile') {
        navigation.replace('ProfileSetup');
        return;
      }
      if (onboardingStep === 'location' && isAuthenticated) {
        navigation.replace('LocationPermission');
        return;
      }
      if (isAuthenticated) {
        navigation.replace('Main');
        return;
      }
      // Persisted guest (or in-memory guest) should land on Main, not login.
      if (isGuest || mmkvStorage.getItem('isGuest') === '1') {
        navigation.replace('Main');
        return;
      }
      const seenOnboarding = mmkvStorage.getItem('onboardingComplete') === '1';
      if (seenOnboarding) {
        navigation.replace('EnterMobile', { mode: 'login' });
      } else {
        navigation.replace('Onboarding');
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [isLoading, isAuthenticated, isGuest, onboardingStep, navigation]);

  if (brandAssets.splash) {
    return (
      <View style={[styles.artContainer, { backgroundColor: colors.primary }]}>
        <Image source={brandAssets.splash} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={styles.artSpinner}>
          {/* Brand colour would vanish against the artwork's own background. */}
          <Spinner size={22} color={colors.text} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.logoBox}>
        <Image source={images.appLogo} style={styles.logo} resizeMode="cover" />
      </View>
      <Text style={styles.wordmark}>{brandConfig.shortName}</Text>
      {brandConfig.splashTagline ? <Text style={styles.tagline}>{brandConfig.splashTagline}</Text> : null}
      {brandConfig.splashSubtitle ? <Text style={styles.subtitle}>{brandConfig.splashSubtitle}</Text> : null}
      <View style={styles.spinnerWrap}>
        <Spinner size={22} color={colors.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  logoBox: {
    width: 120,
    height: 120,
    borderRadius: 30,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  logo: { width: 120, height: 120 },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    marginTop: 10,
    color: colors.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 16,
  },
  spinnerWrap: { marginTop: 14 },
  artContainer: { flex: 1 },
  artSpinner: { position: 'absolute', left: 0, right: 0, bottom: 64, alignItems: 'center' },
});
