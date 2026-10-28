import { isCustomerMessage, messagesFromResponse, toTicket } from '../src/services/support.contract';

describe('customer support contract', () => {
  it('unwraps data.messages so agent replies are not dropped', () => {
    const messages = messagesFromResponse({
      data: {
        messages: [
          { sender: 'user', senderType: 'customer', text: 'Where is my order?' },
          { sender: 'agent', senderType: 'agent', text: 'It is on the way' },
        ],
      },
    });
    expect(messages).toHaveLength(2);
    expect(isCustomerMessage(messages[0])).toBe(true);
    expect(isCustomerMessage(messages[1])).toBe(false);
  });

  it('uses the ticket id the API sends and labels in-progress tickets', () => {
    const ticket = toTicket({
      id: 'tkt-1',
      subject: 'Late order',
      status: 'in_progress',
      createdAt: '2026-10-01T00:00:00.000Z',
      messages: [{ sender: 'user', senderType: 'customer', text: 'Hello', createdAt: '2026-10-01T00:00:00.000Z' }],
    });
    expect(ticket.id).toBe('tkt-1');
    expect(ticket.status).toBe('open');
    expect(ticket.statusLabel).toBe('In progress');
    expect(ticket.messages[0].from).toBe('you');
  });

  it('labels a ticket that is waiting on the customer', () => {
    expect(toTicket({ id: 'tkt-2', status: 'waiting_for_customer' }).statusLabel).toBe('Awaiting your reply');
  });
});
