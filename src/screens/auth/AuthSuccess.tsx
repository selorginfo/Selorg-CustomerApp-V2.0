import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { AnimatedIcon, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import { images } from '../../theme/images';

export default function AuthSuccessScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'AuthSuccess'>>();
  const mode = route.params?.mode || 'login';
  const signup = mode === 'signup';

  const onContinue = () =>
    navigation.reset({
      index: 0,
      routes: [{ name: signup ? 'LocationPermission' : 'Main' }],
    });

  return (
    <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
      <LinearGradient colors={[colors.white, colors.white]} style={styles.gradient}>
        <View style={styles.body}>
          <View style={styles.checkCircle}>
            <AnimatedIcon name="check" motion="pop" playOnMount size={46} color={colors.white} strokeWidth={3} />
          </View>
          <Text style={styles.title}>{signup ? 'Account Created!' : 'Welcome Back!'}</Text>
          <Text style={styles.sub}>
            {signup
              ? 'Welcome to Selorg. Let’s start your healthy journey.'
              : 'Login successful. Let’s get your groceries.'}
          </Text>

          <View style={styles.heroWrap}>
            <Image
              source={signup ? images.onboard3 : images.onboard1}
              style={styles.hero}
              resizeMode="cover"
            />
          </View>
        </View>

        <View style={styles.footer}>
          <PrimaryButton
            label={signup ? 'Start Shopping' : 'Continue to Home'}
            icon="arrowRight"
            onPress={onContinue}
          />
        </View>
      </LinearGradient>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  checkCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.5,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text,
    marginTop: spacing.lg - 2,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.sm,
    textAlign: 'center',
    maxWidth: 270,
  },
  heroWrap: {
    width: '100%',
    maxWidth: 210,
    aspectRatio: 210 / 160,
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: spacing.lg + 2,
    backgroundColor: colors.card,
  },
  hero: { width: '100%', height: '100%' },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
