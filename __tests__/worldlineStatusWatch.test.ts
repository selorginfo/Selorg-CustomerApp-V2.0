import { watchWorldlineStatus } from '../src/utils/worldlineStatusWatch';

jest.mock('../src/services/payments.service', () => ({
  paymentsApi: {
    getWorldlineStatus: jest.fn(),
  },
}));

import { paymentsApi } from '../src/services/payments.service';

const getStatus = paymentsApi.getWorldlineStatus as jest.Mock;

describe('watchWorldlineStatus', () => {
  beforeEach(() => {
    getStatus.mockReset();
  });

  it('returns paid when the server reports PAID', async () => {
    getStatus.mockResolvedValueOnce({ uiState: 'PAID', orderPaymentStatus: 'paid' });
    const result = await watchWorldlineStatus({
      orderId: 'ord-1',
      initialDelayMs: 0,
      intervalMs: 1,
      maxAttempts: 3,
    });
    expect(result.outcome).toBe('paid');
    expect(getStatus).toHaveBeenCalledWith('ord-1', { timeoutMs: 12000 });
  });

  it('returns failed when the server reports FAILED', async () => {
    getStatus.mockResolvedValueOnce({ uiState: 'FAILED', paymentStatus: 'failed' });
    const result = await watchWorldlineStatus({
      orderId: 'ord-2',
      initialDelayMs: 0,
      intervalMs: 1,
      maxAttempts: 3,
    });
    expect(result.outcome).toBe('failed');
  });

  it('keeps polling while waiting then returns pending', async () => {
    getStatus
      .mockResolvedValueOnce({ uiState: 'WAITING_FOR_PAYMENT', paymentStatus: 'pending' })
      .mockResolvedValueOnce({ uiState: 'PENDING_VERIFICATION', paymentStatus: 'pending' })
      .mockResolvedValueOnce({ uiState: 'WAITING_FOR_PAYMENT', status: 'created' });
    const result = await watchWorldlineStatus({
      orderId: 'ord-3',
      initialDelayMs: 0,
      intervalMs: 1,
      maxAttempts: 3,
    });
    expect(result.outcome).toBe('pending');
    expect(getStatus).toHaveBeenCalledTimes(3);
  });

  it('stops when aborted between polls', async () => {
    const signal = { aborted: false };
    getStatus.mockImplementation(async () => {
      signal.aborted = true;
      return { uiState: 'WAITING_FOR_PAYMENT', paymentStatus: 'pending' };
    });
    const result = await watchWorldlineStatus({
      orderId: 'ord-4',
      initialDelayMs: 0,
      intervalMs: 1,
      maxAttempts: 5,
      signal,
    });
    expect(result.outcome).toBe('stopped');
  });
});
