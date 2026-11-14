import vm from 'vm';
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
    expect(html).toContain('window.open = function');
    expect(html).toContain('bankFrmSubmit');
    expect(html).toContain("this.target = '_self'");
    expect(html).toContain('data-selorg-posted');
    expect(html).not.toContain('showBankDocument');
    expect(html).toContain('enableTopWindowRedirection = false');
    expect(html).toContain('singleBankForceRedirect = false');
    expect(html).toContain("String(type).toLowerCase() === 'beforeunload'");
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

describe('Paynimo popup hand-off', () => {
  function installCheckout() {
    const html = buildPaynimoCheckoutHtml(session, { paymentMode: 'all' });
    const script = html.slice(html.indexOf('(function () {'), html.lastIndexOf('})();') + 5);
    const submits: Array<{ id: string; target: string }> = [];
    const writes: string[] = [];
    const assigned: string[] = [];
    const nodes: Array<{ id?: string; target?: string; tagName?: string }> = [];
    class HTMLFormElement {
      id = '';
      target = '';
      method = 'post';
      action = '';
      private attrs: Record<string, string> = {};
      getAttribute(name: string) {
        return this.attrs[name] ?? null;
      }
      setAttribute(name: string, value: string) {
        this.attrs[name] = value;
      }
      submit() {
        submits.push({ id: this.id, target: this.target });
      }
    }
    const body = {
      appendChild(node: { id?: string; target?: string; tagName?: string; querySelectorAll?: (sel: string) => unknown[] }) {
        nodes.push(node);
      },
    };
    const document = {
      forms: [],
      body,
      head: { appendChild() {} },
      getElementById(id: string) {
        if (id === 'err' || id === 'opening') return { textContent: '', style: {} };
        for (const node of nodes) {
          if (node.id === id) return node;
          const nested = (node.querySelectorAll?.('form') || []) as Array<{ id?: string }>;
          const match = nested.find(form => form.id === id);
          if (match) return match;
        }
        return null;
      },
      createElement() {
        return { src: '', async: false, onload: null, onerror: null, style: {} };
      },
      open() {
        writes.push('open');
      },
      write(page: string) {
        writes.push(page);
      },
      close() {
        writes.push('close');
      },
    };
    const messages: Array<{ type?: string; detail?: { url?: string } }> = [];
    const context = vm.createContext({
      window: {},
      document,
      HTMLFormElement,
      fetch: () => new Promise(() => {}),
      URL,
      setTimeout: () => 0,
      clearTimeout: () => {},
      console,
    });
    context.window = context;
    context.window.ReactNativeWebView = {
      postMessage(raw: string) {
        messages.push(JSON.parse(raw));
      },
    };
    vm.runInContext(script, context, { timeout: 2000 });
    context.window.location = {
      href: 'https://www.paynimo.com/',
      assign(next: string) {
        assigned.push(next);
      },
    };
    return { context, submits, writes, assigned, nodes, messages, HTMLFormElement };
  }

  it('posts the bank form in this page and ignores the waiting popup', () => {
    const { context, submits, writes, nodes } = installCheckout();
    const popup = context.window.open('', '_blank');
    popup.document.write('<html><body><h2 id="headText">Please wait</h2></body></html>');
    expect(writes).toEqual([]);
    const form = new context.HTMLFormElement();
    form.id = 'bankFrmSubmit';
    form.target = '_blank';
    const holder = {
      nodeType: 1,
      tagName: 'DIV',
      querySelectorAll: () => [form],
    };
    popup.document.body.append(holder);
    expect(form.target).toBe('_blank');
    expect(nodes).toContain(holder);
    const found = popup.document.getElementById('bankFrmSubmit');
    found.submit();
    found.submit();
    expect(submits).toEqual([{ id: 'bankFrmSubmit', target: '_self' }]);
  });

  it('does not retarget forms other than the bank authentication form', () => {
    const { context, submits } = installCheckout();
    for (const id of ['pgFrmSubmit', 'frmPayment', 'upiCollect']) {
      const form = new context.HTMLFormElement();
      form.id = id;
      form.target = id === 'upiCollect' ? 'checkoutResponseIframe' : '_blank';
      form.submit();
    }
    expect(submits.map(item => item.target)).toEqual(['_blank', '_blank', 'checkoutResponseIframe']);
  });

  it('hands the card gateway GET to the native WebView and leaves UPI on the top window', () => {
    const { context, assigned, writes, messages } = installCheckout();
    expect(context.window.open('upi://pay?pa=merchant@upi')).toBeNull();
    const popup = context.window.open('', 'bank');
    popup.location.assign('https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg?token=hidden');
    popup.location = 'https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg?token=again';
    popup.location.href('https://issuer.example/acs');
    popup.location.assign('javascript:alert(1)');
    popup.document.write('<html><body>Please wait</body></html>');
    expect(assigned).toEqual(['upi://pay?pa=merchant@upi']);
    expect(messages.filter(message => message.type === 'follow-get').map(message => message.detail?.url)).toEqual([
      'https://www.tpsl-india.in/PaymentGateway/txnreqcardvern.pg?token=hidden',
    ]);
    expect(writes).toEqual([]);
  });
});
