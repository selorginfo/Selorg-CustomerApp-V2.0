import React, { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer, SearchBar, StateView, Skeleton, useBottomNavHeight } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { catalogApi } from '../../services/catalog.service';
import type { ApiCategory } from '../../services/catalog.service';
import type { RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CategoriesScreen() {
  // The floating nav overlays the screen, so pad content out from under it.
  const navH = useBottomNavHeight();
  const navigation = useNavigation<Nav>();
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    catalogApi.getCategoriesWithSubcategories({ isActive: true })
      .then(data => setCategories(data || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>All Categories</Text>
        <View style={styles.searchWrap}>
          <SearchBar
            testID="categories-search"
            placeholder="Search categories & products…"
            onPress={() => navigation.navigate('Search')}
          />
        </View>
      </View>

      {loading ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: navH }]}
          showsVerticalScrollIndicator={false}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skBlock}>
              <View style={styles.skHeader}>
                <Skeleton width={34} height={34} radius={10} />
                <Skeleton width="45%" height={16} radius={8} />
              </View>
              <View style={styles.skSubs}>
                {Array.from({ length: 4 }).map((__, j) => (
                  <View key={j} style={styles.skSub}>
                    <Skeleton width="100%" aspectRatio={1} radius={999} />
                    <Skeleton width="70%" height={10} radius={5} style={{ marginTop: 8, alignSelf: 'center' }} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : error ? (
        <StateView
          kind="error"
          title="Couldn't load categories"
          message="Check your connection and try again."
          ctaLabel="Retry"
          onCta={load}
          icon="wifiOff"
        />
      ) : categories.length === 0 ? (
        <StateView
          kind="empty"
          title="No categories yet"
          message="Your store is still being stocked. Check back soon."
          ctaLabel="Reload"
          onCta={load}
          icon="categories"
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: navH }]}
          showsVerticalScrollIndicator={false}
          testID="categories-list"
        >
          {categories.map(c => {
            const catId = c.slug || c._id;
            const subs =
              c.children?.map(ch => ({
                id: ch._id,
                name: ch.name,
                // The catalog ships no subcategory artwork, so tiles borrow the
                // parent category's photo rather than showing an empty circle.
                image: ch.image || c.image,
                slug: ch.slug || ch._id,
              }))
              || c.subs?.map(s => ({ id: s, name: s, image: c.image, slug: s }))
              || [];
            return (
              <View key={c._id} style={styles.catBlock} testID={`category-${catId}`}>
                <View style={styles.catHeaderRow}>
                  <Pressable
                    style={styles.catHeaderLeft}
                    onPress={() => navigation.navigate('CategoryProducts', { categoryId: catId })}
                    accessibilityRole="button"
                    accessibilityLabel={c.name}
                    testID={`category-open-${catId}`}
                  >
                    <View style={styles.catIconWrap}>
                      {c.image ? (
                        <Image source={{ uri: c.image }} style={styles.catIcon} resizeMode="cover" />
                      ) : (
                        <View style={[styles.catIcon, { backgroundColor: '#FFFFFF' }]} />
                      )}
                    </View>
                    <Text style={styles.catName}>{c.name}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => navigation.navigate('CategoryProducts', { categoryId: catId })}
                    hitSlop={6}
                    testID={`category-see-all-${catId}`}
                    accessibilityLabel={`See all ${c.name}`}
                  >
                    <Text style={styles.seeAll}>See All ({subs.length || '+'}) ›</Text>
                  </Pressable>
                </View>

                {subs.length > 0 ? (
                  <View style={styles.subGrid}>
                    {subs.map(sub => (
                      <Pressable
                        key={sub.id}
                        style={styles.subTile}
                        testID={`subcategory-${sub.slug}`}
                        accessibilityLabel={sub.name}
                        onPress={() =>
                          navigation.navigate('CategoryProducts', {
                            categoryId: catId,
                            sub: sub.slug,
                          })
                        }
                      >
                        <View style={styles.subImageWrap}>
                          {sub.image ? (
                            <Image source={{ uri: sub.image }} style={styles.subImage} resizeMode="cover" />
                          ) : (
                            <View style={[styles.subImage, { backgroundColor: '#FFFFFF' }]} />
                          )}
                        </View>
                        <Text style={styles.subLabel} numberOfLines={2}>{sub.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.text, letterSpacing: -0.2 },
  searchWrap: { marginTop: 12 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, gap: 26 },
  skBlock: { marginBottom: 8 },
  skHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  skSubs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 16 },
  skSub: { width: '22%', minWidth: 0 },
  catBlock: {},
  catHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  catHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  catIconWrap: {
    width: 34, height: 34, borderRadius: radii.md + 2, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  catIcon: { width: '100%', height: '100%' },
  catName: { fontFamily: fontFamily.bold, fontSize: 16.5, color: colors.text, flexShrink: 1 },
  seeAll: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.primary },
  subGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 16 },
  // Fluid tile + aspect-ratio thumb: 4 columns hold from 320px up without the
  // image overflowing its cell.
  subTile: { width: '22%', minWidth: 0, alignItems: 'center', gap: 7 },
  subImageWrap: {
    width: '100%', maxWidth: 66, aspectRatio: 1, borderRadius: 999, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.borderLight, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  subImage: { width: '100%', height: '100%' },
  subLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, color: colors.text, textAlign: 'center', lineHeight: 13 },
});
