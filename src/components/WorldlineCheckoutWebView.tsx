import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { colors, fontFamily } from '../theme';
import { buildPaynimoCheckoutHtml } from '../utils/paynimoCheckout';
import { classifyCheckoutNavigation, isBankAuthenticationUrl } from '../utils/checkoutNavigation';
import { isWorldlineReturnUrl } from '../utils/worldline';

export interface GatewayCloseInfo {
  bankAuthenticationStarted: boolean;
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
   * Order checkout shows UPI, cards, and net banking together.
   * Wallet top-up leaves this off so the picked method stays scoped.
   */
  openAllPaymentModes?: boolean;
  /** Optional testID for the Close / cancel control. */
  cancelTestID?: string;
}

/**
 * Hosted Worldline/Paynimo checkout in an in-app WebView.
 * Card "Next" and 3-D Secure stay in this view (`setSupportMultipleWindows={false}` on Android).
 * iOS `window.open` is pulled back into the same view. The merchant return POST is not cancelled;
 * success is decided by the caller from `/worldline/status`, not from this redirect.
 */
export default function WorldlineCheckoutWebView({
  visible,
  sessionPayload,
  redirectUrl,
  onComplete,
  onCancel,
  openAllPaymentModes,
  cancelTestID,
}: WorldlineCheckoutProps) {
  const [loading, setLoading] = useState(true);
  const completed = useRef(false);
  const painted = useRef(false);
  const bankAuthStarted = useRef(false);
  const webRef = useRef<WebView<{}>>(null);

  React.useEffect(() => {
    if (visible) {
      completed.current = false;
      painted.current = false;
      bankAuthStarted.current = false;
      setLoading(true);
    }
  }, [visible, sessionPayload, redirectUrl]);

  const checkoutHtml = sessionPayload
    ? buildPaynimoCheckoutHtml(sessionPayload, openAllPaymentModes ? { paymentMode: 'all' } : undefined)
    : null;
  const source = checkoutHtml
    ? { html: checkoutHtml, baseUrl: 'https://www.paynimo.com/' }
    : redirectUrl
      ? { uri: redirectUrl }
      : null;

  const noteBank = (url: string) => {
    if (isBankAuthenticationUrl(url)) bankAuthStarted.current = true;
  };

  const finishReturn = useCallback(
    (url: string) => {
      if (completed.current) return;
      if (!isWorldlineReturnUrl(url)) return;
      // The document has finished loading, so the return POST body has already reached the API.
      completed.current = true;
      onComplete({ url });
    },
    [onComplete],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      noteBank(nav.url);
      if (!nav.loading) finishReturn(nav.url);
    },
    [finishReturn],
  );

  const handleClose = () => {
    if (completed.current) return;
    onCancel({ bankAuthenticationStarted: bankAuthStarted.current });
  };

  const openInThisView = (url: string) => {
    webRef.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`);
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
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
      <WebView<{}>
        ref={webRef}
        source={source}
        onLoadStart={() => {
          if (!painted.current) setLoading(true);
        }}
        onLoadEnd={event => {
          painted.current = true;
          setLoading(false);
          finishReturn(event.nativeEvent.url);
        }}
        onError={() => setLoading(false)}
        onHttpError={event => {
          setLoading(false);
          finishReturn(event.nativeEvent.url);
        }}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={req => {
          if (req.isTopFrame === false) {
            return /^(https:|about:|data:|blob:)/i.test(req.url);
          }
          const decision = classifyCheckoutNavigation(req.url);
          if (decision === 'upi') {
            Linking.openURL(req.url).catch(() => setLoading(false));
            return false;
          }
          if (decision === 'block') return false;
          noteBank(req.url);
          // Let the return POST finish. Completing here would destroy the WebView first.
          return true;
        }}
        onOpenWindow={event => {
          // Android already loads window.open in this WebView when multiple windows are off.
          if (Platform.OS === 'android') return;
          const url = event.nativeEvent.targetUrl;
          const decision = classifyCheckoutNavigation(url);
          if (decision === 'block' || !url) return;
          if (decision === 'upi') {
            Linking.openURL(url).catch(() => setLoading(false));
            return;
          }
          noteBank(url);
          openInThisView(url);
        }}
        onMessage={event => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg?.type === 'opened' || msg?.type === 'error') {
              painted.current = true;
              setLoading(false);
            }
            if (msg?.type === 'gateway' && msg.detail && !completed.current) {
              completed.current = true;
              onComplete({ url: '', response: msg.detail as Record<string, unknown> });
            }
          } catch {
            // ignore
          }
        }}
        javaScriptEnabled
        domStorageEnabled
        cacheEnabled
        // Android: card form and 3-D Secure window.open stay in this WebView.
        setSupportMultipleWindows={false}
        originWhitelist={['*']}
        mixedContentMode="never"
      />
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
  loader: {
    ...StyleSheet.absoluteFillObject,
    top: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    zIndex: 2,
  },
});
