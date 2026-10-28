export interface ApiCoupon {
  _id: string;
  code: string;
  name?: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number | null;
  isActive?: boolean;
  showInSections?: string[];
  priorityRank?: number;
  bannerImageUrl?: string | null;
}

export function couponsFromResponse(res: unknown): ApiCoupon[] {
  const data = res && typeof res === 'object' && 'data' in res ? (res as { data: unknown }).data : res;
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { coupons?: unknown }).coupons)
      ? (data as { coupons: unknown[] }).coupons
      : [];
  return list
    .map((entry) => {
      const raw = entry as Record<string, unknown>;
      const code = String(raw.code || '');
      if (!code) return null;
      const sections = Array.isArray(raw.showInSections) ? raw.showInSections.map(String) : ['COUPON_LIST'];
      return {
        _id: String(raw._id || raw.id || code),
        code,
        name: String(raw.name || raw.displayName || raw.title || code),
        description: raw.description ? String(raw.description) : undefined,
        discountType: raw.discountType ? String(raw.discountType) : undefined,
        discountValue: typeof raw.discountValue === 'number' ? raw.discountValue : undefined,
        minOrderAmount: Number(raw.minOrderAmount ?? raw.minOrderValue ?? 0),
        maxDiscountAmount: (raw.maxDiscountAmount ?? raw.maxDiscountCap ?? null) as number | null,
        isActive: raw.isActive !== false,
        showInSections: sections,
        priorityRank: typeof raw.priorityRank === 'number' ? raw.priorityRank : 10,
        bannerImageUrl: raw.bannerImageUrl ? String(raw.bannerImageUrl) : null,
      } satisfies ApiCoupon;
    })
    .filter((coupon): coupon is ApiCoupon => coupon !== null)
    .filter((coupon) => coupon.showInSections?.includes('COUPON_LIST'))
    .sort((a, b) => (a.priorityRank ?? 10) - (b.priorityRank ?? 10));
}
