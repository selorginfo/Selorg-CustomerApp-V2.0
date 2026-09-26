import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily } from '../../theme';
import { ScreenContainer, Icon, PrimaryButton, ConfettiBackground } from '../../components';
import { RootStackParamList } from '../../navigation/types';

export default function RatingSuccess() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScreenContainer background={colors.white}>
      <View style={styles.content}>
        <View style={styles.confettiWrap}>
          <ConfettiBackground width={340} height={158} />
        </View>

        <View style={styles.badge}>
          <Icon name="star" size={44} color={colors.white} fill={colors.white} strokeWidth={2} />
        </View>

        <Text style={styles.title}>Thanks for rating!</Text>
        <Text style={styles.subtitle}>
          Your feedback helps us keep the produce fresh and the delivery experience great.
        </Text>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label="Back to orders" onPress={() => navigation.navigate('Orders')} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 14 },
  confettiWrap: { position: 'absolute', top: 40, alignSelf: 'center' },
  badge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fontFamily.bold, fontSize: 23, color: colors.text, marginTop: 8 },
  subtitle: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 260 },
  footer: { padding: 20 },
});
