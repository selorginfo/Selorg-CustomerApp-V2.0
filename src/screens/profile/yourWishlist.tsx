import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Header, ProductCard, ScreenContainer, StateView, SkeletonGrid } from '../../components';
import { spacing } from '../../theme';
import { images } from '../../theme/images';
import { catalogApi } from '../../services/catalog.service';
import type { ApiProduct } from '../../services/catalog.service';
import { resolveListingStock } from '../../utils/catalogMappers';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function toProductCard(p: ApiProduct) {
  const price = Number(p.price ?? 0);
  const mrp = Number(p.mrp ?? p.originalPrice ?? p.price ?? 0);
  const photo = p.imageUrl || p.thumbnailUrl || p.cardImageUrl || (Array.isArray(p.images) ? p.images[0] : '');
  const rating = typeof p.rating === 'number' ? p.rating : ((p.rating as any)?.average ?? 4.2);
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

export default function YourWishlistScreen() {
  const navigation = useNavigation<Nav>();
  const cart = useCart();
  const { wishlist, toggleWish } = useWishlist();

  const [products, setProducts] = useState<ReturnType<typeof toProductCard>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wishlist.length === 0) { setProducts([]); return; }
    setLoading(true);
    Promise.all(
      wishlist.map(id =>
        catalogApi.getProductDetail(id)
          .then(res => { const p = res?.product || (res as any); return p?._id ? toProductCard(p) : null; })
          .catch(() => null),
      ),
    )
      .then(results => setProducts(results.filter(Boolean) as ReturnType<typeof toProductCard>[]))
      .finally(() => setLoading(false));
  }, [wishlist]);

  return (
    <ScreenContainer>
      <Header title="Wishlist" onBack={() => navigation.goBack()} />
      {loading ? (
        <SkeletonGrid count={6} />
      ) : products.length === 0 ? (
        <StateView
          kind="empty"
          title="Your wishlist is empty"
          message="Tap the heart on any product to save it here."
          imageSource={images.wishlistEmpty}
          ctaLabel="Start shopping"
          ctaSize="sm"
          onCta={() => navigation.navigate('Main')}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {products.map(p => (
              <View key={p.id} style={styles.gridItem}>
                <ProductCard
                  product={p}
                  quantity={cart.quantityOf(p.id)}
                  wished={true}
                  onPress={() => navigation.navigate('ProductDetail', { productId: p.id })}
                  onToggleWish={() => toggleWish(p.id)}
                  onAdd={() => cart.addToCart({ id: p.id, name: p.name, unit: p.unit, price: p.price, mrp: p.mrp, stockQuantity: p.stockQuantity, maxOrderLimit: p.maxOrderLimit, image: p.image })}
                  onIncrement={() => cart.incrementItem(p.id, undefined, p.maxOrderLimit)}
                  onDecrement={() => cart.decrementItem(p.id)}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47.5%' },
});
