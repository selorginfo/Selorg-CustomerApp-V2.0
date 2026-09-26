import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet, Icon, RangeSlider } from '../../components';
import { colors, fontFamily, radii } from '../../theme';
import { formatCurrency } from '../../utils/format';

export type SortKey = 'popular' | 'low' | 'high' | 'discount';
export type Availability = 'in' | 'out' | null;

export interface ProductFilters {
  sort: SortKey;
  stockOnly: boolean;
  discountedOnly: boolean;
  /** `null` = no price constraint. `[lo, hi]` in rupees; `hi === PRICE_MAX` means "and above". */
  price: [number, number] | null;
  /** Minimum discount %, 0 = off. */
  discount: number;
  /** Minimum star rating, 0 = off. */
  rating: number;
  availability: Availability;
}

export const PRICE_MIN = 0;
export const PRICE_MAX = 6000;
export const PRICE_STEP = 50;

export const DEFAULT_FILTERS: ProductFilters = {
  sort: 'popular',
  stockOnly: false,
  discountedOnly: false,
  price: null,
  discount: 0,
  rating: 0,
  availability: null,
};

/** Filter chips shown as a count badge — sort is deliberately excluded (it has its own sheet). */
export function countActiveFilters(f: ProductFilters): number {
  return (
    (f.price ? 1 : 0) +
    (f.discount ? 1 : 0) +
    (f.rating ? 1 : 0) +
    (f.availability ? 1 : 0) +
    (f.stockOnly ? 1 : 0) +
    (f.discountedOnly ? 1 : 0)
  );
}

const SORT_OPTIONS: [SortKey, string][] = [
  ['popular', 'Popularity'],
  ['low', 'Price: low to high'],
  ['high', 'Price: high to low'],
  ['discount', 'Discount: high to low'],
];

const DISCOUNT_STEPS = [10, 20, 30, 40, 50];
const RATING_STEPS = [4, 3, 2, 1];

// ───────────────────────────── filtering ─────────────────────────────

interface Filterable {
  price: number;
  mrp: number;
  stockQuantity: number;
  rating?: number;
}

export function applyProductFilters<T extends Filterable>(products: T[], filters: ProductFilters): T[] {
  let list = products.slice();

  if (filters.stockOnly || filters.availability === 'in') list = list.filter(p => p.stockQuantity > 0);
  if (filters.availability === 'out') list = list.filter(p => p.stockQuantity === 0);
  if (filters.discountedOnly) list = list.filter(p => p.mrp > p.price);
  if (filters.price) {
    const [lo, hi] = filters.price;
    const ceiling = hi >= PRICE_MAX ? Number.POSITIVE_INFINITY : hi;
    list = list.filter(p => p.price >= lo && p.price <= ceiling);
  }
  if (filters.discount) {
    list = list.filter(p => p.mrp > p.price && Math.round((1 - p.price / p.mrp) * 100) >= filters.discount);
  }
  if (filters.rating) list = list.filter(p => (p.rating ?? 0) >= filters.rating);

  if (filters.sort === 'low') list.sort((a, b) => a.price - b.price);
  else if (filters.sort === 'high') list.sort((a, b) => b.price - a.price);
  else if (filters.sort === 'discount') {
    list.sort((a, b) => (1 - b.price / b.mrp) - (1 - a.price / a.mrp));
  }
  return list;
}

// ───────────────────────────── sort sheet ─────────────────────────────

export function SortSheet({
  visible,
  onClose,
  value,
  onChange,
}: {
  visible: boolean;
  onClose: () => void;
  value: SortKey;
  onChange: (k: SortKey) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sort by" maxHeightPct={60}>
      {SORT_OPTIONS.map(([key, label]) => {
        const on = value === key;
        return (
          <Pressable
            key={key}
            style={styles.sortRow}
            onPress={() => {
              onChange(key);
              onClose();
            }}
          >
            <Text style={[styles.sortLabel, on && styles.sortLabelOn]}>{label}</Text>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

// ──────────────────────────── filter sheet ────────────────────────────

interface FilterProps {
  visible: boolean;
  onClose: () => void;
  filters: ProductFilters;
  onChange: (next: ProductFilters) => void;
  onReset: () => void;
  /** Live count rendered under the Apply button. */
  resultCount: number;
}

export function FilterSheet({ visible, onClose, filters, onChange, onReset, resultCount }: FilterProps) {
  const [lo, hi] = filters.price ?? [PRICE_MIN, PRICE_MAX];
  const priceTouched = lo > PRICE_MIN || hi < PRICE_MAX;

  const section = (title: string) => <Text style={styles.sectionTitle}>{title}</Text>;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filters"
      maxHeightPct={88}
      headerRight={
        <Pressable onPress={onReset} hitSlop={8}>
          <Text style={styles.clearAll}>Clear All</Text>
        </Pressable>
      }
      footer={
        <View>
          <Pressable style={styles.applyBtn} onPress={onClose}>
            <Text style={styles.applyLabel}>Apply Filters</Text>
          </Pressable>
          <Text style={styles.resultCount}>
            {resultCount.toLocaleString('en-IN')} product{resultCount === 1 ? '' : 's'} found
          </Text>
        </View>
      }
    >
      {/* Price range */}
      {section('Price Range')}
      <View style={styles.priceChips}>
        <Text style={styles.priceChip}>{formatCurrency(lo)}</Text>
        <Text style={styles.priceChip}>
          {hi >= PRICE_MAX ? `${formatCurrency(PRICE_MAX)}+` : formatCurrency(hi)}
        </Text>
      </View>
      <RangeSlider
        min={PRICE_MIN}
        max={PRICE_MAX}
        step={PRICE_STEP}
        low={lo}
        high={hi}
        onChange={(nextLo, nextHi) => onChange({ ...filters, price: [nextLo, nextHi] })}
      />
      <View style={styles.priceBounds}>
        <Text style={styles.priceBound}>₹0</Text>
        <Text style={styles.priceBound}>₹6,000+</Text>
      </View>
      {priceTouched ? (
        <Pressable onPress={() => onChange({ ...filters, price: null })} hitSlop={6}>
          <Text style={styles.resetPrice}>Reset price</Text>
        </Pressable>
      ) : null}

      {/* Discount */}
      {section('Discount')}
      <View style={styles.grid3}>
        {DISCOUNT_STEPS.map(d => {
          const on = filters.discount === d;
          return (
            <Pressable
              key={d}
              style={[styles.gridCell, styles.pill, on && styles.pillOn]}
              onPress={() => onChange({ ...filters, discount: on ? 0 : d })}
            >
              <Text style={[styles.pillLabel, on && styles.pillLabelOn]}>{d}% and above</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Rating */}
      {section('Customer Rating')}
      <View style={styles.grid4}>
        {RATING_STEPS.map(r => {
          const on = filters.rating === r;
          return (
            <Pressable
              key={r}
              style={[styles.gridCell4, styles.ratingPill, on && styles.pillOn]}
              onPress={() => onChange({ ...filters, rating: on ? 0 : r })}
            >
              <View style={styles.ratingTop}>
                <Icon name="star" size={13} color={colors.star} fill={colors.star} strokeWidth={0} />
                <Text style={styles.ratingValue}>{r}</Text>
              </View>
              <Text style={styles.ratingSub}>&amp; above</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Availability */}
      {section('Availability')}
      <View style={styles.availRow}>
        {([['in', 'In Stock'], ['out', 'Out of Stock']] as [Exclude<Availability, null>, string][]).map(
          ([key, label]) => {
            const on = filters.availability === key;
            return (
              <Pressable
                key={key}
                style={styles.availItem}
                onPress={() => onChange({ ...filters, availability: on ? null : key })}
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Icon name="check" size={13} color={colors.white} strokeWidth={3} /> : null}
                </View>
                <Text style={styles.availLabel}>{label}</Text>
              </Pressable>
            );
          },
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text, marginTop: 20, marginBottom: 12 },

  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  sortLabel: { fontFamily: fontFamily.semibold, fontSize: 14.5, color: colors.textMuted },
  sortLabelOn: { fontFamily: fontFamily.bold, color: colors.text },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#CCD3CB',
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  clearAll: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.primary },

  priceChips: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  priceChip: {
    fontFamily: fontFamily.bold, fontSize: 13, color: colors.primaryDark,
    backgroundColor: colors.tint, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, overflow: 'hidden',
  },
  priceBounds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  priceBound: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.textMuted },
  resetPrice: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.primary, marginTop: 10 },

  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: { width: '31.5%', minWidth: 0 },
  grid4: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell4: { width: '23%', minWidth: 0 },
  pill: {
    paddingVertical: 11, paddingHorizontal: 6, borderRadius: radii.lg, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  pillOn: { borderColor: colors.primary, backgroundColor: colors.tint },
  pillLabel: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.text, textAlign: 'center' },
  pillLabelOn: { color: colors.primaryDark },
  ratingPill: {
    paddingVertical: 10, paddingHorizontal: 4, borderRadius: radii.lg, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', gap: 3,
  },
  ratingTop: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingValue: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.star },
  ratingSub: { fontFamily: fontFamily.bold, fontSize: 10.5, color: colors.textMuted },

  availRow: { flexDirection: 'row', gap: 14 },
  availItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 2 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.disabled,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  availLabel: { fontFamily: fontFamily.bold, fontSize: 13.5, color: colors.text },

  applyBtn: {
    paddingVertical: 15, borderRadius: radii.xl - 2, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  applyLabel: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.white },
  resultCount: { fontFamily: fontFamily.bold, fontSize: 12.5, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
});

export default FilterSheet;
