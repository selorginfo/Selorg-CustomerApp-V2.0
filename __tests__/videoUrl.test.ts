import { bannerCreativeVideo, isDirectVideoUrl, normalizeVideoPlayback } from '../src/utils/videoUrl';

describe('banner video urls', () => {
  it('treats an uploaded mp4 as video and leaves a poster image alone', () => {
    expect(isDirectVideoUrl('https://cdn.example/hero.mp4')).toBe(true);
    expect(isDirectVideoUrl('https://cdn.example/hero.mp4?v=2')).toBe(true);
    expect(isDirectVideoUrl('https://cdn.example/hero.jpg')).toBe(false);
    expect(isDirectVideoUrl('https://youtu.be/abc')).toBe(false);
  });

  it('plays the creative when the banner image was replaced with a video file', () => {
    expect(
      bannerCreativeVideo({
        imageUrl: 'https://cdn.example/hero.mp4',
        videoUrl: 'https://cdn.example/hero.mp4',
      }),
    ).toBe('https://cdn.example/hero.mp4');
  });

  it('plays a video-only banner and keeps a real photo as the still', () => {
    expect(bannerCreativeVideo({ videoUrl: 'https://cdn.example/hero.mov' })).toBe(
      'https://cdn.example/hero.mov',
    );
    expect(
      bannerCreativeVideo({
        imageUrl: 'https://cdn.example/poster.jpg',
        videoUrl: 'https://cdn.example/hero.mp4',
      }),
    ).toBeNull();
  });

  it('reads saved playback and drops an unknown mode', () => {
    expect(normalizeVideoPlayback({ mode: 'autoplay', muted: true, loop: true, controls: false })).toEqual({
      mode: 'autoplay',
      muted: true,
      loop: true,
      controls: false,
      playsInline: true,
    });
    expect(normalizeVideoPlayback({ mode: 'bogus' })).toBeUndefined();
  });
});
