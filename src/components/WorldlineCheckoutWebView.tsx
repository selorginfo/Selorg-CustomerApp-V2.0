import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { colors, fontFamily } from '../theme';
import { buildPaynimoCheckoutHtml } from '../utils/paynimoCheckout';
import { hasWorldlineGatewayPayload, isWorldlineReturnUrl, parseReturnUrl } from '../utils/worldline';

export interface WorldlineCheckoutProps {
  visible: boolean;
  /** Paynimo session payload from selorg-service (preferred). */
  sessionPayload?: Record<string, unknown> | null;
  /** Legacy hosted URL — used only when sessionPayload is absent. */
  redirectUrl?: string | null;
  onComplete: (payload: { url: string; response?: Record<string, unknown> }) => void;
  onCancel: () => void;
  /** Optional testID for the Close / cancel control. */
  cancelTestID?: string;
}

/**
 * Hosted Worldline/Paynimo checkout in an in-app WebView.
 * Loads Paynimo SDK with `sessionPayload` and detects gateway return URLs.
 */
export default function WorldlineCheckoutWebView({
  visible,
  sessionPayload,
  redirectUrl,
  onComplete,
  onCancel,
  cancelTestID,
}: WorldlineCheckoutProps) {
  const [loading, setLoading] = useState(true);
  const completed = useRef(false);

  React.useEffect(() => {
    if (visible) {
      completed.current = false;
      setLoading(true);
    }
  }, [visible, sessionPayload, redirectUrl]);

  const checkoutHtml = sessionPayload ? buildPaynimoCheckoutHtml(sessionPayload) : null;
  const source = checkoutHtml
    ? { html: checkoutHtml }
    : redirectUrl
      ? { uri: redirectUrl }
      : null;

  const maybeComplete = useCallback(
    (url: string) => {
      if (completed.current) return;
      if (!isWorldlineReturnUrl(url)) return;
      const parsed = parseReturnUrl(url);
      const hasResult =
        hasWorldlineGatewayPayload(parsed) ||
        String(parsed.paynimo_bridge || '') === '1' ||
        String(parsed.status || '').trim() !== '';
      // Card "Next" navigates to the bare return URL before any card details.
      // Keep the checkout page open until the gateway actually posts a result.
      if (!hasResult) return;
      completed.current = true;
      onComplete({ url });
    },
    [onComplete],
  );

  const onNavigationStateChange = useCallback(
    (nav: WebViewNavigation) => {
      maybeComplete(nav.url);
    },
    [maybeComplete],
  );

  const handleClose = () => {
    if (!completed.current) onCancel();
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
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
      <WebView
        source={source}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={onNavigationStateChange}
        onShouldStartLoadWithRequest={req => {
          if (isWorldlineReturnUrl(req.url)) {
            const parsed = parseReturnUrl(req.url);
            const hasResult =
              hasWorldlineGatewayPayload(parsed) ||
              String(parsed.paynimo_bridge || '') === '1' ||
              String(parsed.status || '').trim() !== '';
            if (!hasResult) return false;
          }
          maybeComplete(req.url);
          return true;
        }}
        onMessage={event => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg?.type === 'gateway' && msg.detail && !completed.current) {
              completed.current = true;
              onComplete({ url: '', response: msg.detail as Record<string, unknown> });
            }
          } catch {
            // ignore
          }
        }}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
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
