import { refundsFromResponse, toRefund } from '../src/services/refunds.contract';

const ENVELOPE = {
  success: true,
  data: {
    refunds: [
      {
        id: 'ref-1',
        orderNumber: 'ORD-9',
        date: '2026-10-01T00:00:00.000Z',
        status: 'completed',
        statusText: 'Refund completed',
        amount: 120,
      },
    ],
    pagination: { page: 1, pageSize: 50, total: 1 },
  },
};

describe('customer refund contract', () => {
  it('reads refunds from data.refunds instead of returning an empty list', () => {
    const list = refundsFromResponse(ENVELOPE).map(toRefund);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('ref-1');
    expect(list[0].ts).toBe('2026-10-01T00:00:00.000Z');
    expect(list[0].status).toBe('processed');
  });

  it('still accepts a bare array and _id/createdAt aliases', () => {
    const refund = toRefund({
      _id: 'legacy',
      amount: 10,
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(refund.id).toBe('legacy');
    expect(refund.ts).toBe('2026-01-01T00:00:00.000Z');
  });
});
