import {
  canReuseUnpaidOnlineAttempt,
  cartContentsKey,
  onlineFailureBlocksMethod,
  onlineInterruptsMethod,
  resolvePayMethod,
  settlementKind,
  settlesWithoutGateway,
  shouldResetPayStateForNewCheckout,
  shouldSkipPrepareFreshPaymentSession,
  unpaidBelongsToCurrentCart,
  wantedSettlement,
} from '../src/utils/paymentAttempt';

describe('payment attempt after a failed UPI payment', () => {
  it('does not keep the failure screen when the shopper switches to COD or wallet', () => {
    expect(onlineFailureBlocksMethod('failed', 'online', 'cod')).toBe(false);
    expect(onlineFailureBlocksMethod('error', 'online', 'wallet')).toBe(false);
  });

  it('still shows a failure for the method that failed', () => {
    expect(onlineFailureBlocksMethod('failed', 'online', 'online')).toBe(true);
    expect(onlineFailureBlocksMethod('error', 'wallet', 'wallet')).toBe(true);
    expect(onlineFailureBlocksMethod('idle', 'online', 'cod')).toBe(false);
  });

  it('does not keep the unconfirmed card sheet after switching to COD or wallet', () => {
    expect(onlineInterruptsMethod('idle', null, 'cod', 'Payment is still being verified.')).toBe(false);
    expect(onlineInterruptsMethod('idle', null, 'wallet', 'Payment is still being verified.')).toBe(false);
    expect(onlineInterruptsMethod('idle', null, 'online', 'Payment is still being verified.')).toBe(true);
    expect(onlineInterruptsMethod('failed', 'online', 'cod', '')).toBe(false);
  });

  it('resets terminal payState before a brand-new checkout after a finished card order', () => {
    expect(shouldResetPayStateForNewCheckout('success')).toBe(true);
    expect(shouldResetPayStateForNewCheckout('failed')).toBe(true);
    expect(shouldResetPayStateForNewCheckout('error')).toBe(true);
    expect(shouldResetPayStateForNewCheckout('idle')).toBe(false);
    expect(shouldResetPayStateForNewCheckout('awaiting_gateway')).toBe(false);
    expect(shouldResetPayStateForNewCheckout('processing')).toBe(false);
  });

  it('does not clear Paynimo while order create or gateway is in flight (Pay Online reload loop)', () => {
    expect(shouldSkipPrepareFreshPaymentSession('processing')).toBe(true);
    expect(shouldSkipPrepareFreshPaymentSession('awaiting_gateway')).toBe(true);
    expect(shouldSkipPrepareFreshPaymentSession('idle')).toBe(false);
    expect(shouldSkipPrepareFreshPaymentSession('success')).toBe(false);
    expect(shouldSkipPrepareFreshPaymentSession('failed')).toBe(false);
    expect(shouldSkipPrepareFreshPaymentSession('error')).toBe(false);
  });

  it('does not attach a previous order gateway attempt to a new cart COD checkout', () => {
    const prevOnline = {
      id: 'ord-1',
      signature: 'p1:v1:1#addr-1##0#online',
    };
    const newCartCod = 'p2:v1:1#addr-1##0#cod';
    const sameCartCod = 'p1:v1:1#addr-1##0#cod';
    expect(cartContentsKey(prevOnline.signature)).toBe('p1:v1:1#addr-1##0');
    expect(unpaidBelongsToCurrentCart(prevOnline, newCartCod)).toBe(false);
    expect(unpaidBelongsToCurrentCart(prevOnline, sameCartCod)).toBe(true);
    expect(canReuseUnpaidOnlineAttempt(prevOnline, newCartCod)).toBe(false);
    expect(canReuseUnpaidOnlineAttempt(prevOnline, prevOnline.signature)).toBe(true);
    expect(unpaidBelongsToCurrentCart({ id: 'ord-1', signature: 'resume:ord-1' }, newCartCod)).toBe(false);
    expect(canReuseUnpaidOnlineAttempt({ id: 'ord-1', signature: 'resume:ord-1' }, 'resume:ord-1')).toBe(true);
  });

  it('ignores a button press event and keeps the method the shopper selected', () => {
    const press = { nativeEvent: { timestamp: 1 } };
    expect(resolvePayMethod(press, 'online')).toBe('online');
    expect(resolvePayMethod(press, 'cod')).toBe('cod');
    expect(resolvePayMethod(press, 'wallet')).toBe('wallet');
    expect(resolvePayMethod('wallet', 'online')).toBe('wallet');
    expect(resolvePayMethod(undefined, 'cod')).toBe('cod');
  });

  it('does not settle a press event without the payment gateway', () => {
    const press = { nativeEvent: { timestamp: 1 } };
    expect(settlesWithoutGateway(press)).toBe(false);
    expect(settlesWithoutGateway('online')).toBe(false);
    expect(settlesWithoutGateway('cod')).toBe(true);
    expect(settlesWithoutGateway('wallet')).toBe(true);
  });

  it('does not treat a replayed UPI order as cash or wallet', () => {
    const upi = { paymentMethod: { type: 'upi' }, paymentStatus: 'failed' };
    expect(settlementKind(upi as never)).toBe('online');
    expect(wantedSettlement('cod')).toBe('cash');
    expect(settlementKind({ paymentMethod: { type: 'cash' }, paymentStatus: 'cod_pending' } as never)).toBe('cash');
    expect(settlementKind({ paymentMethod: { type: 'wallet' }, paymentStatus: 'paid' } as never)).toBe('wallet');
  });
});
