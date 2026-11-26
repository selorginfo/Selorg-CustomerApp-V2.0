import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { AppState, NativeModules } from 'react-native';
import WorldlineNativeCheckout, {
  SDK_OPEN_TIMEOUT_MS,
  SDK_RESULT_GRACE_MS,
} from '../src/components/WorldlineNativeCheckout';

// The first render transforms Modal and friends; on a cold cache that alone passes 5 s.
jest.setTimeout(20000);

type SdkCallback = (result: Record<string, unknown>) => void;
type Props = React.ComponentProps<typeof WorldlineNativeCheckout>;

// Pipe shape of Paynimo's SDK callback `msg`; the values are fixtures.
const SIGNED_MSG = '0300|success|NA|txn-1|470|900000001|54.00||25-11-2026 18:46:17|||||||fixturehash';
const session = {
  features: { showLoader: true },
  consumerData: {
    txnId: 'txn-1',
    token: 'signed-token',
    paymentMode: 'UPI',
    returnUrl: 'https://api.selorg.com/api/v1/customer/payments/worldline/return',
  },
};

let open: jest.Mock;
let appStateChange: ((state: string) => void) | undefined;

const act = (fn: () => unknown) =>
  ReactTestRenderer.act(async () => {
    fn();
  });

function sdkCallbacks(call = 0): { onResponse: SdkCallback; onError: SdkCallback } {
  const [, onResponse, onError] = open.mock.calls[call];
  return { onResponse, onError };
}

async function render(overrides: Partial<Props> = {}) {
  const onComplete = jest.fn();
  const onCancel = jest.fn();
  const props: Props = {
    visible: true,
    sessionPayload: session,
    openAllPaymentModes: true,
    onComplete,
    onCancel,
    cancelTestID: 'sdk-close',
    ...overrides,
  };
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<WorldlineNativeCheckout {...props} />);
  });
  return { tree, props, onComplete, onCancel };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  open = jest.fn();
  NativeModules.WeiplCheckout = { open };
  appStateChange = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateChange = listener as (state: string) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete NativeModules.WeiplCheckout;
});

describe('Paynimo native checkout', () => {
  it('opens the SDK once without returnUrl and forwards the signed result', async () => {
    const { onComplete, onCancel } = await render();
    expect(open).toHaveBeenCalledTimes(1);
    const options = open.mock.calls[0][0];
    expect(options.consumerData.returnUrl).toBeUndefined();
    expect(options.consumerData.paymentMode).toBe('all');
    expect(options.features.enableAbortResponse).toBe(true);

    await act(() => sdkCallbacks().onResponse({ msg: SIGNED_MSG, merchant_code: 'T0000' }));
    expect(onComplete).toHaveBeenCalledWith({ url: '', response: { msg: SIGNED_MSG, merchant_code: 'T0000' } });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('closes with the SDK reason when Paynimo reports an exception', async () => {
    const { onComplete, onCancel } = await render();
    await act(() => sdkCallbacks().onError({ error_code: '0399', error_desc: 'Transaction aborted' }));
    expect(onCancel).toHaveBeenCalledWith({ bankAuthenticationStarted: false, message: 'Transaction aborted' });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('asks the server when Paynimo closes without calling back', async () => {
    const { onCancel } = await render();
    await act(() => appStateChange?.('background'));
    await act(() => appStateChange?.('active'));
    await act(() => jest.advanceTimersByTime(SDK_RESULT_GRACE_MS - 1));
    expect(onCancel).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTime(1));
    expect(onCancel).toHaveBeenCalledWith({ bankAuthenticationStarted: false });
  });

  it('keeps a result that lands just after the app is back in front', async () => {
    const { onComplete, onCancel } = await render();
    await act(() => appStateChange?.('background'));
    await act(() => appStateChange?.('active'));
    await act(() => sdkCallbacks().onResponse({ msg: SIGNED_MSG }));
    await act(() => jest.advanceTimersByTime(SDK_RESULT_GRACE_MS * 2));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('offers Close only when the SDK never appeared', async () => {
    const { tree, onCancel } = await render();
    expect(tree.root.findAllByProps({ testID: 'sdk-close' })).toHaveLength(0);
    await act(() => jest.advanceTimersByTime(SDK_OPEN_TIMEOUT_MS));
    const [close] = tree.root.findAllByProps({ testID: 'sdk-close' });
    await act(() => close.props.onPress());
    expect(onCancel).toHaveBeenCalledWith({ bankAuthenticationStarted: false });
  });

  it('does not offer Close while Paynimo is on screen', async () => {
    const { tree } = await render();
    await act(() => appStateChange?.('background'));
    await act(() => jest.advanceTimersByTime(SDK_OPEN_TIMEOUT_MS));
    expect(tree.root.findAllByProps({ testID: 'sdk-close' })).toHaveLength(0);
  });

  it('ignores results after the checkout was hidden', async () => {
    const { tree, props, onComplete, onCancel } = await render();
    await ReactTestRenderer.act(async () => {
      tree.update(<WorldlineNativeCheckout {...props} visible={false} />);
    });
    await act(() => sdkCallbacks().onError({ error_desc: 'late' }));
    await act(() => sdkCallbacks().onResponse({ msg: SIGNED_MSG }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reopens the SDK for the next attempt', async () => {
    const { tree, props } = await render();
    await ReactTestRenderer.act(async () => {
      tree.update(<WorldlineNativeCheckout {...props} visible={false} />);
    });
    await ReactTestRenderer.act(async () => {
      tree.update(<WorldlineNativeCheckout {...props} visible />);
    });
    expect(open).toHaveBeenCalledTimes(2);
  });
});
