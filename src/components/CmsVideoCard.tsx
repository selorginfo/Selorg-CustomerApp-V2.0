import React, { useRef } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Play } from 'lucide-react-native';
import Video, { ViewType, type VideoRef } from 'react-native-video';
import { colors, fontFamily, radii } from '../theme';
import type { VideoPlayback } from '../utils/videoUrl';
import { splitMediaSources, youTubeThumbnailUrl } from '../utils/youtube';
import { useVideoPlayer } from './VideoPlayerHost';

/**
 * Dashboard video row. An uploaded file shows its opening frame.
 * YouTube shows its thumbnail. Play opens the shared player, which can minimize.
 */
export function CmsVideoCard({
  title,
  videoUrl,
  youtubeUrl,
  playback,
  showTitle = true,
}: {
  title: string;
  videoUrl?: string | null;
  youtubeUrl?: string | null;
  playback?: VideoPlayback;
  /** Home promo videos already carry their copy in the creative. */
  showTitle?: boolean;
}) {
  const { ownUrl, youtubeId } = splitMediaSources({ videoUrl, youtubeUrl });
  const open = useVideoPlayer();
  const previewRef = useRef<VideoRef>(null);

  if (!ownUrl && !youtubeId) return null;

  const play = (source: 'own' | 'youtube') => {
    open?.({
      source,
      title,
      ownUrl: ownUrl || undefined,
      youtubeId: youtubeId || undefined,
      playback,
    });
  };

  return (
    <View style={styles.wrap} testID="cms-video-card">
      {ownUrl ? (
        <View>
          {showTitle ? (
            <View style={styles.titleBar}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
            </View>
          ) : null}
          <View style={styles.stage}>
            <Video
              ref={previewRef}
              source={{ uri: ownUrl }}
              style={styles.fill}
              resizeMode="cover"
              viewType={ViewType.TEXTURE}
              paused
              muted
              repeat={false}
              playInBackground={false}
              playWhenInactive={false}
              pointerEvents="none"
              onLoad={() => previewRef.current?.seek(0.1)}
            />
            <Pressable
              style={styles.hit}
              onPress={() => play('own')}
              accessibilityRole="button"
              accessibilityLabel={`Play ${title} video`}
              testID="cms-video-own"
            >
              <View style={styles.playBadge} pointerEvents="none">
                <Play size={20} color={colors.primary} fill={colors.primary} />
              </View>
            </Pressable>
          </View>
        </View>
      ) : null}

      {youtubeId ? (
        <View>
          <View style={styles.titleBar}>
            <Text style={styles.title} numberOfLines={1}>
              Know More From Experts
            </Text>
          </View>
          <Pressable
            style={styles.stage}
            onPress={() => play('youtube')}
            accessibilityRole="button"
            accessibilityLabel={`Play ${title} on YouTube`}
            testID="cms-video-youtube"
          >
            <Image source={{ uri: youTubeThumbnailUrl(youtubeId) }} style={styles.fill} resizeMode="cover" />
            <View style={styles.playBadge} pointerEvents="none">
              <Play size={20} color={colors.primary} fill={colors.primary} />
            </View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, borderRadius: radii.lg, overflow: 'hidden' },
  titleBar: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  title: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.white },
  stage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hit: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  playBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
});
