import { readWalletBalance } from '../src/services/wallet.service';

describe('readWalletBalance', () => {
  it('reads the signed-in customer envelope', () => {
    expect(
      readWalletBalance({
        success: true,
        data: { balance: 250.5, currency: 'INR', isActive: true },
      }),
    ).toBe(250.5);
  });

  it('reads a double-wrapped balance', () => {
    expect(readWalletBalance({ data: { data: { balance: 80 } } })).toBe(80);
  });

  it('does not treat a missing balance as zero', () => {
    expect(readWalletBalance({ success: true, data: { currency: 'INR' } })).toBeNull();
    expect(readWalletBalance(null)).toBeNull();
  });
});
