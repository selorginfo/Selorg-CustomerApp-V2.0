import React, { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import BillSummaryCard from '../../components/BillSummaryCard';
import {
  Header,
  Icon,
  PrimaryButton,
  QuantityStepper,
  ScreenContainer,
  StateView,
  useBottomNavHeight,
} from '../../components';
import type { IconName } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { useCart } from '../../context/CartContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const CLEAN_TAGS: { icon: IconName; label: string }[] = [
  { icon: 'shield', label: 'Pesticide-Free' },
  { icon: 'leaf', label: 'Fertilizer-Free' },
  { icon: 'check', label: 'Chemical-Free' },
  { icon: 'check', label: 'Non-GMO' },
  { icon: 'pin', label: 'Lab-Tested' },
];

export default function CartScreen() {
  // The floating nav overlays the screen, so pad content out from under it.
  const navH = useBottomNavHeight();
  const navigation = useNavigation<Nav>();
  const cart = useCart();
  const { items, totalItems, coupon, discount, quantityOf, addToCart, incrementItem, decrementItem, applyCoupon, removeCoupon } = cart;
  const [couponInput, setCouponInput] = useState('');

  const handleApplyCoupon = () => {
    if (!couponInput.trim()) return;
    applyCoupon(couponInput);
    setCouponInput('');
  };

  if (items.length === 0) {
    return (
      <ScreenContainer>
        <Header title="Your cart" hideBack />
        <View style={styles.emptyWrap}>
          <StateView
            kind="empty"
            title="Your cart is empty"
            message="Add fresh groceries and they’ll show up here."
            ctaLabel="Start shopping"
            onCta={() => navigation.navigate('Main')}
            lottieSource={require('../../../assets/lottie/empty-cart.json')}
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header title="Your cart" subtitle={`${totalItems} item${totalItems === 1 ? '' : 's'}`} hideBack />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.etaBanner}>
          <Icon name="zap" size={20} color={colors.white} />
          <View>
            <Text style={styles.etaTitle}>Delivery in 12–18 min</Text>
            <Text style={styles.etaSub}>From your nearest darkstore</Text>
          </View>
        </View>

        <View style={styles.itemsCard}>
          {items.map((it, idx) => (
            <View key={it.id} style={[styles.itemRow, idx < items.length - 1 && styles.itemRowBorder]}>
              <View style={styles.itemImageWrap}>
                <Image source={it.image as ImageSourcePropType} style={styles.itemImage} resizeMode="contain" />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{it.name}</Text>
                <Text style={styles.itemUnit}>{it.unit}</Text>
                <Text style={styles.itemPrice}>{formatCurrency(it.price * it.quantity)}</Text>
              </View>
              <QuantityStepper
                quantity={quantityOf(it.productId, it.variantId)}
                onAdd={() =>
                  addToCart({
                    id: it.productId,
                    name: it.name,
                    unit: it.unit,
                    price: it.price,
                    mrp: it.mrp,
                    stockQuantity: it.stockQuantity ?? null,
                    image: it.image,
                    variantId: it.variantId,
                    maxOrderLimit: it.maxOrderLimit,
                  })
                }
                onIncrement={() => incrementItem(it.productId, it.variantId, it.maxOrderLimit)}
                onDecrement={() => decrementItem(it.productId, it.variantId)}
              />
            </View>
          ))}
        </View>

        <View style={styles.cleanSection}>
          <View style={styles.cleanHeader}>
            <Icon name="leaf" size={16} color={colors.primary} strokeWidth={2} />
            <Text style={styles.cleanTitle}>CLEAN FOOD PROMISE</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cleanRow}>
            {CLEAN_TAGS.map(({ icon, label }, idx) => (
              <View key={label + idx} style={styles.cleanChip}>
                <View style={styles.cleanIconWrap}>
                  <Icon name={icon} size={15} color={colors.primary} strokeWidth={2.2} />
                </View>
                <Text style={styles.cleanLabel}>{label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.couponWrap}>
          {coupon ? (
            <View style={styles.couponApplied}>
              <Icon name="tag" size={18} color={colors.primaryDark} />
              <View style={styles.couponAppliedText}>
                <Text style={styles.couponAppliedTitle}>{coupon} applied</Text>
                <Text style={styles.couponAppliedSub}>You saved {formatCurrency(discount)}</Text>
              </View>
              <Pressable onPress={removeCoupon} hitSlop={8}>
                <Text style={styles.couponRemove}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.couponRow}>
              <TextInput
                value={couponInput}
                onChangeText={setCouponInput}
                placeholder="Enter coupon (SAVE10)"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                style={styles.couponInput}
              />
              <Pressable style={styles.couponApplyBtn} onPress={handleApplyCoupon} hitSlop={6}>
                <Text style={styles.couponApplyLabel}>Apply</Text>
              </Pressable>
            </View>
          )}
        </View>

        <BillSummaryCard />
      </ScrollView>

      <View style={[styles.bottomBar, { marginBottom: navH }]}>
        <PrimaryButton
          testID="cart-checkout"
          label="Proceed to Checkout"
          icon="arrowRight"
          disabled={items.length === 0}
          onPress={() => navigation.navigate('Checkout')}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  emptyWrap: { flex: 1, justifyContent: 'center' },
  scrollContent: { paddingBottom: 24 },
  etaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.text,
    borderRadius: radii.xl - 2,
    padding: 14,
  },
  etaTitle: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.white },
  etaSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: 'rgba(255,255,255,0.67)', marginTop: 2 },

  itemsCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xxl,
    overflow: 'hidden',
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemImageWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemImage: { width: '100%', height: '100%' },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  itemUnit: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  itemPrice: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text, marginTop: 3 },

  cleanSection: { marginTop: 16 },
  cleanHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, marginBottom: 8 },
  cleanTitle: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primaryDark, letterSpacing: 0.4 },
  cleanRow: { gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
  cleanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.round,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
  },
  cleanIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.text },

  couponWrap: { marginHorizontal: 16, marginTop: 14 },
  couponRow: { flexDirection: 'row', gap: 8 },
  couponInput: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.text,
  },
  couponApplyBtn: {
    paddingHorizontal: 18,
    borderRadius: radii.lg,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponApplyLabel: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.primaryDark },
  couponApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radii.xl - 2,
    padding: 14,
  },
  couponAppliedText: { flex: 1 },
  couponAppliedTitle: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.primaryDark },
  couponAppliedSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  couponRemove: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.danger },

  bottomBar: {
    padding: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
