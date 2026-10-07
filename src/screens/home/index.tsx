import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AnimatedIcon, Icon, ProductCard, Skeleton, SkeletonRow, StateView, useBottomNavHeight } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { catalogApi } from '../../services/catalog.service';
import type { ApiCategory, ApiProduct } from '../../services/catalog.service';
import {
  bannerImageUri,
  isHeroBannerSection,
  loadHomeCategories,
  resolveHomeSections,
  type HomeBanner,
  type HomeLifestyleItem,
  type ResolvedHomeSection,
} from '../../utils/homeResolve';
import { resolveListingStock } from '../../utils/catalogMappers';
import HeroCarousel from '../../components/HeroCarousel';
import { checkStockAlerts } from '../../utils/stockAlerts';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useOrders } from '../../context/OrdersContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useAuth } from '../../context/AuthContext';
import { useAddress } from '../../context/AddressContext';
import { useDeliveryEta } from '../../utils/useDeliveryEta';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_META: Record<string, { label: string }> = {
  pending: { label: 'Order placed' },
  confirmed: { label: 'Confirmed' },
  'getting-packed': { label: 'Getting packed' },
  'on-the-way': { label: 'On the way' },
  arrived: { label: 'Arrived' },
  delivered: { label: 'Delivered' },
  cancelled: { label: 'Cancelled' },
};

function toProductCard(p: ApiProduct) {
  const price = Number(p.price ?? 0);
  const mrp = Number(p.mrp ?? p.originalPrice ?? p.price ?? 0);
  const photo = p.imageUrl || p.thumbnailUrl || p.cardImageUrl || (Array.isArray(p.images) ? p.images[0] : '');
  const rating = typeof p.rating === 'number' ? p.rating : ((p.rating as { average?: number })?.average ?? 0);
  const unit = (Array.isArray(p.variants) && p.variants[0]?.size) || p.size || p.quantity || p.uom || '1 unit';
  const stock = resolveListingStock(p);
  return {
    id: p._id,
    categoryId: p.categoryId || '',
    sub: '',
    name: p.name,
    unit,
    price,
    mrp: mrp || price,
    stockQuantity: stock,
    maxOrderLimit: typeof p.maxOrderLimit === 'number' && p.maxOrderLimit > 0 ? Math.floor(p.maxOrderLimit) : null,
    image: photo ? { uri: photo } : { uri: '' },
    rating,
    bytes: [] as string[],
  };
}

/** Shimmer stand-in matching the design's `_homeSkeleton()`. */
function HomeSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton height={168} radius={20} />
      <View style={styles.skeletonCats}>
        <SkeletonRow count={4} gap={10} radius={16} />
      </View>
      <View style={styles.skeletonGrid}>
        <SkeletonRow count={3} gap={8} radius={16} aspectRatio={0.62} />
      </View>
      <View style={styles.skeletonGrid}>
        <SkeletonRow count={3} gap={8} radius={16} aspectRatio={0.62} />
      </View>
    </View>
  );
}

const HOME_GRID_PAD = 16;
const HOME_GRID_GAP = 8;
const HOME_GRID_COLS = 3;

export default function HomeScreen() {
  const navH = useBottomNavHeight();
  const { width: screenW } = useWindowDimensions();
  // Floor the share: on fractional-dp widths (e.g. 1280px @ density 3 → 426.667dp)
  // an exact division rounds each card up to the next whole pixel, so the row
  // overflows by ~1px and the last card wraps, leaving a hole in the grid.
  const gridItemWidth = Math.floor(
    (screenW - HOME_GRID_PAD * 2 - HOME_GRID_GAP * (HOME_GRID_COLS - 1)) / HOME_GRID_COLS,
  );
  const navigation = useNavigation<Nav>();
  const cart = useCart();
  const wishlist = useWishlist();
  const { activeOrder, refreshActiveOrder } = useOrders();
  const { unreadCount } = useNotifications();
  const { isAuthenticated } = useAuth();
  const { selectedAddress } = useAddress();
  const etaText = useDeliveryEta();

  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [sections, setSections] = useState<ResolvedHomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(false);
    try {
      const home = await catalogApi.getHome();
      const [cats, resolved] = await Promise.all([
        loadHomeCategories(home),
        resolveHomeSections(home),
      ]);
      setCategories(cats);
      setSections(resolved);
    } catch {
      try {
        const cats = await catalogApi.getCategories({ isActive: true, limit: 20 });
        setCategories(cats);
        setSections([]);
      } catch {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Back-in-stock alerts set from Product Detail (throttled).
    checkStockAlerts().catch(() => {});
  }, [load]);

  // Pull-to-refresh: keep the current content on screen while re-fetching.
  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([load({ silent: true }), isAuthenticated ? refreshActiveOrder() : Promise.resolve()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, isAuthenticated, refreshActiveOrder]);

  const heroSection = useMemo(() => {
    const hero = sections.find(isHeroBannerSection);
    if (hero && hero.kind === 'banners') return hero;
    return sections.find(s => s.kind === 'banners') as
      | Extract<ResolvedHomeSection, { kind: 'banners' }>
      | undefined;
  }, [sections]);

  const bodySections = useMemo(() => {
    if (!heroSection) return sections;
    return sections.filter(s => s.key !== heroSection.key);
  }, [sections, heroSection]);

  const onBell = () => {
    if (isAuthenticated) navigation.navigate('Notifications');
    else navigation.navigate('EnterMobile', { mode: 'login' });
  };

  const onLocation = () => {
    if (isAuthenticated) navigation.navigate('Addresses');
    else navigation.navigate('EnterMobile', { mode: 'login' });
  };

  const navigateBanner = (b: HomeBanner) => {
    if (b.redirectType === 'product' && b.redirectValue) {
      navigation.navigate('ProductDetail', { productId: b.redirectValue });
      return;
    }
    if (b.redirectType === 'category' && b.redirectValue) {
      navigation.navigate('CategoryProducts', { categoryId: b.redirectValue });
      return;
    }
    if (b.redirectType === 'collection' && b.redirectValue) {
      navigation.navigate('Collection', { collectionKey: b.redirectValue, title: b.title || 'Collection' });
      return;
    }
    if (b.link) {
      const catMatch = b.link.match(/\/categor(?:y|ies)\/([^/?#]+)/i);
      if (catMatch?.[1]) {
        navigation.navigate('CategoryProducts', { categoryId: decodeURIComponent(catMatch[1]) });
        return;
      }
      const prodMatch = b.link.match(/\/products?\/([^/?#]+)/i);
      if (prodMatch?.[1]) {
        navigation.navigate('ProductDetail', { productId: decodeURIComponent(prodMatch[1]) });
        return;
      }
    }
    if (categories[0]) {
      navigation.navigate('CategoryProducts', { categoryId: categories[0].slug || categories[0]._id });
    }
  };

  const navigateLifestyle = (item: HomeLifestyleItem) => {
    if (item.redirectType === 'category' && item.redirectValue) {
      navigation.navigate('CategoryProducts', { categoryId: item.redirectValue });
      return;
    }
    if (item.redirectType === 'product' && item.redirectValue) {
      navigation.navigate('ProductDetail', { productId: item.redirectValue });
      return;
    }
    if (item.redirectType === 'collection' && item.redirectValue) {
      navigation.navigate('Collection', {
        collectionKey: item.redirectValue,
        title: item.title || item.name || 'Collection',
      });
      return;
    }
    if (item.link) {
      const catMatch = item.link.match(/\/categor(?:y|ies)\/([^/?#]+)/i);
      if (catMatch?.[1]) {
        navigation.navigate('CategoryProducts', { categoryId: decodeURIComponent(catMatch[1]) });
        return;
      }
      const prodMatch = item.link.match(/\/products?\/([^/?#]+)/i);
      if (prodMatch?.[1]) {
        navigation.navigate('ProductDetail', { productId: decodeURIComponent(prodMatch[1]) });
        return;
      }
      const colMatch = item.link.match(/\/collections?\/([^/?#]+)/i);
      if (colMatch?.[1]) {
        navigation.navigate('Collection', {
          collectionKey: decodeURIComponent(colMatch[1]),
          title: item.title || item.name || 'Collection',
        });
        return;
      }
    }
    // No usable target configured — search for the card's theme rather than
    // leaving the tap dead.
    const label = (item.title || item.name || '').trim();
    navigation.navigate('Search', label ? { q: label } : undefined);
  };

  const renderProductGrid = (products: ApiProduct[]) => (
    <View style={styles.grid}>
      {products.map(p => {
        const card = toProductCard(p);
        return (
          <View key={card.id} style={[styles.gridItem, { width: gridItemWidth }]}>
            <ProductCard
              product={card}
              quantity={cart.quantityOf(card.id)}
              wished={wishlist.isWished(card.id)}
              addVariant="circle"
              onPress={() => navigation.navigate('ProductDetail', { productId: card.id })}
              onToggleWish={() => wishlist.toggleWish(card.id)}
              onAdd={() =>
                cart.addToCart({
                  id: card.id,
                  name: card.name,
                  unit: card.unit,
                  price: card.price,
                  mrp: card.mrp,
                  stockQuantity: card.stockQuantity,
                  maxOrderLimit: card.maxOrderLimit,
                  image: card.image,
                })
              }
              onIncrement={() => cart.incrementItem(card.id, undefined, card.maxOrderLimit)}
              onDecrement={() => cart.decrementItem(card.id)}
            />
          </View>
        );
      })}
    </View>
  );

  // Every hero banner with artwork, as a swipeable auto-advancing carousel.
  const renderHero = (banners: HomeBanner[]) => {
    const withArt = banners
      .map((b, i) => ({ b, uri: bannerImageUri(b), key: b._id || b.bannerId || `hero-${i}` }))
      .filter((x): x is { b: HomeBanner; uri: string; key: string } => !!x.uri);
    if (!withArt.length) return null;
    return (
      <View style={styles.heroCard}>
        <HeroCarousel
          testID="home-hero-banner"
          slides={withArt.map(x => ({ key: x.key, uri: x.uri }))}
          width={screenW - 32}
          height={168}
          onPress={i => navigateBanner(withArt[i].b)}
        />
      </View>
    );
  };

  const renderBannerRow = (section: Extract<ResolvedHomeSection, { kind: 'banners' }>) => (
    <View key={section.key} style={styles.section} testID={`home-banners-${section.key}`}>
      {section.label ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.label}</Text>
        </View>
      ) : null}
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bannerRail}
      >
        {section.items.map((b, i) => {
          const uri = bannerImageUri(b);
          return (
            <Pressable
              key={b._id || b.bannerId || `${section.key}-${i}`}
              style={styles.promoBannerCard}
              onPress={() => navigateBanner(b)}
              testID={`home-banner-${b.bannerId || i}`}
            >
              {uri ? (
                <Image source={{ uri }} style={styles.promoBannerImage} resizeMode="cover" />
              ) : (
                <View style={[styles.promoBannerImage, { backgroundColor: colors.tint }]} />
              )}
              {(b.title || b.subtitle) && (
                <View style={styles.promoBannerText}>
                  {b.title ? (
                    <Text style={styles.promoBannerTitle} numberOfLines={2}>
                      {b.title}
                    </Text>
                  ) : null}
                  {b.subtitle ? (
                    <Text style={styles.promoBannerSub} numberOfLines={1}>
                      {b.subtitle}
                    </Text>
                  ) : null}
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderLifestyle = (section: Extract<ResolvedHomeSection, { kind: 'lifestyle' }>) => (
    <View key={section.key} style={styles.section} testID={`home-lifestyle-${section.key}`}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.label || 'Curated for you'}</Text>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.curatedRail}
      >
        {section.items.map((item, i) => (
          <Pressable
            key={item._id || `${section.key}-${i}`}
            style={styles.curatedCard}
            onPress={() => navigateLifestyle(item)}
            testID={`home-lifestyle-item-${i}`}
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={styles.curatedImage} resizeMode="cover" />
            ) : (
              <View style={[styles.curatedImage, { backgroundColor: colors.tint }]} />
            )}
            <View style={styles.curatedTextWrap}>
              <Text style={styles.curatedTitle}>{item.title || item.name || 'Explore'}</Text>
              {item.subtitle ? <Text style={styles.curatedSubtitle}>{item.subtitle}</Text> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const hasContent =
    categories.length > 0 ||
    sections.some(
      s =>
        (s.kind === 'products' && s.products.length > 0) ||
        (s.kind === 'banners' && s.items.length > 0) ||
        (s.kind === 'lifestyle' && s.items.length > 0),
    );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <LinearGradient colors={[colors.white, colors.white]} style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <Pressable style={styles.locBtn} onPress={onLocation} hitSlop={6}>
            <Icon name="pin" size={18} color={colors.primary} />
            <View style={styles.locTextWrap}>
              <View style={styles.locTitleRow}>
                <Text style={styles.locTitle} numberOfLines={1}>
                  {selectedAddress
                    ? etaText
                      ? `Delivery in ${etaText}`
                      : `Delivering to ${selectedAddress.label}`
                    : 'Set location'}
                </Text>
                <Icon name="chevronDown" size={14} color={colors.textMuted} />
              </View>
              <Text style={styles.locSub} numberOfLines={1}>
                {selectedAddress
                  ? `${etaText ? `${selectedAddress.label} · ` : ''}${selectedAddress.line1}, ${selectedAddress.city}`
                  : 'Tap to add an address'}
              </Text>
            </View>
          </Pressable>
          <View style={styles.headerActions}>
            <Pressable
              style={styles.iconBtn}
              onPress={() => navigation.navigate('Search')}
              hitSlop={6}
              testID="home-search"
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Icon name="search" size={20} color={colors.text} />
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={onBell}
              hitSlop={6}
              testID="home-notifications"
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <AnimatedIcon name="bell" motion="ring" trigger={unreadCount} size={20} color={colors.text} />
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: navH }]}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {activeOrder ? (
          <Pressable style={styles.orderBanner} onPress={() => navigation.navigate('Tracking', { orderId: activeOrder.id })}>
            <Icon name="truck" size={24} color={colors.white} />
            <View style={styles.orderBannerText}>
              <Text style={styles.orderBannerTitle}>
                Order {activeOrder.orderNumber} · {STATUS_META[activeOrder.status]?.label || activeOrder.status}
              </Text>
              <Text style={styles.orderBannerSub}>Tap to track live</Text>
            </View>
            <Icon name="chevronRight" size={20} color={colors.white} />
          </Pressable>
        ) : null}

        {loading ? (
          <HomeSkeleton />
        ) : error ? (
          <View style={styles.hPad}>
            <StateView
              kind="error"
              title="Couldn't load Selorg"
              message="We couldn't reach the store. Check your connection and try again."
              ctaLabel="Retry"
              onCta={load}
              icon="wifiOff"
            />
          </View>
        ) : !hasContent ? (
          <View style={styles.hPad}>
            <StateView
              kind="empty"
              title="Nothing to show yet"
              message="Your store is being stocked. Pull back in a moment."
              ctaLabel="Reload"
              onCta={load}
              icon="leaf"
            />
          </View>
        ) : (
          <>
            {heroSection?.kind === 'banners' ? renderHero(heroSection.items) : null}

            {categories.length > 0 ? (
              <View style={styles.section} testID="home-categories">
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Shop by category</Text>
                  <Pressable
                    onPress={() => (navigation as { navigate: (a: string, b?: object) => void }).navigate('Main', { screen: 'CategoriesTab' })}
                    hitSlop={6}
                  >
                    <Text style={styles.seeAll}>See all</Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  directionalLockEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.catRail}
                >
                  {categories.map(c => (
                    <Pressable
                      key={c._id}
                      style={styles.catItem}
                      onPress={() => navigation.navigate('CategoryProducts', { categoryId: c.slug || c._id })}
                      testID={`home-category-${c.slug || c._id}`}
                    >
                      <View style={styles.catImageWrap}>
                        {c.image ? (
                          <Image source={{ uri: c.image }} style={styles.catImage} resizeMode="cover" />
                        ) : (
                          <View style={[styles.catImage, { backgroundColor: '#FFFFFF' }]} />
                        )}
                      </View>
                      <Text style={styles.catLabel} numberOfLines={2}>
                        {c.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {bodySections.map(section => {
              if (section.kind === 'banners') return renderBannerRow(section);
              if (section.kind === 'lifestyle') return renderLifestyle(section);
              if (section.kind === 'products' && section.products.length > 0) {
                return (
                  <View key={section.key} style={styles.section} testID={`home-products-${section.key}`}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>{section.label}</Text>
                      <Pressable
                        onPress={() =>
                          // Pass the section key: Collection resolves both section
                          // and collection keys (a slug alone 404s for non-collection sections).
                          navigation.navigate('Collection', {
                            collectionKey: section.key,
                            title: section.label,
                          })
                        }
                        hitSlop={6}
                      >
                        <Text style={styles.seeAll}>See all</Text>
                      </Pressable>
                    </View>
                    {renderProductGrid(section.products)}
                  </View>
                );
              }
              return null;
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  headerWrap: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  locBtn: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  locTextWrap: { flex: 1, minWidth: 0 },
  locTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locTitle: { flexShrink: 1, fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  locSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeLabel: { fontFamily: fontFamily.bold, fontSize: 9, color: colors.white },

  scroll: { flex: 1 },
  // No horizontal padding here. Full-bleed rails used to cancel it with a
  // negative margin, which made this vertical scroller wider than the screen
  // so the feed drifted sideways on its own.
  scrollContent: { paddingBottom: 32 },
  hPad: { paddingHorizontal: 16 },

  skeletonWrap: { marginTop: 16, paddingHorizontal: 16 },
  skeletonCats: { marginTop: 20 },
  skeletonGrid: { marginTop: 20 },

  orderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.text,
    borderRadius: radii.xl,
    padding: 14,
    marginTop: 14,
    marginHorizontal: 16,
  },
  orderBannerText: { flex: 1, minWidth: 0 },
  orderBannerTitle: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.white },
  orderBannerSub: { fontFamily: fontFamily.semibold, fontSize: 12, color: 'rgba(255,255,255,0.67)', marginTop: 2 },

  heroCard: {
    marginTop: 16,
    borderRadius: radii.xxl,
    overflow: 'hidden',
    marginHorizontal: 16,
    height: 168,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  heroImage: { width: '100%', height: '100%' },

  section: { marginTop: 22 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text, flex: 1, paddingRight: 8 },
  seeAll: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.primary },

  catRail: { paddingHorizontal: 16, gap: 12 },
  catItem: { width: 76, alignItems: 'center' },
  catImageWrap: {
    width: 68,
    height: 68,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catImage: { width: '100%', height: '100%' },
  catLabel: {
    marginTop: 6,
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
    color: colors.text,
    textAlign: 'center',
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  gridItem: { flexGrow: 0, flexShrink: 0 },

  bannerRail: { paddingHorizontal: 16, gap: 12 },
  promoBannerCard: {
    width: 220,
    height: 120,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.tint,
  },
  promoBannerImage: { ...StyleSheet.absoluteFillObject },
  promoBannerText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 10,
    backgroundColor: 'rgba(20,35,26,0.55)',
  },
  promoBannerTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.white },
  promoBannerSub: { fontFamily: fontFamily.semibold, fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  curatedRail: { paddingHorizontal: 16, gap: 12 },
  curatedCard: {
    width: 148,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  curatedImage: { width: '100%', height: 96 },
  curatedTextWrap: { padding: 10 },
  curatedTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text },
  curatedSubtitle: { fontFamily: fontFamily.semibold, fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
