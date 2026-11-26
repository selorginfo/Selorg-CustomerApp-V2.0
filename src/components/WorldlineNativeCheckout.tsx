import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily } from '../theme';
import {
  buildWorldlineSdkOptions,
  classifyWorldlineSdkResult,
  openWorldlineSdk,
  worldlineSdkStatusCode,
} from '../utils/worldlineSdk';
import type { WorldlineCheckoutProps } from './WorldlineCheckoutWebView';

/**
 * Paynimo's activity can be destroyed without calling back (a launcher tap clears
 * everything above our singleTask activity). Once the app is in front again, wait this long.
 */
export const SDK_RESULT_GRACE_MS = 4000;
/** Paynimo's activity never appeared. Let the shopper leave. */
export const SDK_OPEN_TIMEOUT_MS = 8000;

type Phase = 'opening' | 'waiting' | 'confirming';

const PHASE_COPY: Record<Phase, { title: string; sub: string }> = {
  opening: { title: 'Opening secure payment…', sub: 'The Paynimo payment page opens in a moment.' },
  waiting: { title: 'Waiting for the payment result…', sub: 'Do not close the app.' },
  confirming: {
    title: 'Confirming your payment…',
    sub: 'Checking the result with our server. You will not be charged again.',
  },
};

/** Paynimo's Android SDK. It returns the signed result directly, so there is no return URL to wait on. */
export default function WorldlineNativeCheckout({
  visible,
  sessionPayload,
  openAllPaymentModes,
  onComplete,
  onCancel,
  cancelTestID,
}: WorldlineCheckoutProps) {
  const [phase, setPhase] = useState<Phase>('opening');
  const [canClose, setCanClose] = useState(false);
  const latest = useRef({ sessionPayload, openAllPaymentModes, onComplete, onCancel });
  latest.current = { sessionPayload, openAllPaymentModes, onComplete, onCancel };
  const closeRef = useRef<() => void>(() => {});
  const txnId = String((sessionPayload?.consumerData as { txnId?: unknown } | undefined)?.txnId ?? '');

  useEffect(() => {
    const payload = latest.current.sessionPayload;
    if (!visible || !payload) return undefined;
    let settled = false;
    let detached = false;
    let leftApp = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const stopGrace = () => {
      if (graceTimer !== null) clearTimeout(graceTimer);
      graceTimer = null;
    };
    setPhase('opening');
    setCanClose(false);

    const cancel = (message?: string) => {
      if (settled || detached) return;
      settled = true;
      stopGrace();
      latest.current.onCancel({ bankAuthenticationStarted: false, ...(message ? { message } : {}) });
    };
    closeRef.current = () => cancel();

    const handleResult = (result: Record<string, unknown>) => {
      if (detached) return;
      stopGrace();
      const outcome = classifyWorldlineSdkResult(result);
      console.log('[paynimo-sdk] result', { kind: outcome.kind, code: worldlineSdkStatusCode(result) });
      if (outcome.kind === 'error') {
        cancel(outcome.message);
        return;
      }
      // Still forwarded after a fallback cancel: the server verifies the hash either way.
      settled = true;
      setPhase('confirming');
      latest.current.onComplete({ url: '', response: outcome.response });
    };

    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        leftApp = true;
        stopGrace();
        if (!settled) setPhase('waiting');
        return;
      }
      if (leftApp && !settled) graceTimer = setTimeout(() => cancel(), SDK_RESULT_GRACE_MS);
    });
    const openTimer = setTimeout(() => {
      if (!leftApp && !settled) setCanClose(true);
    }, SDK_OPEN_TIMEOUT_MS);

    const options = buildWorldlineSdkOptions(
      payload,
      latest.current.openAllPaymentModes ? { paymentMode: 'all' } : undefined,
    );
    try {
      if (!openWorldlineSdk(options, res => handleResult(res), err => handleResult(err))) {
        cancel('Secure payment is not available on this device');
      }
    } catch {
      cancel('Could not open secure payment');
    }

    return () => {
      detached = true;
      appState.remove();
      stopGrace();
      clearTimeout(openTimer);
      closeRef.current = () => {};
    };
  }, [visible, txnId]);

  if (!sessionPayload) return null;
  const copy = PHASE_COPY[phase];
  const showClose = canClose && phase === 'opening';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={() => {
        if (showClose) closeRef.current();
      }}
    >
      <View style={styles.body}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.sub}>{copy.sub}</Text>
        {showClose ? (
          <Pressable
            onPress={() => closeRef.current()}
            hitSlop={12}
            style={styles.close}
            testID={cancelTestID}
            accessibilityRole="button"
            accessibilityLabel="Close payment"
          >
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: colors.white,
  },
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  close: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  closeText: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    color: colors.primary,
  },
});
