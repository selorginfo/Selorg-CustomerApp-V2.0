import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { colors, fontFamily } from '../theme';
import { buildPaynimoCheckoutHtml } from '../utils/paynimoCheckout';
import {
  allowedUpiUrl,
  classifyCheckoutNavigation,
  isBankAuthenticationUrl,
  isCheckoutProgressUrl,
  isIssuerAuthenticationUrl,
  isPaymentResultHandoffUrl,
  isPopupGatewayNavigation,
  shouldRecoverBlankGatewayPage,
  type BlankGatewayRecovery,
} from '../utils/checkoutNavigation';
import { isWorldlineReturnUrl } from '../utils/worldline';

export interface GatewayCloseInfo {
  bankAuthenticationStarted: boolean;
}

export interface GatewayProgressInfo {
  bankAuthenticationStarted: boolean;
  gatewayStarted: boolean;
}

export interface WorldlineCheckoutProps {
  visible: boolean;
  /** Paynimo session payload from selorg-service (preferred). */
  sessionPayload?: Record<string, unknown> | null;
  /** Legacy hosted URL — used only when sessionPayload is absent. */
  redirectUrl?: string | null;
  onComplete: (payload: { url: string; response?: Record<string, unknown> }) => void;
  onCancel: (info: GatewayCloseInfo) => void;
  /**
   * Fired when the card/bank page is reached so the app can poll
   * `/worldline/status` even if this WebView stays blank after OTP.
   */
  onGatewayProgress?: (info: GatewayProgressInfo) => void;
  /**
   * Order checkout shows UPI, cards, and net banking together.
   * Wallet top-up leaves this off so the picked method stays scoped.
   */
  openAllPaymentModes?: boolean;
  /** Optional testID for the Close / cancel control. */
  cancelTestID?: string;
}

const PAGE_PROBE_JS = `(function () {
  function report() {
    try {
      var text = document.body && document.body.innerText ? document.body.innerText.replace(/\\s+/g, ' ').trim() : '';
      var href = String(location.href || '');
      var path = href.split('#')[0].split('?')[0];
      var lower = href.toLowerCase();
      var bridge = (document.body && document.body.getAttribute('data-paynimo-bridge') === '1') || lower.indexOf('paynimo_bridge=1') >= 0;
      var returnHit = /\\/payments\\/worldline\\/return\\/?$/i.test(path)
        || /\\/worldline\\/return\\/?$/i.test(path)
        || /\\/paynimo-return(?:\\.html)?\\/?$/i.test(path);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'page',
        detail: { url: path, textLength: text.length, bridge: bridge, returnHit: returnHit }
      }));
    } catch (e) {}
  }
  report();
  setTimeout(report, 700);
  setTimeout(report, 1800);
})();
true;`;

/**
 * Runs before every gateway document, including the bank page after the card GET.
 * Paynimo's checkout shim is gone once this WebView navigates to TPSL. A result
 * form with target=_blank is then cancelled (multiple windows are off) and the
 * shopper is left on a blank Secure Payment sheet after the bank has debited.
 */
const GATEWAY_DOCUMENT_JS = `(function () {
  function notify(type, detail) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, detail: detail || {} }));
      }
    } catch (e) {}
  }
  function isReturn(url) {
    var path = String(url || '').split('#')[0].split('?')[0];
    return /\\/payments\\/worldline\\/return\\/?$/i.test(path)
      || /\\/worldline\\/return\\/?$/i.test(path)
      || /\\/paynimo-return(?:\\.html)?\\/?$/i.test(path);
  }
  function retarget(form) {
    if (!form || !form.tagName) return;
    var target = String(form.target || '').toLowerCase();
    if (!target || target === '_blank' || target === '_new' || target === 'bankwindow') form.target = '_self';
    var action = form.action || form.getAttribute('action') || '';
    if (isReturn(action)) notify('return-nav', { url: String(action) });
  }
  document.addEventListener('submit', function (ev) { retarget(ev.target); }, true);
  if (window.HTMLFormElement && !HTMLFormElement.prototype.__selorgBlankTarget) {
    var nativeSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
      retarget(this);
      return nativeSubmit.call(this);
    };
    HTMLFormElement.prototype.__selorgBlankTarget = true;
  }
  if (!window.__selorgGatewayOpen) {
    window.__selorgGatewayOpen = true;
    var nativeOpen = window.open;
    window.open = function (url) {
      var href = typeof url === 'string' ? url : '';
      if (href && /^https?:/i.test(href)) {
        notify('follow-get', { url: href });
        try { window.location.assign(href); } catch (e) {}
        return window;
      }
      if (nativeOpen) return nativeOpen.apply(window, arguments);
      return null;
    };
  }
})();
true;`;

/**
 * Hosted Worldline/Paynimo checkout in an in-app WebView.
 * Card gateway GETs are loaded by replacing this WebView's document. A bank form
 * POST stays in this page. Success is decided by `/worldline/status`, not this redirect.
 */
export default function WorldlineCheckoutWebView({
  visible,
  sessionPayload,
  redirectUrl,
  onComplete,
  onCancel,
  onGatewayProgress,
  openAllPaymentModes,
  cancelTestID,
}: WorldlineCheckoutProps) {
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [loadError, setLoadError] = useState('');
  const completed = useRef(false);
  const painted = useRef(false);
  const bankAuthStarted = useRef(false);
  const sawIssuer = useRef(false);
  const sawGatewayContent = useRef(false);
  const paintedUrl = useRef('');
  const blankSince = useRef(0);
  const lastBlankUrl = useRef('');
  const latestPageUrl = useRef('');
  const latestTextLength = useRef(0);
  const gatewayUrlRef = useRef<string | null>(null);
  const progressNotified = useRef(false);
  const webRef = useRef<WebView<{}>>(null);
  const blankTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewId = useRef(`wv-${Date.now().toString(36)}`).current;
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);

  const logNav = useCallback((event: string, url: string, extra?: Record<string, unknown>) => {
    const raw = String(url || '');
    const path = raw.split('#')[0].split('?')[0].slice(0, 180);
    console.log('[paynimo]', JSON.stringify({ event, webView: viewId, url: path || '(empty)', ...extra }));
  }, [viewId]);

  const notifyProgress = useCallback(() => {
    if (progressNotified.current) return;
    if (!gatewayUrlRef.current && !bankAuthStarted.current) return;
    progressNotified.current = true;
    onGatewayProgress?.({
      bankAuthenticationStarted: bankAuthStarted.current,
      gatewayStarted: !!gatewayUrlRef.current || bankAuthStarted.current,
    });
  }, [onGatewayProgress]);

  const recoveryProgress = useCallback((): BlankGatewayRecovery => {
    const blankForMs =
      blankSince.current > 0 && lastBlankUrl.current === latestPageUrl.current
        ? Date.now() - blankSince.current
        : 0;
    return {
      gatewayStarted: !!gatewayUrlRef.current || bankAuthStarted.current,
      sawIssuer: sawIssuer.current,
      sawGatewayContent: sawGatewayContent.current,
      leftPaintedDocument: !!paintedUrl.current && paintedUrl.current !== latestPageUrl.current,
      blankForMs,
    };
  }, []);

  const markProgress = useCallback(
    (url: string) => {
      let changed = false;
      if (isIssuerAuthenticationUrl(url)) {
        sawIssuer.current = true;
        if (!bankAuthStarted.current) {
          bankAuthStarted.current = true;
          changed = true;
        }
        // Live OTP. A blank timer from the previous document must not cover it.
        if (blankTimer.current) {
          clearTimeout(blankTimer.current);
          blankTimer.current = null;
          setConfirming(false);
        }
      } else if (isBankAuthenticationUrl(url) || isCheckoutProgressUrl(url)) {
        if (!bankAuthStarted.current) {
          bankAuthStarted.current = true;
          changed = true;
        }
      }
      if (changed || gatewayUrlRef.current || bankAuthStarted.current) notifyProgress();
    },
    [notifyProgress],
  );

  React.useEffect(() => {
    if (visible) {
      completed.current = false;
      painted.current = false;
      bankAuthStarted.current = false;
      sawIssuer.current = false;
      sawGatewayContent.current = false;
      paintedUrl.current = '';
      blankSince.current = 0;
      lastBlankUrl.current = '';
      latestPageUrl.current = '';
      latestTextLength.current = 0;
      progressNotified.current = false;
      if (blankTimer.current) clearTimeout(blankTimer.current);
      gatewayUrlRef.current = null;
      setGatewayUrl(null);
      setLoading(true);
      setConfirming(false);
      setLoadError('');
    } else {
      if (blankTimer.current) clearTimeout(blankTimer.current);
      if (probeTimer.current) clearInterval(probeTimer.current);
    }
  }, [visible, sessionPayload, redirectUrl]);

  // Keep reading the document while Secure Payment is open. A post-OTP sheet
  // often goes white without another load event, so the interval cannot wait
  // for the card URL to be stored.
  React.useEffect(() => {
    if (!visible) return undefined;
    probeTimer.current = setInterval(() => {
      if (completed.current) return;
      webRef.current?.injectJavaScript(PAGE_PROBE_JS);
    }, 2000);
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active' || completed.current) return;
      webRef.current?.injectJavaScript(PAGE_PROBE_JS);
      if (gatewayUrlRef.current || bankAuthStarted.current) {
        // Resume used to leave progress latched, so the parent never restarted
        // status polling and a captured payment stayed on the blank sheet.
        progressNotified.current = false;
        notifyProgress();
      }
    });
    return () => {
      sub.remove();
      if (probeTimer.current) {
        clearInterval(probeTimer.current);
        probeTimer.current = null;
      }
    };
  }, [visible, notifyProgress]);

  const checkoutHtml = sessionPayload
    ? buildPaynimoCheckoutHtml(sessionPayload, openAllPaymentModes ? { paymentMode: 'all' } : undefined)
    : null;
  const source = gatewayUrl
    ? { uri: gatewayUrl }
    : checkoutHtml
      ? { html: checkoutHtml, baseUrl: 'https://www.paynimo.com/' }
      : redirectUrl
        ? { uri: redirectUrl }
        : null;

  const followGateway = (url: string, via: string) => {
    const raw = String(url || '').trim();
    const follow = isPopupGatewayNavigation(raw) && !gatewayUrlRef.current;
    logNav('popup-location', raw, { followed: follow, via });
    if (!follow) {
      markProgress(raw);
      return;
    }
    gatewayUrlRef.current = raw;
    bankAuthStarted.current = true;
    if (isIssuerAuthenticationUrl(raw)) sawIssuer.current = true;
    blankSince.current = 0;
    lastBlankUrl.current = '';
    if (blankTimer.current) {
      clearTimeout(blankTimer.current);
      blankTimer.current = null;
    }
    notifyProgress();
    setGatewayUrl(raw);
  };

  const finishReturn = useCallback(
    (url: string) => {
      if (completed.current) return;
      // The API return URL, or the website page it redirects to. Paid is still
      // decided by /worldline/status, not by this URL.
      if (!isWorldlineReturnUrl(url) && !isPaymentResultHandoffUrl(url)) return;
      completed.current = true;
      if (blankTimer.current) clearTimeout(blankTimer.current);
      if (probeTimer.current) {
        clearInterval(probeTimer.current);
        probeTimer.current = null;
      }
      setConfirming(true);
      onComplete({ url });
    },
    [onComplete],
  );

  const recoverBlankPage = useCallback(
    (url: string, textLength: number) => {
      if (completed.current) return;
      latestPageUrl.current = url;
      latestTextLength.current = textLength;
      if (textLength <= 1) {
        if (lastBlankUrl.current !== url) {
          lastBlankUrl.current = url;
          blankSince.current = Date.now();
        }
      } else {
        lastBlankUrl.current = '';
        blankSince.current = 0;
        if (textLength > 8) {
          sawGatewayContent.current = true;
          paintedUrl.current = url;
        }
      }
      if (isIssuerAuthenticationUrl(url)) {
        sawIssuer.current = true;
        bankAuthStarted.current = true;
        notifyProgress();
      }
      const progress = recoveryProgress();
      // Live OTP, a painted card form, or a page that has not been empty long
      // enough. Cancel any pending handoff so we never cover the OTP UI.
      if (!shouldRecoverBlankGatewayPage(url, textLength, progress)) {
        if (blankTimer.current) {
          clearTimeout(blankTimer.current);
          blankTimer.current = null;
          setConfirming(false);
        }
        return;
      }
      if (blankTimer.current) return;
      notifyProgress();
      // shouldRecover already waited out the empty document. One short beat
      // so a redirect that is about to paint can still cancel this.
      blankTimer.current = setTimeout(() => {
        blankTimer.current = null;
        if (completed.current) return;
        const currentUrl = latestPageUrl.current;
        if (isIssuerAuthenticationUrl(currentUrl)) return;
        if (!shouldRecoverBlankGatewayPage(currentUrl, latestTextLength.current, recoveryProgress())) return;
        completed.current = true;
        if (probeTimer.current) {
          clearInterval(probeTimer.current);
          probeTimer.current = null;
        }
        setConfirming(true);
        logNav('blank-page', currentUrl, { textLength: latestTextLength.current });
        onComplete({ url: currentUrl && currentUrl !== 'about:blank' ? currentUrl : '' });
      }, 1500);
    },
    [logNav, notifyProgress, onComplete, recoveryProgress],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      logNav('navigation', nav.url, { loading: nav.loading });
      markProgress(nav.url);
      if (!nav.loading) finishReturn(nav.url);
    },
    [finishReturn, logNav, markProgress],
  );

  const handleClose = () => {
    if (completed.current) return;
    onCancel({ bankAuthenticationStarted: bankAuthStarted.current });
  };

  if (!source) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.header}>
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          testID={cancelTestID}
          accessibilityRole="button"
          accessibilityLabel="Close payment"
        >
          <Text style={styles.close}>Close</Text>
        </Pressable>
        <Text style={styles.title}>Secure payment</Text>
        <View style={styles.spacer} />
      </View>
      {loadError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Card page unavailable</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable
            onPress={() => {
              setLoadError('');
              webRef.current?.reload();
            }}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Back to payment</Text>
          </Pressable>
        </View>
      ) : null}
      <WebView<{}>
        ref={webRef}
        source={source}
        onLoadStart={event => {
          logNav('load-start', event.nativeEvent.url);
          markProgress(event.nativeEvent.url);
          if (isWorldlineReturnUrl(event.nativeEvent.url) || isPaymentResultHandoffUrl(event.nativeEvent.url)) {
            setConfirming(true);
          }
          if (!painted.current) setLoading(true);
        }}
        onLoadEnd={event => {
          logNav('load-end', event.nativeEvent.url);
          painted.current = true;
          setLoading(false);
          markProgress(event.nativeEvent.url);
          finishReturn(event.nativeEvent.url);
          webRef.current?.injectJavaScript(PAGE_PROBE_JS);
        }}
        onError={() => {
          setLoading(false);
          // A dropped connection after the bank page is not a decline. Verify.
          if ((bankAuthStarted.current || gatewayUrlRef.current) && !completed.current) {
            completed.current = true;
            if (blankTimer.current) clearTimeout(blankTimer.current);
            setConfirming(true);
            onComplete({ url: '' });
            return;
          }
          setLoadError('The card page did not load. Check your connection and try again. You have not been charged.');
        }}
        onHttpError={event => {
          logNav('http-error', event.nativeEvent.url, { statusCode: event.nativeEvent.statusCode });
          setLoading(false);
          finishReturn(event.nativeEvent.url);
        }}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={req => {
          // Handoff in any frame — a subframe 302 after OTP must still complete the app flow.
          if (isPaymentResultHandoffUrl(req.url)) {
            logNav('handoff', req.url, { decision: 'app', topFrame: req.isTopFrame !== false });
            finishReturn(req.url);
            return false;
          }
          const decision = classifyCheckoutNavigation(req.url);
          const allow =
            req.isTopFrame === false
              ? allowedUpiUrl(req.url)
                ? false
                : /^(https:|about:|data:|blob:)/i.test(req.url) || decision !== 'block'
              : decision !== 'block' && decision !== 'upi';
          logNav('intercept', req.url, {
            topFrame: req.isTopFrame !== false,
            navigationType: req.navigationType,
            decision,
            allow,
          });
          if (req.isTopFrame === false) {
            if (allowedUpiUrl(req.url)) {
              Linking.openURL(req.url).catch(() => setLoading(false));
              return false;
            }
            if (/^(https:|about:|data:|blob:)/i.test(req.url)) return true;
            return decision !== 'block';
          }
          if (decision === 'upi') {
            Linking.openURL(req.url).catch(() => setLoading(false));
            return false;
          }
          if (decision === 'block') return false;
          markProgress(req.url);
          // Let the return POST finish. Completing here would destroy the WebView first.
          return true;
        }}
        onOpenWindow={event => {
          const url = event.nativeEvent.targetUrl || '';
          logNav('open-window', url, { hasUrl: !!url && url !== 'about:blank' });
          if (!url || url === 'about:blank') return;
          if (allowedUpiUrl(url)) {
            Linking.openURL(url).catch(() => setLoading(false));
            return;
          }
          followGateway(url, 'open-window');
        }}
        onMessage={event => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg?.type === 'page') {
              const textLength = Number(msg.detail?.textLength);
              const pageUrl = String(msg.detail?.url || '');
              if (msg.detail?.returnHit || msg.detail?.bridge) {
                finishReturn(pageUrl || 'https://www.selorg.com/checkout/payment?paynimo_bridge=1');
              }
              if (Number.isFinite(textLength)) recoverBlankPage(pageUrl, textLength);
            }
            if (msg?.type === 'return-nav') {
              finishReturn(String(msg.detail?.url || ''));
            }
            if (msg?.type === 'follow-get') {
              followGateway(String(msg.detail?.url || ''), 'popup-location');
            }
            if (msg?.type === 'diag') {
              console.log('[paynimo]', JSON.stringify({ webView: viewId, ...msg.detail }));
            }
            if (msg?.type === 'opened' || msg?.type === 'error') {
              painted.current = true;
              setLoading(false);
              logNav(msg.type === 'opened' ? 'checkout-opened' : 'checkout-error', '');
            }
            if (msg?.type === 'gateway' && msg.detail && !completed.current) {
              completed.current = true;
              if (blankTimer.current) clearTimeout(blankTimer.current);
              if (probeTimer.current) {
                clearInterval(probeTimer.current);
                probeTimer.current = null;
              }
              setConfirming(true);
              onComplete({ url: '', response: msg.detail as Record<string, unknown> });
            }
          } catch {
            // ignore
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        // New windows are disabled. After OTP the bank POSTs the result; with multiple
        // windows that POST is cancelled in a hidden WebView and this page stays blank.
        // UPI still leaves via the checkout shim, and the card GET is a native loadUrl.
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={GATEWAY_DOCUMENT_JS}
        injectedJavaScript={PAGE_PROBE_JS}
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        originWhitelist={['*']}
        mixedContentMode="compatibility"
      />
      {loading && !confirming ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
      {confirming ? (
        <View style={styles.confirming}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.confirmingTitle}>Confirming your payment…</Text>
          <Text style={styles.confirmingSub}>Checking the result with our server. You will not be charged again.</Text>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  close: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: colors.primary,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.text,
  },
  spacer: { width: 48 },
  errorBox: {
    padding: 24,
    gap: 8,
    backgroundColor: colors.white,
  },
  errorTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.text,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  retryText: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    color: colors.primary,
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    top: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    zIndex: 2,
  },
  confirming: {
    ...StyleSheet.absoluteFillObject,
    top: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: colors.white,
    zIndex: 3,
  },
  confirmingTitle: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  confirmingSub: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
