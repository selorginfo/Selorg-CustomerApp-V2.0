import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, Icon, ProductCard, ScreenContainer, StateView, SkeletonGrid } from '../../components';
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

  const slug = collectionKey.includes('-') ? collectionKey : sectionKeyToCollectionSlug(collectionKey);

  const [rawProducts, setRawProducts] = useState<ReturnType<typeof toProductCard>[]>([]);
  const [title, setTitle] = useState(routeTitle || 'Products');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ProductFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    catalogApi
      .getCollection(slug, { limit: 40 })
      .then(col => {
        setTitle(routeTitle || col.title || col.name || 'Products');
        setRawProducts((col.products || []).map(toProductCard));
      })
      .catch(() => setRawProducts([]))
      .finally(() => setLoading(false));
  }, [slug, routeTitle]);

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
                onAdd={() => cart.addToCart({ id: p.id, name: p.name, unit: p.unit, price: p.price, mrp: p.mrp, stockQuantity: p.stockQuantity, image: p.image })}
                onIncrement={() => cart.incrementItem(p.id)}
                onDecrement={() => cart.decrementItem(p.id)}
              />
            </View>
          ))}
        </ScrollView>
      )}

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
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
