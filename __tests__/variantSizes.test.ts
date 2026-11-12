import { dedupeSizeOptions } from '../src/utils/variantSizes';

describe('dedupeSizeOptions', () => {
  it('keeps each pack size once and the price that belongs to it', () => {
    const rows = dedupeSizeOptions([
      { id: 'a', size: '100ml', price: 29 },
      { id: 'b', size: '200 ml', price: 79 },
      { id: 'c', size: '500ml', price: 159 },
      { id: 'd', size: '1 L', price: 319 },
      { id: 'b2', size: '200ml', price: 79, classification: 'Variant' },
      { id: 'c2', size: '500 ml Pouch', price: 159 },
      { id: 'd2', size: '1 litre', price: 319 },
    ]);

    expect(rows.map(r => [r.id, r.price])).toEqual([
      ['a', 29],
      ['b', 79],
      ['c', 159],
      ['d', 319],
    ]);
  });

  it('keeps the opened product price when the same size is repeated', () => {
    const rows = dedupeSizeOptions(
      [
        { id: 'variant-sku', size: '100 ml', price: 0, classification: 'Variant' },
        { id: 'style-sku', size: '100ml', price: 29, classification: 'Style' },
      ],
      'style-sku',
    );
    expect(rows).toEqual([{ id: 'style-sku', size: '100ml', price: 29, classification: 'Style' }]);
  });

  it('does not merge different sizes, including packs with no size label', () => {
    const rows = dedupeSizeOptions([
      { id: 'pcs2', size: '2 pcs', price: 40 },
      { id: 'pcs5', size: '5 pcs', price: 90 },
      { id: 'plain-a', price: 10 },
      { id: 'plain-b', price: 12 },
    ]);
    expect(rows.map(r => r.id)).toEqual(['pcs2', 'pcs5', 'plain-a', 'plain-b']);
  });

  it('keeps one option per volume from the coconut oil catalog, with that volume’s price', () => {
    const catalog = [
      { id: 'p100', size: '100ml Pouch', price: 29 },
      { id: 'p250', size: '250ml Pouch', price: 79 },
      { id: 'p500', size: '500ml Pouch', price: 159 },
      { id: 'p1', size: '1 Ltr Pouch', price: 319 },
      { id: 'b250', size: '250ml Bottle', price: 79 },
      { id: 'b500', size: '500ml Bottle', price: 159 },
      { id: 'b1', size: '1 Ltr Bottle', price: 319 },
    ];

    const pouch = dedupeSizeOptions(catalog, 'p100');
    expect(pouch.map(r => [r.id, r.size, r.price])).toEqual([
      ['p100', '100ml Pouch', 29],
      ['p250', '250ml Pouch', 79],
      ['p500', '500ml Pouch', 159],
      ['p1', '1 Ltr Pouch', 319],
    ]);

    const bottle = dedupeSizeOptions(catalog, 'b250');
    expect(bottle.map(r => [r.id, r.price])).toEqual([
      ['p100', 29],
      ['b250', 79],
      ['b500', 159],
      ['b1', 319],
    ]);
    expect(new Set(bottle.map(r => r.size?.replace(/\s+/g, '').toLowerCase())).size).toBe(bottle.length);
  });

  it('replaces a zero price with the priced duplicate of that size', () => {
    const rows = dedupeSizeOptions([
      { id: 'empty', size: '250g', price: 0 },
      { id: 'priced', size: '250 g', price: 55 },
      { id: 'kg', size: '1 kg', price: 180 },
    ]);
    expect(rows.map(r => [r.id, r.price])).toEqual([
      ['priced', 55],
      ['kg', 180],
    ]);
  });
});
