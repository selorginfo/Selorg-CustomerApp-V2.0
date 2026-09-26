import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/types';
import { CountryCodeSheet, Flag, Icon, PrimaryButton, ScreenContainer, isoForCode } from '../../components';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { images } from '../../theme/images';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../utils/toast';
import { isValidEmail, isValidIndianMobile } from '../../utils/validation';

type Method = 'mobile' | 'whatsapp' | 'email';
type Mode = 'login' | 'signup';

// Web-parity validators (selorg-web-app/src/lib/validation.ts).

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function EnterMobileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'EnterMobile'>>();
  const { sendOtp, continueAsGuest } = useAuth();

  const [mode, setMode] = useState<Mode>(route.params?.mode || 'login');
  const [method, setMethod] = useState<Method>('mobile');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [countryCode, setCountryCode] = useState('+91');
  const [ccOpen, setCcOpen] = useState(false);

  const signup = mode === 'signup';

  // Sliding highlight + crossfade for the Log In / Sign Up toggle.
  const [pillTrackW, setPillTrackW] = useState(0);
  const slide = useRef(new Animated.Value(mode === 'signup' ? 1 : 0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: signup ? 1 : 0,
      useNativeDriver: true,
      friction: 9,
      tension: 90,
    }).start();
  }, [signup, slide]);

  const switchMode = useCallback(
    (next: Mode) => {
      if (next === mode) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Animated.timing(fade, {
        toValue: 0,
        duration: 110,
        useNativeDriver: true,
      }).start(() => {
        setMode(next);
        Animated.timing(fade, {
          toValue: 1,
          duration: 190,
          useNativeDriver: true,
        }).start();
      });
    },
    [mode, fade],
  );

  const PILL_PAD = 5;
  const highlightW =
    pillTrackW > 0 ? (pillTrackW - PILL_PAD * 2 - 4) / 2 : 0;
  const highlightX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, highlightW + 4],
  });

  // Sliding highlight + crossfade for the method toggle. The design offers
  // Mobile / WhatsApp / Email when logging in, but signup requires mobile
  // verification, so it shows SMS / WhatsApp only.
  const METHODS: Method[] = signup ? ['mobile', 'whatsapp'] : ['mobile', 'whatsapp', 'email'];
  const [methodTrackW, setMethodTrackW] = useState(0);
  const methodSlide = useRef(
    new Animated.Value(METHODS.indexOf(method)),
  ).current;
  const fieldFade = useRef(new Animated.Value(1)).current;

  const switchMethod = useCallback(
    (next: Method) => {
      if (next === method) return;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Animated.spring(methodSlide, {
        toValue: METHODS.indexOf(next),
        useNativeDriver: true,
        friction: 9,
        tension: 90,
      }).start();
      Animated.timing(fieldFade, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }).start(() => {
        setMethod(next);
        Animated.timing(fieldFade, {
          toValue: 1,
          duration: 190,
          useNativeDriver: true,
        }).start();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [method, methodSlide, fieldFade],
  );

  const METHOD_PAD = 4;
  const methodCount = METHODS.length;
  const methodHighlightW =
    methodTrackW > 0 ? (methodTrackW - METHOD_PAD * 2 - (methodCount - 1) * 4) / methodCount : 0;
  const methodHighlightX = methodSlide.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, methodHighlightW + 4, (methodHighlightW + 4) * 2],
  });

  // Signup can't use email — snap back to mobile when the mode flips.
  useEffect(() => {
    if (signup && method === 'email') {
      setMethod('mobile');
      methodSlide.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signup]);

  const valid =
    method === 'email' ? isValidEmail(email) : isValidIndianMobile(phone);

  const onSubmit = async () => {
    if (!valid || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      const identifier =
        method === 'email' ? { email: email.trim() } : { phone: phone.trim() };
      const res = await sendOtp(identifier, signup ? 'signup' : 'login', method);
      if (res.success) {
        navigation.navigate('Otp');
      } else if (res.code === 'USER_NOT_FOUND') {
        // No account yet — bounce them into the Sign Up tab.
        switchMode('signup');
        showToast(res.message || 'No account found. Please sign up.', 'err');
      } else if (res.code === 'PHONE_EXISTS' || res.code === 'EMAIL_EXISTS') {
        // Already registered — bounce them into the Log In tab.
        switchMode('login');
        showToast(res.message || 'Account already exists. Please log in.', 'err');
      } else {
        showToast(res.message || 'Could not send code', 'err');
      }
    } finally {
      setLoading(false);
    }
  };

  const onSkipGuest = () => {
    continueAsGuest();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <ScreenContainer background={colors.white} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.flex}>
          <View style={styles.heroWrap}>
            <View style={styles.heroBanner}>
              <Image source={images.onboard1} style={styles.heroImg} resizeMode="cover" />
            </View>
            <Animated.View style={[styles.heroCopy, { opacity: fade }]}>
              <Text style={styles.heroTitle}>{signup ? 'Create your account' : 'Welcome back'}</Text>
              <Text style={styles.heroSub}>
                {signup
                  ? 'Sign up to access your account & exclusive offers.'
                  : 'Log in to continue to fresh & organic.'}
              </Text>
            </Animated.View>
          </View>

          <View style={styles.body}>
            <View
              style={styles.pillToggle}
              onLayout={(e) => setPillTrackW(e.nativeEvent.layout.width)}
            >
              {highlightW > 0 && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.pillHighlight,
                    { width: highlightW, transform: [{ translateX: highlightX }] },
                  ]}
                />
              )}
              {(['login', 'signup'] as Mode[]).map((id) => {
                const on = mode === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => switchMode(id)}
                    style={styles.pillBtn}
                  >
                    <Text style={[styles.pillLabel, on && styles.pillLabelOn]}>
                      {id === 'login' ? 'Log In' : 'Sign Up'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View
              style={styles.methodToggle}
              onLayout={(e) => setMethodTrackW(e.nativeEvent.layout.width)}
            >
              {methodHighlightW > 0 && (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.methodHighlight,
                    {
                      width: methodHighlightW,
                      transform: [{ translateX: methodHighlightX }],
                    },
                  ]}
                />
              )}
              {METHODS.map((id) => {
                const on = method === id;
                const label =
                  id === 'mobile'
                    ? signup ? 'SMS' : 'Mobile'
                    : id === 'whatsapp'
                      ? 'WhatsApp'
                      : 'Email';
                return (
                  <Pressable
                    key={id}
                    onPress={() => switchMethod(id)}
                    style={styles.methodBtn}
                  >
                    <Text style={[styles.methodLabel, on && styles.methodLabelOn]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Animated.View style={{ opacity: fieldFade }}>
            {method === 'email' ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <View style={styles.inputWrap}>
                  <Icon name="mail" size={18} color={colors.textMuted} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="davidjonson@gmail.com"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    testID="auth-email-input"
                    accessibilityLabel="Email address"
                  />
                </View>
              </View>
            ) : (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  {method === 'whatsapp' ? 'WhatsApp number' : 'Mobile number'}
                </Text>
                <View style={styles.inputWrap}>
                  <Pressable style={styles.ccBtn} onPress={() => setCcOpen(true)} hitSlop={6}>
                    <Flag iso={isoForCode(countryCode)} width={26} />
                    <Text style={styles.ccCode}>{countryCode}</Text>
                    <Icon name="chevronDown" size={13} color={colors.textMuted} strokeWidth={2.6} />
                  </Pressable>
                  <TextInput
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, '').slice(0, 10))}
                    keyboardType="number-pad"
                    placeholder="10-digit number"
                    placeholderTextColor={colors.textMuted}
                    style={styles.input}
                    maxLength={10}
                    testID="auth-phone-input"
                    accessibilityLabel="Mobile number"
                  />
                </View>
              </View>
            )}

            <View style={styles.trustRow}>
              <Icon name="shield" size={15} color={colors.primary} />
              <Text style={styles.trustText}>
                {signup
                  ? `Mobile verification is required. Code will be sent via ${
                      method === 'whatsapp' ? 'WhatsApp.' : 'SMS.'
                    }`
                  : method === 'whatsapp'
                    ? 'We’ll send the code to your WhatsApp.'
                    : 'We’ll send a 4-digit verification code.'}
              </Text>
            </View>
            </Animated.View>

            <View style={styles.ctaWrap}>
              <PrimaryButton
                testID="auth-send-otp"
                label={loading ? 'Sending…' : signup ? 'Create Account' : 'Log In'}
                onPress={onSubmit}
                disabled={!valid || loading}
                loading={loading}
              />
            </View>

            <Animated.View style={[styles.toggleRow, { opacity: fade }]}>
              <Text style={styles.toggleText}>
                {signup ? 'Already have an account? ' : 'New here? '}
              </Text>
              <Pressable onPress={() => switchMode(signup ? 'login' : 'signup')} testID="auth-switch-mode">
                <Text style={styles.toggleLink}>{signup ? 'Log in' : 'Sign up'}</Text>
              </Pressable>
            </Animated.View>

            <Pressable onPress={onSkipGuest} style={styles.guestWrap} testID="auth-guest">
              <Text style={styles.guestText}>Skip · Browse as guest</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <CountryCodeSheet
        visible={ccOpen}
        value={countryCode}
        onSelect={setCountryCode}
        onClose={() => setCcOpen(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heroWrap: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: 72,
    borderBottomRightRadius: 72,
    paddingBottom: spacing.md + 2,
    alignItems: 'stretch',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  heroBanner: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignSelf: 'stretch',
    borderBottomLeftRadius: 80,
    borderBottomRightRadius: 80,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroCopy: {
    alignItems: 'center',
    paddingHorizontal: spacing.md + 8,
  },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 21,
    color: colors.text,
    letterSpacing: -0.3,
    marginTop: spacing.sm + 4,
    textAlign: 'center',
  },
  heroSub: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 5,
    textAlign: 'center',
  },
  body: {
    paddingHorizontal: spacing.md + 8,
    paddingTop: spacing.sm + 4,
    // Deliberate breathing room under the guest link — the auth block is never
    // stretched to the bottom edge.
    paddingBottom: spacing.xl,
  },
  pillToggle: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.round,
    padding: 5,
    shadowColor: '#14231a',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  pillBtn: { flex: 1, paddingVertical: 11, borderRadius: radii.round, alignItems: 'center' },
  pillHighlight: {
    position: 'absolute',
    left: 5,
    top: 5,
    bottom: 5,
    borderRadius: radii.round,
    backgroundColor: colors.primary,
  },
  pillLabel: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.textMuted },
  pillLabelOn: { color: colors.white },
  methodToggle: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 4,
    marginTop: spacing.sm + 2,
  },
  methodBtn: { flex: 1, paddingVertical: 9, borderRadius: radii.sm + 5, alignItems: 'center' },
  methodHighlight: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: radii.sm + 5,
    backgroundColor: colors.white,
    shadowColor: '#456e29',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  methodLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textMuted },
  methodLabelOn: { color: colors.primaryDark },
  field: { marginTop: spacing.sm + 2 },
  fieldLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 12.5,
    color: colors.textMuted,
    marginBottom: 7,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.xl - 2,
    paddingHorizontal: 14,
  },
  ccBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  ccCode: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text },
  input: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 14,
  },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: spacing.sm },
  trustText: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textMuted },
  ctaWrap: { marginTop: spacing.sm + 6 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.sm + 4,
  },
  toggleText: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.textMuted },
  toggleLink: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.primaryDark },
  passwordLinkWrap: { alignSelf: 'center', marginTop: spacing.md },
  passwordLink: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },
  guestWrap: { alignSelf: 'center', marginTop: spacing.sm + 2 },
  guestText: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.textMuted },
});
