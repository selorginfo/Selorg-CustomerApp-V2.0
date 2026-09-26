import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon, ProductCard, ScreenContainer, SearchBar, StateView, SkeletonGrid } from '../../components';
import { colors, fontFamily } from '../../theme';
import { catalogApi } from '../../services/catalog.service';
import type { ApiProduct } from '../../services/catalog.service';
import type { Product } from '../../types/product';
import type { RootStackParamList } from '../../navigation/types';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 40;

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

  // Sold out only when the API actually says so; `null` means it didn't report
  // stock at all, which leaves the product orderable without inventing a cap.
  const stockQuantity =
    typeof p.stockQuantity === 'number'
      ? p.stockQuantity
      : typeof p.stock === 'number'
        ? p.stock
        : p.stock === false || p.isSaleable === false || p.isActive === false
          ? 0
          : null;

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
  const cart = useCart();
  const wishlist = useWishlist();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[] | null>(null);
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

    if (!term) {
      setResults(null);
      return undefined;
    }

    const timer = setTimeout(() => {
      catalogApi
        .searchProducts({ q: term, limit: PAGE_SIZE })
        .then(res => {
          if (id !== requestId.current) return;
          const raw = res?.products || [];
          setResults(Array.isArray(raw) ? raw.map(toProductCard) : []);
        })
        .catch(() => {
          if (id === requestId.current) setResults([]);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  const renderCard = (p: Product) => (
    <View key={p.id} style={styles.gridItem}>
      <ProductCard
        product={p}
        quantity={cart.quantityOf(p.id)}
        wished={wishlist.isWished(p.id)}
        addVariant="compact"
        onPress={() => navigation.navigate('ProductDetail', { productId: p.id })}
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
    </ScrollView>
  );

  const body = () => {
    if (!term) {
      if (browseLoading) return <SkeletonGrid count={6} />;
      if (browse && browse.length > 0) {
        return grid(<Text style={styles.browseHeading}>BROWSE ALL PRODUCTS</Text>, browse);
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
          onSubmit={Keyboard.dismiss}
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
});
