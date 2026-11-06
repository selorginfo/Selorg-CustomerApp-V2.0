import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { colors, radii } from '../theme';
import { bannerImageUri, type HomeBanner } from '../utils/homeResolve';
import { bannerCreativeVideo } from '../utils/videoUrl';
import { isFruitPromoSection, isFullWidthStrip, keepsItsLayout } from '../utils/homeLayout';
import { CmsVideoCard } from './CmsVideoCard';
import HeroCarousel from './HeroCarousel';
import { ResponsiveBanner } from './ResponsiveBanner';
import { useReduceMotion } from '../utils/useReduceMotion';

/** Same pace as the web marquee: slow enough to read each card. */
const AUTO_SCROLL_PX_PER_SEC = 28;
/** Fruit pair (Ban-046 / Ban-047) advances on its own, then waits to be read. */
const FRUIT_SLIDE_MS = 4000;
/** Grid promo pair sits long enough to read, then slides the other way. */
const GRID_SLIDE_MS = 4000;
/**
 * Frame used until Image.getSize reports the creative. The live pair is
 * 1362×1155, which is the same shape as the cards in the home feed.
 */
const GRID_BANNER_ASPECT = 1362 / 1155;

export function nextPagerStep(
  index: number,
  direction: 1 | -1,
  count: number,
): { index: number; direction: 1 | -1 } | null {
  if (count < 2) return null;
  let dir = direction;
  let next = index + dir;
  if (next >= count || next < 0) {
    dir = (dir * -1) as 1 | -1;
    next = index + dir;
  }
  if (next < 0 || next >= count || next === index) return null;
  return { index: next, direction: dir };
}

/**
 * The two fruit promos are one short sliding row. A full-width stack of both
 * creatives was eating the home feed; this keeps a peek of the next card.
 */
function FruitSlideRail({
  items,
  sectionKey,
  width,
  onPress,
}: {
  items: HomeBanner[];
  sectionKey: string;
  width: number;
  onPress: (banner: HomeBanner) => void;
}) {
  const reduceMotion = useReduceMotion();
  const railRef = useRef<ScrollView>(null);
  const index = useRef(0);
  const dragging = useRef(false);
  const cardW = Math.round(Math.min(width * 0.8, 300));
  const cardH = Math.round(cardW / 1.72);
  const step = cardW + 10;

  useEffect(() => {
    if (reduceMotion || items.length < 2) return undefined;
    const timer = setInterval(() => {
      if (dragging.current) return;
      index.current = (index.current + 1) % items.length;
      railRef.current?.scrollTo({ x: index.current * step, animated: true });
    }, FRUIT_SLIDE_MS);
    return () => clearInterval(timer);
  }, [reduceMotion, items.length, step]);

  const settle = (x: number) => {
    dragging.current = false;
    index.current = Math.max(0, Math.min(items.length - 1, Math.round(x / Math.max(step, 1))));
  };

  return (
    <ScrollView
      ref={railRef}
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={step}
      snapToAlignment="start"
      disableIntervalMomentum
      scrollEventThrottle={16}
      onScrollBeginDrag={() => {
        dragging.current = true;
      }}
      onScrollEndDrag={e => settle(e.nativeEvent.contentOffset.x)}
      onMomentumScrollEnd={e => settle(e.nativeEvent.contentOffset.x)}
      contentContainerStyle={styles.bannerRail}
    >
      {items.map((b, i) => {
        const uri = bannerImageUri(b);
        const id = b.bannerId || i;
        return (
          <Pressable
            key={b._id || id || `${sectionKey}-${i}`}
            style={[styles.railCard, styles.fruitCard, { width: cardW, height: cardH }]}
            onPress={() => onPress(b)}
            testID={`home-banner-${id}`}
            accessibilityRole="button"
            accessibilityLabel="Open banner"
          >
            {uri ? (
              <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
            ) : (
              <View style={[styles.fill, { backgroundColor: colors.primaryDark }]} />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * One full-width page per CMS banner. Auto-play ping-pongs so the pair slides
 * left, then right, without cloning slides or stacking them down the feed.
 */
function GridBannerCarousel({
  items,
  sectionKey,
  pageWidth,
  onPress,
}: {
  items: HomeBanner[];
  sectionKey: string;
  pageWidth: number;
  onPress: (banner: HomeBanner) => void;
}) {
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const dirRef = useRef<1 | -1>(1);
  const dragging = useRef(false);
  const pageWidthRef = useRef(pageWidth);
  const countRef = useRef(items.length);
  const restartAuto = useRef<() => void>(() => {});
  const seenKey = useRef<string | null>(null);
  const [aspect, setAspect] = useState(GRID_BANNER_ASPECT);
  const firstUri = bannerImageUri(items[0] || {}) || '';
  const measureKey = items.map(b => bannerImageUri(b) || b._id || b.bannerId || '').join('|');

  pageWidthRef.current = pageWidth;
  countRef.current = items.length;

  useEffect(() => {
    if (seenKey.current === null) {
      seenKey.current = measureKey;
      return;
    }
    if (seenKey.current === measureKey) return;
    seenKey.current = measureKey;
    indexRef.current = 0;
    dirRef.current = 1;
    scrollRef.current?.scrollTo?.({ x: 0, animated: false });
  }, [measureKey]);

  useEffect(() => {
    let alive = true;
    if (!firstUri || typeof Image.getSize !== 'function') return undefined;
    Image.getSize(
      firstUri,
      (width, height) => {
        if (!alive || width <= 0 || height <= 0) return;
        const next = width / height;
        setAspect(prev => (Math.abs(prev - next) / prev < 0.012 ? prev : next));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [firstUri]);

  useEffect(() => {
    const width = pageWidthRef.current;
    if (width <= 0) return;
    scrollRef.current?.scrollTo?.({ x: indexRef.current * width, animated: false });
  }, [pageWidth]);

  useEffect(() => {
    if (reduceMotion) return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      if (dragging.current) return;
      const width = pageWidthRef.current;
      const count = countRef.current;
      const step = nextPagerStep(indexRef.current, dirRef.current, count);
      if (!step || width <= 0) return;
      indexRef.current = step.index;
      dirRef.current = step.direction;
      scrollRef.current?.scrollTo?.({ x: step.index * width, animated: true });
    };
    const arm = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, GRID_SLIDE_MS);
    };
    restartAuto.current = arm;
    arm();
    return () => {
      if (timer) clearInterval(timer);
      restartAuto.current = () => {};
    };
  }, [reduceMotion]);

  const settle = (x: number) => {
    dragging.current = false;
    const width = Math.max(pageWidthRef.current, 1);
    const count = countRef.current;
    const next = Math.max(0, Math.min(count - 1, Math.round(x / width)));
    indexRef.current = next;
    if (next <= 0) dirRef.current = 1;
    else if (next >= count - 1) dirRef.current = -1;
    restartAuto.current();
  };

  const cardW = Math.max(pageWidth - 32, 160);
  const cardH = Math.round(cardW / aspect);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      pagingEnabled
      nestedScrollEnabled
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={pageWidth}
      snapToAlignment="start"
      disableIntervalMomentum
      scrollEventThrottle={16}
      bounces={items.length > 1}
      overScrollMode="never"
      style={{ width: pageWidth, height: cardH }}
      onScrollBeginDrag={() => {
        dragging.current = true;
      }}
      onScrollEndDrag={e => {
        const vx = e.nativeEvent.velocity?.x ?? 0;
        if (Math.abs(vx) > 0.05) return;
        settle(e.nativeEvent.contentOffset.x);
      }}
      onMomentumScrollEnd={e => {
        if (!dragging.current) return;
        settle(e.nativeEvent.contentOffset.x);
      }}
      testID={`home-banner-carousel-${sectionKey}`}
    >
      {items.map((b, i) => {
        const uri = bannerImageUri(b);
        const id = b.bannerId || b._id || i;
        return (
          <View key={b._id || b.bannerId || `${sectionKey}-${i}`} style={{ width: pageWidth, height: cardH, paddingHorizontal: 16 }}>
            <Pressable
              style={[styles.railCard, { width: cardW, height: cardH }]}
              onPress={() => onPress(b)}
              testID={`home-banner-${id}`}
              accessibilityRole="button"
              accessibilityLabel="Open banner"
            >
              {uri ? (
                <Image source={{ uri }} style={styles.fill} resizeMode="cover" fadeDuration={0} />
              ) : (
                <View style={[styles.fill, { backgroundColor: colors.primaryDark }]} />
              )}
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * CMS banner row. Artwork is image-only (the creative already carries its copy).
 * Layout follows the web home: scroll rail, paged grid carousel, full-width strip,
 * or a single promo with the dashboard video under it.
 * The fruit pair is the exception: a short horizontal slide instead of a stack.
 */
export function HomeBannerRail({
  sectionKey,
  items,
  layout,
  onPress,
}: {
  sectionKey: string;
  items: HomeBanner[];
  layout?: string;
  onPress: (banner: HomeBanner) => void;
}) {
  const { width: screenW } = useWindowDimensions();
  const [rowW, setRowW] = useState(0);
  const reduceMotion = useReduceMotion();
  const railRef = useRef<ScrollView>(null);
  const loopWidth = useRef(0);
  const offsetX = useRef(0);
  const dragging = useRef(false);
  const [loopReady, setLoopReady] = useState(false);

  useEffect(() => {
    if (reduceMotion || !loopReady) return undefined;
    const timer = setInterval(() => {
      const width = loopWidth.current;
      const rail = railRef.current;
      if (dragging.current || width <= 0 || !rail) return;
      offsetX.current += (AUTO_SCROLL_PX_PER_SEC * 50) / 1000;
      if (offsetX.current >= width) offsetX.current -= width;
      rail.scrollTo({ x: offsetX.current, animated: false });
    }, 50);
    return () => clearInterval(timer);
  }, [reduceMotion, loopReady]);
  const section = { key: sectionKey, kind: 'banners' as const, layout, items };
  const contentW = Math.max((rowW || screenW) - 32, 160);
  const scrollRow = layout === 'scroll' || sectionKey.startsWith('scroll_');

  if (!scrollRow && items.length === 1) {
    const banner = items[0]!;
    const creative = bannerCreativeVideo(banner);
    const still = bannerImageUri(banner);
    const linkedVideo = (banner.videoUrl || '').trim();
    const showLinked = Boolean(linkedVideo) && !creative;
    const strip = isFullWidthStrip(section);
    const height = creative
      ? Math.round((contentW * 9) / 16)
      : strip
        ? Math.round(contentW / 3.4)
        : Math.round(contentW / 2.2);
    const videoTitle = (banner.title || '').trim().replace(/\s+banner$/i, '') || 'Banner';

    return (
      <View style={styles.section} testID={`home-banners-${sectionKey}`} onLayout={e => setRowW(e.nativeEvent.layout.width)}>
        {creative ? (
          <View style={[styles.singleCard, { height }]}>
            <HeroCarousel
              slides={[{
                key: banner._id || banner.bannerId || sectionKey,
                uri: creative,
                video: true,
                poster: still,
                playback: banner.videoPlayback,
              }]}
              width={contentW}
              height={height}
              onPress={() => undefined}
              testID={`home-banner-${banner.bannerId || 0}`}
            />
          </View>
        ) : still ? (
          <Pressable
            style={styles.singleCard}
            onPress={() => onPress(banner)}
            testID={`home-banner-${banner.bannerId || 0}`}
            accessibilityRole="button"
            accessibilityLabel="Open banner"
          >
            <ResponsiveBanner uri={still} />
          </Pressable>
        ) : null}
        {showLinked ? (
          <View style={styles.videoWrap}>
            <CmsVideoCard
              title={videoTitle}
              videoUrl={linkedVideo}
              playback={banner.videoPlayback}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const basis = rowW || screenW;
  const fruitSlides = isFruitPromoSection(section) && items.length > 1;
  if (fruitSlides) {
    return (
      <View
        style={styles.section}
        testID={`home-banners-${sectionKey}`}
        onLayout={e => setRowW(e.nativeEvent.layout.width)}
      >
        <FruitSlideRail items={items} sectionKey={sectionKey} width={basis} onPress={onPress} />
      </View>
    );
  }

  const stacked = !scrollRow && layout === 'grid' && items.length > 1;
  if (stacked) {
    return (
      <View
        style={styles.section}
        testID={`home-banners-${sectionKey}`}
        onLayout={e => {
          const width = e.nativeEvent.layout.width;
          setRowW(prev => (Math.abs(prev - width) < 1 ? prev : width));
        }}
      >
        <GridBannerCarousel items={items} sectionKey={sectionKey} pageWidth={basis} onPress={onPress} />
      </View>
    );
  }

  const wide = keepsItsLayout(section) ? Math.min(basis * 0.82, 340) : Math.min(basis * 0.88, 380);
  const cardH = Math.round((wide * 3) / 4);

  const renderCards = (copy: boolean) =>
    items.map((b, i) => {
      const uri = bannerImageUri(b);
      const id = b.bannerId || i;
      return (
        <Pressable
          key={`${copy ? 'copy' : 'live'}-${b._id || id}`}
          style={[styles.railCard, { width: wide, height: cardH }]}
          onPress={() => onPress(b)}
          testID={copy ? undefined : `home-banner-${id}`}
          accessibilityRole="button"
          accessibilityLabel="Open banner"
          accessibilityElementsHidden={copy}
          importantForAccessibility={copy ? 'no-hide-descendants' : 'auto'}
        >
          {uri ? (
            <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
          ) : (
            <View style={[styles.fill, { backgroundColor: colors.primaryDark }]} />
          )}
        </Pressable>
      );
    });

  return (
    <View style={styles.section} testID={`home-banners-${sectionKey}`} onLayout={e => setRowW(e.nativeEvent.layout.width)}>
      <ScrollView
        ref={railRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onScroll={e => {
          if (dragging.current) offsetX.current = e.nativeEvent.contentOffset.x;
        }}
        onScrollEndDrag={e => {
          offsetX.current = e.nativeEvent.contentOffset.x;
          dragging.current = false;
        }}
        onMomentumScrollEnd={e => {
          offsetX.current = e.nativeEvent.contentOffset.x;
          dragging.current = false;
        }}
        contentContainerStyle={styles.bannerRail}
      >
        <View
          style={styles.loopSet}
          onLayout={e => {
            const width = e.nativeEvent.layout.width;
            if (width > 0 && width !== loopWidth.current) {
              loopWidth.current = width;
              setLoopReady(true);
            }
          }}
        >
          {renderCards(false)}
        </View>
        {reduceMotion ? null : <View style={styles.loopSet}>{renderCards(true)}</View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  videoWrap: { marginHorizontal: 16 },
  bannerRail: { paddingHorizontal: 16 },
  loopSet: { flexDirection: 'row', gap: 12, paddingRight: 12 },
  railCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#f3f4ef',
  },
  fruitCard: { marginRight: 10 },
  singleCard: {
    marginHorizontal: 16,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#f3f4ef',
  },
  fill: { ...StyleSheet.absoluteFillObject },
});
