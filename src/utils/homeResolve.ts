/**
 * Resolve CMS / Master Sheet home sections the same way as selorg-web-app
 * `page.tsx` → `resolveSections()` + `homeService.getSectionProducts()`.
 *
 * `/customer/home` returns ordered `sectionDefinitions` + inline banners/lifestyle.
 * Product carousels come from `/sections/:key/products` (mastersheet productIds),
 * with `/collections/:slug` fallback for `collections_*` keys.
 */
import { catalogApi } from '../services/catalog.service';
import type { ApiCategory, ApiProduct, HomePayload } from '../services/catalog.service';
import { sectionKeyToCollectionSlug } from './catalogMappers';

export type HomeBanner = {
  _id?: string;
  bannerId?: string;
  slot?: string;
  presentationMode?: string;
  title?: string;
  kicker?: string;
  subtitle?: string;
  imageUrl?: string;
  bannerImageUrl?: string;
  link?: string;
  redirectType?: string;
  redirectValue?: string;
};

export type HomeLifestyleItem = {
  _id?: string;
  name?: string;
  title?: string;
  imageUrl?: string;
  subtitle?: string;
  link?: string;
  redirectType?: string;
  redirectValue?: string;
};

export type ResolvedHomeSection =
  | { key: string; label: string; kind: 'banners'; items: HomeBanner[] }
  | { key: string; label: string; kind: 'lifestyle'; items: HomeLifestyleItem[] }
  | {
      key: string;
      label: string;
      kind: 'products';
      slug: string;
      products: ApiProduct[];
      error?: boolean;
    };

function isUsableBannerImage(b: HomeBanner): boolean {
  const src = String(b.imageUrl || b.bannerImageUrl || '').trim();
  if (!src) return false;
  const url = src.toLowerCase();
  return !url.includes('/sample%20banner/') && !url.includes('/sample banner/');
}

function normalizeBanner(raw: Record<string, unknown>): HomeBanner {
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    bannerId: raw.bannerId ? String(raw.bannerId) : undefined,
    slot: raw.slot ? String(raw.slot) : undefined,
    presentationMode: raw.presentationMode ? String(raw.presentationMode) : undefined,
    title: raw.title ? String(raw.title) : undefined,
    kicker: raw.kicker ? String(raw.kicker) : undefined,
    subtitle: raw.subtitle ? String(raw.subtitle) : undefined,
    imageUrl: (raw.imageUrl || raw.bannerImageUrl || raw.image) as string | undefined,
    bannerImageUrl: raw.bannerImageUrl as string | undefined,
    link: raw.link ? String(raw.link) : undefined,
    redirectType: raw.redirectType ? String(raw.redirectType) : undefined,
    redirectValue: raw.redirectValue ? String(raw.redirectValue) : undefined,
  };
}

function normalizeLifestyle(raw: Record<string, unknown>): HomeLifestyleItem {
  return {
    _id: String(raw._id ?? raw.id ?? ''),
    name: raw.name ? String(raw.name) : undefined,
    title: raw.title ? String(raw.title) : raw.name ? String(raw.name) : undefined,
    subtitle: raw.subtitle ? String(raw.subtitle) : undefined,
    imageUrl: (raw.imageUrl || raw.image || raw.cardImageUrl) as string | undefined,
    link: raw.link ? String(raw.link) : undefined,
    redirectType: raw.redirectType ? String(raw.redirectType) : undefined,
    redirectValue: raw.redirectValue ? String(raw.redirectValue) : undefined,
  };
}

export function isHeroBannerSection(section: ResolvedHomeSection): boolean {
  return (
    section.kind === 'banners' &&
    section.items.some(b => b.slot === 'hero' || b.presentationMode === 'carousel')
  );
}

export function bannerImageUri(b: HomeBanner): string | undefined {
  const primary = typeof b.imageUrl === 'string' ? b.imageUrl.trim() : '';
  if (primary) return primary;
  const fallback = typeof b.bannerImageUrl === 'string' ? b.bannerImageUrl.trim() : '';
  return fallback || undefined;
}

/**
 * Walk every Master Sheet / CMS section definition (web parity).
 * Keeps mobile "Shop by category" separate — categories still loaded from home/categories API.
 */
export async function resolveHomeSections(home: HomePayload): Promise<ResolvedHomeSection[]> {
  const defs = home.sectionDefinitions || [];
  const sectionsMap = (home.sections || {}) as Record<string, unknown>;

  const resolved = await Promise.all(
    defs.map(async (def): Promise<ResolvedHomeSection | null> => {
      const key = def.key || '';
      const label = def.label || key;

      // Categories rail is rendered separately on mobile; skip Moringa promo like web.
      if (
        key === 'categories' ||
        key === 'section_categories' ||
        /shop\s*by\s*categor/i.test(label) ||
        /^categor/i.test(key) ||
        /moringa/i.test(key) ||
        /moringa/i.test(label)
      ) {
        return null;
      }

      const inline = sectionsMap[key];
      if (Array.isArray(inline) && inline.length > 0) {
        const first = inline[0] as Record<string, unknown>;
        if (first && typeof first === 'object' && 'slot' in first) {
          const items = (inline as Record<string, unknown>[])
            .map(normalizeBanner)
            .filter(isUsableBannerImage);
          if (!items.length) return null;
          return { key, label, kind: 'banners', items };
        }
        // Category-shaped payloads (have slug) — never render as lifestyle (web parity)
        if (first && typeof first === 'object' && 'slug' in first) {
          return null;
        }
        const life = (inline as Record<string, unknown>[])
          .map(normalizeLifestyle)
          .filter(i => !!String(i.imageUrl || '').trim());
        if (life.length) return { key, label, kind: 'lifestyle', items: life };
      }

      // Product carousel — prefer mastersheet HomeSection productIds via /sections/:key/products
      try {
        const productSection = await catalogApi.getSectionProducts(key, { limit: 8 });
        if (!productSection) return null;
        return {
          key,
          label: productSection.title || label,
          kind: 'products',
          slug: sectionKeyToCollectionSlug(key),
          products: productSection.products || [],
        };
      } catch {
        return {
          key,
          label,
          kind: 'products',
          slug: sectionKeyToCollectionSlug(key),
          products: [],
          error: true,
        };
      }
    }),
  );

  return resolved.filter((s): s is ResolvedHomeSection => s !== null);
}

export async function loadHomeCategories(home: HomePayload): Promise<ApiCategory[]> {
  if (home.categories?.length) return home.categories;
  return catalogApi.getCategories({ isActive: true, limit: 20 }).catch(() => []);
}
