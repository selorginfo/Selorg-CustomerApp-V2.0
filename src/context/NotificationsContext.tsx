import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { notificationsApi } from '../services/notifications.service';
import type { ApiNotification, NotificationPreferences } from '../services/notifications.service';
import { Storage } from '../api/storage';
import { showToast } from '../utils/toast';
import { useAuth } from './AuthContext';
import { usePager } from '../utils/usePager';

const NOTIFS_PAGE = 50;

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  ts: string;
  read: boolean;
  type: string;
  /** Ids from the backend payload (orderId, refundId, ticketId, productId) used for tap-through. */
  data?: Record<string, unknown>;
}

type NotifPrefs = NotificationPreferences;

interface NotificationsContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  prefs: NotifPrefs;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  togglePref: (key: keyof NotifPrefs) => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

const DEFAULT_PREFS: NotifPrefs = {
  push: true,
  order: true,
  promo: true,
  wallet: true,
};

function toItem(raw: ApiNotification): NotificationItem {
  return {
    id: raw.id || raw._id || '',
    title: raw.title,
    body: raw.body,
    ts: raw.createdAt,
    read: Boolean(raw.read),
    type: raw.type || raw.category || 'info',
    data: raw.data,
  };
}

export const NotificationsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [backendPrefs, setBackendPrefs] = useState<import('../services/notifications.service').BackendNotificationPreferences>({});
  const [loading, setLoading] = useState(false);

  const fetchNotifsPage = useCallback(
    async (page: number) =>
      ((await notificationsApi.listNotifications({ page, limit: NOTIFS_PAGE })) ?? []).map(toItem).filter(n => n.id),
    [],
  );
  const pager = usePager(fetchNotifsPage, NOTIFS_PAGE, setNotifications);
  const { firstPageLoaded } = pager;

  const loadNotifications = useCallback(async () => {
    if (!Storage.getItem('accessToken')) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const [items, savedPrefs] = await Promise.all([
        notificationsApi.listNotifications({ page: 1, limit: NOTIFS_PAGE }),
        notificationsApi.getPreferences().catch(() => ({ ui: DEFAULT_PREFS, backend: {} })),
      ]);
      setNotifications((items ?? []).map(toItem).filter(n => n.id));
      firstPageLoaded((items ?? []).length);
      setPrefs(savedPrefs.ui);
      setBackendPrefs(savedPrefs.backend);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, [firstPageLoaded]);

  // Reload per account so a previous user's notifications never linger.
  useEffect(() => {
    setNotifications([]);
    setPrefs(DEFAULT_PREFS);
    setBackendPrefs({});
    if (!userId) return;
    loadNotifications();
  }, [userId, loadNotifications]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try {
      await notificationsApi.markRead(id);
    } catch {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n));
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await notificationsApi.markAllRead();
      showToast('All marked read');
    } catch {
      // soft fail
    }
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    const removed = notifications.find(n => n.id === id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await notificationsApi.deleteNotification(id);
    } catch {
      if (removed) setNotifications(prev => [...prev, removed]);
    }
  }, [notifications]);

  const togglePref = useCallback(async (key: keyof NotifPrefs) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      const result = await notificationsApi.updatePreferences(next, backendPrefs);
      setPrefs(result.ui);
      setBackendPrefs(result.backend);
    } catch {
      setPrefs(prefs);
      // Tell the user the switch flipped back — a silent revert looks like a glitch.
      showToast('Could not update notification settings. Check your connection.', 'err');
    }
  }, [prefs, backendPrefs]);

  const value = useMemo<NotificationsContextType>(() => ({
    notifications, unreadCount, prefs, loading,
    markRead, markAllRead, deleteNotification, togglePref, refresh: loadNotifications,
    hasMore: pager.hasMore, loadingMore: pager.loadingMore, loadMore: pager.loadMore,
  }), [notifications, unreadCount, prefs, loading, markRead, markAllRead, deleteNotification, togglePref, loadNotifications, pager.hasMore, pager.loadingMore, pager.loadMore]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
};
