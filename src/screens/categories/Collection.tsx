import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Icon, PrimaryButton, ProductCard, ScreenContainer, StateView, SkeletonGrid } from '../../components';
import { showToast } from '../../utils/toast';
import { colors, fontFamily, radii } from '../../theme';
import { catalogApi } from '../../services/catalog.service';
import type { ApiProduct } from '../../services/catalog.service';
import { resolveListingStock, sectionKeyToCollectionSlug } from '../../utils/catalogMappers';
import type { RootStackParamList } from '../../navigation/types';
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

const PAGE_SIZE = 40;

/**
 * Home section keys (`best_sellers`, `collections_summer_fruits`) go through the
 * sections API, which also falls back to the matching collection; plain
 * collection slugs (`summer-fruits`) go straight to /collections.
 */
async function fetchCollectionPage(
  key: string,
  page: number,
): Promise<{ title?: string; products: ApiProduct[]; total?: number }> {
  if (!key.includes('-')) {
    const section = await catalogApi.getSectionProducts(key, { page, limit: PAGE_SIZE });
    if (section) return { title: section.title, products: section.products };
  }
  const col = await catalogApi.getCollection(sectionKeyToCollectionSlug(key), { page, limit: PAGE_SIZE });
  const total = (col.pagination as { total?: number } | undefined)?.total;
  return { title: col.title || col.name, products: col.products || [], total };
}

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

export default function CollectionScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Collection'>>();
  const { collectionKey, title: routeTitle } = route.params;
  const cart = useCart();
  const wishlist = useWishlist();

  const [rawProducts, setRawProducts] = useState<ReturnType<typeof toProductCard>[]>([]);
  const [title, setTitle] = useState(routeTitle || 'Products');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(false);
    fetchCollectionPage(collectionKey, 1)
      .then(res => {
        if (!alive) return;
        setTitle(routeTitle || res.title || 'Products');
        setRawProducts(res.products.map(toProductCard));
        setPage(1);
        setHasMore(
          typeof res.total === 'number' ? res.products.length < res.total : res.products.length >= PAGE_SIZE,
        );
      })
      .catch(() => {
        // A failed load is an error with Retry, not an empty collection.
        if (!alive) return;
        setRawProducts([]);
        setLoadError(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [collectionKey, routeTitle, reloadKey]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await fetchCollectionPage(collectionKey, next);
      const seen = new Set(rawProducts.map(p => p.id));
      const fresh = res.products.map(toProductCard).filter(p => !seen.has(p.id));
      const combined = [...rawProducts, ...fresh];
      setRawProducts(combined);
      setPage(next);
      setHasMore(
        fresh.length > 0 &&
          (typeof res.total === 'number' ? combined.length < res.total : res.products.length >= PAGE_SIZE),
      );
    } catch {
      showToast('Could not load more products', 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  const list = useMemo(() => applyProductFilters(rawProducts, filters), [rawProducts, filters]);
  const activeCount = countActiveFilters(filters);

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <Header
        title={title}
        subtitle={`${list.length.toLocaleString('en-IN')} product${list.length === 1 ? '' : 's'}`}
        onBack={() => navigation.goBack()}
        search
        searchPlaceholder={`Search in ${title.toLowerCase()}…`}
        onSearchPress={() => navigation.navigate('Search')}
      />

      <View style={styles.sortRow}>
        <Pressable
          style={[styles.sortBtn, activeCount > 0 && styles.sortBtnOn]}
          onPress={() => setFilterOpen(true)}
        >
          <Icon name="sort2" size={17} color={activeCount > 0 ? colors.primary : colors.text} />
          <Text style={[styles.sortBtnLabel, activeCount > 0 && styles.sortBtnLabelOn]}>Filters</Text>
          {activeCount > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeLabel}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.sortBtn} onPress={() => setSortOpen(true)}>
          <Icon name="sort" size={17} color={colors.text} />
          <Text style={styles.sortBtnLabel}>Sort</Text>
        </Pressable>
      </View>

      {loading ? (
        <SkeletonGrid count={6} />
      ) : loadError ? (
        <StateView
          kind="error"
          title="Couldn't load products"
          message="Check your connection and try again."
          ctaLabel="Retry"
          onCta={() => setReloadKey(k => k + 1)}
          icon="alert"
        />
      ) : list.length === 0 ? (
        <StateView
          kind="empty"
          title="No products found"
          message="This collection is empty or unavailable right now."
          ctaLabel="Go back"
          onCta={() => navigation.goBack()}
          icon="box"
        />
      ) : (
        <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
          {list.map(p => (
            <View key={p.id} style={styles.gridItem}>
              <ProductCard
                product={p}
                quantity={cart.quantityOf(p.id)}
                wished={wishlist.isWished(p.id)}
                onPress={() => navigation.navigate('ProductDetail', { productId: p.id })}
                onToggleWish={() => wishlist.toggleWish(p.id)}
                onAdd={() => cart.addToCart({ id: p.id, name: p.name, unit: p.unit, price: p.price, mrp: p.mrp, stockQuantity: p.stockQuantity, maxOrderLimit: p.maxOrderLimit, image: p.image })}
                onIncrement={() => cart.incrementItem(p.id, undefined, p.maxOrderLimit)}
                onDecrement={() => cart.decrementItem(p.id)}
              />
            </View>
          ))}
          {hasMore ? (
            <View style={styles.loadMore}>
              <PrimaryButton
                label={loadingMore ? 'Loading…' : 'Load more'}
                kind="ghost"
                onPress={loadMore}
                loading={loadingMore}
                disabled={loadingMore}
              />
            </View>
          ) : null}
        </ScrollView>
      )}

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
  loadMore: { width: '100%', marginTop: 4 },
  sortRow: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sortBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: radii.lg, backgroundColor: colors.white,
    borderWidth: 1.5, borderColor: colors.border,
  },
  sortBtnOn: { borderColor: colors.primary },
  sortBtnLabel: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },
  sortBtnLabelOn: { color: colors.primaryDark },
  countBadge: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  countBadgeLabel: { fontFamily: fontFamily.bold, fontSize: 10, color: colors.white },
  gridScroll: { flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    padding: 16,
  },
  gridItem: { width: '48%', minWidth: 0 },
});
