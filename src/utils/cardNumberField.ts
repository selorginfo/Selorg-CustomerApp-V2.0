/** Hosted Paynimo card-field helpers. These never leave the device or the gateway page. */

const MAX_PAN_DIGITS = 19;

export type CardBrand = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'unknown';

export function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function stripCardNumber(value: string): string {
  return digitsOnly(value).slice(0, MAX_PAN_DIGITS);
}

export function detectCardBrand(digits: string): CardBrand {
  const pan = digitsOnly(digits);
  if (/^3[47]/.test(pan)) return 'amex';
  if (/^4/.test(pan)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(pan)) return 'mastercard';
  if (/^(60|65|81|82|508)/.test(pan)) return 'rupay';
  return 'unknown';
}

export function expectedPanLength(brand: CardBrand): { min: number; max: number } {
  if (brand === 'amex') return { min: 15, max: 15 };
  if (brand === 'visa' || brand === 'mastercard' || brand === 'rupay') return { min: 16, max: 16 };
  return { min: 12, max: 19 };
}

/** Groups of 4: `1234 5678 9012 3456`. Visa, Mastercard, and RuPay stop at 16 digits. */
export function formatCardNumber(value: string): string {
  const pan = stripCardNumber(value);
  const { max } = expectedPanLength(detectCardBrand(pan));
  return pan.slice(0, max).replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function luhnOk(digits: string): boolean {
  const pan = stripCardNumber(digits);
  if (pan.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let n = pan.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function cardNumberError(value: string): string | null {
  const pan = stripCardNumber(value);
  if (!pan) return 'Enter the card number';
  if (pan.length < 12) return 'Card number is too short';
  const brand = detectCardBrand(pan);
  const { min, max } = expectedPanLength(brand);
  if (pan.length < min || pan.length > max) return 'Check the card number length';
  if (!luhnOk(pan)) return 'Check the card number';
  return null;
}

/**
 * `MM/YY` — the only shape Paynimo's `cardExpiry` regex accepts.
 * A first digit above 1 becomes `0X`. A month above 12 is not accepted.
 * `adding` appends the slash after the month while typing forward only, so
 * backspace can still remove it.
 */
export function formatExpiry(value: string, adding = false): string {
  let d = digitsOnly(value).slice(0, 4);
  if (d.length >= 1 && d.charAt(0) > '1') d = `0${d}`.slice(0, 4);
  if (d.length >= 2) {
    const month = Number(d.slice(0, 2));
    if (month === 0 || month > 12) d = d.slice(0, 1);
  }
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  if (d.length === 2 && adding) return `${d}/`;
  return d;
}

export function expiryError(value: string, now = new Date()): string | null {
  const digits = digitsOnly(value);
  if (digits.length < 4) return 'Enter expiry as MM/YY';
  const month = Number(digits.slice(0, 2));
  const year = 2000 + Number(digits.slice(2, 4));
  if (month < 1 || month > 12) return 'Enter a valid month';
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  if (end.getTime() < now.getTime()) return 'This card has expired';
  return null;
}

export function cvvError(value: string, brand: CardBrand = 'unknown'): string | null {
  const digits = digitsOnly(value).slice(0, 4);
  if (brand === 'amex') return digits.length === 4 ? null : 'Enter the 4-digit CVV';
  if (brand === 'unknown') return digits.length >= 3 && digits.length <= 4 ? null : 'Enter the CVV';
  return digits.length === 3 ? null : 'Enter the 3-digit CVV';
}

/** Caret index in the formatted string after `digitsBefore` digits. */
export function cursorForDigits(formatted: string, digitsBefore: number): number {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) {
      seen += 1;
      if (seen === digitsBefore) return i + 1;
    }
  }
  return formatted.length;
}

/**
 * Formats Paynimo's own `inputCardNo` and `cardExpiry` fields in the checkout page.
 * Paynimo removes the spaces itself when it reads the card number, and expects
 * expiry as `MM/YY`, so the separators are left in place. CVV and bank OTP pages
 * are not touched. The values are never posted to Selorg or logged.
 */
export function hostedCardFieldScript(): string {
  return `(function () {
    if (window.__selorgCardFields) return;
    window.__selorgCardFields = true;
    function digits(value) {
      return String(value || '').replace(/\\D/g, '');
    }
    function brand(pan) {
      if (/^3[47]/.test(pan)) return 'amex';
      if (/^4/.test(pan)) return 'visa';
      if (/^(5[1-5]|2[2-7])/.test(pan)) return 'mastercard';
      if (/^(60|65|81|82|508)/.test(pan)) return 'rupay';
      return '';
    }
    function formatPan(value) {
      var d = digits(value);
      var kind = brand(d);
      var max = kind === 'amex' ? 15 : (kind ? 16 : 19);
      return d.slice(0, max).replace(/(\\d{4})(?=\\d)/g, '$1 ');
    }
    function formatExpiry(value, adding) {
      var d = digits(value).slice(0, 4);
      if (d.length >= 1 && d.charAt(0) > '1') d = ('0' + d).slice(0, 4);
      if (d.length >= 2) {
        var month = Number(d.slice(0, 2));
        if (month === 0 || month > 12) d = d.slice(0, 1);
      }
      if (d.length > 2) return d.slice(0, 2) + '/' + d.slice(2);
      if (d.length === 2 && adding) return d + '/';
      return d;
    }
    function cursorFor(formatted, digitsBefore) {
      if (digitsBefore <= 0) return 0;
      var seen = 0;
      for (var i = 0; i < formatted.length; i++) {
        if (/\\d/.test(formatted.charAt(i))) {
          seen += 1;
          if (seen === digitsBefore) return i + 1;
        }
      }
      return formatted.length;
    }
    window.__selorgFormatCardNumber = formatPan;
    window.__selorgFormatExpiry = formatExpiry;
    function kindOf(el) {
      if (!el || el.tagName !== 'INPUT') return '';
      var name = String(el.name || el.getAttribute && el.getAttribute('name') || '');
      if (name === 'inputCardNo') return 'pan';
      if (name === 'cardExpiry') return 'exp';
      return '';
    }
    var nativeValue = null;
    try {
      nativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    } catch (e) {}
    function readValue(el) {
      return String((nativeValue ? nativeValue.get.call(el) : el.value) || '');
    }
    function writeValue(el, value) {
      if (nativeValue) nativeValue.set.call(el, value);
      else el.value = value;
    }
    // Paynimo's own input/keyup/blur handlers regroup the card number as 4-6-5
    // and re-add the expiry slash after backspace. Writes that only move
    // separators are ignored so they cannot fight the caret.
    function guardValue(el, kind) {
      if (!nativeValue || !nativeValue.get || !nativeValue.set) return;
      try {
        Object.defineProperty(el, 'value', {
          configurable: true,
          enumerable: true,
          get: function () { return readValue(el); },
          set: function (value) {
            var text = value == null ? '' : String(value);
            if (digits(text) === digits(readValue(el))) return;
            var next = kind === 'pan' ? formatPan(text) : formatExpiry(text, false);
            el.__selorgPrev = next;
            writeValue(el, next);
          },
        });
      } catch (e) {}
    }
    function prepare(el, kind) {
      if (el.__selorgReady) return;
      el.__selorgReady = true;
      guardValue(el, kind);
      try { el.setAttribute('inputmode', 'numeric'); } catch (e) {}
      if (kind === 'pan') {
        try { el.setAttribute('maxlength', '23'); } catch (e) {}
        try { el.setAttribute('autocomplete', 'cc-number'); } catch (e) {}
        if (!el.placeholder) el.placeholder = '1234 5678 9012 3456';
      } else {
        try { el.setAttribute('maxlength', '5'); } catch (e) {}
        try { el.setAttribute('autocomplete', 'cc-exp'); } catch (e) {}
        if (!el.placeholder) el.placeholder = 'MM/YY';
      }
      el.__selorgPrev = readValue(el);
    }
    function placeCaret(el, pos) {
      try { el.setSelectionRange(pos, pos); } catch (e) {}
      // Android keyboards move the caret again after the input event.
      setTimeout(function () {
        if (document.activeElement !== el) return;
        try { el.setSelectionRange(pos, pos); } catch (e) {}
      }, 0);
    }
    function onInput(ev) {
      var el = ev && ev.target;
      var kind = kindOf(el);
      if (!kind) return;
      prepare(el, kind);
      var raw = readValue(el);
      var prev = String(el.__selorgPrev || '');
      var start = typeof el.selectionStart === 'number' ? el.selectionStart : raw.length;
      var atEnd = start >= raw.length;
      var d = digits(raw);
      var before = digits(raw.slice(0, start)).length;
      var trailingSlash = prev.charAt(prev.length - 1) === '/' && raw === prev.slice(0, -1);
      // Backspace on a space or slash: remove the digit in front of it instead.
      if (!trailingSlash && raw.length < prev.length && d === digits(prev) && before > 0) {
        d = d.slice(0, before - 1) + d.slice(before);
        before -= 1;
        atEnd = false;
      }
      var adding = raw.length > prev.length;
      var next = kind === 'pan' ? formatPan(d) : formatExpiry(d, adding && atEnd);
      if (kind === 'exp' && !adding && next + '/' === raw) next = raw;
      el.__selorgPrev = next;
      if (raw === next) return;
      writeValue(el, next);
      placeCaret(el, atEnd ? next.length : cursorFor(next, before));
    }
    function onFocus(ev) {
      var el = ev && ev.target;
      var kind = kindOf(el);
      if (kind) prepare(el, kind);
    }
    try {
      document.addEventListener('input', onInput, true);
      document.addEventListener('focusin', onFocus, true);
    } catch (e) {}
  })();`;
}
