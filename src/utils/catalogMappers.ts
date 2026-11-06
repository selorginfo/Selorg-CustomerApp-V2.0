import type { ApiCategory, ApiProduct, CategoryBrowseResult } from '../services/catalog.service';
import { normalizeVideoPlayback } from './videoUrl';

/**
 * Sellable units for a product card, or `null` when the API did not report
 * stock at all (orderable, count unknown — see `Product.stockQuantity`).
 *
 * Endpoints disagree about stock. `/categories/:slug/products` and
 * `/products/:id` join live store inventory into `availableStock`. Home
 * carousels (`/sections/:key/products`) and `/collections/:slug` do NOT — they
 * emit catalog placeholders of `stockQuantity: 0` / `stock: 0` for items that
 * are in stock. Treating those zeros as a real count marked every home card
 * sold out while the same item showed in stock in its category.
 */
export function resolveListingStock(raw: {
  availableStock?: number;
  stockQuantity?: number;
  stock?: number | boolean;
  isSaleable?: boolean;
  isActive?: boolean;
}): number | null {
  // Hard availability flags outrank any count.
  if (raw.stock === false || raw.isSaleable === false || raw.isActive === false) return 0;

  // Live store stock is authoritative wherever the endpoint joins it.
  if (typeof raw.availableStock === 'number' && Number.isFinite(raw.availableStock)) {
    return raw.availableStock;
  }

  // No `availableStock` → inventory was not joined, so a catalog 0 means
  // "not reported", not "sold out". Only a positive catalog count is real;
  // otherwise fall through to null, matching the web app's resolveStockOk.
  const catalog = [raw.stockQuantity, raw.stock].filter(
    (n): n is number => typeof n === 'number' && Number.isFinite(n),
  );
  const best = catalog.length ? Math.max(...catalog) : 0;
  return best > 0 ? best : null;
}

/** Per-order quantity cap, or null when the product has none. */
export function resolveMaxOrderLimit(raw: { maxOrderLimit?: number | null }): number | null {
  const n = raw.maxOrderLimit;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** Normalize product id fields (`id` vs `_id`) from selorg-service. */
export function normalizeProduct(raw: Record<string, unknown>): ApiProduct {
  const id = String(raw._id ?? raw.id ?? '');
  return {
    ...(raw as unknown as ApiProduct),
    _id: id,
  };
}

function mediaString(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

/** Normalize category id and image fields from selorg-service. */
export function normalizeCategory(raw: Record<string, unknown>): ApiCategory {
  const id = String(raw._id ?? raw.id ?? '');
  const subs = raw.subcategories ?? raw.children ?? raw.subs;
  return {
    ...(raw as unknown as ApiCategory),
    _id: id,
    image:
      (raw.image as string) ||
      (raw.imageUrl as string) ||
      (raw.thumbnailUrl as string) ||
      (raw.cardImageUrl as string),
    slug: (raw.slug as string) || id,
    bannerImage: mediaString(raw.bannerImage),
    bannerId: mediaString(raw.bannerId),
    bannerVideo: mediaString(raw.bannerVideo),
    youtubeUrl: mediaString(raw.youtubeUrl),
    videoPlayback: normalizeVideoPlayback(raw.videoPlayback),
    children: Array.isArray(subs)
      ? (subs as Record<string, unknown>[]).map(normalizeCategory)
      : (raw.children as ApiCategory[] | undefined),
    subs: Array.isArray(subs) && !raw.children
      ? (subs as ApiCategory[]).map(c => c.name || String(c))
      : (raw.subs as string[] | undefined),
  };
}

/** Products response also carries the subcategory banners and videos. */
export function mapCategoryBrowse(data: unknown): CategoryBrowseResult {
  if (Array.isArray(data)) {
    return {
      products: (data as Record<string, unknown>[]).map(normalizeProduct),
      subcategories: [],
    };
  }
  const source = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const products = Array.isArray(source.products)
    ? (source.products as Record<string, unknown>[]).map(normalizeProduct)
    : [];
  const categoryRaw = source.category;
  const category =
    categoryRaw && typeof categoryRaw === 'object'
      ? normalizeCategory(categoryRaw as Record<string, unknown>)
      : undefined;
  const subcategories = Array.isArray(source.subcategories)
    ? (source.subcategories as Record<string, unknown>[]).map(normalizeCategory)
    : [];
  const pagination = source.pagination as CategoryBrowseResult['meta'];
  return { products, meta: pagination, category, subcategories };
}

/** `collections_deal_in_lowest_price` → `deal-in-lowest-price` */
export function sectionKeyToCollectionSlug(sectionKey: string): string {
  if (sectionKey.startsWith('collections_')) {
    return sectionKey.replace(/^collections_/, '').replace(/_/g, '-');
  }
  return sectionKey.replace(/_/g, '-');
}

export function isCollectionSectionKey(key: string): boolean {
  return key.startsWith('collections_');
}
