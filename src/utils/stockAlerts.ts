import { mmkvStorage } from '../lib/storage';
import { catalogApi } from '../services/catalog.service';
import { resolveListingStock } from './catalogMappers';
import { showToast } from './toast';

/**
 * Device-side "Notify me": the backend has no back-in-stock subscription, so
 * watched products are re-checked when the app opens (Home load) and a local
 * notification fires once a product can be ordered again.
 */
const KEY = 'stockAlerts';
const LAST_CHECK_KEY = 'stockAlertsCheckedAt';
const MIN_CHECK_GAP_MS = 10 * 60 * 1000;
const MAX_WATCHED = 30;

type Watch = { id: string; name: string; at: number };

function read(): Watch[] {
  try {
    const raw = mmkvStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(w => w && typeof w.id === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: Watch[]) {
  try {
    mmkvStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_WATCHED)));
  } catch {
    // non-fatal
  }
}

export function isStockAlertSet(productId: string): boolean {
  return read().some(w => w.id === productId);
}

export function setStockAlert(productId: string, name: string): void {
  const list = read().filter(w => w.id !== productId);
  list.push({ id: productId, name, at: Date.now() });
  write(list);
}

export function clearStockAlert(productId: string): void {
  write(read().filter(w => w.id !== productId));
}

async function notifyBackInStock(w: Watch) {
  const title = 'Back in stock';
  const body = `${w.name} is available again. Order before it sells out.`;
  try {
    const notifee = require('@notifee/react-native').default;
    await notifee.displayNotification({
      title,
      body,
      data: { productId: w.id },
      android: { channelId: 'push_channel_v3', pressAction: { id: 'default' } },
    });
  } catch {
    showToast(`${w.name} is back in stock`, 'info');
  }
}

/** Re-check watched products (throttled); fires one notification per product that is orderable again. */
export async function checkStockAlerts(force = false): Promise<void> {
  const list = read();
  if (!list.length) return;
  const last = Number(mmkvStorage.getItem(LAST_CHECK_KEY) || 0);
  if (!force && Date.now() - last < MIN_CHECK_GAP_MS) return;
  mmkvStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

  const storeId = mmkvStorage.getItem('assignedStoreId') || undefined;
  for (const w of list) {
    try {
      const detail = await catalogApi.getProductDetail(w.id, storeId);
      const product = detail?.product;
      if (product && resolveListingStock(product) !== 0) {
        clearStockAlert(w.id);
        await notifyBackInStock(w);
      }
    } catch {
      // try again on the next check
    }
  }
}
