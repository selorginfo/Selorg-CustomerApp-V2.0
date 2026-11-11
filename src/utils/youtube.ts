const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extracts the 11-char video id from watch / youtu.be / shorts / embed / live links. */
export function getYouTubeId(raw?: string | null): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (YT_ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '').toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = parts[0] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.searchParams.get('v')) id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
  }

  return id && YT_ID.test(id) ? id : null;
}

export function youTubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

export function youTubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** Split a CMS video field into an uploaded file and a YouTube id. */
export function splitMediaSources(input: {
  videoUrl?: string | null;
  youtubeUrl?: string | null;
}): { ownUrl: string | null; youtubeId: string | null; youtubeHref: string } {
  const videoUrl = String(input.videoUrl || '').trim();
  const youtubeUrl = String(input.youtubeUrl || '').trim();
  const videoId = getYouTubeId(videoUrl);
  const youtubeId = getYouTubeId(youtubeUrl) || videoId;
  const ownUrl = videoUrl && /^https?:\/\//i.test(videoUrl) && !videoId ? videoUrl : null;
  const youtubeHref = (youtubeUrl || (videoId ? videoUrl : '')).trim();
  return { ownUrl, youtubeId, youtubeHref };
}
