/** Short phones / landscape — shrink badge & tighten vertical rhythm so footer never overlaps. */
export const ORDER_PLACED_COMPACT_HEIGHT = 700;

export type OrderPlacedLayout = {
  compact: boolean;
  badgeSize: number;
  iconSize: number;
  titleSize: number;
  subtitleSize: number;
  thankYouSize: number;
};

export function orderPlacedLayout(windowHeight: number): OrderPlacedLayout {
  const compact = windowHeight > 0 && windowHeight < ORDER_PLACED_COMPACT_HEIGHT;
  return {
    compact,
    badgeSize: compact ? 72 : 96,
    iconSize: compact ? 36 : 48,
    titleSize: compact ? 22 : 24,
    subtitleSize: compact ? 13 : 14,
    thankYouSize: compact ? 14 : 15,
  };
}
