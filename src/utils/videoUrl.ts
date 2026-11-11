const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv|ogg)(?:$|[?#])/i;

export type VideoPlayback = {
  mode: 'autoplay' | 'click' | 'hover';
  muted: boolean;
  loop: boolean;
  controls: boolean;
  playsInline: boolean;
};

/** True when the URL is an uploaded video file, not a poster image or a YouTube link. */
export function isDirectVideoUrl(url?: string | null): boolean {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  return Boolean(trimmed) && VIDEO_FILE.test(trimmed);
}

/**
 * The banner creative itself is a video file (media library replaced the image with one).
 * A video URL with no still image is the creative too.
 */
export function bannerCreativeVideo(banner: {
  imageUrl?: string;
  bannerImageUrl?: string;
  videoUrl?: string;
}): string | null {
  const image = (banner.imageUrl || banner.bannerImageUrl || '').trim();
  if (isDirectVideoUrl(image)) return image;
  const video = (banner.videoUrl || '').trim();
  if (!isDirectVideoUrl(video)) return null;
  if (!image || isDirectVideoUrl(image)) return video;
  return null;
}

export function normalizeVideoPlayback(raw: unknown): VideoPlayback | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const mode = record.mode;
  if (mode !== 'autoplay' && mode !== 'click' && mode !== 'hover') return undefined;
  return {
    mode,
    muted: Boolean(record.muted),
    loop: Boolean(record.loop),
    controls: typeof record.controls === 'boolean' ? record.controls : mode === 'click',
    playsInline: record.playsInline !== false,
  };
}
