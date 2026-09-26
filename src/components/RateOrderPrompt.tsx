import React, { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import BottomSheet from './BottomSheet';
import Icon from './Icon';
import PrimaryButton from './PrimaryButton';
import type { Order } from '../context/OrdersContext';

const STAR_EMPTY = '#CBD2C7';
const LABELS = ['Tap a star to rate', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

interface Props {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  onSubmit: (stars: number, comment: string) => Promise<void> | void;
}

/**
 * Post-delivery rating prompt (`_reviewPromptOverlay`): order thumb + meta,
 * 5 stars with a live label, an optional comment box, Submit and
 * "Maybe later". Submits through OrdersContext.rateOrder — same endpoint the
 * full Rate screen uses.
 */
export default function RateOrderPrompt({ visible, order, onClose, onSubmit }: Props) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) return;
    setStars(0);
    setComment('');
    onClose();
  };

  const submit = async () => {
    if (stars === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(stars, comment.trim());
      setStars(0);
      setComment('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!order) return null;
  const thumb = order.items[0]?.image as ImageSourcePropType | undefined;

  return (
    <BottomSheet visible={visible} onClose={close} maxHeightPct={80}>
      <View style={styles.headRow}>
        <View style={styles.thumbWrap}>
          {thumb ? (
            <Image source={thumb} style={styles.thumb} resizeMode="contain" />
          ) : (
            <Icon name="box" size={22} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.headText}>
          <Text style={styles.headTitle}>Rate your order</Text>
          <Text style={styles.headSub}>
            #{order.orderNumber} · {order.items.length} item{order.items.length === 1 ? '' : 's'}
          </Text>
        </View>
        <Pressable onPress={close} style={styles.closeBtn} hitSlop={8}>
          <Icon name="x" size={16} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
            <Icon
              name="star"
              size={34}
              color={n <= stars ? colors.star : STAR_EMPTY}
              fill={n <= stars ? colors.star : 'transparent'}
              strokeWidth={1.6}
            />
          </Pressable>
        ))}
      </View>
      <Text style={[styles.label, stars > 0 && styles.labelOn]}>{LABELS[stars]}</Text>

      <View style={styles.commentCard}>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Share what you loved or what we can improve… (optional)"
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={styles.commentInput}
        />
      </View>

      <View style={styles.submitWrap}>
        <PrimaryButton
          label={submitting ? 'Submitting…' : 'Submit review'}
          disabled={stars === 0 || submitting}
          loading={submitting}
          onPress={submit}
        />
      </View>
      <Pressable onPress={close} style={styles.laterBtn} hitSlop={6}>
        <Text style={styles.laterLabel}>Maybe later</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbWrap: {
    width: 46,
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '84%', height: '84%' },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text },
  headSub: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.md,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16, marginBottom: 4 },
  label: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.textMuted, textAlign: 'center', height: 18 },
  labelOn: { color: colors.primary },
  commentCard: {
    marginTop: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl - 2,
    padding: 12,
  },
  commentInput: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.text,
    minHeight: 72,
    padding: 0,
    lineHeight: 20,
  },
  submitWrap: { marginTop: 14 },
  laterBtn: { alignSelf: 'center', paddingVertical: 12 },
  laterLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.textMuted },
});
