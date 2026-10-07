import { navigate, navigationRef, setPendingNavigation } from './navigationRef';

type Target = { screen: string; params?: Record<string, string> };

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined;

/**
 * Where a notification should take the user, from the ids the backend puts in
 * its data payload (orderId, refundId, ticketId, productId) or its type.
 */
export function notificationTarget(data?: Record<string, unknown> | null, type?: string): Target | null {
  if (!data && !type) return null;
  const d = data || {};
  const productId = str(d.productId);
  if (productId) return { screen: 'ProductDetail', params: { productId } };
  const refundId = str(d.refundId);
  if (refundId) return { screen: 'RefundDetail', params: { refundId } };
  const ticketId = str(d.ticketId);
  if (ticketId) return { screen: 'TicketDetail', params: { ticketId } };
  const orderId = str(d.orderId);
  if (orderId) return { screen: 'OrderDetail', params: { orderId } };
  const kind = String(str(d.type) || type || '').toLowerCase();
  if (kind.includes('wallet')) return { screen: 'Wallet' };
  if (kind.includes('refund')) return { screen: 'Refunds' };
  if (kind.includes('order')) return { screen: 'Orders' };
  return null;
}

/** Navigate for a tapped notification; queues it when navigation isn't mounted yet. Returns true if it routed. */
export function openNotificationTarget(data?: Record<string, unknown> | null, type?: string): boolean {
  const target = notificationTarget(data, type);
  if (!target) return false;
  if (navigationRef.isReady()) navigate(target.screen, target.params);
  else setPendingNavigation(target.screen, target.params);
  return true;
}
