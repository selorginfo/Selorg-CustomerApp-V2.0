import {
  gatewayDismissAction,
  hasWorldlineGatewayPayload,
  isWorldlineFailedStatus,
  isWorldlinePendingStatus,
  isWorldlinePaidStatus,
  isWorldlineReturnUrl,
  retryWhileHeld,
  shouldSubmitGatewayResponse,
  switchFromOnlineDecision,
} from '../src/utils/worldline';

describe('Worldline return URL', () => {
  const apiReturn = 'https://api.selorg.com/api/v1/customer/payments/worldline/return';

  it('treats the merchant return as a callback even when the POST body is not in the query', () => {
    expect(isWorldlineReturnUrl(apiReturn)).toBe(true);
    expect(hasWorldlineGatewayPayload({})).toBe(false);
    expect(shouldSubmitGatewayResponse({})).toBe(false);
  });

  it('accepts the local API return and the Selorg result page', () => {
    expect(isWorldlineReturnUrl('http://localhost:3333/api/v1/customer/payments/worldline/return')).toBe(true);
    expect(
      isWorldlineReturnUrl('https://www.selorg.com/checkout/payment?paynimo_bridge=1&status=success'),
    ).toBe(true);
    expect(isWorldlineReturnUrl('https://www.selorg.com/paynimo-return.html')).toBe(true);
  });

  it('does not treat a bank OTP or 3-D Secure URL as the merchant return', () => {
    expect(isWorldlineReturnUrl('https://acs.hdfcbank.com/acs/auth?txnStatus=Y&status=success')).toBe(false);
    expect(isWorldlineReturnUrl('https://3ds.icicibank.com/otp?txnstatus=0300')).toBe(false);
    expect(isWorldlineReturnUrl('https://secure.bank.example/pareq?status=failed')).toBe(false);
    expect(isWorldlineReturnUrl('http://192.168.0.14:3333/api/v1/customer/payments/worldline/return')).toBe(true);
    expect(isWorldlineReturnUrl('http://evil.example/payments/worldline/return')).toBe(false);
    expect(isWorldlineReturnUrl('https://evil.example/?paynimo_bridge=1&status=success')).toBe(false);
  });

  it('does not submit a presentation redirect as a capture', () => {
    const presentation = {
      paynimo_bridge: '1',
      status: 'success',
      orderId: 'ord-1',
      message: 'ok',
    };
    expect(shouldSubmitGatewayResponse(presentation)).toBe(false);
    expect(hasWorldlineGatewayPayload(presentation)).toBe(false);
  });

  it('submits a real gateway payload and ignores a success string on its own', () => {
    expect(shouldSubmitGatewayResponse({ status: 'success' })).toBe(false);
    expect(shouldSubmitGatewayResponse({ msg: '0300|success|...' })).toBe(true);
    expect(shouldSubmitGatewayResponse({ paymentMethod: { paymentTransaction: { statusCode: '0300' } } })).toBe(true);
  });
});

describe('payment status classification', () => {
  it('treats pending / timeout / unknown as in-flight, not failed', () => {
    expect(isWorldlinePendingStatus({ uiState: 'PENDING_VERIFICATION' })).toBe(true);
    expect(isWorldlinePendingStatus({ paymentOutcome: 'TIMEOUT' })).toBe(true);
    expect(isWorldlinePendingStatus({ paymentOutcome: 'PENDING' })).toBe(true);
    expect(isWorldlineFailedStatus({ uiState: 'PENDING_VERIFICATION' })).toBe(false);
    expect(isWorldlineFailedStatus({ paymentOutcome: 'TIMEOUT', uiState: 'RETRY_AVAILABLE' })).toBe(
      false,
    );
    expect(isWorldlineFailedStatus({ uiState: 'FAILED', paymentStatus: 'failed' })).toBe(true);
    expect(isWorldlinePaidStatus({ uiState: 'PAID', orderPaymentStatus: 'paid' })).toBe(true);
  });

  it('blocks COD while verification is unknown so a debit is not cancelled', () => {
    expect(switchFromOnlineDecision({ uiState: 'UNKNOWN', status: 'unknown' }, true)).toBe(
      'block_other_method',
    );
    expect(
      switchFromOnlineDecision({ uiState: 'PENDING_VERIFICATION', paymentStatus: 'pending' }, true),
    ).toBe('block_other_method');
  });
});

describe('closing the checkout', () => {
  it('never aborts a confirmed payment', () => {
    expect(gatewayDismissAction({ uiState: 'PAID', orderPaymentStatus: 'paid' }, { statusKnown: true })).toBe(
      'finish_paid',
    );
    expect(
      gatewayDismissAction({ walletCredited: true, orderPaymentStatus: 'paid' }, { statusKnown: true, bankAuthenticationStarted: true }),
    ).toBe('finish_paid');
  });

  it('does not abort a pending or unknown attempt, including bank OTP before our row updates', () => {
    expect(
      gatewayDismissAction({ uiState: 'PENDING_VERIFICATION', paymentStatus: 'pending' }, { statusKnown: true }),
    ).toBe('hold');
    expect(gatewayDismissAction({ uiState: 'UNKNOWN', status: 'unknown' }, { statusKnown: true })).toBe('hold');
    expect(gatewayDismissAction(null, { statusKnown: false, bankAuthenticationStarted: true })).toBe('hold');
    expect(
      gatewayDismissAction(
        { uiState: 'WAITING_FOR_PAYMENT', status: 'created' },
        { statusKnown: true, bankAuthenticationStarted: true },
      ),
    ).toBe('hold');
  });

  it('aborts only a checkout the shopper left before the bank, and leaves a real failure alone', () => {
    expect(
      gatewayDismissAction(
        { uiState: 'WAITING_FOR_PAYMENT', status: 'created' },
        { statusKnown: true, bankAuthenticationStarted: false },
      ),
    ).toBe('abort');
    expect(gatewayDismissAction({ uiState: 'FAILED', paymentStatus: 'failed' }, { statusKnown: true })).toBe(
      'close_failed',
    );
    expect(gatewayDismissAction({ uiState: 'RETRY_AVAILABLE' }, { statusKnown: true })).toBe('close_failed');
  });
});

describe('retry while a gateway attempt is open', () => {
  it('reuses the online order and blocks a second cash or wallet order', () => {
    const pending = { uiState: 'PENDING_VERIFICATION', paymentStatus: 'pending' };
    expect(retryWhileHeld(pending, true, 'online')).toBe('reuse_online');
    expect(retryWhileHeld(pending, true, 'cod')).toBe('block_other_method');
    expect(retryWhileHeld(pending, true, 'wallet')).toBe('block_other_method');
    expect(retryWhileHeld(null, false, 'cod')).toBe('clear_and_continue');
    expect(retryWhileHeld(null, false, 'wallet')).toBe('clear_and_continue');
  });

  it('does not open another payment after a capture, and allows a new attempt only after failure', () => {
    expect(retryWhileHeld({ uiState: 'PAID', orderPaymentStatus: 'paid' }, true, 'online')).toBe('already_paid');
    expect(retryWhileHeld({ uiState: 'PAID', orderPaymentStatus: 'paid' }, true, 'cod')).toBe('already_paid');
    expect(retryWhileHeld({ uiState: 'FAILED', paymentStatus: 'failed' }, true, 'online')).toBe('clear_and_continue');
    expect(retryWhileHeld({ uiState: 'FAILED', paymentStatus: 'failed' }, true, 'cod')).toBe('clear_and_continue');
  });
});

describe('explicit switch from online to COD or wallet', () => {
  it('allows COD after a waiting or failed card attempt, but not while verifying a capture', () => {
    expect(switchFromOnlineDecision({ uiState: 'WAITING_FOR_PAYMENT', status: 'created' }, true)).toBe(
      'clear_and_continue',
    );
    expect(switchFromOnlineDecision({ uiState: 'FAILED', paymentStatus: 'failed' }, true)).toBe('clear_and_continue');
    expect(switchFromOnlineDecision(null, false)).toBe('clear_and_continue');
    expect(switchFromOnlineDecision({ uiState: 'PENDING_VERIFICATION', paymentStatus: 'pending' }, true)).toBe(
      'block_other_method',
    );
    expect(switchFromOnlineDecision({ uiState: 'PAID', orderPaymentStatus: 'paid' }, true)).toBe('already_paid');
  });
});
