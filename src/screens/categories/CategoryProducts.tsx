import React, { useCallback, useEffect, useMemo, useState } from 'react';
import LoadMoreFooter from '../../components/LoadMoreFooter';
import { usePager } from '../../utils/usePager';

const CATEGORY_PAGE = 40;
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Icon,
  ProductCard,
  ScreenContainer,
  SearchBar,
  Skeleton,
  StateView,
} from '../../components';
import type { AppTabKey } from '../../components';
import { colors, fontFamily, shadows } from '../../theme';
import { catalogApi } from '../../services/catalog.service';
import type { ApiCategory, ApiProduct } from '../../services/catalog.service';
import type { RootStackParamList } from '../../navigation/types';
import { resolveListingStock } from '../../utils/catalogMappers';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import {
  applyProductFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  FilterSheet,
  SortSheet,
  type ProductFilters,
} from './SortFilterSheet';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function toProductCard(p: ApiProduct) {
  const price = Number(p.price ?? 0);
  const mrp = Number(p.mrp ?? p.originalPrice ?? p.price ?? 0);
  const photo = p.imageUrl || p.thumbnailUrl || p.cardImageUrl || (Array.isArray(p.images) ? p.images[0] : '');
  const rating = typeof p.rating === 'number' ? p.rating : ((p.rating as any)?.average ?? 0);
  const unit = (Array.isArray(p.variants) && p.variants[0]?.size) || p.size || p.quantity || p.uom || '1 unit';
  const stock = resolveListingStock(p);
  return {
    id: p._id,
    categoryId: p.categoryId || '',
    sub: (p as { subcategoryName?: string }).subcategoryName || '',
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

export default function CategoryProductsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'CategoryProducts'>>();
  const { categoryId, sub: initialSub } = route.params;
  const { width } = useWindowDimensions();
  const cart = useCart();
  const wishlist = useWishlist();

  const [category, setCategory] = useState<ApiCategory | null>(null);
  const [allProducts, setAllProducts] = useState<ReturnType<typeof toProductCard>[]>([]);
  const [loadingCat, setLoadingCat] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Bumped by "Retry" to re-run the product fetch (re-setting the same tab was a no-op).
  const [reloadKey, setReloadKey] = useState(0);

  const [activeSub, setActiveSub] = useState<string>(initialSub || 'all');
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const fetchPage = useCallback(
    async (page: number) => {
      const res = await catalogApi.getCategoryProducts(categoryId, {
        page,
        limit: CATEGORY_PAGE,
        subcategory: activeSub === 'all' ? undefined : activeSub,
      });
      const raw = res?.products || (res as any) || [];
      return Array.isArray(raw) ? raw.map(toProductCard) : [];
    },
    [categoryId, activeSub],
  );
  const pager = usePager(fetchPage, CATEGORY_PAGE, setAllProducts);
  const { firstPageLoaded } = pager;

  useEffect(() => {
    setLoadingCat(true);
    Promise.all([
      catalogApi.getCategories({ isActive: true }).catch(() => [] as ApiCategory[]),
      catalogApi.getCategorySubcategories(categoryId).catch(() => [] as ApiCategory[]),
    ])
      .then(([all, children]) => {
        const match = all.find(c => c.slug === categoryId || c._id === categoryId);
        setCategory({ ...(match ?? ({ _id: categoryId, name: '' } as ApiCategory)), children });
      })
      .finally(() => setLoadingCat(false));
  }, [categoryId]);

  // Products carry no subcategory field, so the narrowing has to happen
  // server-side via `?subcategory=<slug>`; re-fetch whenever the tab changes.
  useEffect(() => {
    setLoadingProducts(true);
    setLoadError(false);
    let alive = true;
    fetchPage(1)
      .then(list => {
        if (!alive) return;
        setAllProducts(list);
        firstPageLoaded(list.length);
      })
      .catch(() => { if (alive) { setAllProducts([]); setLoadError(true); } })
      .finally(() => alive && setLoadingProducts(false));
    return () => {
      alive = false;
    };
  }, [fetchPage, firstPageLoaded, reloadKey]);

  // A sub-category given by name (older links, name-only catalogs) is mapped
  // to its slug once the children load, so the server filter matches.
  useEffect(() => {
    if (!category?.children?.length || activeSub === 'all') return;
    if (category.children.some(c => (c.slug || c._id) === activeSub)) return;
    const byName = category.children.find(
      c => c.name?.trim().toLowerCase() === activeSub.trim().toLowerCase(),
    );
    if (byName) setActiveSub(byName.slug || byName._id);
  }, [category, activeSub]);

  const subs = useMemo(() => {
    if (!category) return [] as { slug: string; name: string }[];
    if (category.children?.length) {
      return category.children.map(c => ({ slug: c.slug || c._id, name: c.name }));
    }
    if (category.subs?.length) return category.subs.map(name => ({ slug: name, name }));
    return [];
  }, [category]);

  const list = useMemo(() => applyProductFilters(allProducts, filters), [allProducts, filters]);
  const activeCount = countActiveFilters(filters);

  const chips = [{ slug: 'all', name: 'All' }, ...subs];
  const sectionTitle =
    activeSub === 'all'
      ? category?.name || 'All'
      : subs.find(s => s.slug === activeSub)?.name || category?.name || 'All';
  const searchHint = (category?.name || 'category').replace(/^Fresh\s+/i, '').toLowerCase();
  const loading = loadingCat || loadingProducts;

  // Sidebar scales with the viewport instead of being a hard 92px, so it stays
  // usable at 320px and doesn't look lost on a tablet.
  const sidebarW = Math.round(Math.min(Math.max(width * 0.24, 84), 120));

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActiveSub('all');
  };

  const goTab = (key: AppTabKey) => {
    // Cart is a root stack screen now, not one of the tabs.
    if (key === 'cart') {
      navigation.navigate('Cart');
      return;
    }
    const screen =
      key === 'home' ? 'HomeTab'
        : key === 'category' ? 'CategoriesTab'
        : key === 'order' ? 'OrdersTab'
        : 'ProfileTab';
    navigation.navigate('Main', { screen });
  };

  const getCategoryThumb = (subSlug: string): string => {
    const match = category?.children?.find(c => (c.slug || c._id) === subSlug);
    return match?.image || category?.image || '';
  };

  const header = (
    <View style={styles.headerRow}>
      <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
        <Icon name="chevronLeft" size={19} color={colors.text} strokeWidth={2.4} />
      </Pressable>
      <View style={styles.searchFlex}>
        <SearchBar placeholder={`Search in ${searchHint}…`} onPress={() => navigation.navigate('Search')} />
      </View>
    </View>
  );

  const renderMain = () => {
    if (loadError) {
      return (
        <StateView
          kind="error"
          title="Couldn't load products"
          message="Check your connection and try again."
          ctaLabel="Retry"
          onCta={() => setReloadKey(k => k + 1)}
          icon="wifiOff"
        />
      );
    }
    if (allProducts.length === 0) {
      return (
        <StateView
          kind="empty"
          title="No products here yet"
          message="This category is being restocked. Check back soon."
          ctaLabel="Browse home"
          onCta={() => goTab('home')}
          icon="box"
        />
      );
    }
    if (list.length === 0) {
      return (
        <StateView
          kind="empty"
          title="No products match"
          message="Try another sub-category or clear filters."
          ctaLabel="Show all"
          onCta={resetFilters}
          icon="filter"
        />
      );
    }
    return (
      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      >
        {list.map(p => (
          <View key={p.id} style={styles.gridItem}>
            <ProductCard
              product={p}
              quantity={cart.quantityOf(p.id)}
              wished={wishlist.isWished(p.id)}
              addVariant="compact"
              onPress={() => navigation.navigate('ProductDetail', { productId: p.id })}
              onToggleWish={() => wishlist.toggleWish(p.id)}
              onAdd={() => cart.addToCart({ id: p.id, name: p.name, unit: p.unit, price: p.price, mrp: p.mrp, stockQuantity: p.stockQuantity, maxOrderLimit: p.maxOrderLimit, image: p.image })}
              onIncrement={() => cart.incrementItem(p.id, undefined, p.maxOrderLimit)}
              onDecrement={() => cart.decrementItem(p.id)}
            />
          </View>
        ))}
        <View style={styles.loadMoreWrap}>
          <LoadMoreFooter hasMore={pager.hasMore} loading={pager.loadingMore} onPress={pager.loadMore} />
        </View>
      </ScrollView>
    );
  };

  return (
    <ScreenContainer edges={['top', 'bottom']} background={colors.white}>
      {header}

      <View style={styles.body}>
        {/* Full-height rail: margin-bottom here would detach the pane from the
            bottom of the screen, so the nav clearance goes on its contents. */}
        <View style={[styles.sidebar, { width: sidebarW }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sidebarList}>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={styles.sideItem}>
                    <Skeleton width={44} height={44} radius={12} />
                  </View>
                ))
              : chips.map(chip => {
                  const on = activeSub === chip.slug;
                  const isAll = chip.slug === 'all';
                  const thumbUri = isAll ? category?.image || '' : getCategoryThumb(chip.slug);
                  return (
                    <Pressable
                      key={chip.slug}
                      style={[styles.sideItem, on && styles.sideItemOn]}
                      onPress={() => setActiveSub(chip.slug)}
                      testID={`subcategory-${chip.slug}`}
                      accessibilityRole="button"
                      accessibilityLabel={chip.name}
                      accessibilityState={{ selected: on }}
                    >
                      <View style={[styles.sideThumb, on && styles.sideThumbOn]}>
                        {!isAll && thumbUri ? (
                          <Image source={{ uri: thumbUri }} style={styles.sideImage} resizeMode="cover" />
                        ) : (
                          <Icon name="grid" size={19} color={on ? colors.white : colors.textMuted} strokeWidth={2.2} />
                        )}
                      </View>
                      <Text style={[styles.sideLabel, on && styles.sideLabelOn]} numberOfLines={3}>
                        {chip.name}
                      </Text>
                    </Pressable>
                  );
                })}
          </ScrollView>
        </View>

        <View style={styles.main}>
          <View style={styles.mainHeader}>
            <View style={styles.mainTitles}>
              <Text style={styles.mainTitle} numberOfLines={2}>{sectionTitle}</Text>
              <Text style={styles.mainCount}>
                {list.length.toLocaleString('en-IN')} Product{list.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.toolRow}>
              <Pressable
                style={[styles.toolBtn, activeCount > 0 && styles.toolBtnOn]}
                onPress={() => setFilterOpen(true)}
                hitSlop={4}
                accessibilityLabel="Filters"
              >
                <Icon name="sort2" size={18} color={activeCount > 0 ? colors.primary : colors.text} strokeWidth={2.2} />
                {activeCount > 0 ? (
                  <View style={styles.toolBadge}>
                    <Text style={styles.toolBadgeLabel}>{activeCount}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={() => setSortOpen(true)} hitSlop={4} accessibilityLabel="Sort">
                <Icon name="sort" size={18} color={colors.text} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.grid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.gridItem}>
                  <Skeleton aspectRatio={0.72} radius={20} />
                </View>
              ))}
            </View>
          ) : (
            renderMain()
          )}
        </View>
      </View>

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        // Clear All resets filters only; the chosen sort order is kept.
        onReset={() => setFilters(f => ({ ...DEFAULT_FILTERS, sort: f.sort }))}
        resultCount={list.length}
      />
      <SortSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        value={filters.sort}
        onChange={sort => setFilters(f => ({ ...f, sort }))}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadMoreWrap: { width: '100%' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#14231A',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  searchFlex: { flex: 1, minWidth: 0 },

  body: { flex: 1, flexDirection: 'row' },
  sidebar: { backgroundColor: colors.white, borderTopRightRadius: 16, ...shadows.card },
  // Top padding used to come from the removed SUB-CATEGORIES caption.
  sidebarList: { paddingTop: 12, paddingBottom: 24 },
  sideItem: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 5,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  // Design marks the active rail item with a 3px green underline.
  sideItemOn: { borderBottomColor: colors.primary },
  sideThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sideThumbOn: { backgroundColor: colors.primary },
  sideImage: { width: '100%', height: '100%' },
  sideLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    lineHeight: 12.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  sideLabelOn: { fontFamily: fontFamily.bold, color: colors.primaryDark },

  main: { flex: 1, minWidth: 0, paddingLeft: 10, paddingRight: 12 },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  mainTitles: { flex: 1, minWidth: 0 },
  mainTitle: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.text, lineHeight: 21 },
  mainCount: { fontFamily: fontFamily.bold, fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  toolRow: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  toolBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnOn: { borderColor: colors.primary },
  toolBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.white,
  },
  toolBadgeLabel: { fontFamily: fontFamily.bold, fontSize: 9.5, color: colors.white },
  gridScroll: { flex: 1 },
  // 48% + space-between keeps two columns on every width without a gap
  // pushing the second card onto its own row.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10, paddingBottom: 16 },
  gridItem: { width: '48%', minWidth: 0 },
});
