import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { Icon, PrimaryButton, Header, StateView, ScreenContainer, SkeletonForm } from '../../components';
import { catalogApi } from '../../services/catalog.service';
import { showToast } from '../../utils/toast';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type WriteReviewRoute = RouteProp<RootStackParamList, 'WriteReview'>;

const STAR_EMPTY = '#DCE0D8';
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export default function WriteReview() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<WriteReviewRoute>();
  const productId = params?.productId;

  const [productName, setProductName] = useState('');
  const [productUnit, setProductUnit] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!productId) { setError(true); setLoading(false); return; }
    catalogApi.getProductDetail(productId)
      .then(res => {
        const p = res?.product || (res as any);
        if (p?._id) {
          setProductName(p.name || '');
          const unit = (Array.isArray(p.variants) && p.variants[0]?.size) || p.size || p.quantity || p.uom || '1 unit';
          setProductUnit(unit);
          const photo = p.imageUrl || p.thumbnailUrl || p.cardImageUrl || (Array.isArray(p.images) ? p.images[0] : '');
          setPhotoUri(photo || '');
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [productId]);

  // There is no product-review endpoint yet; the flow still gives the user
  // real submit feedback and hands them to the order-rating path that does
  // reach the backend (POST /orders/{id}/rate).
  const submit = () => {
    if (stars === 0 || submitting) return;
    setSubmitting(true);
    showToast('Product reviews are coming soon · rate your order from Orders', 'info');
    setSubmitting(false);
    navigation.goBack();
  };

  if (loading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <Header title="Write a review" onBack={() => navigation.goBack()} />
        <SkeletonForm />
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <Header title="Write a review" onBack={() => navigation.goBack()} />
        <StateView
          kind="error"
          title="Product not found"
          message="This product may no longer be available."
          ctaLabel="Go back"
          onCta={() => navigation.goBack()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <Header title="Write a review" subtitle={productName} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.productCard}>
          <View style={styles.thumbWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.thumb} resizeMode="contain" />
            ) : (
              <Icon name="image" size={28} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.productMeta}>
            <Text style={styles.productName} numberOfLines={2}>{productName}</Text>
            <Text style={styles.productUnit}>{productUnit}</Text>
          </View>
        </View>

        <Text style={styles.prompt}>How would you rate it?</Text>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map(n => (
            <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
              <Icon
                name="star"
                size={38}
                color={n <= stars ? colors.star : STAR_EMPTY}
                strokeWidth={0}
                fill={n <= stars ? colors.star : STAR_EMPTY}
              />
            </Pressable>
          ))}
        </View>
        <Text style={styles.ratingLabel}>{RATING_LABELS[stars]}</Text>

        <View style={styles.textCard}>
          <Text style={styles.textLabel}>YOUR REVIEW</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Share what you loved or what could be better…"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={5}
            style={styles.textInput}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={submitting ? 'Posting…' : 'Post review'}
          onPress={submit}
          disabled={stars === 0}
          loading={submitting}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.md, paddingBottom: 24 },

  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 12,
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '82%', height: '82%' },
  productMeta: { flex: 1, minWidth: 0 },
  productName: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  productUnit: { fontFamily: fontFamily.medium, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },

  prompt: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text, textAlign: 'center', marginTop: 22 },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
  ratingLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.primary, textAlign: 'center', height: 18, marginTop: 8 },

  textCard: {
    marginTop: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 14,
  },
  textLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  textInput: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text,
    minHeight: 110,
    lineHeight: 20,
    padding: 0,
  },

  footer: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
