export interface SupportMessage {
  from?: 'customer' | 'agent' | string;
  sender?: string;
  senderType?: string;
  text?: string;
  message?: string;
  createdAt?: string;
  ts?: string;
}

export interface SupportTicketRaw {
  id?: string;
  _id?: string;
  subject?: string;
  status?: string;
  createdAt?: string;
  messages?: SupportMessage[];
}

export type TicketStatus = 'open' | 'resolved' | 'closed';

export interface TicketView {
  id: string;
  subject: string;
  status: TicketStatus;
  statusLabel: string;
  ts: string;
  rider?: boolean;
  messages: Array<{ from: 'you' | 'agent'; text: string; ts: string }>;
}

export function isCustomerMessage(message: SupportMessage): boolean {
  return message.from === 'customer' || message.senderType === 'customer' || message.sender === 'user';
}

export function mapTicketStatus(status: string | undefined): { status: TicketStatus; statusLabel: string } {
  const value = String(status || 'open');
  if (value === 'in_progress') return { status: 'open', statusLabel: 'In progress' };
  if (value === 'waiting_for_customer') return { status: 'open', statusLabel: 'Awaiting your reply' };
  if (value === 'resolved' || value === 'closed') return { status: 'resolved', statusLabel: 'Resolved' };
  return { status: 'open', statusLabel: 'Open' };
}

export function messagesFromResponse(res: unknown): SupportMessage[] {
  const data = res && typeof res === 'object' && 'data' in res ? (res as { data: unknown }).data : res;
  if (Array.isArray(data)) return data as SupportMessage[];
  if (data && typeof data === 'object' && Array.isArray((data as { messages?: unknown }).messages)) {
    return (data as { messages: SupportMessage[] }).messages;
  }
  return [];
}

export function toTicket(raw: SupportTicketRaw): TicketView {
  const mapped = mapTicketStatus(raw.status);
  return {
    id: String(raw.id || raw._id || ''),
    subject: raw.subject || 'Support request',
    status: mapped.status,
    statusLabel: mapped.statusLabel,
    ts: raw.createdAt || '',
    messages: (raw.messages || []).map((message) => ({
      from: isCustomerMessage(message) ? 'you' as const : 'agent' as const,
      text: message.text || message.message || '',
      ts: message.createdAt || message.ts || new Date().toISOString(),
    })),
  };
}
