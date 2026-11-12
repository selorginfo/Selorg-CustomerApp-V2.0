import { API_ORIGIN } from '../config/api';

/**
 * The API session's returnUrl is often http://localhost:3333. Inside the app
 * WebView, localhost is the phone, and Paynimo's card "Next" navigates there
 * before the card form. Point the callback at the host this device can reach.
 */
// React Native's URL polyfill doesn't implement hostname/protocol/port, so parse origins by hand.
const ORIGIN_RE = /^(https?:\/\/)([^/?#:]+)(:\d+)?/i;

function returnUrlForDevice(returnUrl: unknown): string {
  const raw = String(returnUrl || '');
  const match = raw.match(ORIGIN_RE);
  if (!match) return raw;
  const host = match[2].toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '0.0.0.0') return raw;
  const deviceOrigin = String(API_ORIGIN).match(ORIGIN_RE);
  if (!deviceOrigin) return raw;
  return `${deviceOrigin[0]}${raw.slice(match[0].length)}`;
}

/**
 * Build an in-app WebView HTML page that launches Paynimo/Worldline hosted checkout
 * using the `sessionPayload` returned by selorg-service.
 */
export function buildPaynimoCheckoutHtml(
  sessionPayload: Record<string, unknown>,
  options?: { paymentMode?: string },
): string {
  const payload = { ...sessionPayload } as {
    features?: Record<string, unknown>;
    consumerData?: Record<string, unknown>;
  };
  if (payload.consumerData || options?.paymentMode) {
    payload.consumerData = {
      ...(payload.consumerData || {}),
      ...(options?.paymentMode ? { paymentMode: options.paymentMode } : {}),
      returnUrl: returnUrlForDevice(payload.consumerData?.returnUrl),
    };
  }
  payload.features = {
    ...(payload.features || {}),
    enableAbortResponse: true,
    enableExpressPay: false,
    // Card "Next" replaces this page with returnUrl before the card form when this is false.
    // Web checkout and the rider app both leave the card form in a same-view window.
    enableNewWindowFlow: true,
    enableTopWindowRedirection: false,
    singleBankForceRedirect: false,
  };
  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  // jQuery, the Paynimo loader, config, and the ~1.4MB checkout bundle used to
  // download one after another, so this page sat on "Opening secure payment…".
  // They start together. The loader's own copy is what finally calls pnCheckout.
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <title>Secure Payment</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; background: #FFFFFF; color: #2a3326; }
    .wrap { max-width: 420px; margin: 40px auto; text-align: center; }
    .err { color: #b42318; margin-top: 12px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap" id="opening">
    <p>Opening secure payment…</p>
    <p id="err" class="err"></p>
  </div>
  <script>
    (function () {
      var payload = ${payloadJson};
      var JQUERY = 'https://code.jquery.com/jquery-3.7.1.min.js';
      var LOADER = 'https://www.paynimo.com/paynimocheckout/server/lib/checkout.js';
      var CONFIG = 'https://www.paynimo.com/paynimocheckout/server/others/config.json';
      var BASE = 'https://www.paynimo.com/paynimocheckout/server/lib/';
      function notify(type, detail) {
        try {
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, detail: detail || {} }));
          }
        } catch (e) {}
      }
      function showErr(msg) {
        var el = document.getElementById('err');
        if (el) el.textContent = msg || 'Could not open payment gateway';
        notify('error', { message: msg });
      }
      function loadScript(src) {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          s.src = src;
          s.async = true;
          var done = false;
          var timer = setTimeout(function () {
            if (done) return;
            done = true;
            reject(new Error('Timed out loading payment'));
          }, 12000);
          s.onload = function () {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve();
          };
          s.onerror = function () {
            if (done) return;
            done = true;
            clearTimeout(timer);
            reject(new Error('Could not load payment'));
          };
          document.head.appendChild(s);
        });
      }
      function preload(href, as) {
        var link = document.createElement('link');
        link.rel = 'preload';
        link.as = as;
        link.href = href;
        document.head.appendChild(link);
      }
      function versionFor(config) {
        var id = payload.consumerData && payload.consumerData.merchantId;
        var override = id && config.merchant_overrides && config.merchant_overrides[id];
        if (override === 'v1' || override === 'v2') return override;
        return config.default_version || 'v2';
      }
      payload.consumerData = payload.consumerData || {};
      payload.features = payload.features || {};
      payload.features.enableNewWindowFlow = true;
      payload.features.enableTopWindowRedirection = false;
      payload.features.singleBankForceRedirect = false;
      payload.consumerData.responseHandler = function (res) {
        var txn = res && res.paymentMethod && res.paymentMethod.paymentTransaction;
        var code = txn && txn.statusCode;
        if (!code && !(res && res.msg)) return;
        var safe = { statusCode: code || '', msg: (res && res.msg) || '' };
        try { safe = JSON.parse(JSON.stringify(res)); } catch (e) {}
        notify('gateway', safe);
      };
      var configPromise = fetch(CONFIG).then(function (res) {
        if (!res.ok) return null;
        return res.json();
      }).catch(function () { return null; });
      Promise.all([loadScript(JQUERY), loadScript(LOADER), configPromise]).then(function (ready) {
        var config = ready[2];
        if (!config || !config.versions) return;
        var files = config.versions[versionFor(config)] || {};
        var q = config.version ? ('?' + config.version) : '';
        if (files.checkoutCSS) preload(new URL(files.checkoutCSS, BASE).href + q, 'style');
        if (files.checkoutUIJS) preload(new URL(files.checkoutUIJS, BASE).href + q, 'script');
        if (!files.checkoutJS) return;
        return loadScript(new URL(files.checkoutJS, BASE).href + q);
      }).then(function () {
        if (typeof $ === 'undefined' || !$.pnCheckout) {
          showErr('Payment SDK failed to load. Check your network connection.');
          return;
        }
        var opening = document.getElementById('opening');
        if (opening) opening.style.display = 'none';
        $.pnCheckout(payload);
        notify('opened', {});
      }).catch(function (e) {
        showErr((e && e.message) ? e.message : 'Payment checkout error');
      });
    })();
  </script>
</body>
</html>`;
}
