import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { ordersApi } from '../services/orders.service';
import type { CreateOrderPayload, PaymentMethodType } from '../services/orders.service';
import { paymentsApi } from '../services/payments.service';
import { Storage } from '../api/storage';
import { useCart } from './CartContext';
import { useAddress } from './AddressContext';
import { useAuth } from './AuthContext';
import { toLocalOrder } from '../utils/mappers';
import { showToast } from '../utils/toast';
import { usePager } from '../utils/usePager';
import { getErrorCode, getErrorMessage } from '../utils/apiError';
import {
  parseReturnUrl,
  hasWorldlineGatewayPayload,
  isWorldlinePaidStatus,
  isWorldlinePendingStatus,
  isWorldlineFailedStatus,
  presentationMessageFromReturn,
} from '../utils/worldline';

export type PayMethod = 'online' | 'cod' | 'wallet';

/** Optional "this order is for someone else" details (checkout gift toggle). */
export interface OrderReceiver {
  name?: string;
  phone?: string;
}
export type PayState = 'idle' | 'processing' | 'success' | 'failed' | 'error' | 'awaiting_gateway';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'getting-packed'
  | 'on-the-way'
  | 'arrived'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'cod_pending' | 'failed';

export interface TimelineEntry {
  status: string;
  timestamp: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  method?: PayMethod;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    unit: string;
    price: number;
    mrp?: number;
    quantity: number;
    image?: unknown;
  }>;
  itemTotal: number;
  discount: number;
  deliveryFee: number;
  tip: number;
  totalBill: number;
  addressId: string;
  coupon?: string | null;
  placedAt: string | number;
  timeline: TimelineEntry[];
  reviewAsked?: boolean;
}

interface PlaceOrderResult {
  success: boolean;
  order?: Order;
  message?: string;
  needsGateway?: boolean;
  sessionPayload?: Record<string, unknown>;
  gatewayOrderId?: string;
  gatewayTxnId?: string;
}

interface OrdersContextType {
  orders: Order[];
  loading: boolean;
  activeOrder: Order | null;
  payState: PayState;
  payError: string;
  gatewaySessionPayload: Record<string, unknown> | null;
  /** Order the open Worldline session belongs to; survives activeOrder refreshes. */
  pendingGatewayOrderId: string | null;
  placeOrder: (method: PayMethod, receiver?: OrderReceiver) => Promise<PlaceOrderResult>;
  completeGatewayPayment: (
    orderId: string,
    returnUrlOrResponse: string | Record<string, unknown>,
  ) => Promise<PlaceOrderResult>;
  cancelGatewayPayment: () => void;
  retryPayment: () => void;
  canCancel: (order: Order) => boolean;
  /** Resolves true when the server accepted the cancellation. */
  cancelOrder: (order: Order, reason?: string) => Promise<boolean>;
  reorder: (order: Order) => Promise<boolean>;
  /** Fetches one order with its tracking timeline (does not hijack the Home banner's active order). */
  openTracking: (orderId: string) => Promise<Order | null>;
  refreshActiveOrder: () => Promise<void>;
  clearActiveOrder: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  rateOrder: (orderId: string, rating: number, comment?: string) => Promise<void>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

const ORDERS_PAGE = 50;

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'getting-packed', 'on-the-way', 'arrived'];

/** What a gateway order was created from — a retry may only reuse it if nothing changed. */
function cartSignature(
  items: Array<{ productId: string; variantId?: string; quantity?: number }>,
  addressId: string,
  coupon: string | null | undefined,
  tip: number | undefined,
): string {
  const lines = items
    .map(i => `${i.productId}:${i.variantId || ''}:${i.quantity}`)
    .sort()
    .join('|');
  return [lines, addressId, coupon || '', tip || 0].join('#');
}

function paymentMethodType(method: PayMethod): PaymentMethodType {
  if (method === 'cod') return 'cash';
  if (method === 'wallet') return 'wallet';
  return 'upi';
}

export const OrdersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const cart = useCart();
  const { selectedAddressId } = useAddress();
  const { user } = useAuth();
  const userId = user?.id || '';
  const accountRef = useRef(userId);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [payState, setPayState] = useState<PayState>('idle');
  const [payError, setPayError] = useState('');
  const [gatewaySessionPayload, setGatewaySessionPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingGatewayOrderId, setPendingGatewayOrderId] = useState<string | null>(null);
  const [pendingGatewayTxnId, setPendingGatewayTxnId] = useState<string | null>(null);
  const placeIdempotencyKeyRef = useRef<string | null>(null);
  // Online order whose payment never completed — "Retry payment" reuses it
  // instead of creating a second pending order.
  const unpaidOnlineOrderRef = useRef<{ id: string; signature: string } | null>(null);

  const fetchOrdersPage = useCallback(async (page: number) => {
    const data = await ordersApi.getOrders({ page, limit: ORDERS_PAGE });
    return Array.isArray(data) ? data.map(toLocalOrder) : [];
  }, []);
  const ordersPager = usePager(fetchOrdersPage, ORDERS_PAGE, setOrders);
  const { firstPageLoaded: ordersFirstPage } = ordersPager;

  const loadOrders = useCallback(async () => {
    const forAccount = userId;
    if (!Storage.getItem('accessToken') || !forAccount) {
      if (accountRef.current === forAccount) setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchOrdersPage(1);
      if (accountRef.current !== forAccount) return;
      setOrders(list);
      ordersFirstPage(list.length);
    } catch {
      // Same account: keep the list already on screen. A different account's
      // failure must not leave the previous user's orders in place.
      if (accountRef.current !== forAccount) setOrders([]);
    } finally {
      if (accountRef.current === forAccount) setLoading(false);
    }
  }, [userId, fetchOrdersPage, ordersFirstPage]);

  const refreshActiveOrder = useCallback(async () => {
    const forAccount = userId;
    if (!Storage.getItem('accessToken') || !forAccount) {
      if (accountRef.current === forAccount) setActiveOrder(null);
      return;
    }
    try {
      const raw = await ordersApi.getActiveOrders();
      if (accountRef.current !== forAccount) return;
      setActiveOrder(raw ? toLocalOrder(raw) : null);
    } catch {
      if (accountRef.current !== forAccount) setActiveOrder(null);
    }
  }, [userId]);

  // Drop the previous account's orders immediately, then load. Responses that
  // arrive after another login are ignored.
  useEffect(() => {
    accountRef.current = userId;
    unpaidOnlineOrderRef.current = null;
    placeIdempotencyKeyRef.current = null;
    setOrders([]);
    setActiveOrder(null);
    if (!userId) return;
    loadOrders();
    refreshActiveOrder();
  }, [userId, loadOrders, refreshActiveOrder]);

  const placeOrder = useCallback(
    async (method: PayMethod, receiver?: OrderReceiver): Promise<PlaceOrderResult> => {
      if (payState === 'processing' || payState === 'awaiting_gateway') {
        return { success: false };
      }
      if (cart.items.length === 0) return { success: false, message: 'Your cart is empty' };
      if (!selectedAddressId) return { success: false, message: 'Please select a delivery address' };

      setPayState('processing');
      setPayError('');

      const payload: CreateOrderPayload = {
        items: cart.items.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        addressId: selectedAddressId,
        paymentMethodType: paymentMethodType(method),
        couponCode: cart.coupon ?? undefined,
        deliveryTip: cart.tip || undefined,
        customerName: receiver?.name?.trim() || undefined,
        customerPhone: receiver?.phone?.trim() || undefined,
      };

      const signature = cartSignature(payload.items, selectedAddressId, cart.coupon, cart.tip);

      try {
        // Retry of an online payment: reuse the order already created for this
        // exact cart while the server still holds it open and unpaid.
        if (method === 'online' && unpaidOnlineOrderRef.current) {
          const prev = unpaidOnlineOrderRef.current;
          let reusable: Order | null = null;
          try {
            const existing = toLocalOrder(await ordersApi.getOrder(prev.id));
            if (existing.status !== 'cancelled' && existing.paymentStatus !== 'paid') {
              if (prev.signature === signature) {
                reusable = existing;
              } else {
                // Cart changed since — retire the stale draft before placing anew.
                await ordersApi.cancelOrder(prev.id, 'Payment retried with a changed cart').catch(() => {});
              }
            }
          } catch {
            // fall through to a fresh order
          }
          unpaidOnlineOrderRef.current = null;
          if (reusable) {
            const session = await paymentsApi.createWorldlineSession({ orderId: reusable.id });
            if (!session.sessionPayload) {
              throw new Error('Payment gateway unavailable');
            }
            unpaidOnlineOrderRef.current = { id: reusable.id, signature };
            setPendingGatewayOrderId(reusable.id);
            setPendingGatewayTxnId(session.txnId || null);
            setGatewaySessionPayload(session.sessionPayload as Record<string, unknown>);
            setActiveOrder(reusable);
            setPayState('awaiting_gateway');
            return {
              success: true,
              order: reusable,
              needsGateway: true,
              sessionPayload: session.sessionPayload as Record<string, unknown>,
              gatewayOrderId: reusable.id,
              gatewayTxnId: session.txnId,
            };
          }
        }

        let raw: Awaited<ReturnType<typeof ordersApi.createOrder>> | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (!placeIdempotencyKeyRef.current) {
            placeIdempotencyKeyRef.current = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
          }
          try {
            raw = await ordersApi.createOrder(payload, {
              idempotencyKey: placeIdempotencyKeyRef.current,
            });
            break;
          } catch (err: unknown) {
            const msg = getErrorMessage(err, 'Could not place order. Please retry.');
            const duplicateNumber =
              getErrorCode(err) === 'DUPLICATE_KEY' ||
              /orderNumber already exists|order number already exists|E11000|duplicate key/i.test(msg);
            if (duplicateNumber && attempt === 0) {
              placeIdempotencyKeyRef.current = null;
              continue;
            }
            throw err;
          }
        }
        if (!raw) return { success: false, message: 'Could not place order. Please retry.' };
        placeIdempotencyKeyRef.current = null;
        const order = toLocalOrder(raw);

        if (method === 'online') {
          unpaidOnlineOrderRef.current = { id: order.id, signature };
          const session = await paymentsApi.createWorldlineSession({ orderId: order.id });
          if (!session.sessionPayload) {
            throw new Error('Payment gateway unavailable');
          }
          setPendingGatewayOrderId(order.id);
          setPendingGatewayTxnId(session.txnId || null);
          setGatewaySessionPayload(session.sessionPayload as Record<string, unknown>);
          setActiveOrder(order);
          setPayState('awaiting_gateway');
          return {
            success: true,
            order,
            needsGateway: true,
            sessionPayload: session.sessionPayload as Record<string, unknown>,
            gatewayOrderId: order.id,
            gatewayTxnId: session.txnId,
          };
        }

        setOrders(prev => [order, ...prev]);
        setActiveOrder(order);
        setPayState('success');
        await cart.clearCart();
        return { success: true, order };
      } catch (err: unknown) {
        const msg = getErrorMessage(err, 'Could not place order. Please retry.');
        setPayState('error');
        setPayError(msg);
        // Duplicate-key / conflict responses are safe to retry with a fresh key.
        if (/orderNumber already exists|duplicate|E11000|conflict/i.test(msg)) {
          placeIdempotencyKeyRef.current = null;
        }
        // Keep idempotency key so a retry after timeout cannot create a second order.
        return { success: false, message: msg };
      }
    },
    [payState, cart, selectedAddressId],
  );

  const completeGatewayPayment = useCallback(
    async (orderId: string, returnUrlOrResponse: string | Record<string, unknown>): Promise<PlaceOrderResult> => {
      setPayState('processing');
      setPayError('');
      try {
        const response =
          typeof returnUrlOrResponse === 'string' ? parseReturnUrl(returnUrlOrResponse) : returnUrlOrResponse;
        const bridgeHint =
          typeof returnUrlOrResponse === 'string' ? presentationMessageFromReturn(response) : '';

        // API return already verified via processGatewayReturn and redirected to a
        // presentation URL (`paynimo_bridge=1`). Posting that URL to /complete can
        // overwrite a good payment with hash_mismatch / failed — only complete when
        // we still have raw gateway crypto fields.
        if (hasWorldlineGatewayPayload(response) || response.msg || response.paymentMethod) {
          await paymentsApi.completeWorldlinePayment({
            orderId,
            txnId: pendingGatewayTxnId || undefined,
            response,
          });
        } else {
          // Give the server return handler a moment to finish before polling.
          await new Promise<void>(r => setTimeout(() => r(), 800));
        }

        let paid = false;
        let failed = false;
        for (let i = 0; i < 10; i += 1) {
          const status = await paymentsApi.getWorldlineStatus(orderId);
          if (isWorldlinePaidStatus(status)) {
            paid = true;
            break;
          }
          if (isWorldlineFailedStatus(status)) {
            failed = true;
            break;
          }
          if (!isWorldlinePendingStatus(status)) break;
          await new Promise<void>(r => setTimeout(() => r(), 1500));
        }

        const detail = await ordersApi.getOrder(orderId);
        const order = toLocalOrder(detail);
        if (paid) order.paymentStatus = 'paid';

        setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
        setActiveOrder(order);
        setGatewaySessionPayload(null);
        setPendingGatewayOrderId(null);
        setPendingGatewayTxnId(null);
        setPayState(paid ? 'success' : 'failed');
        if (paid) unpaidOnlineOrderRef.current = null;
        if (!paid) {
          const msg =
            bridgeHint ||
            (failed
              ? 'Payment was not completed. You can retry from checkout.'
              : 'Payment was not confirmed yet. Check Orders in a moment, or retry.');
          setPayError(msg);
          return { success: false, message: msg, order };
        }
        await cart.clearCart();
        return { success: true, order };
      } catch (err: unknown) {
        const msg = getErrorMessage(err, 'Payment confirmation failed');
        setPayState('failed');
        setPayError(msg);
        return { success: false, message: msg };
      }
    },
    [cart, pendingGatewayTxnId],
  );

  const cancelGatewayPayment = useCallback(() => {
    if (pendingGatewayOrderId && pendingGatewayTxnId) {
      paymentsApi
        .abortWorldlinePayment({
          orderId: pendingGatewayOrderId,
          txnId: pendingGatewayTxnId,
          reason: 'user_cancelled',
        })
        .catch(() => {});
    }
    setGatewaySessionPayload(null);
    setPendingGatewayOrderId(null);
    setPendingGatewayTxnId(null);
    placeIdempotencyKeyRef.current = null;
    setPayState('idle');
    setPayError('');
  }, [pendingGatewayOrderId, pendingGatewayTxnId]);

  const retryPayment = useCallback(() => {
    setPayState('idle');
    setPayError('');
    setGatewaySessionPayload(null);
  }, []);

  const canCancel = useCallback((order: Order) => ['pending', 'confirmed'].includes(order.status), []);

  const cancelOrder = useCallback(async (order: Order, reason?: string): Promise<boolean> => {
    if (!order.id) {
      showToast('Could not cancel, try again', 'err');
      console.warn('[orders] cancel attempted without an order id', order.orderNumber);
      return false;
    }
    try {
      await ordersApi.cancelOrder(order.id, reason);
      const update = (o: Order): Order =>
        o.id === order.id
          ? {
              ...o,
              status: 'cancelled' as OrderStatus,
              timeline: [...o.timeline, { status: 'cancelled', timestamp: new Date().toISOString() }],
            }
          : o;
      setOrders(prev => prev.map(update));
      setActiveOrder(prev => (prev?.id === order.id ? null : prev));
      // Only prepaid orders have anything to refund (not COD).
      showToast(order.paymentStatus === 'paid' ? 'Order cancelled · refund initiated' : 'Order cancelled');
      return true;
    } catch (err) {
      // Surface the backend's own reason (policy window, status, daily cap)
      // instead of a blanket retry prompt.
      showToast(getErrorMessage(err, 'Could not cancel, try again'), 'err');
      console.warn('[orders] cancel failed', err);
      return false;
    }
  }, []);

  const reorder = useCallback(
    async (order: Order) => {
      try {
        await ordersApi.reorder(order.id);
        await cart.refreshCart();
        showToast('Items added to cart');
        return true;
      } catch {
        showToast('Could not reorder items', 'err');
        return false;
      }
    },
    [cart],
  );

  const openTracking = useCallback(async (orderId: string): Promise<Order | null> => {
    try {
      const [detail, tracking] = await Promise.all([
        ordersApi.getOrder(orderId),
        ordersApi.getTracking(orderId),
      ]);
      const order = toLocalOrder(detail);
      if (tracking.timeline?.length) {
        order.timeline = tracking.timeline.map(t => ({
          status: t.status,
          timestamp: t.timestamp || new Date().toISOString(),
        }));
      }
      // Keep the Home banner's active order fresh only when this is that order
      // (or nothing is active yet and this one is in progress).
      setActiveOrder(prev =>
        prev?.id === order.id || (!prev && ACTIVE_STATUSES.includes(order.status)) ? order : prev,
      );
      setOrders(prev => prev.map(o => (o.id === order.id ? { ...o, status: order.status } : o)));
      return order;
    } catch {
      return null;
    }
  }, []);

  const rateOrder = useCallback(async (orderId: string, rating: number, comment?: string) => {
    if (orders.find(o => o.id === orderId)?.reviewAsked) {
      throw new Error('You have already rated this order');
    }
    await ordersApi.rateOrder(orderId, { rating, comment });
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, reviewAsked: true } : o)),
    );
  }, [orders]);

  const clearActiveOrder = useCallback(() => setActiveOrder(null), []);

  const value = useMemo<OrdersContextType>(
    () => ({
      orders,
      loading,
      activeOrder,
      payState,
      payError,
      gatewaySessionPayload,
      pendingGatewayOrderId,
      placeOrder,
      completeGatewayPayment,
      cancelGatewayPayment,
      retryPayment,
      canCancel,
      cancelOrder,
      reorder,
      openTracking,
      refreshActiveOrder,
      clearActiveOrder,
      hasMore: ordersPager.hasMore,
      loadingMore: ordersPager.loadingMore,
      loadMore: ordersPager.loadMore,
      refresh: loadOrders,
      rateOrder,
    }),
    [
      orders,
      loading,
      activeOrder,
      payState,
      payError,
      gatewaySessionPayload,
      pendingGatewayOrderId,
      placeOrder,
      completeGatewayPayment,
      cancelGatewayPayment,
      retryPayment,
      canCancel,
      cancelOrder,
      reorder,
      openTracking,
      refreshActiveOrder,
      clearActiveOrder,
      ordersPager.hasMore,
      ordersPager.loadingMore,
      ordersPager.loadMore,
      loadOrders,
      rateOrder,
    ],
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};

export const useOrders = () => {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used within an OrdersProvider');
  return ctx;
};
