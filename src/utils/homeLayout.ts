/**
 * Home section layout rules copied from selorg-web-app page.tsx.
 * Consecutive single promo banners collapse into one row. Hero, scroll,
 * strip, grid, and the fruit pair stay in their own sections, in CMS order.
 */

export type LayoutBanner = { bannerId?: string };

export type LayoutSection = {
  key: string;
  kind: string;
  layout?: string;
  items?: LayoutBanner[];
};

export function isFullWidthStrip(section: LayoutSection): boolean {
  if (section.kind !== 'banners') return false;
  if (section.layout === 'strip') return true;
  if (section.layout) return false;
  return section.key.startsWith('strip_');
}

export function keepsItsLayout(section: LayoutSection): boolean {
  return (
    section.kind === 'banners' &&
    (section.layout === 'scroll' || section.layout === 'grid' || section.key.startsWith('scroll_'))
  );
}

export function isFruitPromoSection(section: LayoutSection): boolean {
  if (section.kind !== 'banners' || !section.items?.length) return false;
  if (section.key === 'banner_scroll_mid_row') return true;
  return section.items.every(b => b.bannerId === 'Ban-046' || b.bannerId === 'Ban-047');
}

export function mergePromoBanners<T extends LayoutSection>(sections: T[], isHero: (section: T) => boolean): T[] {
  const merged: T[] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    const mergeable =
      section.kind === 'banners' &&
      !isHero(section) &&
      !isFruitPromoSection(section) &&
      !isFullWidthStrip(section) &&
      !keepsItsLayout(section) &&
      previous?.kind === 'banners' &&
      !isHero(previous) &&
      !isFruitPromoSection(previous) &&
      !isFullWidthStrip(previous) &&
      !keepsItsLayout(previous);

    if (mergeable && previous && previous.kind === 'banners' && section.kind === 'banners') {
      merged[merged.length - 1] = {
        ...previous,
        items: [...(previous.items || []), ...(section.items || [])],
      };
      continue;
    }
    merged.push(section);
  }
  return merged;
}

/** Subcategory product lists that open on the products, with no banner image. */
const HIDE_ALL_SUBCATEGORY_BANNERS = new Set(['tea-breakfast', 'dairy-products']);
const HIDE_SUBCATEGORY_BANNER = new Set([
  'dry-powder-mix/fruits-mix',
  'dry-powder-mix/vegetables-mix',
  'groceries-kitchen/salt-sugar-jaggery',
  'groceries-kitchen/paste',
  'groceries-kitchen/vermecelli',
  'millet-mandi/millet-flours',
  'millet-mandi/millet-noodles-pasta',
  'millet-mandi/sprouts',
  'rice-mandi/boiled-rice',
  'rice-mandi/basmathi-seeraga-samba-rice',
  'rice-mandi/red-rice-brown-rice',
  'rice-mandi/kerala-rice-broken-rice',
  'rice-mandi/rice-essentials-others',
]);

export function shouldHideSubcategoryBanner(categorySlug: string, subcategorySlug: string): boolean {
  const category = categorySlug.trim().toLowerCase();
  const sub = subcategorySlug.trim().toLowerCase();
  if (!category || !sub) return false;
  return HIDE_ALL_SUBCATEGORY_BANNERS.has(category) || HIDE_SUBCATEGORY_BANNER.has(`${category}/${sub}`);
}
