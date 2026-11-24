/**
 * Same destination rules as selorg-web-app `bannerHref`.
 * Dashboard redirects win. Known banner ids / image files / titles fill gaps
 * when a row was saved with redirectType "none".
 */

const sub = (category: string, subcategory: string) => ({ category, subcategory });

const BY_BANNER_ID: Record<string, string> = {
  'Ban-052': '/search?q=Moringa',
  'Ban-053': '/category/dry-fruits-seeds/sub/dry-fruits-nuts',
  'Ban-054': '/category/dry-powder-mix/sub/fruits-mix',
  'Ban-055': '/category/millet-mandi/sub/millet-noodles-pasta',
  'Ban-056': '/category/dry-fruits-seeds/sub/seeds',
  'Ban-057': '/category/millet-mandi/sub/raw-millets',
  'Ban-058': '/category/dry-powder-mix/sub/herbs-mix',
};

const BY_IMAGE_FILE: Record<string, string> = {
  '1792066451016-747b156b.webp': '/search?q=Moringa',
  '1790663887198-b4f91e56.webp': '/category/vegetables/sub/native-vegetables',
  '1790665594489-406ec1bb.webp': '/category/groceries-kitchen/sub/honey',
  '1790667036299-8a0a237e.webp': '/category/fruits/sub/premium-fruits',
  '1790667068708-bba38044.webp': '/category/fruits/sub/highly-nutritious-fruits',
  'freshly-picked.png': '/category/fruits/sub/premium-fruits',
  'fresh-produce.png': '/category/fruits/sub/highly-nutritious-fruits',
};

const BY_TITLE: Record<string, string> = {
  'hero banner': '/category/fruits/sub/highly-nutritious-fruits',
  'moringa banner': '/search?q=Moringa',
  moringa: '/search?q=Moringa',
  'honey banner': '/category/groceries-kitchen/sub/honey',
  'tini tummies': '/category/dry-fruits-seeds/sub/dry-fruits-nuts',
  'toddler treats': '/category/millet-mandi/sub/millet-noodles-pasta',
  'women wellness': '/category/dry-fruits-seeds/sub/seeds',
  adults: '/category/millet-mandi/sub/raw-millets',
  'golden age': '/category/dry-powder-mix/sub/herbs-mix',
};

export type BannerDestination =
  | { kind: 'product'; productId: string }
  | { kind: 'category'; categoryId: string; sub?: string }
  | { kind: 'collection'; collectionKey: string; title?: string }
  | { kind: 'search'; q?: string }
  | { kind: 'url'; url: string }
  | { kind: 'none' };

export type BannerLinkInput = {
  link?: string;
  redirectType?: string;
  redirectValue?: string;
  bannerId?: string;
  title?: string;
  imageUrl?: string;
  bannerImageUrl?: string;
};

function imageFile(b: BannerLinkInput): string {
  const url = (b.imageUrl || b.bannerImageUrl || '').trim();
  return url.split('?')[0]?.split('/').pop() ?? '';
}

/** Turn a web path into a customer-app screen. External https links stay URLs. */
export function destinationFromHref(raw: string, title?: string): BannerDestination {
  const value = raw.trim();
  if (!value) return { kind: 'none' };

  let path = value;
  let search = '';
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const host = url.hostname.replace(/^www\./, '');
      const internal = host === 'selorg.com' || host.endsWith('.selorg.com');
      if (!internal) return { kind: 'url', url: value };
      path = url.pathname;
      search = url.search;
    } else if (value.startsWith('/')) {
      const q = value.indexOf('?');
      path = q === -1 ? value : value.slice(0, q);
      search = q === -1 ? '' : value.slice(q);
    } else {
      return { kind: 'none' };
    }
  } catch {
    return { kind: 'none' };
  }

  const parts = path.split('/').filter(Boolean).map(p => decodeURIComponent(p));
  const head = (parts[0] || '').toLowerCase();

  if (head === 'search') {
    const q = new URLSearchParams(search).get('q') || '';
    return { kind: 'search', q: q || undefined };
  }
  if (head === 'offers') return { kind: 'search' };

  if ((head === 'category' || head === 'categories') && parts[1]) {
    if (parts[2] === 'sub' && parts[3]) {
      return { kind: 'category', categoryId: parts[1], sub: parts[3] };
    }
    return { kind: 'category', categoryId: parts[1] };
  }
  if ((head === 'product' || head === 'products') && parts[1]) {
    return { kind: 'product', productId: parts[1] };
  }
  if ((head === 'collection' || head === 'collections') && parts[1]) {
    return { kind: 'collection', collectionKey: parts[1], title };
  }
  return { kind: 'none' };
}

function fromRedirect(b: BannerLinkInput): BannerDestination {
  const value = b.redirectValue?.trim();
  if (!value) return { kind: 'none' };
  if (b.redirectType === 'subcategory' && value.includes('/')) {
    const [category, subcategory] = value.split('/');
    if (category && subcategory) return { kind: 'category', categoryId: category, sub: subcategory };
  }
  if (b.redirectType === 'category') return { kind: 'category', categoryId: value };
  if (b.redirectType === 'product') return { kind: 'product', productId: value };
  if (b.redirectType === 'collection') {
    return { kind: 'collection', collectionKey: value, title: b.title };
  }
  if (b.redirectType === 'url') return destinationFromHref(value, b.title);
  return { kind: 'none' };
}

export function bannerDestination(b: BannerLinkInput): BannerDestination {
  if (b.link) {
    const fromLink = destinationFromHref(b.link, b.title);
    if (fromLink.kind !== 'none') return fromLink;
  }
  const fromValue = fromRedirect(b);
  if (fromValue.kind !== 'none') return fromValue;

  const href =
    (b.bannerId && BY_BANNER_ID[b.bannerId]) ||
    BY_IMAGE_FILE[imageFile(b)] ||
    BY_TITLE[(b.title || '').trim().toLowerCase()] ||
    '';
  // Web sends unmatched banners to /offers. The app has no offers screen, so
  // search is the same next step. A real redirect above always wins.
  if (!href) return { kind: 'search' };
  return destinationFromHref(href, b.title);
}
