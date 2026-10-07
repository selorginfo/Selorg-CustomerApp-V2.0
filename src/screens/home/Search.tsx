import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon, PrimaryButton, ProductCard, ScreenContainer, SearchBar, StateView, SkeletonGrid } from '../../components';
import { colors, fontFamily } from '../../theme';
import { catalogApi } from '../../services/catalog.service';
import type { ApiProduct } from '../../services/catalog.service';
import { resolveListingStock } from '../../utils/catalogMappers';
import type { Product } from '../../types/product';
import type { RootStackParamList } from '../../navigation/types';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { mmkvStorage } from '../../lib/storage';
import { showToast } from '../../utils/toast';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 40;
const RECENT_KEY = 'recentSearches';
const RECENT_MAX = 8;

function readRecent(): string[] {
  try {
    const raw = mmkvStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Maps a search payload straight onto the card shape. Every field is taken
 * from the API as-is: no placeholder pack size, no assumed stock count, and
 * no strike-through price unless the API really sends a higher one.
 */
function toProductCard(p: ApiProduct): Product {
  const price = Number(p.price ?? 0);
  const mrp = Number(p.mrp ?? p.originalPrice ?? 0);
  const photo =
    p.imageUrl || p.thumbnailUrl || p.cardImageUrl || (Array.isArray(p.images) ? p.images[0] : '');
  const rating = typeof p.rating === 'number' ? p.rating : Number(p.rating?.average ?? 0);
  const unit =
    (Array.isArray(p.variants) && p.variants[0]?.size) || p.size || p.quantity || p.uom || '';

  // Shared rule with Home / Category / Product Detail: search results don't
  // join live inventory, so a catalog 0 means "not reported", not sold out.
  const stockQuantity = resolveListingStock(p);

  return {
    id: p._id,
    categoryId: p.categoryId || '',
    sub: '',
    name: p.name,
    unit,
    price,
    mrp: mrp > price ? mrp : price,
    stockQuantity,
    maxOrderLimit: typeof p.maxOrderLimit === 'number' && p.maxOrderLimit > 0 ? Math.floor(p.maxOrderLimit) : null,
    image: photo ? { uri: photo } : { uri: '' },
    rating: Number.isFinite(rating) ? rating : 0,
    bytes: [],
  };
}

export default function SearchScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Search'>>();
  const cart = useCart();
  const wishlist = useWishlist();

  const [query, setQuery] = useState(route.params?.q || '');
  const [results, setResults] = useState<Product[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [recent, setRecent] = useState<string[]>(readRecent);
  // Default "browse all products" grid, shown while the query is empty.
  const [browse, setBrowse] = useState<Product[] | null>(null);
  const [browseLoading, setBrowseLoading] = useState(true);
  // Keeps a slow early keystroke from overwriting a newer response.
  const requestId = useRef(0);

  const term = query.trim();

  useEffect(() => {
    catalogApi
      .searchProducts({ limit: PAGE_SIZE })
      .then(res => {
        const raw = res?.products || [];
        setBrowse(Array.isArray(raw) ? raw.map(toProductCard) : []);
      })
      .catch(() => setBrowse([]))
      .finally(() => setBrowseLoading(false));
  }, []);

  // Search as you type: each keystroke lists the products that match, so the
  // grid tracks the query instead of waiting for the keyboard's submit key.
  // The previous results stay on screen while the next request is in flight,
  // so the list refines rather than flashing a spinner on every character.
  useEffect(() => {
    const id = ++requestId.current;

    setSearchError(false);
    if (!term) {
      setResults(null);
      setHasMore(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      catalogApi
        .searchProducts({ q: term, page: 1, limit: PAGE_SIZE })
        .then(res => {
          if (id !== requestId.current) return;
          const raw = Array.isArray(res?.products) ? res.products : [];
          setResults(raw.map(toProductCard));
          setPage(1);
          const total = res?.meta?.total;
          setHasMore(typeof total === 'number' ? raw.length < total : raw.length >= PAGE_SIZE);
        })
        .catch(() => {
          // A failed request is an error, not "no results".
          if (id !== requestId.current) return;
          setResults(null);
          setSearchError(true);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, retryKey]);

  const rememberSearch = (q: string) => {
    const t = q.trim();
    if (t.length < 2) return;
    const next = [t, ...recent.filter(r => r.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      mmkvStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // non-fatal
    }
  };

  const clearRecent = () => {
    setRecent([]);
    mmkvStorage.removeItem(RECENT_KEY);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || !term) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await catalogApi.searchProducts({ q: term, page: next, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      const raw = Array.isArray(res?.products) ? res.products : [];
      setResults(prev => {
        const seen = new Set((prev || []).map(p => p.id));
        return [...(prev || []), ...raw.map(toProductCard).filter(p => !seen.has(p.id))];
      });
      setPage(next);
      const total = res?.meta?.total;
      const shown = (results?.length || 0) + raw.length;
      setHasMore(raw.length > 0 && (typeof total === 'number' ? shown < total : raw.length >= PAGE_SIZE));
    } catch {
      showToast('Could not load more results', 'err');
    } finally {
      setLoadingMore(false);
    }
  };

  const renderCard = (p: Product) => (
    <View key={p.id} style={styles.gridItem}>
      <ProductCard
        product={p}
        quantity={cart.quantityOf(p.id)}
        wished={wishlist.isWished(p.id)}
        addVariant="compact"
        onPress={() => {
          if (term) rememberSearch(term);
          navigation.navigate('ProductDetail', { productId: p.id });
        }}
        onToggleWish={() => wishlist.toggleWish(p.id)}
        onAdd={() =>
          cart.addToCart({
            id: p.id,
            name: p.name,
            unit: p.unit,
            price: p.price,
            mrp: p.mrp,
            stockQuantity: p.stockQuantity,
            maxOrderLimit: p.maxOrderLimit,
            image: p.image,
          })
        }
        onIncrement={() => cart.incrementItem(p.id, undefined, p.maxOrderLimit)}
        onDecrement={() => cart.decrementItem(p.id)}
      />
    </View>
  );

  const grid = (heading: React.ReactNode, list: Product[]) => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.resultsWrap}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      testID="search-results"
    >
      {heading}
      <View style={styles.grid}>{list.map(renderCard)}</View>
      {term && hasMore && list === results ? (
        <View style={styles.loadMore}>
          <PrimaryButton
            label={loadingMore ? 'Loading…' : 'Load more'}
            kind="ghost"
            onPress={loadMore}
            loading={loadingMore}
            disabled={loadingMore}
            testID="search-load-more"
          />
        </View>
      ) : null}
    </ScrollView>
  );

  const recentBlock =
    recent.length > 0 ? (
      <View style={styles.recentWrap}>
        <View style={styles.recentHead}>
          <Text style={styles.browseHeading}>RECENT SEARCHES</Text>
          <Text style={styles.recentClear} onPress={clearRecent} accessibilityRole="button">
            Clear
          </Text>
        </View>
        <View style={styles.recentChips}>
          {recent.map(r => (
            <Pressable key={r} style={styles.recentChip} onPress={() => setQuery(r)} accessibilityRole="button">
              <Icon name="clock" size={13} color={colors.textMuted} />
              <Text style={styles.recentChipText} numberOfLines={1}>{r}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  const body = () => {
    if (!term) {
      if (browseLoading) return <SkeletonGrid count={6} />;
      if (browse && browse.length > 0) {
        return grid(
          <>
            {recentBlock}
            <Text style={styles.browseHeading}>BROWSE ALL PRODUCTS</Text>
          </>,
          browse,
        );
      }
      return (
        <StateView
          kind="empty"
          title="Nothing to browse yet"
          message="Search for a product by name to get started."
          icon="search"
        />
      );
    }

    if (searchError) {
      return (
        <StateView
          kind="error"
          title="Couldn't search right now"
          message="Check your connection and try again."
          ctaLabel="Retry"
          onCta={() => setRetryKey(k => k + 1)}
          icon="alert"
        />
      );
    }

    if (results === null) return <SkeletonGrid count={6} />;

    if (results.length === 0) {
      return (
        <StateView
          kind="empty"
          title={`No results for "${term}"`}
          message="Try a different spelling or browse categories."
          ctaLabel="Browse categories"
          onCta={() => (navigation as any).navigate('Main', { screen: 'CategoriesTab' })}
          icon="search"
        />
      );
    }

    return grid(
      <Text style={styles.resultsCount}>
        {results.length} result{results.length === 1 ? '' : 's'} for “{term}”
      </Text>,
      results,
    );
  };

  return (
    <ScreenContainer edges={['top', 'bottom']}>
      <View style={styles.root} testID="search-screen">
      <View style={styles.header}>
        <SearchBar
          editable
          autoFocus
          focused
          testID="search-bar"
          placeholder="Search for products"
          value={query}
          onChangeText={setQuery}
          onSubmit={() => {
            rememberSearch(query);
            Keyboard.dismiss();
          }}
          left={
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Icon name="chevronLeft" size={22} color={colors.text} />
            </Pressable>
          }
          right={
            query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            ) : undefined
          }
        />
      </View>

      {body()}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  scroll: { flex: 1 },
  resultsWrap: { padding: 16 },
  resultsCount: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.textMuted, marginBottom: 12 },
  browseHeading: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.textMuted,
    marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  gridItem: { width: '48%', minWidth: 0 },
  loadMore: { marginTop: 16 },
  recentWrap: { marginBottom: 16 },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  recentClear: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },
  recentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  recentChipText: { fontFamily: fontFamily.semibold, fontSize: 12.5, color: colors.text, flexShrink: 1 },
});
