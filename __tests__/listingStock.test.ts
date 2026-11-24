import { resolveListingStock } from '../src/utils/catalogMappers';

describe('customer listing stock after a bulk load', () => {
  it('uses live available stock, including zero', () => {
    expect(resolveListingStock({ availableStock: 100, stockQuantity: 0, stock: 0 })).toBe(100);
    expect(resolveListingStock({ availableStock: 0, stockQuantity: 20, stock: 20 })).toBe(0);
    expect(resolveListingStock({ availableStock: 500, stockQuantity: 0 })).toBe(500);
  });

  it('does not treat a missing live quantity of catalog 0 as sold out', () => {
    expect(resolveListingStock({ stockQuantity: 0, stock: 0 })).toBeNull();
  });
});
