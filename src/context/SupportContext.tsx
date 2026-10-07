import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { supportApi } from '../services/support.service';
import type { SupportTicket, SupportMessage } from '../services/support.service';
import { Storage } from '../api/storage';
import { showToast } from '../utils/toast';
import { useAuth } from './AuthContext';
import { getErrorMessage } from '../utils/apiError';
import { usePager } from '../utils/usePager';

const TICKETS_PAGE = 30;

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
  /** Resolves false when the message was not delivered (it is removed from the thread). */
  sendMessage: (ticketId: string, text: string) => Promise<boolean>;
  reopenTicket: (ticketId: string) => void;
  /** Pulls the latest messages for one ticket (agent replies). */
  refreshTicket: (ticketId: string) => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
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
  const { user } = useAuth();
  const userId = user?.id || '';
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTicketsPage = useCallback(
    async (page: number) => ((await supportApi.listMyTickets({ page, limit: TICKETS_PAGE })) || []).map(toTicket),
    [],
  );
  const pager = usePager(fetchTicketsPage, TICKETS_PAGE, setTickets);
  const { firstPageLoaded } = pager;

  const loadTickets = useCallback(async () => {
    if (!Storage.getItem('accessToken')) { setTickets([]); return; }
    setLoading(true);
    try {
      const list = await fetchTicketsPage(1);
      setTickets(list);
      firstPageLoaded(list.length);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, [fetchTicketsPage, firstPageLoaded]);

  // Reload per account so a previous user's tickets never linger.
  useEffect(() => {
    setTickets([]);
    if (!userId) return;
    loadTickets();
  }, [userId, loadTickets]);

  // One ticket at a time: a double tap must not open two conversations.
  const creating = useRef<Promise<Ticket> | null>(null);

  const newTicket = useCallback((subject = 'New conversation', description = 'Hello'): Promise<Ticket> => {
    if (creating.current) return creating.current;
    const run = (async () => {
      try {
        const raw = await supportApi.createTicket({ subject, description });
        const t = toTicket(raw);
        setTickets(prev => [t, ...prev]);
        return t;
      } catch (err) {
        showToast(getErrorMessage(err, 'Could not start a conversation. Please try again.'), 'err');
        throw err;
      } finally {
        creating.current = null;
      }
    })();
    creating.current = run;
    return run;
  }, []);

  const chatWithRider = useCallback(async (): Promise<Ticket> => {
    try {
      return await newTicket('Delivery support', 'I need help with my active delivery.');
    } catch {
      // newTicket already explained the failure
      throw new Error('support_unavailable');
    }
  }, [newTicket]);

  const refreshTicket = useCallback(async (ticketId: string) => {
    try {
      const msgs = await supportApi.getTicketMessages(ticketId);
      if (!Array.isArray(msgs)) return;
      const mapped = toTicket({ _id: ticketId, messages: msgs } as SupportTicket).messages;
      setTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, messages: mapped } : t)));
    } catch {
      // keep what we have; next poll retries
    }
  }, []);

  const sendMessage = useCallback(async (ticketId: string, text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const userMsg = { from: 'you' as const, text: trimmed, ts: new Date().toISOString() };
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, messages: [...t.messages, userMsg] } : t));
    try {
      await supportApi.sendMessage(ticketId, trimmed);
      await refreshTicket(ticketId);
      return true;
    } catch {
      // Don't leave an undelivered message looking sent.
      setTickets(prev =>
        prev.map(t => (t.id === ticketId ? { ...t, messages: t.messages.filter(m => m !== userMsg) } : t)),
      );
      showToast('Message could not be sent', 'err');
      return false;
    }
  }, [refreshTicket]);

  const reopenTicket = useCallback((ticketId: string) => {
    setTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, status: 'open' } : t)));
    supportApi.reopenTicket(ticketId).catch(() => {
      setTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, status: 'resolved' } : t)));
      showToast('Could not reopen this conversation', 'err');
    });
  }, []);

  const value = useMemo<SupportContextType>(() => ({
    tickets, loading, newTicket, chatWithRider, sendMessage, reopenTicket, refreshTicket, refresh: loadTickets,
    hasMore: pager.hasMore, loadingMore: pager.loadingMore, loadMore: pager.loadMore,
  }), [tickets, loading, newTicket, chatWithRider, sendMessage, reopenTicket, refreshTicket, loadTickets, pager.hasMore, pager.loadingMore, pager.loadMore]);

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
};

export const useSupport = () => {
  const ctx = useContext(SupportContext);
  if (!ctx) throw new Error('useSupport must be used within a SupportProvider');
  return ctx;
};
