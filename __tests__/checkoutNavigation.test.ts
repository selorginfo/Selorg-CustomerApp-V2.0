import {
  classifyCheckoutNavigation,
  isAllowedHttpPaymentUrl,
  isBankAuthenticationUrl,
  isCheckoutProgressUrl,
  isPaymentResultHandoffUrl,
  isIssuerAuthenticationUrl,
  isPopupGatewayNavigation,
  shouldRecoverBlankGatewayPage,
} from '../src/utils/checkoutNavigation';

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
    // TPSL card page is in-flight — Close must not abort, and status watch must start.
    expect(isBankAuthenticationUrl('https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg')).toBe(true);
    expect(isCheckoutProgressUrl('https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg')).toBe(true);
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
    expect(isPopupGatewayNavigation('https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg?token=hidden')).toBe(
      true,
    );
    expect(isPopupGatewayNavigation('https://acs.hdfcbank.com/acs/auth')).toBe(true);
    expect(isPopupGatewayNavigation('https://www.paynimo.com/paynimocheckout/')).toBe(false);
    expect(isPopupGatewayNavigation('upi://pay?pa=selorg@upi')).toBe(false);
    expect(classifyCheckoutNavigation('https://www.paynimo.com/paynimocheckout/server/lib/checkout.js')).toBe('allow');
    expect(classifyCheckoutNavigation('about:blank')).toBe('allow');
  });

  it('does not render the website after the gateway POST', () => {
    expect(isPaymentResultHandoffUrl('https://api.selorg.com/api/v1/customer/payments/worldline/return')).toBe(false);
    expect(
      isPaymentResultHandoffUrl(
        'https://www.selorg.com/checkout/payment?paynimo_bridge=1&status=success&orderId=abc',
      ),
    ).toBe(true);
    expect(
      isPaymentResultHandoffUrl(
        'https://www.selorg.com/auth?redirect=%2Fcheckout%2Fpayment%3Fpaynimo_bridge%3D1',
      ),
    ).toBe(true);
    expect(isPaymentResultHandoffUrl('https://www.selorg.com/checkout/confirmation?orderId=abc')).toBe(true);
    expect(isPaymentResultHandoffUrl('https://acs.hdfcbank.com/acs/auth')).toBe(false);
    expect(isPaymentResultHandoffUrl('https://www.paynimo.com/')).toBe(false);
  });

  it('recovers stuck post-debit sheets but never tears down OTP / live card pages', () => {
    // Live TPSL card page and issuer ACS — sparse DOM is normal; keep WebView for OTP.
    expect(shouldRecoverBlankGatewayPage('https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg', 0, true)).toBe(
      false,
    );
    expect(shouldRecoverBlankGatewayPage('https://acs.hdfcbank.com/acs/auth', 0, true)).toBe(false);
    expect(shouldRecoverBlankGatewayPage('https://acs.hdfcbank.com/acs/auth', 40, true)).toBe(false);
    expect(shouldRecoverBlankGatewayPage('https://3ds.icicibank.com/v1/otp', 0, true)).toBe(false);
    expect(shouldRecoverBlankGatewayPage('about:blank', 0, true)).toBe(true);
    // After the card GET, an empty Paynimo document is the stuck Secure Payment screen.
    expect(shouldRecoverBlankGatewayPage('https://www.paynimo.com/', 0, true)).toBe(true);
    expect(shouldRecoverBlankGatewayPage('about:blank', 0, false)).toBe(false);
    expect(shouldRecoverBlankGatewayPage('https://www.paynimo.com/', 0, false)).toBe(false);
  });

  it('leaves the blank sheet after OTP without closing a live card or OTP page', () => {
    const tpsl = 'https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg';
    const acs = 'https://acs.hdfcbank.com/acs/auth';
    expect(isIssuerAuthenticationUrl(acs)).toBe(true);
    expect(isIssuerAuthenticationUrl(tpsl)).toBe(false);
    expect(isIssuerAuthenticationUrl('https://authentication.cardinalcommerce.com/ThreeDSecure/V2')).toBe(true);
    // Card form still on TPSL, even if the document has not painted text.
    expect(
      shouldRecoverBlankGatewayPage(tpsl, 0, {
        gatewayStarted: true,
        sawIssuer: false,
        sawGatewayContent: false,
        leftPaintedDocument: false,
        blankForMs: 20000,
      }),
    ).toBe(false);
    // Same URL the shopper is typing into — sparse OTP widget, not a finished payment.
    expect(
      shouldRecoverBlankGatewayPage(tpsl, 0, {
        gatewayStarted: true,
        sawIssuer: false,
        sawGatewayContent: true,
        leftPaintedDocument: false,
        blankForMs: 20000,
      }),
    ).toBe(false);
    // Bank OTP host itself is never torn down for being empty.
    expect(
      shouldRecoverBlankGatewayPage(acs, 0, {
        gatewayStarted: true,
        sawIssuer: true,
        sawGatewayContent: true,
        leftPaintedDocument: true,
        blankForMs: 20000,
      }),
    ).toBe(false);
    // After OTP, the gateway document is white. Verify with the server.
    expect(
      shouldRecoverBlankGatewayPage(tpsl, 0, {
        gatewayStarted: true,
        sawIssuer: true,
        sawGatewayContent: true,
        leftPaintedDocument: true,
        blankForMs: 4000,
      }),
    ).toBe(true);
    expect(
      shouldRecoverBlankGatewayPage('about:blank', 0, {
        gatewayStarted: true,
        sawIssuer: true,
        sawGatewayContent: true,
        leftPaintedDocument: true,
        blankForMs: 0,
      }),
    ).toBe(true);
    expect(
      shouldRecoverBlankGatewayPage('https://www.selorg.com/checkout/payment?paynimo_bridge=1', 0, {
        gatewayStarted: true,
        sawIssuer: true,
        sawGatewayContent: true,
        leftPaintedDocument: true,
        blankForMs: 0,
      }),
    ).toBe(true);
  });
});
