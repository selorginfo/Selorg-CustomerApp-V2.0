import { toLocalOrder } from '../src/utils/mappers';

// Captured verbatim from GET /api/v1/customer/orders/:id on the running
// backend: the API emits `id` and never `_id`, and names totals totalBill /
// itemTotal. Reading `_id` here is what left every order with an undefined id.
const API_ORDER = {
  id: '6abce04b92f562d864edf3dd',
  orderNumber: 'ORD-20260930-00153',
  status: 'confirmed',
  paymentStatus: 'cod_pending',
  paymentMethodType: 'cash',
  itemTotal: 189,
  deliveryFee: 40,
  discount: 0,
  deliveryTip: 0,
  totalBill: 234,
  createdAt: '2026-09-30T10:11:23.179Z',
  items: [
    {
      id: '6abce04b92f562d864edf3df',
      productId: '6aaab5c3315af688f00476af',
      productName: 'Malgoova - 5 pcs',
      variantSize: '5 pcs',
      quantity: 1,
      price: 189,
      originalPrice: 209,
      image: 'https://cdn.example.com/malgoa.webp',
    },
  ],
  timeline: [],
};

describe('toLocalOrder', () => {
  it('reads the id the API actually sends', () => {
    expect(toLocalOrder(API_ORDER as never).id).toBe('6abce04b92f562d864edf3dd');
  });

  it('maps totals from totalBill / itemTotal', () => {
    const o = toLocalOrder(API_ORDER as never);
    expect(o.totalBill).toBe(234);
    expect(o.itemTotal).toBe(189);
  });

  it('maps item name, unit, mrp and image', () => {
    const [item] = toLocalOrder(API_ORDER as never).items;
    expect(item.name).toBe('Malgoova - 5 pcs');
    expect(item.unit).toBe('5 pcs');
    expect(item.mrp).toBe(209);
    expect(item.image).toEqual({ uri: 'https://cdn.example.com/malgoa.webp' });
  });

  it('still accepts legacy documents that carry _id', () => {
    const legacy = { _id: 'abc123', orderNumber: 'ORD-1', items: [], timeline: [] };
    expect(toLocalOrder(legacy as never).id).toBe('abc123');
  });

  it('does not throw when orderNumber is missing', () => {
    const noNumber = { id: 'abcdef123456', items: [], timeline: [] };
    expect(() => toLocalOrder(noNumber as never)).not.toThrow();
  });
});
