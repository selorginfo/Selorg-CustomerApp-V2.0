import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, radii } from '../theme';
import type { ApiCategory } from '../services/catalog.service';
import { shouldHideSubcategoryBanner } from '../utils/homeLayout';
import { CmsVideoCard } from './CmsVideoCard';
import { ResponsiveBanner } from './ResponsiveBanner';

/**
 * Category and subcategory media from `/categories/:slug/products`.
 * Subcategory pages are image-only. The parent category keeps the title
 * overlay. Hidden subcategory lists skip the image and still play videos.
 */
export function CategoryMediaHeader({
  categorySlug,
  categoryName,
  categoryImage,
  subcategory,
}: {
  categorySlug: string;
  categoryName: string;
  categoryImage?: string;
  subcategory?: ApiCategory | null;
}) {
  const subSlug = subcategory ? subcategory.slug || subcategory._id : '';
  const hideImage = subcategory ? shouldHideSubcategoryBanner(categorySlug, subSlug) : false;
  const image = (
    subcategory?.bannerImage ||
    subcategory?.image ||
    categoryImage ||
    ''
  ).trim();
  const showImage = Boolean(image) && !hideImage;
  const youtubeUrl = subcategory?.youtubeUrl;
  const bannerVideo = subcategory?.bannerVideo;

  if (!showImage && !youtubeUrl && !bannerVideo) return null;

  return (
    <View style={styles.wrap} testID="category-media">
      {showImage ? (
        <View style={styles.banner} testID="category-banner">
          <ResponsiveBanner uri={image} />
          {subcategory ? null : (
            <View style={styles.scrim}>
              <Text style={styles.kicker}>100% CERTIFIED ORGANIC</Text>
              <Text style={styles.title} numberOfLines={2}>
                {categoryName}
              </Text>
              <Text style={styles.sub}>Handpicked, quality-checked and delivered to your door.</Text>
            </View>
          )}
        </View>
      ) : null}
      {subcategory && (youtubeUrl || bannerVideo) ? (
        <CmsVideoCard
          title={subcategory.name || categoryName}
          youtubeUrl={youtubeUrl}
          videoUrl={bannerVideo}
          playback={subcategory.videoPlayback}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, width: '100%' },
  banner: {
    width: '100%',
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#eef4e6',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,38,12,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 4,
  },
  kicker: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.white,
  },
  title: { fontFamily: fontFamily.bold, fontSize: 22, color: colors.white },
  sub: { fontFamily: fontFamily.semibold, fontSize: 12, color: 'rgba(255,255,255,0.92)' },
});
