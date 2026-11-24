import vm from 'vm';
import {
  cardNumberError,
  cursorForDigits,
  cvvError,
  detectCardBrand,
  expiryError,
  formatCardNumber,
  formatExpiry,
  hostedCardFieldScript,
  luhnOk,
  stripCardNumber,
} from '../src/utils/cardNumberField';

describe('card number formatting', () => {
  it('inserts a space after every 4 digits and drops non-digits', () => {
    expect(formatCardNumber('1234567890123456')).toBe('1234 5678 9012 3456');
    expect(formatCardNumber('4111-1111 1111abcd1111')).toBe('4111 1111 1111 1111');
  });

  it('stops Visa, Mastercard, and RuPay at 16 digits and Amex at 15', () => {
    expect(formatCardNumber('41111111111111119999')).toBe('4111 1111 1111 1111');
    expect(formatCardNumber('55555555555544449')).toBe('5555 5555 5555 4444');
    expect(formatCardNumber('378282246310005999')).toBe('3782 8224 6310 005');
  });

  it('strips spaces before the gateway sees the number', () => {
    expect(stripCardNumber('1234 5678 9012 3456')).toBe('1234567890123456');
  });

  it('maps a digit count to the caret position in the formatted value', () => {
    expect(cursorForDigits('1234 5678', 4)).toBe(4);
    expect(cursorForDigits('1234 5678', 5)).toBe(6);
  });
});

describe('expiry formatting', () => {
  it('builds MM/YY and only adds the slash while typing forward', () => {
    expect(formatExpiry('1', true)).toBe('1');
    expect(formatExpiry('12', true)).toBe('12/');
    expect(formatExpiry('12', false)).toBe('12');
    expect(formatExpiry('1228')).toBe('12/28');
    expect(formatExpiry('12/28')).toBe('12/28');
  });

  it('pads a single-digit month and refuses month 00 or above 12', () => {
    expect(formatExpiry('4', true)).toBe('04/');
    expect(formatExpiry('13', true)).toBe('1');
    expect(formatExpiry('00', true)).toBe('0');
  });
});

describe('card validation', () => {
  it('accepts a Luhn-valid Visa, Mastercard, and RuPay length', () => {
    expect(detectCardBrand('4111111111111111')).toBe('visa');
    expect(detectCardBrand('5555555555554444')).toBe('mastercard');
    expect(detectCardBrand('6082820000000009')).toBe('rupay');
    expect(luhnOk('4111111111111111')).toBe(true);
    expect(cardNumberError('4111111111111111')).toBeNull();
    expect(cardNumberError('4111111111111112')).toBe('Check the card number');
    expect(cardNumberError('411111')).toBe('Card number is too short');
    expect(cardNumberError('41111111111111111')).toBe('Check the card number length');
  });

  it('checks expiry and CVV without accepting a past card', () => {
    expect(expiryError('1228', new Date(2026, 0, 1))).toBeNull();
    expect(expiryError('0120', new Date(2026, 0, 1))).toBe('This card has expired');
    expect(expiryError('1328', new Date(2026, 0, 1))).toBe('Enter a valid month');
    expect(cvvError('123', 'visa')).toBeNull();
    expect(cvvError('12', 'visa')).toBe('Enter the 3-digit CVV');
    expect(cvvError('1234', 'amex')).toBeNull();
  });
});

/** Browser-like input: assigning a different value moves the caret to the end. */
class FakeInput {
  tagName = 'INPUT';
  placeholder = '';
  selectionStart = 0;
  selectionEnd = 0;
  attrs: Record<string, string> = {};
  stored = '';
  constructor(public name: string) {}
  get value(): string {
    return this.stored;
  }
  set value(next: string) {
    const text = String(next);
    if (text === this.stored) return;
    this.stored = text;
    this.selectionStart = text.length;
    this.selectionEnd = text.length;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  getAttribute(k: string) {
    return this.attrs[k] ?? null;
  }
  setSelectionRange(a: number, b: number) {
    this.selectionStart = a;
    this.selectionEnd = b;
  }
}

/** Paynimo checkout-ui-v2 `input keyup blur` handler for `inputCardNo`, formatting part. */
function paynimoCardNumberHandler(el: FakeInput) {
  el.value = el.value.replace(/[^0-9 ]/g, '');
  let pan = el.value.split(' ').join('');
  if (pan.length > 0) {
    const grouping = pan.length < 19 ? (pan.length < 16 ? /(^.{4}|.{6})/g : /(.{4})/g) : undefined;
    pan = pan.replace(grouping as RegExp, '$1 ').trim();
  }
  el.value = pan;
}

/** Paynimo checkout-ui-v2 `input keyup blur` handler for `cardExpiry`, formatting part. */
function paynimoExpiryHandler(el: FakeInput, keyCode?: number) {
  const v = el.value;
  if (v.length < 3 && v.indexOf('/') === -1) {
    if (keyCode !== 8) {
      el.value = v
        .replace(/^([2-9])$/, '0$1')
        .replace(/^1[3-9]$/, '1')
        .replace(/(.{2})/, '$1/')
        .replace(/^(.{5})\d{2}(\d{2})$/, '$1$2')
        .slice(0, 5);
    }
  } else if (v.length === 2) {
    el.value = v.replace(/\//g, '').replace(/ /g, '');
  } else if (v.length > 4) {
    el.value = v.replace(/^(\d{2})([0-9]+)$/, '$1/$2').slice(0, 5);
  }
}

function installFields({ paynimo = true } = {}) {
  const listeners: Record<string, Array<(ev: { target: unknown }) => void>> = {};
  const timers: Array<() => void> = [];
  const document = {
    activeElement: null as unknown,
    addEventListener(type: string, fn: (ev: { target: unknown }) => void) {
      (listeners[type] ||= []).push(fn);
    },
  };
  const logs: string[] = [];
  const context = vm.createContext({
    window: {},
    document,
    HTMLInputElement: FakeInput,
    setTimeout: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
    console: { log: (line: unknown) => logs.push(String(line)) },
  });
  context.window = context;
  vm.runInContext(hostedCardFieldScript(), context);

  function field(name: string): FakeInput {
    return new FakeInput(name);
  }

  function runPaynimo(el: FakeInput, keyCode?: number) {
    if (!paynimo) return;
    if (el.name === 'inputCardNo') paynimoCardNumberHandler(el);
    if (el.name === 'cardExpiry') paynimoExpiryHandler(el, keyCode);
  }

  /** Capture listeners (ours) first, then Paynimo's delegated bubble handlers. */
  function fire(type: string, el: FakeInput, keyCode?: number) {
    document.activeElement = el;
    (listeners[type] || []).forEach(fn => fn({ target: el }));
    if (type === 'input' || type === 'keyup' || type === 'blur') runPaynimo(el, keyCode);
    timers.splice(0).forEach(fn => fn());
  }

  /** The browser edits the value, then fires input and an Android soft-keyboard keyup. */
  function edit(el: FakeInput, value: string, caret: number) {
    el.stored = value;
    el.selectionStart = caret;
    el.selectionEnd = caret;
    fire('input', el);
    fire('keyup', el, 229);
  }

  function type(el: FakeInput, text: string) {
    for (const ch of text) {
      const pos = el.selectionStart;
      edit(el, el.value.slice(0, pos) + ch + el.value.slice(pos), pos + 1);
    }
  }

  function backspace(el: FakeInput) {
    const pos = el.selectionStart;
    if (pos <= 0) return;
    edit(el, el.value.slice(0, pos - 1) + el.value.slice(pos), pos - 1);
  }

  return { field, fire, edit, type, backspace, logs, context };
}

describe('hosted Paynimo card fields', () => {
  it('formats the card number as 4 4 4 4 while typing and keeps the caret at the end', () => {
    const h = installFields();
    const pan = h.field('inputCardNo');
    h.fire('focusin', pan);
    expect(pan.attrs.inputmode).toBe('numeric');
    expect(pan.placeholder).toBe('1234 5678 9012 3456');
    h.type(pan, '4111111111111111');
    expect(pan.value).toBe('4111 1111 1111 1111');
    expect(pan.selectionStart).toBe(pan.value.length);
    h.type(pan, '9');
    expect(pan.value).toBe('4111 1111 1111 1111');
  });

  it('keeps 4 4 4 4 under 16 digits even though Paynimo regroups as 4-6-5', () => {
    const raw = new FakeInput('inputCardNo');
    raw.stored = '411111111111';
    paynimoCardNumberHandler(raw);
    expect(raw.value).toBe('4111 111111 11');

    const h = installFields();
    const pan = h.field('inputCardNo');
    h.fire('focusin', pan);
    for (const [typed, shown] of [
      ['4111', '4111'],
      ['1', '4111 1'],
      ['1111', '4111 1111 1'],
      ['111', '4111 1111 1111'],
      ['111', '4111 1111 1111 111'],
    ]) {
      h.type(pan, typed);
      expect(pan.value).toBe(shown);
      expect(pan.selectionStart).toBe(shown.length);
    }
    h.fire('blur', pan);
    expect(pan.value).toBe('4111 1111 1111 111');
  });

  it('keeps the caret on the edited digit when Paynimo rewrites the field', () => {
    const h = installFields();
    const pan = h.field('inputCardNo');
    h.fire('focusin', pan);
    h.type(pan, '5555444433332222');
    pan.setSelectionRange(7, 7);
    h.backspace(pan);
    expect(pan.value).toBe('5555 4443 3332 222');
    expect(pan.selectionStart).toBe(6);
    h.type(pan, '9');
    expect(pan.value).toBe('5555 4944 3333 2222');
    expect(pan.selectionStart).toBe(7);
  });

  it('still lets Paynimo clear the field', () => {
    const h = installFields();
    const pan = h.field('inputCardNo');
    h.fire('focusin', pan);
    h.type(pan, '4111');
    pan.value = '';
    expect(pan.value).toBe('');
  });

  it('ignores letters and symbols from the keyboard', () => {
    const h = installFields();
    const pan = h.field('inputCardNo');
    h.type(pan, '41a1#1-');
    expect(pan.value).toBe('4111');
  });

  it('removes the digit before a space on backspace instead of getting stuck', () => {
    const h = installFields();
    const pan = h.field('inputCardNo');
    h.type(pan, '41111');
    expect(pan.value).toBe('4111 1');
    h.backspace(pan);
    expect(pan.value).toBe('4111');
    pan.setSelectionRange(5, 5);
    h.type(pan, '2');
    expect(pan.value).toBe('4111 2');
    pan.setSelectionRange(5, 5);
    h.backspace(pan);
    expect(pan.value).toBe('4112');
    expect(pan.selectionStart).toBe(3);
  });

  it('inserts a digit in the middle and keeps the caret after it', () => {
    const h = installFields();
    const pan = h.field('inputCardNo');
    h.type(pan, '41111111');
    expect(pan.value).toBe('4111 1111');
    pan.setSelectionRange(2, 2);
    h.type(pan, '9');
    expect(pan.value).toBe('4191 1111 1');
    expect(pan.selectionStart).toBe(3);
  });

  it('formats a pasted card number', () => {
    const h = installFields();
    const pan = h.field('inputCardNo');
    h.edit(pan, '5555-5555 5555-4444', 19);
    expect(pan.value).toBe('5555 5555 5555 4444');
  });

  it('builds MM/YY in the expiry field and lets backspace remove the slash', () => {
    const h = installFields();
    const exp = h.field('cardExpiry');
    h.fire('focusin', exp);
    expect(exp.placeholder).toBe('MM/YY');
    h.type(exp, '12');
    expect(exp.value).toBe('12/');
    h.type(exp, '28');
    expect(exp.value).toBe('12/28');
    h.backspace(exp);
    h.backspace(exp);
    expect(exp.value).toBe('12/');
    h.backspace(exp);
    expect(exp.value).toBe('12');
    h.backspace(exp);
    expect(exp.value).toBe('1');
    h.backspace(exp);
    expect(exp.value).toBe('');
    h.type(exp, '0528');
    expect(exp.value).toBe('05/28');
    h.fire('blur', exp);
    expect(exp.value).toBe('05/28');
  });

  it('would get stuck on 12/ with Paynimo alone on an Android keyboard', () => {
    const raw = new FakeInput('cardExpiry');
    raw.stored = '12';
    paynimoExpiryHandler(raw, 229);
    expect(raw.value).toBe('12/');
  });

  it('pads the month and matches the MM/YY pattern Paynimo validates', () => {
    const h = installFields();
    const exp = h.field('cardExpiry');
    h.type(exp, '428');
    expect(exp.value).toBe('04/28');
    expect(/^((0[1-9]|[0]*1[0-2])\/[0-9][0-9])$/.test(exp.value)).toBe(true);
    const exp2 = h.field('cardExpiry');
    h.type(exp2, '1');
    h.type(exp2, '3');
    expect(exp2.value).toBe('1');
  });

  it('leaves CVV and other inputs alone and never logs the card number', () => {
    const h = installFields();
    const cvv = h.field('cvvCode');
    h.edit(cvv, '12a', 3);
    expect(cvv.value).toBe('12a');
    const pan = h.field('inputCardNo');
    h.type(pan, '4111111111111111');
    expect(h.logs.join(' ')).not.toContain('4111');
    expect(hostedCardFieldScript()).not.toContain('console.log');
  });
});
