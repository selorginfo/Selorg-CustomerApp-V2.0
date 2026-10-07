import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../theme';
import { useReduceMotion } from '../utils/useReduceMotion';

export interface HeroSlide {
  key: string;
  uri: string;
}

interface Props {
  slides: HeroSlide[];
  width: number;
  height: number;
  onPress: (index: number) => void;
  /** ms between automatic advances; paused while the user is dragging. */
  intervalMs?: number;
  testID?: string;
}

/** Paged hero banner carousel with dots; auto-advances unless reduce-motion is on. */
export default function HeroCarousel({ slides, width, height, onPress, intervalMs = 4000, testID }: Props) {
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const dragging = useRef(false);
  const count = slides.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || reduceMotion) return undefined;
    const t = setInterval(() => {
      if (dragging.current) return;
      setIndex(prev => {
        const next = (prev + 1) % count;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [count, width, intervalMs, reduceMotion]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    setIndex(Math.max(0, Math.min(count - 1, next)));
  };

  if (count === 0) return null;

  return (
    <View testID={testID}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onMomentumScrollEnd={onMomentumEnd}
        style={{ width, height }}
      >
        {slides.map((s, i) => (
          <Pressable
            key={s.key}
            onPress={() => onPress(i)}
            style={{ width, height }}
            accessibilityRole="button"
            accessibilityLabel={`Banner ${i + 1} of ${count}`}
          >
            <Image source={{ uri: s.uri }} style={styles.image} resizeMode="cover" />
          </Pressable>
        ))}
      </ScrollView>
      {count > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((s, i) => (
            <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { width: 16, backgroundColor: colors.white },
});
