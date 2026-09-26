import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, shadows } from '../../theme';
import { ScreenContainer, Header, Icon, PrimaryButton, StateView } from '../../components';
import { useOrders } from '../../context/OrdersContext';
import { showToast } from '../../utils/toast';
import { RootStackParamList } from '../../navigation/types';

export default function RateOrder() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'RateOrder'>>();
  const { orders, rateOrder } = useOrders();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const order = orders.find(o => o.id === route.params?.orderId);

  if (!order) {
    return (
      <ScreenContainer>
        <Header title="Rate your order" onBack={() => navigation.goBack()} />
        <StateView
          kind="empty"
          icon="box"
          title="Order not found"
          message="This order may have been removed."
          ctaLabel="Back to orders"
          onCta={() => navigation.navigate('Orders')}
        />
      </ScreenContainer>
    );
  }

  const onSubmit = async () => {
    if (stars === 0 || submitting) return;
    setSubmitting(true);
    try {
      await rateOrder(order.id, stars, comment.trim() || undefined);
      navigation.replace('RatingSuccess');
    } catch {
      showToast('Could not submit rating', 'err');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <Header title="Rate your order" subtitle={`#${order.orderNumber}`} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.prompt}>How was your experience?</Text>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(n => (
            <Pressable key={n} onPress={() => setStars(n)} hitSlop={6} style={styles.starTouchable}>
              <Icon
                name="star"
                size={38}
                color={n <= stars ? colors.star : '#CBD2C7'}
                fill={n <= stars ? colors.star : 'transparent'}
                strokeWidth={1.6}
              />
            </Pressable>
          ))}
        </View>

        <View style={styles.commentCard}>
          <Text style={styles.commentLabel}>ADD A COMMENT (optional)</Text>
          <TextInput
            style={styles.commentInput}
            placeholder="Tell us what you loved or what we can improve…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={comment}
            onChangeText={setComment}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={submitting ? 'Submitting…' : 'Submit rating'}
          disabled={stars === 0 || submitting}
          loading={submitting}
          onPress={onSubmit}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, gap: 18 },
  prompt: { fontFamily: fontFamily.bold, fontSize: 16.5, color: colors.text, textAlign: 'center', marginTop: 6 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  starTouchable: { padding: 2 },
  commentCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.card,
  },
  commentLabel: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.textMuted, letterSpacing: 0.4, marginBottom: 8 },
  commentInput: { fontFamily: fontFamily.medium, fontSize: 14, color: colors.text, minHeight: 90 },
  footer: { padding: 16, paddingTop: 6 },
});
