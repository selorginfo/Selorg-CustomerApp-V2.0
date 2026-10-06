import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, fontFamily, radii, spacing } from '../../theme';
import {
  CleanBadges,
  AnimatedIcon,
  Icon,
  ImageZoomModal,
  PrimaryButton,
  QuantityStepper,
  SkeletonDetail,
  StateView,
} from '../../components';
import { catalogApi } from '../../services/catalog.service';
import type { ApiProduct, ApiProductDetail } from '../../services/catalog.service';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useAddress } from '../../context/AddressContext';
import { formatCurrency } from '../../utils/format';
import { showToast } from '../../utils/toast';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type PDPRoute = RouteProp<RootStackParamList, 'ProductDetail'>;

const STAR_EMPTY = '#DCE0D8';
const NAV_FADE_AT = 170;

type Variant = NonNullable<ApiProductDetail['variants']>[number];

const BENEFITS = ['Farm fresh', 'Quality checked', 'Naturally ripened', 'No preservatives'];
const CLEAN_PROMISE = ['Pesticide-Free', 'Fertilizer-Free', 'Chemical-Free', 'Non-GMO'];

/** The four accordions the design ships on the PDP. */
const ACCORDIONS: { key: string; title: string; body: string }[] = [
  {
    key: 'details',
    title: 'Product details',
    body:
      'Hand-picked, quality-checked produce sourced daily from partner organic farms. Stored cold and delivered from the darkstore nearest to you for maximum freshness.',
  },
  {
    key: 'nutrition',
    title: 'Nutrition information',
    body:
      'A natural source of vitamins, fibre and antioxidants. Free from artificial colours, flavours and preservatives.',
  },
  {
    key: 'storage',
    title: 'Storage & specifications',
    body:
      'Keep refrigerated. Best consumed within 3–5 days of delivery. Net quantity as per the selected size. Country of origin: India.',
  },
  {
    key: 'return',
    title: 'Return & refund',
    body:
      'Not satisfied? Report within 24 hours of delivery for a full refund or replacement — no questions asked.',
  },
];

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

function getRating(raw?: number | { average?: number } | null): number {
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  return raw.average ?? 0;
}
function getReviewCount(raw?: number | { count?: number; total?: number } | null): number {
  if (!raw || typeof raw === 'number') return 0;
  return raw.count ?? raw.total ?? 0;
}
function getPhoto(p: ApiProduct): string {
  return p.imageUrl || p.thumbnailUrl || p.cardImageUrl || (Array.isArray(p.images) ? p.images[0] : '') || '';
}
function getPrice(p: ApiProduct): number { return Number(p.price ?? 0); }
function getMrp(p: ApiProduct): number { return Number(p.mrp ?? p.originalPrice ?? p.price ?? 0); }
function getUnit(p: ApiProduct): string {
  return (Array.isArray(p.variants) && p.variants[0]?.size) || p.size || p.quantity || p.uom || '1 unit';
}
function getStock(p: ApiProduct): number {
  return typeof p.stockQuantity === 'number' ? p.stockQuantity : (p.stock !== false && p.stock !== 0 ? 99 : 0);
}

export default function ProductDetail() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<PDPRoute>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { quantityOf, addToCart, incrementItem, decrementItem } = useCart();
  const { isWished, toggleWish } = useWishlist();
  const { selectedAddress } = useAddress();

  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [related, setRelated] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [imgIndex, setImgIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [variantIndex, setVariantIndex] = useState(0);
  const [openAcc, setOpenAcc] = useState<string | null>('details');

  const navOpacity = useRef(new Animated.Value(0)).current;
  const priceFade = useRef(new Animated.Value(1)).current;

  const productId = params?.productId;

  useEffect(() => {
    if (!productId) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    setImgIndex(0);
    setVariantIndex(0);
    catalogApi.getProductDetail(productId)
      .then(res => {
        const p = res?.product;
        if (p?._id) {
          setProduct(p);
          setVariants(res.variants || []);
          setRelated(res.relatedProducts || []);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [productId]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const past = e.nativeEvent.contentOffset.y > NAV_FADE_AT;
      navOpacity.stopAnimation();
      Animated.timing(navOpacity, {
        toValue: past ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    },
    [navOpacity],
  );

  // Gallery images: the product's own image list, de-duplicated.
  const gallery = useMemo(() => {
    if (!product) return [];
    const list = [
      getPhoto(product),
      ...(Array.isArray(product.images) ? product.images : []),
    ].filter(Boolean);
    return Array.from(new Set(list));
  }, [product]);

  const onGalleryScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (i !== imgIndex) setImgIndex(i);
  };

  const selectVariant = (i: number) => {
    if (i === variantIndex) return;
    setVariantIndex(i);
    priceFade.setValue(0.2);
    Animated.timing(priceFade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.plainHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.glassBtn} hitSlop={8}>
            <Icon name="chevronLeft" size={19} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <SkeletonDetail />
      </SafeAreaView>
    );
  }

  if (error || !product) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.plainHeader}>
          <Pressable onPress={() => navigation.goBack()} style={styles.glassBtn} hitSlop={8}>
            <Icon name="chevronLeft" size={19} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <StateView
          kind="error"
          title="Product not found"
          message="This product may no longer be available."
          ctaLabel="Go back"
          onCta={() => navigation.goBack()}
        />
      </SafeAreaView>
    );
  }

  const basePrice = getPrice(product);
  const baseMrp = getMrp(product);
  const activeVariant = variants[variantIndex];
  const price = activeVariant?.price != null ? Number(activeVariant.price) : basePrice;
  const mrp = activeVariant?.originalPrice != null ? Number(activeVariant.originalPrice) : baseMrp;
  const unit = activeVariant?.size || getUnit(product);
  const stockQty = getStock(product);
  const rating = getRating(product.rating);
  const reviewCount = getReviewCount(product.rating as { count?: number } | undefined);
  const off = mrp > price ? Math.round((1 - price / mrp) * 100) : 0;
  const qty = quantityOf(product._id, activeVariant?.id);
  const oos = stockQty === 0;
  const wished = isWished(product._id);
  const deliverTo = selectedAddress?.city;

  const stockLabel = oos
    ? 'Currently out of stock'
    : stockQty <= 3
      ? `Only ${stockQty} left in stock`
      : 'In stock, ready to pack';

  const cartProduct = {
    id: product._id,
    name: product.name,
    unit,
    price,
    mrp,
    stockQuantity: stockQty,
    image: gallery[0] ? { uri: gallery[0] } : undefined,
    variantId: activeVariant?.id,
    maxOrderLimit: typeof product.maxOrderLimit === 'number' ? product.maxOrderLimit : null,
  };

  const goCart = () => navigation.navigate('Cart');

  return (
    <View style={styles.root} testID="product-detail">
      {/* Scroll-reactive floating header — transparent over the gallery,
          frosted white with the product name once past the fold. */}
      <View style={[styles.navWrap, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Animated.View style={[styles.navBackdrop, { opacity: navOpacity }]} pointerEvents="none" />
        <View style={styles.navRow} pointerEvents="box-none">
          <Pressable onPress={() => navigation.goBack()} style={styles.glassBtn} hitSlop={8}>
            <Icon name="chevronLeft" size={19} color={colors.text} strokeWidth={2.2} />
          </Pressable>
          <Animated.Text style={[styles.navTitle, { opacity: navOpacity }]} numberOfLines={1}>
            {product.name}
          </Animated.Text>
          <Pressable onPress={() => toggleWish(product._id)} style={styles.glassBtn} hitSlop={8}>
            <AnimatedIcon
              name="heart"
              motion="pop"
              active={wished}
              size={19}
              color={wished ? colors.danger : colors.text}
              strokeWidth={2.2}
              fill={wished ? colors.danger : 'none'}
            />
          </Pressable>
          <Pressable
            onPress={() => showToast('Share link copied', 'info')}
            style={styles.glassBtn}
            hitSlop={8}
          >
            <Icon name="share" size={18} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Gallery */}
        <View style={styles.gallery}>
          {gallery.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              nestedScrollEnabled
              directionalLockEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onGalleryScroll}
            >
              {gallery.map((uri, i) => (
                <Pressable key={uri + i} onPress={() => setZoomOpen(true)} style={{ width }}>
                  <View style={styles.galleryPage}>
                    <Image source={{ uri }} style={styles.galleryImg} resizeMode="contain" />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.galleryPage, { width }]}>
              <Icon name="box" size={48} color={colors.textMuted} strokeWidth={1.4} />
            </View>
          )}

          {gallery.length > 1 ? (
            <View style={[styles.counter, { top: insets.top + 58 }]}>
              <Text style={styles.counterLabel}>{imgIndex + 1} / {gallery.length}</Text>
            </View>
          ) : null}

          {off > 0 ? (
            <View style={styles.offRibbon}>
              <Text style={styles.offRibbonLabel}>{off}% OFF</Text>
            </View>
          ) : null}

          {gallery.length > 1 ? (
            <View style={styles.dots}>
              {gallery.map((_, i) => (
                <View key={i} style={[styles.dot, i === imgIndex && styles.dotOn]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={styles.brand}>{(product.brand || 'Selorg Organic').toUpperCase()}</Text>
          <Text style={styles.name}>{product.name}</Text>

          {rating > 0 ? (
            <Pressable
              style={styles.ratingRow}
              onPress={() => navigation.navigate('Reviews', { productId: product._id })}
              hitSlop={6}
            >
              <StarRow value={rating} size={15} />
              <Text style={styles.ratingValue}>{rating.toFixed(1)}</Text>
              {reviewCount > 0 ? (
                <Text style={styles.ratingMeta}>· {reviewCount.toLocaleString('en-IN')} reviews</Text>
              ) : null}
            </Pressable>
          ) : null}

          <Text style={styles.description}>
            Fresh, naturally ripened and lab-tested for purity. Hand-picked and delivered from the darkstore
            nearest you.
          </Text>

          {/* Price */}
          <Animated.View style={[styles.priceRow, { opacity: priceFade }]}>
            <Text style={styles.price}>{formatCurrency(price)}</Text>
            {off > 0 ? <Text style={styles.mrp}>{formatCurrency(mrp)}</Text> : null}
            {off > 0 ? (
              <View style={styles.offPill}>
                <Text style={styles.offPillLabel}>{off}% OFF</Text>
              </View>
            ) : null}
          </Animated.View>
          <Text style={styles.taxNote}>Inclusive of all taxes</Text>

          {/* Variants — rendered only when the API actually returns more than one. */}
          {variants.length > 1 ? (
            <View style={styles.section}>
              <Text style={styles.blockTitle}>Select size</Text>
              <View style={styles.variantRow}>
                {variants.map((v, i) => {
                  const on = i === variantIndex;
                  return (
                    <Pressable
                      key={v.id || i}
                      onPress={() => selectVariant(i)}
                      style={[styles.variantPill, on && styles.variantPillOn]}
                    >
                      <Text style={[styles.variantLabel, on && styles.variantLabelOn]} numberOfLines={1}>
                        {v.size || `Option ${i + 1}`}
                      </Text>
                      {v.price != null ? (
                        <Text style={[styles.variantSub, on && styles.variantSubOn]} numberOfLines={1}>
                          {formatCurrency(Number(v.price))}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Delivery / stock */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Icon name="truck" size={19} color={colors.primary} strokeWidth={2} />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>Delivery in 20–30 mins</Text>
                {deliverTo ? <Text style={styles.infoSub}>Delivering to {deliverTo}</Text> : null}
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Icon name="check" size={19} color={oos ? colors.danger : colors.primary} strokeWidth={2.6} />
              <Text style={[styles.infoText, oos && styles.infoTextDanger]}>{stockLabel}</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Icon name="check" size={19} color={colors.primary} strokeWidth={2.6} />
              <Text style={styles.infoText}>Free delivery on orders above ₹199</Text>
            </View>
          </View>

          {/* Why you'll love it */}
          <View style={styles.section}>
            <Text style={styles.blockTitle}>Why you&rsquo;ll love it</Text>
            <View style={styles.benefitGrid}>
              {BENEFITS.map(b => (
                <View key={b} style={styles.benefitCell}>
                  <Icon name="check" size={15} color={colors.primary} strokeWidth={2.6} />
                  <Text style={styles.benefitLabel} numberOfLines={2}>{b}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Clean food promise */}
          <View style={styles.promiseCard}>
            <View style={styles.promiseHead}>
              <Icon name="leaf" size={15} color={colors.primary} strokeWidth={2} />
              <Text style={styles.promiseTitle}>CLEAN FOOD PROMISE</Text>
            </View>
            <CleanBadges items={CLEAN_PROMISE} />
          </View>

          {/* Accordions */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Product information</Text>
            {ACCORDIONS.map(a => {
              const open = openAcc === a.key;
              return (
                <View key={a.key} style={styles.accRow}>
                  <Pressable
                    style={styles.accHeader}
                    onPress={() => setOpenAcc(open ? null : a.key)}
                  >
                    <Text style={styles.accTitle}>{a.title}</Text>
                    <Icon
                      name={open ? 'x' : 'plus'}
                      size={17}
                      color={colors.textMuted}
                      strokeWidth={2.4}
                    />
                  </Pressable>
                  {open ? <Text style={styles.accBody}>{a.body}</Text> : null}
                </View>
              );
            })}
          </View>

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionHeading}>Reviews</Text>
              <Pressable onPress={() => navigation.navigate('Reviews', { productId: product._id })} hitSlop={6}>
                <Text style={styles.seeAllLink}>See all →</Text>
              </Pressable>
            </View>
            {rating > 0 ? (
              <View style={styles.reviewSummary}>
                <View style={styles.reviewScoreCol}>
                  <Text style={styles.reviewScore}>{rating.toFixed(1)}</Text>
                  <StarRow value={rating} size={13} />
                </View>
                <View style={styles.reviewMetaCol}>
                  <Text style={styles.reviewVerdict}>
                    {rating >= 4.5 ? 'Excellent' : rating >= 4 ? 'Very good' : rating >= 3 ? 'Good' : 'Mixed'}
                  </Text>
                  <Text style={styles.reviewMetaSub}>
                    {reviewCount > 0
                      ? `Based on ${reviewCount.toLocaleString('en-IN')} verified reviews`
                      : 'Average rating from verified orders'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.reviewSummary}>
                <Text style={styles.reviewMetaSub}>
                  No ratings yet. Rate your order after delivery from the Orders screen.
                </Text>
              </View>
            )}
          </View>

          {/* Related products — straight from the API's relatedProducts. */}
          {related.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>You may also like</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedRail}
                style={styles.relatedRailOuter}
              >
                {related.map(rp => {
                  const rPhoto = getPhoto(rp);
                  const rPrice = getPrice(rp);
                  const rMrp = getMrp(rp);
                  const rOff = rMrp > rPrice;
                  const rStock = getStock(rp);
                  const inCart = quantityOf(rp._id) > 0;
                  return (
                    <View key={rp._id} style={styles.relatedCard}>
                      <Pressable onPress={() => navigation.push('ProductDetail', { productId: rp._id })}>
                        <View style={styles.relatedImgWrap}>
                          {rPhoto ? (
                            <Image source={{ uri: rPhoto }} style={styles.relatedImg} resizeMode="contain" />
                          ) : (
                            <Icon name="box" size={24} color={colors.textMuted} />
                          )}
                        </View>
                        <Text style={styles.relatedName} numberOfLines={2}>{rp.name}</Text>
                      </Pressable>
                      <View style={styles.relatedBottom}>
                        <View style={styles.relatedPriceWrap}>
                          <Text style={styles.relatedPrice} numberOfLines={1}>{formatCurrency(rPrice)}</Text>
                          {rOff ? (
                            <Text style={styles.relatedMrp} numberOfLines={1}>{formatCurrency(rMrp)}</Text>
                          ) : null}
                        </View>
                        <Pressable
                          disabled={rStock === 0}
                          onPress={() =>
                            addToCart({
                              id: rp._id,
                              name: rp.name,
                              unit: getUnit(rp),
                              price: rPrice,
                              mrp: rMrp,
                              stockQuantity: rStock,
                              image: rPhoto ? { uri: rPhoto } : undefined,
                            })
                          }
                          style={[styles.relatedAdd, rStock === 0 && styles.relatedAddOff]}
                          hitSlop={4}
                        >
                          <Icon
                            name={inCart ? 'check' : 'plus'}
                            size={16}
                            color={rStock === 0 ? '#B7C1B6' : colors.primary}
                            strokeWidth={2.6}
                          />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Sticky purchase bar */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerTotalLabel}>Total</Text>
          <Text style={styles.footerTotalValue}>{formatCurrency(price * Math.max(qty, 1))}</Text>
        </View>

        {qty > 0 && !oos ? (
          <View style={styles.footerStepper}>
            <QuantityStepper
              quantity={qty}
              variant="block"
              testIDPrefix={`product-${product._id}`}
              onAdd={() => addToCart(cartProduct)}
              onIncrement={() => incrementItem(product._id, activeVariant?.id)}
              onDecrement={() => decrementItem(product._id, activeVariant?.id)}
            />
          </View>
        ) : null}

        <View style={styles.footerAction}>
          {oos ? (
            <PrimaryButton
              label="Notify me"
              icon="bell"
              onPress={() => showToast("We'll notify you when it's back in stock", 'info')}
            />
          ) : qty > 0 ? (
            <PrimaryButton label="Go to cart" icon="cart" onPress={goCart} />
          ) : (
            <PrimaryButton
              testID="product-add-to-cart"
              label="Add to cart"
              icon="plus"
              onPress={() => addToCart(cartProduct)}
            />
          )}
        </View>
      </View>

      <ImageZoomModal visible={zoomOpen} uri={gallery[imgIndex] || ''} onClose={() => setZoomOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  plainHeader: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8 },

  navWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, paddingBottom: 8 },
  navBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  navTitle: { flex: 1, minWidth: 0, fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.text },
  glassBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  scrollContent: { paddingBottom: 24 },
  gallery: { position: 'relative', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  galleryPage: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  galleryImg: { width: '82%', height: '82%' },
  counter: {
    position: 'absolute',
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radii.round,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  counterLabel: { fontFamily: fontFamily.semibold, fontSize: 11, color: colors.white },
  offRibbon: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    backgroundColor: colors.primary,
    borderRadius: radii.round,
    paddingVertical: 6,
    paddingHorizontal: 12,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  offRibbonLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.white },
  dots: { position: 'absolute', left: 0, right: 0, bottom: 16, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C9D2CB' },
  dotOn: { width: 18, backgroundColor: colors.primary },

  body: { paddingHorizontal: spacing.md, paddingTop: 20 },
  brand: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primary, letterSpacing: 1 },
  name: { fontFamily: fontFamily.bold, fontSize: 23, color: colors.text, marginTop: 4, lineHeight: 27 },
  starRow: { flexDirection: 'row', gap: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  ratingValue: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text },
  ratingMeta: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.textMuted },
  description: {
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: 10,
  },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  price: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.text },
  mrp: { fontFamily: fontFamily.medium, fontSize: 16, color: colors.textMuted, textDecorationLine: 'line-through' },
  offPill: { backgroundColor: colors.tint, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.md },
  offPillLabel: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },
  taxNote: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 4 },

  section: { marginTop: 20 },
  blockTitle: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text, marginBottom: 10 },
  sectionHeading: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.text, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAllLink: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },

  variantRow: { flexDirection: 'row', gap: 10 },
  variantPill: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: radii.xl - 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  variantPillOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  variantLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text },
  variantLabelOn: { color: colors.white },
  variantSub: { fontFamily: fontFamily.semibold, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  variantSubOn: { color: 'rgba(255,255,255,0.85)' },

  infoCard: {
    marginTop: 20,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  infoTextWrap: { flex: 1, minWidth: 0 },
  infoTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text },
  infoSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  infoText: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.text },
  infoTextDanger: { color: colors.danger },
  infoDivider: { height: 1, backgroundColor: colors.border },

  benefitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  benefitCell: {
    width: '48%',
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.tint,
    borderRadius: radii.lg,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  benefitLabel: { flex: 1, minWidth: 0, fontFamily: fontFamily.semibold, fontSize: 12, color: colors.primaryDark },

  promiseCard: {
    marginTop: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl - 2,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  promiseHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9 },
  promiseTitle: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primaryDark, letterSpacing: 0.3 },

  accRow: { borderBottomWidth: 1, borderBottomColor: colors.border },
  accHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 16,
  },
  accTitle: { flex: 1, minWidth: 0, fontFamily: fontFamily.bold, fontSize: 14.5, color: colors.text },
  accBody: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 21,
    paddingBottom: 16,
  },

  reviewSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reviewScoreCol: { alignItems: 'center', gap: 4 },
  reviewScore: { fontFamily: fontFamily.bold, fontSize: 28, color: colors.text, lineHeight: 30 },
  reviewMetaCol: { flex: 1, minWidth: 0 },
  reviewVerdict: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.text },
  reviewMetaSub: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },

  relatedRailOuter: { marginHorizontal: -spacing.md },
  relatedRail: { gap: 12, paddingHorizontal: spacing.md, paddingVertical: 2 },
  relatedCard: {
    width: 150,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 10,
    gap: 6,
  },
  relatedImgWrap: {
    height: 96,
    borderRadius: radii.lg,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  relatedImg: { width: '82%', height: '82%' },
  relatedName: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
    color: colors.text,
    lineHeight: 16,
    minHeight: 32,
    marginTop: 6,
  },
  relatedBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  relatedPriceWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  relatedPrice: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  relatedMrp: {
    fontFamily: fontFamily.medium,
    fontSize: 10.5,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  relatedAdd: {
    width: 30,
    height: 30,
    borderRadius: radii.md + 1,
    backgroundColor: colors.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relatedAddOff: { backgroundColor: colors.placeholder },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#14231A',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  footerTotal: { flexShrink: 0 },
  footerTotalLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: colors.textMuted },
  footerTotalValue: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text },
  footerStepper: { flexShrink: 0 },
  footerAction: { flex: 1, minWidth: 0 },
});
