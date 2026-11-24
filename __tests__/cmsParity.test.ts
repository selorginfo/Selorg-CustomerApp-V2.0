import { mapCategoryBrowse } from '../src/utils/catalogMappers';
import { bannerDestination } from '../src/utils/bannerNavigation';
import { isHeroBannerSection, type ResolvedHomeSection } from '../src/utils/homeResolve';
import { mergePromoBanners, shouldHideSubcategoryBanner } from '../src/utils/homeLayout';
import { getYouTubeId, splitMediaSources, youTubeEmbedUrl, youTubeThumbnailUrl } from '../src/utils/youtube';

describe('youtube and uploaded video sources', () => {
  it('reads watch, share, shorts, and embed links', () => {
    expect(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('https://cdn.example/clip.mp4')).toBeNull();
  });

  it('keeps an uploaded file separate from a YouTube link', () => {
    expect(
      splitMediaSources({
        videoUrl: 'https://cdn.example/honey.mp4',
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      }),
    ).toEqual({
      ownUrl: 'https://cdn.example/honey.mp4',
      youtubeId: 'dQw4w9WgXcQ',
      youtubeHref: 'https://youtu.be/dQw4w9WgXcQ',
    });
    expect(splitMediaSources({ videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }).ownUrl).toBeNull();
    expect(youTubeEmbedUrl('dQw4w9WgXcQ')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youTubeThumbnailUrl('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
});

describe('banner navigation matches the webapp', () => {
  it('opens a subcategory from the dashboard redirect', () => {
    expect(
      bannerDestination({ redirectType: 'subcategory', redirectValue: 'fruits/premium-fruits' }),
    ).toEqual({ kind: 'category', categoryId: 'fruits', sub: 'premium-fruits' });
  });

  it('opens search, product, and collection links', () => {
    expect(bannerDestination({ link: '/search?q=Moringa' })).toEqual({ kind: 'search', q: 'Moringa' });
    expect(bannerDestination({ link: '/product/abc123' })).toEqual({ kind: 'product', productId: 'abc123' });
    expect(bannerDestination({ redirectType: 'collection', redirectValue: 'deals', title: 'Deals' })).toEqual({
      kind: 'collection',
      collectionKey: 'deals',
      title: 'Deals',
    });
  });

  it('uses the known banner id when the row has no redirect', () => {
    expect(bannerDestination({ bannerId: 'Ban-052', redirectType: 'none' })).toEqual({
      kind: 'search',
      q: 'Moringa',
    });
    expect(bannerDestination({ bannerId: 'Ban-053' })).toEqual({
      kind: 'category',
      categoryId: 'dry-fruits-seeds',
      sub: 'dry-fruits-nuts',
    });
    expect(bannerDestination({ title: 'Untitled promo' })).toEqual({ kind: 'search' });
  });
});

describe('home section order', () => {
  const hero: ResolvedHomeSection = {
    key: 'hero',
    label: 'Hero',
    kind: 'banners',
    items: [{ _id: 'h', slot: 'hero', title: 'Hero' }],
  };
  const moringa: ResolvedHomeSection = {
    key: 'banner_sub_moringa_banner',
    label: 'Moringa',
    kind: 'banners',
    items: [{ _id: 'm', bannerId: 'Ban-052', title: 'Moringa' }],
  };
  const honey: ResolvedHomeSection = {
    key: 'banner_sub_honey_banner',
    label: 'Honey',
    kind: 'banners',
    items: [{ _id: 'n', bannerId: 'Ban-049', title: 'Honey' }],
  };
  const scroll: ResolvedHomeSection = {
    key: 'scroll_banner',
    label: 'Scroll Banner',
    kind: 'banners',
    layout: 'scroll',
    items: [{ _id: 's', bannerId: 'Ban-046' }],
  };

  it('keeps CMS order and merges consecutive single promos', () => {
    const merged = mergePromoBanners([hero, moringa, honey, scroll], isHeroBannerSection);
    expect(merged.map(s => s.key)).toEqual(['hero', 'banner_sub_moringa_banner', 'scroll_banner']);
    const promo = merged[1];
    expect(promo.kind).toBe('banners');
    if (promo.kind === 'banners') {
      expect(promo.items.map(b => b.bannerId)).toEqual(['Ban-052', 'Ban-049']);
    }
  });

  it('does not treat a scroll row as the hero', () => {
    expect(isHeroBannerSection(scroll)).toBe(false);
    expect(isHeroBannerSection(hero)).toBe(true);
  });
});

describe('subcategory banners', () => {
  it('hides the same subcategory images as the webapp and keeps the rest', () => {
    expect(shouldHideSubcategoryBanner('tea-breakfast', 'masala-tea')).toBe(true);
    expect(shouldHideSubcategoryBanner('millet-mandi', 'millet-noodles-pasta')).toBe(true);
    expect(shouldHideSubcategoryBanner('fruits', 'premium-fruits')).toBe(false);
    expect(shouldHideSubcategoryBanner('fruits', '')).toBe(false);
  });

  it('keeps banner, youtube, and uploaded video fields from the category API', () => {
    const browse = mapCategoryBrowse({
      category: { _id: 'c1', name: 'Fruits', slug: 'fruits', bannerImage: 'https://cdn.example/fruits.jpg' },
      subcategories: [
        {
          _id: 's1',
          name: 'Premium Fruits',
          slug: 'premium-fruits',
          bannerImage: 'https://cdn.example/premium.jpg',
          bannerVideo: 'https://cdn.example/premium.mp4',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          videoPlayback: { mode: 'click', muted: true, loop: false, controls: true },
        },
      ],
      products: [{ id: 'p1', name: 'Apple' }],
      pagination: { page: 1, limit: 40, total: 1 },
    });

    expect(browse.category?.bannerImage).toBe('https://cdn.example/fruits.jpg');
    expect(browse.subcategories[0]).toMatchObject({
      slug: 'premium-fruits',
      bannerImage: 'https://cdn.example/premium.jpg',
      bannerVideo: 'https://cdn.example/premium.mp4',
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      videoPlayback: { mode: 'click', muted: true, loop: false, controls: true, playsInline: true },
    });
    expect(browse.products[0]?._id).toBe('p1');
  });
});
