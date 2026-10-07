import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AnimatedIcon, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import { probeConnectivity } from '../../utils/connectivity';
import { showToast } from '../../utils/toast';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function NoInternetScreen() {
  const navigation = useNavigation<Nav>();
  const [checking, setChecking] = useState(false);

  // Re-check the connection; only leave once it's really back.
  const onTryAgain = async () => {
    if (checking) return;
    setChecking(true);
    const ok = await probeConnectivity();
    setChecking(false);
    if (!ok) {
      showToast('Still offline. Check Wi-Fi or mobile data.', 'err');
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.wrap}>
        <View style={styles.body}>
          <View style={styles.iconTile}>
            <AnimatedIcon name="wifiOff" motion="pulse" size={46} color={colors.danger} strokeWidth={2} />
          </View>
          <Text style={styles.title}>No internet connection</Text>
          <Text style={styles.message}>
            We couldn&rsquo;t reach Selorg. Check your connection and try again — your cart is saved.
          </Text>
        </View>
        <PrimaryButton
          label={checking ? 'Checking…' : 'Try again'}
          onPress={onTryAgain}
          loading={checking}
          disabled={checking}
          testID="no-internet-retry"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg + 4 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  iconTile: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.text, marginTop: 8 },
  message: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 270,
  },
});
