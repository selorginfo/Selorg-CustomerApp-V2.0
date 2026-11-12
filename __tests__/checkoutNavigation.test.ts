import { classifyCheckoutNavigation, isAllowedHttpPaymentUrl, isBankAuthenticationUrl } from '../src/utils/checkoutNavigation';

describe('checkout navigation', () => {
  it('allows the Worldline return POST even with an empty query string', () => {
    const url = 'https://api.selorg.com/api/v1/customer/payments/worldline/return';
    expect(classifyCheckoutNavigation(url)).toBe('return');
  });

  it('allows card 3-D Secure and bank OTP pages', () => {
    expect(classifyCheckoutNavigation('https://acs.hdfcbank.com/acs/auth?txnStatus=Y')).toBe('allow');
    expect(classifyCheckoutNavigation('https://3ds.icicibank.com/v1/otp')).toBe('allow');
    expect(classifyCheckoutNavigation('http://acs.sbi.example/3ds/pareq')).toBe('allow');
    expect(isAllowedHttpPaymentUrl('http://acs.sbi.example/3ds/pareq')).toBe(true);
    expect(isBankAuthenticationUrl('https://acs.hdfcbank.com/acs/auth')).toBe(true);
    expect(isBankAuthenticationUrl('https://www.paynimo.com/paynimocheckout/')).toBe(false);
  });

  it('blocks unrelated HTTP and non-payment schemes', () => {
    expect(classifyCheckoutNavigation('http://evil.example/phish')).toBe('block');
    expect(classifyCheckoutNavigation('http://example.com/status=success')).toBe('block');
    expect(isAllowedHttpPaymentUrl('http://example.com/status=success')).toBe(false);
    expect(classifyCheckoutNavigation('file:///etc/passwd')).toBe('block');
    expect(classifyCheckoutNavigation('intent://scan/#Intent;package=com.malware;end')).toBe('block');
  });

  it('still opens a real UPI app link', () => {
    expect(classifyCheckoutNavigation('upi://pay?pa=selorg@upi&am=10')).toBe('upi');
    expect(
      classifyCheckoutNavigation('intent://pay#Intent;scheme=upi;package=com.phonepe.app;end'),
    ).toBe('upi');
  });

  it('keeps Paynimo and the inline checkout page', () => {
    expect(classifyCheckoutNavigation('https://www.paynimo.com/paynimocheckout/server/lib/checkout.js')).toBe('allow');
    expect(classifyCheckoutNavigation('about:blank')).toBe('allow');
  });
});
