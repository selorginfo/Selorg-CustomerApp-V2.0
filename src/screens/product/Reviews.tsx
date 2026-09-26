import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, spacing } from '../../theme';
import { Header, Icon, PrimaryButton, ScreenContainer, SkeletonList, StateView } from '../../components';
import { catalogApi } from '../../services/catalog.service';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ReviewsRoute = RouteProp<RootStackParamList, 'Reviews'>;

const STAR_EMPTY = '#DCE0D8';

/** Shape the backend uses when a product carries reviews. */
interface ProductReview {
  id?: string;
  _id?: string;
  author?: string;
  userName?: string;
  rating?: number;
  comment?: string;
  text?: string;
  verified?: boolean;
  isMine?: boolean;
}

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <View style={styles.starRow}>
      {[0, 1, 2, 3, 4].map(i => (
        <Icon
          key={i}
          name="star"
          size={size}
          color={i < rounded ? colors.star : STAR_EMPTY}
          strokeWidth={0}
          fill={i < rounded ? colors.star : STAR_EMPTY}
        />
      ))}
    </View>
  );
}

export default function Reviews() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<ReviewsRoute>();
  const productId = params?.productId;

  const [productName, setProductName] = useState('');
  const [rating, setRating] = useState(0);
  const [total, setTotal] = useState(0);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!productId) {
      setError(true);
      setLoading(false);
      return;
    }
    catalogApi
      .getProductDetail(productId)
      .then(res => {
        const p = res?.product as (typeof res.product & {
          reviews?: ProductReview[];
          reviewCount?: number;
        }) | undefined;
        if (!p?._id) {
          setError(true);
          return;
        }
        setProductName(p.name || '');
        const raw = p.rating;
        const avg = typeof raw === 'number' ? raw : (raw as { average?: number })?.average ?? 0;
        const count =
          p.reviewCount ??
          (typeof raw === 'object' ? (raw as { count?: number })?.count ?? 0 : 0);
        setRating(avg);
        setTotal(count);
        setReviews(Array.isArray(p.reviews) ? p.reviews : []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [productId]);

  // Star distribution, computed from the reviews the API actually returned.
  const histogram = useMemo(() => {
    if (reviews.length === 0) return null;
    const buckets = [0, 0, 0, 0, 0];
    reviews.forEach(r => {
      const n = Math.min(Math.max(Math.round(r.rating ?? 0), 1), 5);
      buckets[n - 1] += 1;
    });
    return [5, 4, 3, 2, 1].map(star => ({
      star,
      pct: Math.round((buckets[star - 1] / reviews.length) * 100),
    }));
  }, [reviews]);

  if (loading) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <Header title="Reviews" onBack={() => navigation.goBack()} />
        <SkeletonList count={5} />
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer edges={['top', 'bottom']}>
        <Header title="Reviews" onBack={() => navigation.goBack()} />
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

  const hasAnything = rating > 0 || reviews.length > 0;

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <Header title="Reviews" subtitle={productName} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {hasAnything ? (
          <View style={styles.summaryCard}>
            <View style={styles.summaryScoreCol}>
              <Text style={styles.summaryScore}>{rating.toFixed(1)}</Text>
              <StarRow value={rating} size={15} />
              <Text style={styles.summaryCount}>
                {(total || reviews.length).toLocaleString('en-IN')} review
                {(total || reviews.length) === 1 ? '' : 's'}
              </Text>
            </View>
            {histogram ? (
              <View style={styles.barsCol}>
                {histogram.map(({ star, pct }) => (
                  <View key={star} style={styles.barRow}>
                    <Text style={styles.barStar}>{star}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.barPct}>{pct}%</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.barsCol}>
                <Text style={styles.noBreakdown}>
                  Star breakdown appears once written reviews come in.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {reviews.length > 0 ? (
          <View style={styles.list}>
            {reviews.map((r, i) => {
              const name = r.author || r.userName || 'Selorg customer';
              const body = r.comment || r.text || '';
              return (
                <View key={r.id || r._id || i} style={styles.reviewCard}>
                  <View style={styles.reviewHead}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarInitial}>{name[0]?.toUpperCase() || 'U'}</Text>
                    </View>
                    <View style={styles.reviewHeadText}>
                      <Text style={styles.reviewName} numberOfLines={1}>{name}</Text>
                      <StarRow value={r.rating ?? 0} size={12} />
                    </View>
                    {r.isMine ? (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeLabel}>You</Text>
                      </View>
                    ) : r.verified !== false ? (
                      <View style={styles.verifiedRow}>
                        <Icon name="check" size={12} color={colors.primary} strokeWidth={3} />
                        <Text style={styles.verifiedLabel}>Verified</Text>
                      </View>
                    ) : null}
                  </View>
                  {body ? <Text style={styles.reviewBody}>&ldquo;{body}&rdquo;</Text> : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <StateView
              kind="empty"
              title={hasAnything ? 'No written reviews yet' : 'No reviews yet'}
              message="Be the first to tell other shoppers what you thought. Rate your order after delivery from the Orders screen."
              icon="star"
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label="Back to product" icon="chevronLeft" onPress={() => navigation.goBack()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: { padding: spacing.md, paddingBottom: 24 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl + 2,
    padding: 18,
  },
  summaryScoreCol: { alignItems: 'center', flexShrink: 0 },
  summaryScore: { fontFamily: fontFamily.bold, fontSize: 38, color: colors.text, lineHeight: 40 },
  starRow: { flexDirection: 'row', gap: 1 },
  summaryCount: { fontFamily: fontFamily.semibold, fontSize: 11, color: colors.textMuted, marginTop: 4 },
  barsCol: { flex: 1, minWidth: 0, gap: 5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barStar: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.textMuted, width: 8 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.borderLight, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.star },
  barPct: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted, width: 30, textAlign: 'right' },
  noBreakdown: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  list: { marginTop: 14, gap: 12 },
  reviewCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 14,
  },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.primaryDark },
  reviewHeadText: { flex: 1, minWidth: 0, gap: 2 },
  reviewName: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  verifiedLabel: { fontFamily: fontFamily.bold, fontSize: 10, color: colors.primary },
  youBadge: { backgroundColor: colors.tint, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 8 },
  youBadgeLabel: { fontFamily: fontFamily.bold, fontSize: 10, color: colors.primary },
  reviewBody: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
    marginTop: 10,
  },

  emptyWrap: { marginTop: 8 },
  footer: {
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
