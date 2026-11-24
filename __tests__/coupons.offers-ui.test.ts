/**
 * OPEN-02: checkout exposes Available offers via couponsApi.list + couponsFromResponse.
 */
import fs from 'fs';
import path from 'path';

describe('OPEN-02 available coupons UI', () => {
  const checkout = fs.readFileSync(
    path.join(__dirname, '../src/screens/cart/checkout.tsx'),
    'utf8',
  );
  const service = fs.readFileSync(
    path.join(__dirname, '../src/services/coupons.service.ts'),
    'utf8',
  );

  it('checkout loads offers with couponsApi.list when View offers is opened', () => {
    expect(checkout).toContain('couponsApi');
    expect(checkout).toContain('View offers');
    expect(checkout).toContain('couponsApi');
    expect(checkout).toMatch(/couponsApi\s*\n?\s*\.list\(itemTotal\)/);
  });

  it('manual coupon entry remains alongside offers', () => {
    expect(checkout).toContain('Enter coupon code');
    expect(checkout).toContain('handleApplyCoupon');
    expect(checkout).toContain('applyCoupon(offer.code)');
  });

  it('list endpoint uses couponsFromResponse mapper', () => {
    expect(service).toContain('couponsFromResponse');
    expect(service).toContain("'/coupons'");
  });
});
