import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '../theme';
import { formatCurrency } from '../utils/format';
import type { Product } from '../types/product';
import Icon from './Icon';
import QuantityStepper from './QuantityStepper';

interface Props {
  product: Product;
  quantity: number;
  wished: boolean;
  onPress: () => void;
  onToggleWish: () => void;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  /** The design's grid treatment is the circular "+"; `compact` is the ADD pill. */
  addVariant?: 'compact' | 'circle';
}

/**
 * Grid product card, matching `_productCard()` in the prototype:
 * edge-to-edge 1:1 image with the discount ribbon and wishlist chip floating
 * over it, then name + rating pill, then price/unit + add control. The card
 * itself carries no padding — every inner block pads itself — so the image
 * bleeds to the rounded corners.
 */
export default function ProductCard({
  product,
  quantity,
  wished,
  onPress,
  onToggleWish,
  onAdd,
  onIncrement,
  onDecrement,
  addVariant = 'circle',
}: Props) {
  const off = product.mrp > product.price ? Math.round((1 - product.price / product.mrp) * 100) : 0;
  const outOfStock = product.stockQuantity === 0;
  const hasPhoto = !!(product.image as { uri?: string })?.uri || typeof product.image === 'number';

  // `heartpop .4s` from the design.
  const heart = useRef(new Animated.Value(1)).current;
  const prevWished = useRef(wished);
  useEffect(() => {
    if (prevWished.current === wished) return;
    prevWished.current = wished;
    if (!wished) return;
    heart.setValue(1);
    Animated.sequence([
      Animated.timing(heart, { toValue: 1.35, duration: 150, useNativeDriver: true }),
      Animated.spring(heart, { toValue: 1, useNativeDriver: true, friction: 4, tension: 160 }),
    ]).start();
  }, [wished, heart]);

  return (
    <View style={styles.card} testID={`product-card-${product.id}`}>
      <View>
        <Pressable onPress={onPress} testID={`product-open-${product.id}`} accessibilityLabel={product.name}>
          <View style={styles.imageWrap}>
            {hasPhoto ? (
              <Image source={product.image} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Icon name="box" size={28} color={colors.textMuted} strokeWidth={1.6} />
              </View>
            )}
          </View>
        </Pressable>

        {off > 0 ? (
          <View style={styles.offBadge}>
            <Text style={styles.offLabel}>-{off}%</Text>
          </View>
        ) : null}

        <Pressable onPress={onToggleWish} style={styles.wishBtn} hitSlop={6}>
          <Animated.View style={{ transform: [{ scale: heart }] }}>
            <Icon
              name="heart"
              size={16}
              color={wished ? colors.danger : '#8A938C'}
              strokeWidth={2.2}
              fill={wished ? colors.danger : 'none'}
            />
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.nameRow}>
        <Pressable onPress={onPress} style={styles.nameFlex}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        </Pressable>
        {product.rating > 0 ? (
          <View style={styles.ratingPill}>
            <Icon name="star" size={11} color={colors.star} fill={colors.star} strokeWidth={0} />
            <Text style={styles.ratingLabel}>{product.rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.priceCol}>
          <Text style={styles.price} numberOfLines={1}>{formatCurrency(product.price)}</Text>
          {product.unit ? (
            <Text style={styles.unit} numberOfLines={1}>/{product.unit}</Text>
          ) : null}
        </View>
        <QuantityStepper
          quantity={quantity}
          outOfStock={outOfStock}
          onAdd={onAdd}
          onIncrement={onIncrement}
          onDecrement={onDecrement}
          variant={addVariant}
          testIDPrefix={`product-${product.id}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#14231A',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  // 1:1 so the media scales with the card on every screen width (no fixed height).
  imageWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#FFFFFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  offBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.danger,
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 8,
    shadowColor: colors.danger,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  offLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.white },
  wishBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingHorizontal: 10, paddingTop: 10 },
  nameFlex: { flex: 1, minWidth: 0, minHeight: 33 },
  name: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text, lineHeight: 16.5 },
  ratingPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.tint,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  ratingLabel: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.primaryDark },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 'auto',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  priceCol: { flex: 1, minWidth: 0 },
  price: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.primaryDark },
  unit: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
});
