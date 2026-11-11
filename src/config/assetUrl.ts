const ASSET_KEYS = new Set([
  'image',
  'images',
  'imageurl',
  'thumbnail',
  'thumbnailurl',
  'video',
  'videourl',
  'avatar',
  'avatarurl',
  'logo',
  'logourl',
  'banner',
  'bannerurl',
  'bannerimageurl',
  'cardimageurl',
  'additionalimages',
  'icon',
  'url',
  'photourl',
  'photouri',
]);

export function isAssetKey(keyName: string): boolean {
  return ASSET_KEYS.has(String(keyName || '').toLowerCase());
}

export function looksLikeAssetPath(value: string): boolean {
  const raw = value.trim();
  return raw.startsWith('/') || /^https?:\/\//i.test(raw) || /^uploads\//i.test(raw);
}

/** Rewrite only real media keys whose value is already a path or URL. */
export function shouldRewriteAsset(keyName: string, value: string): boolean {
  return isAssetKey(keyName) && looksLikeAssetPath(value);
}
