import React, { createContext, useCallback, useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Maximize2, Minus, Minimize2, X } from 'lucide-react-native';
import Video from 'react-native-video';
import { WebView } from 'react-native-webview';
import { colors, fontFamily } from '../theme';
import type { VideoPlayback } from '../utils/videoUrl';
import { youTubeEmbedUrl } from '../utils/youtube';

export type FloatingVideo = {
  source: 'own' | 'youtube';
  title: string;
  ownUrl?: string;
  youtubeId?: string;
  playback?: VideoPlayback;
};

type Size = 'center' | 'mini' | 'max';

const VideoPlayerContext = createContext<((video: FloatingVideo) => void) | null>(null);

export function useVideoPlayer() {
  return useContext(VideoPlayerContext);
}

/** App-root player. Minimize keeps a corner preview while the screen stays usable. */
export function VideoPlayerProvider({ children }: { children: React.ReactNode }) {
  const [video, setVideo] = useState<FloatingVideo | null>(null);
  const [size, setSize] = useState<Size>('center');
  const { width, height } = useWindowDimensions();

  const open = useCallback((next: FloatingVideo) => {
    setVideo(next);
    setSize('center');
  }, []);

  const close = () => setVideo(null);

  const frameWidth =
    size === 'mini'
      ? Math.min(width * 0.46, 240)
      : size === 'max'
        ? Math.min(width - 12, Math.min((height - 72) * (16 / 9), 1200))
        : Math.min(width - 32, Math.min((height - 140) * (16 / 9), 760));

  const label = video?.source === 'youtube' ? 'Know More From Experts' : video?.title || 'Video';

  return (
    <VideoPlayerContext.Provider value={open}>
      {children}
      {video ? (
        <View
          pointerEvents="box-none"
          style={styles.overlay}
          testID="video-player-dock"
        >
          {size === 'mini' ? null : (
            <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close video" />
          )}
          <View
            style={[
              styles.sheet,
              { width: frameWidth },
              size === 'mini' ? styles.mini : styles.centered,
            ]}
          >
            <View style={styles.bar}>
              <Text style={styles.barTitle} numberOfLines={1}>
                {label}
              </Text>
              {size === 'mini' ? null : (
                <Pressable
                  onPress={() => setSize('mini')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Minimize video"
                  testID="video-minimize"
                >
                  <Minus size={16} color={colors.white} />
                </Pressable>
              )}
              <Pressable
                onPress={() => setSize(size === 'max' ? 'center' : size === 'mini' ? 'center' : 'max')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={size === 'max' ? 'Restore video' : 'Maximize video'}
                testID="video-resize"
              >
                {size === 'max' ? (
                  <Minimize2 size={16} color={colors.white} />
                ) : (
                  <Maximize2 size={16} color={colors.white} />
                )}
              </Pressable>
              <Pressable
                onPress={close}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close video"
                testID="video-close"
              >
                <X size={16} color={colors.white} />
              </Pressable>
            </View>
            <View style={styles.player}>
              {video.source === 'youtube' && video.youtubeId ? (
                <WebView
                  source={{ uri: youTubeEmbedUrl(video.youtubeId) }}
                  style={styles.fill}
                  allowsFullscreenVideo
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                  javaScriptEnabled
                  domStorageEnabled
                  setSupportMultipleWindows={false}
                />
              ) : null}
              {video.source === 'own' && video.ownUrl ? (
                <Video
                  source={{ uri: video.ownUrl }}
                  style={styles.fill}
                  resizeMode="contain"
                  controls={video.playback?.controls !== false}
                  paused={false}
                  repeat={Boolean(video.playback?.loop)}
                  muted={Boolean(video.playback?.muted)}
                  playInBackground={false}
                  playWhenInactive={false}
                  ignoreSilentSwitch="ignore"
                />
              ) : null}
            </View>
          </View>
        </View>
      ) : null}
    </VideoPlayerContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 40, elevation: 40 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  centered: { alignSelf: 'center', marginTop: '18%' },
  mini: { position: 'absolute', right: 12, bottom: 88 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  barTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: 13, color: colors.white },
  player: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
});
