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
      // Paynimo registers beforeunload and sets event.returnValue. Android WebView
      // then shows "Confirm Navigation" and never loads the bank page. Ignore that
      // handler before checkout.js runs. The bank document is a new page and keeps
      // its own leave warning.
      if (typeof EventTarget !== 'undefined' && EventTarget.prototype && !EventTarget.prototype.__selorgUnload) {
        var nativeAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          if (String(type).toLowerCase() === 'beforeunload') return;
          return nativeAddEventListener.call(this, type, listener, options);
        };
        EventTarget.prototype.__selorgUnload = true;
      }
      try {
        Object.defineProperty(window, 'onbeforeunload', {
          configurable: true,
          enumerable: true,
          get: function () { return null; },
          set: function () {}
        });
      } catch (e) {}
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
      // Paynimo opens window.open(''), writes a waiting page, then does one of:
      // bankWindow.location.assign/replace/href = httpsUrl (card gateway GET), or
      // append <form id="bankFrmSubmit" method="post"> and form.submit().
      // location.assign on an HTML-sourced WebView does not commit that GET, and
      // doing it in the same turn drops the bridge message. The GET is handed to
      // the native WebView once. The bank form is still submitted in this page.
      function diag(detail) {
        notify('diag', detail || {});
      }
      function pathOnly(value) {
        var raw = String(value || '');
        return raw.split('#')[0].split('?')[0].slice(0, 180);
      }
      if (!window.__selorgCardSubmit) {
        window.__selorgCardSubmit = true;
        var nativeSubmit = HTMLFormElement.prototype.submit;
        HTMLFormElement.prototype.submit = function () {
          var id = this.id || '';
          var method = String(this.method || 'GET').toUpperCase();
          var target = this.target || '';
          if (id === 'bankFrmSubmit') {
            if (this.getAttribute('data-selorg-posted') === '1') {
              diag({ event: 'form-submit-skipped', formId: id, reason: 'already-submitted' });
              return;
            }
            this.setAttribute('data-selorg-posted', '1');
            this.target = '_self';
            target = '_self';
          }
          diag({
            event: 'form-submit',
            formId: id || '(none)',
            method: method,
            target: target || '(default)',
            action: pathOnly(this.action),
            webView: 'visible'
          });
          return nativeSubmit.call(this);
        };
      }
      function showInThisPage(next) {
        if (next) window.location.assign(next);
      }
      function holdBankForm(html) {
        var text = String(html || '');
        if (text.indexOf('bankFrmSubmit') < 0) {
          diag({ event: 'popup-write', hasBankForm: false, bytes: text.length });
          return;
        }
        if (document.getElementById('bankFrmSubmit')) {
          diag({ event: 'popup-write-skipped', formId: 'bankFrmSubmit', reason: 'already-in-document' });
          return;
        }
        var holder = document.createElement('div');
        holder.innerHTML = text;
        document.body.appendChild(holder);
        diag({ event: 'popup-write-form', formId: 'bankFrmSubmit', webView: 'visible' });
      }
      function attachPopupNode(node) {
        if (!node || !node.nodeType) return node;
        document.body.appendChild(node);
        var form = node.id === 'bankFrmSubmit' ? node : (node.querySelector ? node.querySelector('#bankFrmSubmit') : null);
        diag({
          event: 'popup-append',
          formId: form && form.id ? form.id : '(none)',
          method: form && form.method ? String(form.method).toUpperCase() : '',
          target: form && form.target ? form.target : '',
          action: form ? pathOnly(form.action) : '',
          webView: 'visible'
        });
        return node;
      }
      window.open = function (url) {
        var href = typeof url === 'string' ? url : '';
        diag({ event: 'window-open', url: href ? pathOnly(href) : '(blank)', webView: 'visible' });
        if (href && href !== 'about:blank' && !/^https?:/i.test(href)) {
          showInThisPage(href);
          return null;
        }
        if (href.slice(0, 8).toLowerCase() === 'https://') {
          notify('follow-get', { url: href });
          return window;
        }
        if (href.slice(0, 7).toLowerCase() === 'http://') {
          showInThisPage(href);
          return window;
        }
        var popup = {
          closed: false,
          name: '',
          focus: function () {},
          close: function () {
            popup.closed = true;
            diag({ event: 'popup-close' });
          },
          postMessage: function () { diag({ event: 'popup-post-message' }); },
          document: {
            open: function () {},
            close: function () {},
            write: holdBankForm,
            writeln: function (html) { holdBankForm(html); },
            createElement: function (tag) { return document.createElement(tag); },
            getElementById: function (id) { return document.getElementById(id); },
            body: { append: attachPopupNode, appendChild: attachPopupNode }
          }
        };
        function hostOf(value) {
          var raw = String(value || '');
          if (raw.slice(0, 8).toLowerCase() !== 'https://') return '';
          return raw.slice(8).split('/')[0].split('?')[0].split('#')[0].split(':')[0].toLowerCase();
        }
        function noteLocation(next) {
          var href = typeof next === 'string' ? next : '';
          var host = hostOf(href);
          var checkoutHost = host === 'paynimo.com' || host.slice(-13) === '.paynimo.com';
          // Card GET only. A paynimo.com URL is still the checkout. A second GET
          // is ignored. bankFrmSubmit remains a POST in this page.
          var follow = !!host && !checkoutHost && !popup.__selorgFollowed;
          if (follow) popup.__selorgFollowed = true;
          diag({
            event: 'popup-location',
            url: pathOnly(href),
            method: 'GET',
            hasQuery: href.indexOf('?') >= 0,
            followed: follow,
            webView: 'visible'
          });
          if (follow) notify('follow-get', { url: href });
        }
        function hrefCall(next) { noteLocation(next); }
        var locationHooks = { assign: noteLocation, replace: noteLocation };
        try {
          Object.defineProperty(locationHooks, 'href', {
            configurable: true,
            get: function () { return hrefCall; },
            set: noteLocation
          });
        } catch (e) {
          locationHooks.href = hrefCall;
        }
        try {
          Object.defineProperty(popup, 'location', {
            configurable: true,
            get: function () { return locationHooks; },
            set: function (value) { if (typeof value === 'string') noteLocation(value); }
          });
        } catch (e) {
          popup.location = locationHooks;
        }
        return popup;
      };
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
