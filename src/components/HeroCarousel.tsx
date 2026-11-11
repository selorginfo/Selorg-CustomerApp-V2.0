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
import { Pause, Volume2, VolumeX } from 'lucide-react-native';
import Video, { ViewType, type VideoRef } from 'react-native-video';
import Icon from './Icon';
import { colors } from '../theme';
import { useReduceMotion } from '../utils/useReduceMotion';
import type { VideoPlayback } from '../utils/videoUrl';

export interface HeroSlide {
  key: string;
  uri: string;
  /** `uri` is a video file and should play, not render as a photo. */
  video?: boolean;
  poster?: string;
  playback?: VideoPlayback;
  /** Still image failed to load — play this file instead. */
  fallbackVideo?: string;
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
  const hasVideo = slides.some(s => s.video);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || reduceMotion || hasVideo) return undefined;
    const t = setInterval(() => {
      if (dragging.current) return;
      setIndex(prev => {
        const next = (prev + 1) % count;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, intervalMs);
    return () => clearInterval(t);
  }, [count, width, intervalMs, reduceMotion, hasVideo]);

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
          <HeroFrame
            key={s.key}
            slide={s}
            width={width}
            height={height}
            active={i === index}
            reduceMotion={reduceMotion}
            label={`Banner ${i + 1} of ${count}`}
            onPress={() => onPress(i)}
          />
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

function HeroFrame({
  slide,
  width,
  height,
  active,
  reduceMotion,
  label,
  onPress,
}: {
  slide: HeroSlide;
  width: number;
  height: number;
  active: boolean;
  reduceMotion: boolean;
  label: string;
  onPress: () => void;
}) {
  const [playFallback, setPlayFallback] = useState(false);
  const videoUri = slide.video ? slide.uri : playFallback ? slide.fallbackVideo : undefined;

  if (videoUri) {
    return (
      <View style={{ width, height, backgroundColor: '#000' }}>
        <HeroVideo
          uri={videoUri}
          poster={slide.poster}
          playback={slide.playback}
          active={active}
          reduceMotion={reduceMotion}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={{ width, height }}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Image
        source={{ uri: slide.uri }}
        style={styles.image}
        resizeMode="cover"
        onError={() => {
          if (slide.fallbackVideo) setPlayFallback(true);
        }}
      />
    </Pressable>
  );
}

function HeroVideo({
  uri,
  poster,
  playback,
  active,
  reduceMotion,
}: {
  uri: string;
  poster?: string;
  playback?: VideoPlayback;
  active: boolean;
  reduceMotion: boolean;
}) {
  const mode = playback?.mode ?? 'click';
  const savedMuted = Boolean(playback?.muted);
  const loop = playback?.loop ?? false;
  const canAutoplay = !reduceMotion && (mode === 'autoplay' || mode === 'hover');
  const videoRef = useRef<VideoRef>(null);
  const [silent, setSilent] = useState(savedMuted);
  const [started, setStarted] = useState(canAutoplay);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const playing = active && started && !ended;

  useEffect(() => {
    if (canAutoplay && active) setStarted(true);
  }, [canAutoplay, active]);

  const togglePlay = () => {
    if (ended) {
      videoRef.current?.seek(0);
      setEnded(false);
      setStarted(true);
      return;
    }
    setStarted(value => !value);
  };

  if (failed) {
    if (poster) return <Image source={{ uri: poster }} style={styles.videoFill} resizeMode="contain" />;
    return <View style={styles.videoFill} />;
  }

  return (
    <View style={styles.videoFill}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={styles.videoFill}
        resizeMode="contain"
        viewType={ViewType.TEXTURE}
        repeat={loop}
        muted={silent}
        paused={!playing}
        controls={false}
        poster={poster ? { source: { uri: poster }, resizeMode: 'contain' } : undefined}
        playInBackground={false}
        playWhenInactive={false}
        preventsDisplaySleepDuringVideoPlayback={false}
        ignoreSilentSwitch="ignore"
        mixWithOthers="mix"
        disableFocus
        shutterColor="#000000"
        pointerEvents="none"
        onEnd={() => {
          if (!loop) setEnded(true);
        }}
        onError={() => setFailed(true)}
      />
      <View style={styles.miniBar}>
        <Pressable
          style={styles.miniBtn}
          onPress={togglePlay}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause video' : 'Play video'}
        >
          {playing ? (
            <Pause size={12} color={colors.white} fill={colors.white} />
          ) : (
            <Icon name="play" size={12} color={colors.white} fill={colors.white} />
          )}
        </Pressable>
        <Pressable
          style={styles.miniBtn}
          onPress={() => setSilent(value => !value)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={silent ? 'Unmute video' : 'Mute video'}
        >
          {silent ? <VolumeX size={12} color={colors.white} /> : <Volume2 size={12} color={colors.white} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
  videoFill: { width: '100%', height: '100%', backgroundColor: '#000' },
  miniBar: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    gap: 6,
  },
  miniBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
