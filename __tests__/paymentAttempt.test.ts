import {
  onlineFailureBlocksMethod,
  resolvePayMethod,
  settlementKind,
  settlesWithoutGateway,
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
