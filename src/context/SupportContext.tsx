import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supportApi } from '../services/support.service';
import type { SupportTicket, SupportMessage } from '../services/support.service';
import { Storage } from '../api/storage';
import { showToast } from '../utils/toast';

export interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'resolved' | 'closed';
  ts: string;
  rider?: boolean;
  messages: Array<{ from: 'you' | 'agent'; text: string; ts: string }>;
}

interface SupportContextType {
  tickets: Ticket[];
  loading: boolean;
  newTicket: (subject?: string, description?: string) => Promise<Ticket>;
  chatWithRider: () => Promise<Ticket>;
  sendMessage: (ticketId: string, text: string) => Promise<void>;
  reopenTicket: (ticketId: string) => void;
  refresh: () => Promise<void>;
}

const SupportContext = createContext<SupportContextType | undefined>(undefined);

function toTicket(raw: SupportTicket): Ticket {
  return {
    id: raw._id,
    subject: raw.subject || 'Support request',
    status: raw.status === 'closed' ? 'resolved' : raw.status,
    ts: raw.createdAt,
    messages: (raw.messages || []).map((m: SupportMessage) => ({
      from: m.from === 'customer' ? 'you' : 'agent',
      text: m.text || m.message || '',
      ts: m.createdAt || m.ts || new Date().toISOString(),
    })),
  };
}

export const SupportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTickets = useCallback(async () => {
    if (!Storage.getItem('accessToken')) { setTickets([]); return; }
    setLoading(true);
    try {
      const raw = await supportApi.listMyTickets({ limit: 30 });
      setTickets((raw || []).map(toTicket));
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const newTicket = useCallback(async (subject = 'New conversation', description = 'Hello'): Promise<Ticket> => {
    const raw = await supportApi.createTicket({ subject, description });
    const t = toTicket(raw);
    setTickets(prev => [t, ...prev]);
    return t;
  }, []);

  const chatWithRider = useCallback(async (): Promise<Ticket> => {
    try {
      return await newTicket('Delivery support', 'I need help with my active delivery.');
    } catch {
      showToast('Could not start chat', 'err');
      throw new Error('support_unavailable');
    }
  }, [newTicket]);

  const sendMessage = useCallback(async (ticketId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg = { from: 'you' as const, text: trimmed, ts: new Date().toISOString() };
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, messages: [...t.messages, userMsg] } : t));
    try {
      await supportApi.sendMessage(ticketId, trimmed);
      await loadTickets();
    } catch {
      showToast('Message could not be sent', 'err');
    }
  }, [loadTickets]);

  const reopenTicket = useCallback((ticketId: string) => {
    setTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, status: 'open' } : t)));
    supportApi.reopenTicket(ticketId).catch(() => {});
  }, []);

  const value = useMemo<SupportContextType>(() => ({
    tickets, loading, newTicket, chatWithRider, sendMessage, reopenTicket, refresh: loadTickets,
  }), [tickets, loading, newTicket, chatWithRider, sendMessage, reopenTicket, loadTickets]);

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
};

export const useSupport = () => {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error('useSupport must be used within a SupportProvider');
  return ctx;
};
