import { buildPaynimoCheckoutHtml } from '../src/utils/paynimoCheckout';

function payloadOf(html: string): { paymentMode?: string; returnUrl?: string; features?: Record<string, unknown> } {
  const marker = 'var payload = ';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('checkout payload missing');
  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf(';', jsonStart);
  const consumer = JSON.parse(html.slice(jsonStart, jsonEnd)) as {
    consumerData?: { paymentMode?: string; returnUrl?: string };
    features?: Record<string, unknown>;
  };
  return {
    paymentMode: consumer.consumerData?.paymentMode,
    returnUrl: consumer.consumerData?.returnUrl,
    features: consumer.features,
  };
}

const session = {
  features: { enableExpressPay: true },
  consumerData: {
    paymentMode: 'UPI',
    returnUrl: 'http://localhost:3333/api/v1/customer/payments/worldline/return',
    token: 'signed',
    txnId: 'txn-1',
  },
};

describe('Paynimo checkout instruments', () => {
  it('opens cards and net banking with UPI on online order payment', () => {
    const html = buildPaynimoCheckoutHtml(session, { paymentMode: 'all' });
    const payload = payloadOf(html);
    expect(payload.paymentMode).toBe('all');
    expect(payload.features?.enableExpressPay).toBe(false);
    expect(payload.features?.enableNewWindowFlow).toBe(true);
    expect(payload.features?.enableTopWindowRedirection).toBe(false);
    expect(payload.features?.singleBankForceRedirect).toBe(false);
  });

  it('does not force the card window closed after the payload is built', () => {
    const html = buildPaynimoCheckoutHtml(session, { paymentMode: 'all' });
    expect(html).toContain('enableNewWindowFlow = true');
    expect(html).not.toContain('enableNewWindowFlow = false');
    expect(html).toContain('enableTopWindowRedirection = false');
    expect(html).toContain('singleBankForceRedirect = false');
  });

  it('keeps a wallet top-up on the method the shopper picked', () => {
    expect(payloadOf(buildPaynimoCheckoutHtml({ ...session, consumerData: { ...session.consumerData, paymentMode: 'cards' } })).paymentMode).toBe(
      'cards',
    );
    expect(
      payloadOf(
        buildPaynimoCheckoutHtml({
          ...session,
          consumerData: { ...session.consumerData, paymentMode: 'netBanking' },
        }),
      ).paymentMode,
    ).toBe('netBanking');
    expect(payloadOf(buildPaynimoCheckoutHtml(session)).paymentMode).toBe('UPI');
  });

  it('keeps the card return path when opening every instrument', () => {
    const payload = payloadOf(buildPaynimoCheckoutHtml(session, { paymentMode: 'all' }));
    expect(payload.returnUrl).toContain('/payments/worldline/return');
  });

  it('starts jQuery, the Paynimo loader, and checkout config together', () => {
    const html = buildPaynimoCheckoutHtml(session, { paymentMode: 'all' });
    expect(html).not.toContain('integrity=');
    expect(html).toContain('https://code.jquery.com/jquery-3.7.1.min.js');
    expect(html).toContain('https://www.paynimo.com/paynimocheckout/server/lib/checkout.js');
    expect(html).toContain('https://www.paynimo.com/paynimocheckout/server/others/config.json');
    expect(html).toContain('Promise.all([loadScript(JQUERY), loadScript(LOADER), configPromise])');
    expect(html).toContain("override === 'v1' || override === 'v2'");
  });
});
