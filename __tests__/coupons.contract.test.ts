import { couponsFromResponse } from '../src/services/coupons.contract';

describe('couponsFromResponse', () => {
  it('unwraps data.coupons and maps the backend field names', () => {
    const coupons = couponsFromResponse({
      data: {
        coupons: [
          {
            _id: 'c1',
            code: 'SAVE10',
            displayName: 'Save 10',
            minOrderValue: 199,
            maxDiscountCap: 50,
            showInSections: ['COUPON_LIST'],
            priorityRank: 2,
            bannerImageUrl: 'https://cdn.example/save.png',
          },
          { code: 'HIDDEN', showInSections: ['HOME_ONLY'], priorityRank: 1 },
        ],
      },
    });
    expect(coupons).toHaveLength(1);
    expect(coupons[0].code).toBe('SAVE10');
    expect(coupons[0].name).toBe('Save 10');
    expect(coupons[0].minOrderAmount).toBe(199);
    expect(coupons[0].maxDiscountAmount).toBe(50);
    expect(coupons[0].bannerImageUrl).toBe('https://cdn.example/save.png');
  });
});
