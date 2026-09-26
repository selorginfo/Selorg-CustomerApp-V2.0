/**
 * Customer realtime channel — mirrors selorg-web-app `src/services/socket.ts`.
 *
 * Connects to selorg-service's dedicated customer Socket.IO namespace
 * (`/customer-socket.io`) with the customer JWT. Used for live order tracking:
 * status events (`order.*`) and rider GPS (`rider:location`). The backend
 * joins the socket to `customer:{userId}` automatically and to
 * `order:{orderId}` on `subscribe:order`.
 */
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '../config/api';
import { Storage } from '../api/storage';

/** Server → client order lifecycle events (selorg-service orderRealtime). */
export const ORDER_STATUS_EVENTS = [
  'order.confirmed',
  'order.picking_started',
  'order.handed_over',
  'order.rider_accepted',
  'order.out_for_delivery',
  'order.delivered',
  'order.cancelled',
] as const;

export type OrderStatusEvent = (typeof ORDER_STATUS_EVENTS)[number];

export interface RiderLocationPayload {
  orderId?: string;
  latitude?: number;
  longitude?: number;
  heading?: number;
  at?: string;
}

let socket: Socket | null = null;

/** Opens (or reuses) the customer Socket.IO connection. Null when logged out. */
export function getCustomerSocket(): Socket | null {
  const token = Storage.getItem('accessToken');
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.auth = { token } as any;
    socket.connect();
    return socket;
  }
  socket = io(API_ORIGIN, {
    path: '/customer-socket.io',
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function closeCustomerSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export interface OrderRealtimeHandlers {
  /** Any order lifecycle event fired — refetch order/tracking state. */
  onStatus?: () => void;
  /** Rider GPS update for the tracked order. */
  onRiderLocation?: (payload: RiderLocationPayload) => void;
}

/**
 * Subscribes to live updates for one order. Returns an unsubscribe cleanup.
 * Mirrors the web app's OrdersContext tracking subscription.
 */
export function subscribeToOrder(orderId: string, handlers: OrderRealtimeHandlers): () => void {
  const s = getCustomerSocket();
  if (!s || !orderId) return () => {};

  const onStatus = (payload?: { orderId?: string }) => {
    if (payload?.orderId && payload.orderId !== orderId) return;
    handlers.onStatus?.();
  };
  const onGps = (payload: RiderLocationPayload) => {
    if (payload?.orderId && payload.orderId !== orderId) return;
    handlers.onRiderLocation?.(payload);
  };

  s.emit('subscribe:order', orderId);
  ORDER_STATUS_EVENTS.forEach(event => s.on(event, onStatus));
  s.on('rider:location', onGps);

  return () => {
    s.emit('unsubscribe:order', orderId);
    ORDER_STATUS_EVENTS.forEach(event => s.off(event, onStatus));
    s.off('rider:location', onGps);
  };
}
