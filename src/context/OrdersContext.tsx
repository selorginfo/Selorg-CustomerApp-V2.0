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
import { toLocalOrder } from '../utils/mappers';
import { showToast } from '../utils/toast';
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
  placeOrder: (method: PayMethod, receiver?: OrderReceiver) => Promise<PlaceOrderResult>;
  completeGatewayPayment: (
    orderId: string,
    returnUrlOrResponse: string | Record<string, unknown>,
  ) => Promise<PlaceOrderResult>;
  cancelGatewayPayment: () => void;
  retryPayment: () => void;
  canCancel: (order: Order) => boolean;
  cancelOrder: (order: Order, reason?: string) => Promise<void>;
  reorder: (order: Order) => Promise<boolean>;
  openTracking: (orderId: string) => Promise<Order | null>;
  clearActiveOrder: () => void;
  refresh: () => Promise<void>;
  rateOrder: (orderId: string, rating: number, comment?: string) => Promise<void>;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

function paymentMethodType(method: PayMethod): PaymentMethodType {
  if (method === 'cod') return 'cash';
  if (method === 'wallet') return 'wallet';
  return 'upi';
}

export const OrdersProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const cart = useCart();
  const { selectedAddressId } = useAddress();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [payState, setPayState] = useState<PayState>('idle');
  const [payError, setPayError] = useState('');
  const [gatewaySessionPayload, setGatewaySessionPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingGatewayOrderId, setPendingGatewayOrderId] = useState<string | null>(null);
  const [pendingGatewayTxnId, setPendingGatewayTxnId] = useState<string | null>(null);
  const placeIdempotencyKeyRef = useRef<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!Storage.getItem('accessToken')) {
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const data = await ordersApi.getOrders({ limit: 50 });
      setOrders(Array.isArray(data) ? data.map(toLocalOrder) : []);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

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

      try {
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

  const cancelOrder = useCallback(async (order: Order, reason?: string) => {
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
      showToast('Order cancelled · refund initiated');
    } catch {
      showToast('Could not cancel, try again', 'err');
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
      setActiveOrder(order);
      return order;
    } catch {
      return null;
    }
  }, []);

  const rateOrder = useCallback(async (orderId: string, rating: number, comment?: string) => {
    await ordersApi.rateOrder(orderId, { rating, comment });
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, reviewAsked: true } : o)),
    );
  }, []);

  const clearActiveOrder = useCallback(() => setActiveOrder(null), []);

  const value = useMemo<OrdersContextType>(
    () => ({
      orders,
      loading,
      activeOrder,
      payState,
      payError,
      gatewaySessionPayload,
      placeOrder,
      completeGatewayPayment,
      cancelGatewayPayment,
      retryPayment,
      canCancel,
      cancelOrder,
      reorder,
      openTracking,
      clearActiveOrder,
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
      placeOrder,
      completeGatewayPayment,
      cancelGatewayPayment,
      retryPayment,
      canCancel,
      cancelOrder,
      reorder,
      openTracking,
      clearActiveOrder,
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
