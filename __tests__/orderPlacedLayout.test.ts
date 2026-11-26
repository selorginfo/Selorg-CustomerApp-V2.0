import {
  ORDER_PLACED_COMPACT_HEIGHT,
  orderPlacedLayout,
} from '../src/utils/orderPlacedLayout';

describe('orderPlacedLayout', () => {
  it('uses full sizes on tall screens so the hero badge stays prominent', () => {
    const layout = orderPlacedLayout(800);
    expect(layout.compact).toBe(false);
    expect(layout.badgeSize).toBe(96);
    expect(layout.iconSize).toBe(48);
    expect(layout.titleSize).toBe(24);
  });

  it('compacts below the short-screen threshold so footer actions do not overlap content', () => {
    const layout = orderPlacedLayout(ORDER_PLACED_COMPACT_HEIGHT - 1);
    expect(layout.compact).toBe(true);
    expect(layout.badgeSize).toBe(72);
    expect(layout.iconSize).toBe(36);
    expect(layout.titleSize).toBe(22);
    expect(layout.subtitleSize).toBe(13);
    expect(layout.thankYouSize).toBe(14);
  });

  it('stays full-size exactly at the compact threshold', () => {
    expect(orderPlacedLayout(ORDER_PLACED_COMPACT_HEIGHT).compact).toBe(false);
  });

  it('treats zero/unknown height as non-compact (safe default)', () => {
    expect(orderPlacedLayout(0).compact).toBe(false);
  });
});
