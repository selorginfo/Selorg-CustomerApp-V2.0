import { NativeModules, Platform } from 'react-native';
import {
  buildWorldlineSdkOptions,
  classifyWorldlineSdkResult,
  isWorldlineSdkAvailable,
  openWorldlineSdk,
  worldlineSdkStatusCode,
} from '../src/utils/worldlineSdk';

// Pipe shape of Paynimo's SDK callback `msg`; the values are fixtures.
const SIGNED_MSG = '0300|success|NA|txn-1|470|900000001|54.00||25-11-2026 18:46:17|||||||fixturehash';

const session = {
  features: { enableExpressPay: false, showLoader: true },
  consumerData: {
    deviceId: 'AndroidSH2',
    token: 'signed-token',
    returnUrl: 'https://api.selorg.com/api/v1/customer/payments/worldline/return',
    paymentMode: 'UPI',
    merchantId: 'T0000',
    txnId: 'txn-1',
    totalAmount: '54.00',
    items: [{ itemId: 'FIRST', amount: '54.00', comAmt: '0.00' }],
  },
};

type Options = { consumerData: Record<string, unknown>; features: Record<string, unknown> };

describe('Paynimo SDK options', () => {
  it('drops returnUrl so the signed result comes back through the callback', () => {
    const options = buildWorldlineSdkOptions(session) as Options;
    expect(options.consumerData.returnUrl).toBeUndefined();
    expect(options.consumerData.token).toBe('signed-token');
    expect(options.consumerData.deviceId).toBe('AndroidSH2');
    expect(options.consumerData.totalAmount).toBe('54.00');
    expect(options.consumerData.items).toEqual(session.consumerData.items);
    expect(options.features).toEqual({ enableExpressPay: false, showLoader: true, enableAbortResponse: true });
  });

  it('opens every instrument on order checkout without touching the session', () => {
    const options = buildWorldlineSdkOptions(session, { paymentMode: 'all' }) as Options;
    expect(options.consumerData.paymentMode).toBe('all');
    expect(session.consumerData.paymentMode).toBe('UPI');
    expect(session.consumerData.returnUrl).toContain('/worldline/return');
  });
});

describe('Paynimo SDK results', () => {
  it('sends a signed msg for server verification', () => {
    expect(classifyWorldlineSdkResult({ msg: SIGNED_MSG, merchant_code: 'T0000' })).toEqual({
      kind: 'verify',
      response: { msg: SIGNED_MSG, merchant_code: 'T0000' },
    });
    expect(worldlineSdkStatusCode({ msg: SIGNED_MSG })).toBe('0300');
  });

  it('treats an SDK exception as an exit with its reason', () => {
    const err = { error_code: '0399', error_desc: 'Expected checkout initialisation options' };
    expect(classifyWorldlineSdkResult(err)).toEqual({
      kind: 'error',
      message: 'Expected checkout initialisation options',
    });
    expect(worldlineSdkStatusCode(err)).toBe('0399');
    expect(classifyWorldlineSdkResult(undefined)).toEqual({ kind: 'error', message: '' });
  });
});

describe('Paynimo SDK availability', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete NativeModules.WeiplCheckout;
  });

  it('opens the native module on Android only', () => {
    const open = jest.fn();
    NativeModules.WeiplCheckout = { open };
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(isWorldlineSdkAvailable()).toBe(true);

    const onResponse = jest.fn();
    const onError = jest.fn();
    expect(openWorldlineSdk({ consumerData: {} }, onResponse, onError)).toBe(true);
    expect(open).toHaveBeenCalledWith({ consumerData: {} }, onResponse, onError);

    jest.replaceProperty(Platform, 'OS', 'ios');
    expect(isWorldlineSdkAvailable()).toBe(false);
  });

  it('falls back to the WebView when the module is not linked', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    expect(isWorldlineSdkAvailable()).toBe(false);
    expect(openWorldlineSdk({}, jest.fn(), jest.fn())).toBe(false);
  });
});
