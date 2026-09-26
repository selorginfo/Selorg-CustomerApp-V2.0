import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';
import { PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import { images, categoryImages } from '../../theme/images';
import { mmkvStorage } from '../../lib/storage';

const AUTOPLAY_MS = 3200;
const H_MARGIN = spacing.md + 4;

type Slide =
  | { type: 'photo'; img: any; t1: string; t2: string; sub: string }
  | { type: 'grid'; t1: string; t2: string; sub: string };

const SLIDES: Slide[] = [
  {
    type: 'photo',
    img: images.onboard1,
    t1: 'Good Food',
    t2: 'Free Ride Home.',
    sub: 'Order fresh groceries anytime and get them delivered straight to your door with zero delivery fees.',
  },
  {
    // The design's second slide is a mosaic of category tiles, not a photo.
    type: 'grid',
    t1: 'Right Here',
    t2: 'All In One Place.',
    sub: 'Explore a wide variety of fresh food and daily essentials anytime, for easy, convenient shopping.',
  },
  {
    type: 'photo',
    img: images.onboard3,
    t1: 'Ready For You',
    t2: 'Fresh Vegetables.',
    sub: 'Enjoy a simple, smooth experience designed to make everyday food shopping effortless.',
  },
];

const TINTS = ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'];
const MOSAIC = [
  categoryImages.c1,
  categoryImages.c2,
  categoryImages.c3,
  categoryImages.c4,
  categoryImages.c5,
  categoryImages.c6,
  categoryImages.c7,
  categoryImages.c8,
];

function Tile({ src, tint, big }: { src: any; tint: string; big?: boolean }) {
  return (
    <View style={[styles.tile, big && styles.tileBig, { backgroundColor: tint }]}>
      <Image source={src} style={styles.tileImg} resizeMode="contain" />
    </View>
  );
}

/** The 8-tile category mosaic that stands in for slide 2's artwork. */
function OnboardMosaic() {
  return (
    <View style={styles.mosaic}>
      <View style={styles.mosaicRow}>
        <View style={styles.mosaicCol}><Tile src={MOSAIC[0]} tint={TINTS[0]} /></View>
        <View style={styles.mosaicCol}><Tile src={MOSAIC[1]} tint={TINTS[1]} /></View>
      </View>
      <View style={styles.mosaicRow}>
        <View style={styles.mosaicSide}>
          <Tile src={MOSAIC[2]} tint={TINTS[2]} />
          <Tile src={MOSAIC[3]} tint={TINTS[3]} />
        </View>
        <View style={styles.mosaicCentre}><Tile src={MOSAIC[4]} tint={TINTS[4]} big /></View>
        <View style={styles.mosaicSide}>
          <Tile src={MOSAIC[5]} tint={TINTS[5]} />
          <Tile src={MOSAIC[6]} tint={TINTS[6]} />
        </View>
      </View>
      <View style={styles.mosaicRow}>
        <View style={styles.mosaicCol}><Tile src={MOSAIC[7]} tint={TINTS[7]} /></View>
        <View style={styles.mosaicCol}><Tile src={MOSAIC[1]} tint={TINTS[1]} /></View>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [index, setIndex] = useState(0);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const scrollRef = useRef<ScrollView>(null);
  const touched = useRef(false);
  const indexRef = useRef(0);
  const targetRef = useRef(0);
  // scrollTo() on Android also emits drag/momentum with the old offset.
  // Ignore those until the animation should have landed, or the carousel
  // snaps back and the timer starts another slide — an endless jump.
  const programmaticUntil = useRef(0);

  const pageW = frame.w;
  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const goFinish = useCallback(() => {
    touched.current = true;
    mmkvStorage.setItem('onboardingComplete', '1');
    // replace — so Android BACK from EnterMobile cannot reopen Onboarding
    navigation.replace('EnterMobile', { mode: 'login' });
  }, [navigation]);

  const goToIndex = useCallback(
    (i: number) => {
      if (pageW <= 0) return;
      const next = Math.max(0, Math.min(SLIDES.length - 1, i));
      targetRef.current = next;
      programmaticUntil.current = Date.now() + 500;
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * pageW, animated: true });
    },
    [pageW],
  );

  // Auto-advance every 3.2s until the user interacts (design behaviour).
  useEffect(() => {
    if (touched.current || pageW <= 0) return;
    const t = setTimeout(() => {
      if (touched.current) return;
      goToIndex((indexRef.current + 1) % SLIDES.length);
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [index, pageW, goToIndex]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageW <= 0) return;
    const i = Math.max(
      0,
      Math.min(SLIDES.length - 1, Math.round(e.nativeEvent.contentOffset.x / pageW)),
    );
    const fromCode = Date.now() < programmaticUntil.current;
    if (fromCode && i !== targetRef.current) return;
    if (!fromCode) touched.current = true;
    if (i !== indexRef.current) setIndex(i);
  };

  const onDotPress = (i: number) => {
    touched.current = true;
    goToIndex(i);
  };

  const onNext = () => {
    touched.current = true;
    if (last) goFinish();
    else goToIndex(index + 1);
  };

  return (
    <ScreenContainer background={colors.card} edges={['top', 'bottom']}>
      <View style={styles.skipRow}>
        <Pressable onPress={goFinish} hitSlop={8}>
          <Text style={styles.skipBtn}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.headTextWrap}>
        <Text style={styles.title}>
          {slide.t1}
          {'\n'}
          {slide.t2}
        </Text>
        <Text style={styles.sub}>{slide.sub}</Text>
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => onDotPress(i)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Slide ${i + 1}`}
            >
              <View style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Flex-filling media area — no fixed height, so it adapts from a 568px
          SE to a tablet, and the CTA always stays on screen. */}
      <View style={styles.carouselWrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onLayout={e => {
            const w = Math.round(e.nativeEvent.layout.width);
            const h = Math.round(e.nativeEvent.layout.height);
            if (w <= 0 || h <= 0) return;
            setFrame(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
          }}
          onScrollBeginDrag={() => {
            if (Date.now() < programmaticUntil.current) return;
            touched.current = true;
          }}
          onMomentumScrollEnd={onMomentumEnd}
          style={styles.carousel}
        >
          {pageW > 0
            ? SLIDES.map((s, i) => (
                <View key={i} style={[styles.slide, { width: pageW, height: frame.h }]}>
                  {s.type === 'grid' ? (
                    <View style={styles.mosaicPage}>
                      <OnboardMosaic />
                    </View>
                  ) : (
                    <Image source={s.img} style={styles.slideImage} resizeMode="cover" />
                  )}
                </View>
              ))
            : null}
        </ScrollView>
      </View>

      <View style={styles.footer}>
        <PrimaryButton label={last ? 'Get Started' : 'Next'} kind="dark" onPress={onNext} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: H_MARGIN, paddingTop: spacing.sm },
  skipBtn: {
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
    color: colors.textMuted,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  headTextWrap: { paddingHorizontal: spacing.lg + 2, paddingTop: spacing.xs + 2 },
  title: { fontFamily: fontFamily.bold, fontSize: 30, color: colors.text, letterSpacing: -0.5, lineHeight: 34 },
  sub: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: spacing.sm + 2,
    maxWidth: 300,
  },
  dotsRow: { flexDirection: 'row', gap: 7, marginTop: spacing.md },
  dot: { height: 8, borderRadius: 4 },
  dotActive: { width: 24, backgroundColor: colors.primary },
  dotInactive: { width: 8, backgroundColor: colors.border },

  carouselWrap: {
    flex: 1,
    minHeight: 0,
    marginTop: spacing.md + 2,
    marginHorizontal: H_MARGIN,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  carousel: { flex: 1 },
  slide: { height: '100%' },
  slideImage: { width: '100%', height: '100%' },

  mosaicPage: { flex: 1, backgroundColor: colors.white, padding: 20, justifyContent: 'center' },
  mosaic: { width: '100%', gap: 12 },
  mosaicRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mosaicCol: { flex: 1, minWidth: 0 },
  mosaicSide: { flex: 1, minWidth: 0, gap: 12 },
  mosaicCentre: { flex: 1.2, minWidth: 0 },
  tile: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  tileBig: { aspectRatio: 1 / 1.1 },
  tileImg: { width: '82%', height: '82%' },

  footer: { paddingHorizontal: H_MARGIN, paddingTop: spacing.md, paddingBottom: spacing.lg + 2 },
});
