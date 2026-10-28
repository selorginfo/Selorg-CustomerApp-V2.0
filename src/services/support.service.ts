import SelorgApi from '../api';
import { messagesFromResponse, type SupportMessage } from './support.contract';

export type { SupportMessage } from './support.contract';

/**
 * Customer support tickets.
 * Mounted at /api/v1/customer/support in selorg-service.
 */

export interface SupportTicket {
  id?: string;
  _id?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  messages?: SupportMessage[];
}

const unwrap = <T,>(res: any): T => (res && 'data' in res ? res.data : res) as T;

export const supportApi = {
  listMyTickets: (params?: { status?: string; page?: number; limit?: number }): Promise<SupportTicket[]> =>
    SelorgApi.get('/support/tickets', { query: params }).then(unwrap<SupportTicket[]>),

  getActiveTicket: (): Promise<SupportTicket | null> =>
    SelorgApi.get('/support/tickets/active').then(unwrap<SupportTicket | null>),

  createTicket: (data: {
    subject?: string;
    description: string;
    orderId?: string;
    attachmentUrl?: string;
  }): Promise<SupportTicket> =>
    SelorgApi.post('/support/tickets', { data }).then(unwrap<SupportTicket>),

  getTicketMessages: (ticketId: string): Promise<SupportMessage[]> =>
    SelorgApi.get(`/support/tickets/${ticketId}/messages`).then(messagesFromResponse),

  sendMessage: (ticketId: string, message: string): Promise<SupportMessage> =>
    SelorgApi.post(`/support/tickets/${ticketId}/messages`, { data: { message: message.trim() } }).then(unwrap<SupportMessage>),

  reopenTicket: (ticketId: string): Promise<SupportTicket> =>
    SelorgApi.post(`/support/tickets/${ticketId}/reopen`).then(unwrap<SupportTicket>),
};
