import SelorgApi from '../api';
import { unwrapApiData } from '../utils/apiResponse';

export interface ApiNotification {
  id?: string;
  _id?: string;
  title: string;
  body: string;
  type?: string;
  category?: string;
  read?: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

/** Backend notification preferences (selorg-service). */
export interface BackendNotificationPreferences {
  push?: boolean;
  inApp?: boolean;
  sms?: boolean;
  whatsapp?: boolean;
  email?: boolean;
  dnd?: boolean;
  categories?: Record<string, { push?: boolean; inApp?: boolean; sms?: boolean; whatsapp?: boolean; email?: boolean }>;
}

/** UI-facing toggles used by Settings screen. */
export interface NotificationPreferences {
  push: boolean;
  order: boolean;
  promo: boolean;
  wallet: boolean;
}

function categoryPush(prefs: BackendNotificationPreferences, key: string): boolean {
  return prefs.categories?.[key]?.push !== false;
}

export function mapBackendPrefsToUi(raw: BackendNotificationPreferences): NotificationPreferences {
  return {
    push: raw.push !== false,
    order: categoryPush(raw, 'order'),
    promo: categoryPush(raw, 'promotional') && categoryPush(raw, 'offers'),
    wallet: categoryPush(raw, 'wallet'),
  };
}

export function mapUiPrefsToBackend(
  ui: NotificationPreferences,
  previous?: BackendNotificationPreferences,
): BackendNotificationPreferences {
  const prev = previous || {};
  const categories = { ...(prev.categories || {}) };
  const setCat = (key: string, push: boolean) => {
    categories[key] = { ...(categories[key] || {}), push };
  };
  setCat('order', ui.order);
  setCat('promotional', ui.promo);
  setCat('offers', ui.promo);
  setCat('wallet', ui.wallet);
  return { ...prev, push: ui.push, categories };
}

export const notificationsApi = {
  listNotifications: async (params?: { page?: number; limit?: number }): Promise<ApiNotification[]> => {
    const res = await SelorgApi.get('/notifications', { query: params });
    const data = unwrapApiData<unknown>(res);
    if (Array.isArray(data)) return data as ApiNotification[];
    if (data && typeof data === 'object' && Array.isArray((data as { data?: ApiNotification[] }).data)) {
      return (data as { data: ApiNotification[] }).data;
    }
    return [];
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    const res = await SelorgApi.get('/notifications/unread-count');
    const data = unwrapApiData<{ count?: number; unreadCount?: number }>(res);
    return { count: data?.count ?? data?.unreadCount ?? 0 };
  },

  markRead: (id: string): Promise<void> =>
    SelorgApi.update(`/notifications/${id}/read`, {}).then(() => undefined),

  markAllRead: (): Promise<void> =>
    SelorgApi.update('/notifications/read-all', {}).then(() => undefined),

  deleteNotification: (id: string): Promise<void> =>
    SelorgApi.delete(`/notifications/${id}`).then(() => undefined),

  getPreferences: async (): Promise<{ ui: NotificationPreferences; backend: BackendNotificationPreferences }> => {
    const res = await SelorgApi.get('/notifications/preferences');
    const backend = unwrapApiData<BackendNotificationPreferences>(res) || {};
    return { ui: mapBackendPrefsToUi(backend), backend };
  },

  updatePreferences: async (
    ui: NotificationPreferences,
    previous?: BackendNotificationPreferences,
  ): Promise<{ ui: NotificationPreferences; backend: BackendNotificationPreferences }> => {
    const payload = mapUiPrefsToBackend(ui, previous);
    const res = await SelorgApi.update('/notifications/preferences', { data: payload });
    const backend = unwrapApiData<BackendNotificationPreferences>(res) || payload;
    return { ui: mapBackendPrefsToUi(backend), backend };
  },

  registerToken: (token: string, platform: 'ios' | 'android'): Promise<void> =>
    SelorgApi.post('/notifications/register-token', { data: { token, platform } }).then(() => undefined),

  removeToken: (token: string): Promise<void> =>
    SelorgApi.post('/notifications/remove-token', { data: { token } }).then(() => undefined),
};
