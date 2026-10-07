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
export function buildPaynimoCheckoutHtml(sessionPayload: Record<string, unknown>): string {
  const payload = { ...sessionPayload } as {
    features?: Record<string, unknown>;
    consumerData?: Record<string, unknown>;
  };
  if (payload.consumerData) {
    payload.consumerData = {
      ...payload.consumerData,
      returnUrl: returnUrlForDevice(payload.consumerData.returnUrl),
    };
  }
  payload.features = {
    ...(payload.features || {}),
    enableAbortResponse: true,
    enableExpressPay: false,
    enableNewWindowFlow: false,
    enableTopWindowRedirection: false,
    singleBankForceRedirect: false,
  };
  const payloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
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
  <script
    src="https://code.jquery.com/jquery-3.7.1.min.js"
    integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo="
    crossorigin="anonymous"></script>
  <script src="https://www.paynimo.com/paynimocheckout/server/lib/checkout.js"></script>
</head>
<body>
  <div class="wrap">
    <p>Opening secure payment…</p>
    <p id="err" class="err"></p>
  </div>
  <script>
    (function () {
      var payload = ${payloadJson};
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
      try {
        if (typeof $ === 'undefined') {
          showErr('Payment SDK failed to load (jQuery). Check your network connection.');
          return;
        }
        if (!$.pnCheckout) {
          showErr('Payment SDK failed to load (checkout). Check your network connection.');
          return;
        }
        payload.consumerData = payload.consumerData || {};
        payload.features = payload.features || {};
        payload.features.enableNewWindowFlow = false;
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
        $.pnCheckout(payload);
        notify('opened', {});
      } catch (e) {
        showErr((e && e.message) ? e.message : 'Payment checkout error');
      }
    })();
  </script>
</body>
</html>`;
}
