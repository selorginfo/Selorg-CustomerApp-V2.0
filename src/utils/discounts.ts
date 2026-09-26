/**
 * Shared helpers for /coupons API payloads (order + item level).
 */

/** Local calendar YYYY-MM-DD — matches admin DATEONLY fields without UTC skew. */
export function calendarTodayYmd(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDiscountDateActive(d: {
  startDate?: string | null;
  endDate?: string | null;
}): boolean {
  const today = calendarTodayYmd();
  const startOk = !d.startDate || String(d.startDate).slice(0, 10) <= today;
  const endOk = !d.endDate || String(d.endDate).slice(0, 10) >= today;
  return startOk && endOk;
}

/** API returns either `{ list: Discount[] }` or a raw array depending on client/version. */
export function parseDiscountsListFromApiData(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object' && data !== null && 'list' in data) {
    const list = (data as { list?: unknown }).list;
    return Array.isArray(list) ? list : [];
  }
  return [];
}

export function normalizeDiscountLevel(level: unknown): string {
  return String(level ?? '')
    .trim()
    .toLowerCase();
}

/** Product rows included on item-level discounts (list API). */
export type DiscountLinkedItemRow = {
  id: string | number;
  name?: string | null;
  imageUrl?: string | null;
  price?: number | string | null;
  mrp?: number | string | null;
  compareAtPrice?: number | string | null;
};

export function getDiscountLinkedItems(d: {
  Items?: DiscountLinkedItemRow[];
  items?: DiscountLinkedItemRow[];
}): DiscountLinkedItemRow[] | undefined {
  const raw = d.Items ?? d.items;
  return Array.isArray(raw) && raw.length > 0 ? raw : undefined;
}
