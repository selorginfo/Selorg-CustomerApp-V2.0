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
  canReuseUnpaidOnlineAttempt,
  isPayMethod,
  settlementKind,
  shouldResetPayStateForNewCheckout,
  shouldSkipPrepareFreshPaymentSession,
  unpaidBelongsToCurrentCart,
  wantedSettlement,
} from '../utils/paymentAttempt';
import {
  parseReturnUrl,
  isWorldlinePaidStatus,
  isWorldlinePendingStatus,
  isWorldlineFailedStatus,
  presentationMessageFromReturn,
  shouldSubmitGatewayResponse,
  gatewayDismissAction,
  retryWhileHeld,
  switchFromOnlineDecision,
  type GatewayDismissAction,
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
  /** Gateway has not reached a terminal status. The order must stay open. */
  pendingVerification?: boolean;
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
  /** Method that produced the current failure. A later COD/wallet choice must not inherit it. */
  failedMethod: PayMethod | null;
  gatewaySessionPayload: Record<string, unknown> | null;
  /** Order the open Worldline session belongs to; survives activeOrder refreshes. */
  pendingGatewayOrderId: string | null;
  placeOrder: (method: PayMethod, receiver?: OrderReceiver) => Promise<PlaceOrderResult>;
  /** Open the gateway for an unpaid online order. Does not create another order. */
  payExistingOrder: (orderId: string) => Promise<PlaceOrderResult>;
  completeGatewayPayment: (
    orderId: string,
    returnUrlOrResponse: string | Record<string, unknown>,
  ) => Promise<PlaceOrderResult>;
  cancelGatewayPayment: (options?: { bankAuthenticationStarted?: boolean }) => Promise<GatewayDismissAction>;
  retryPayment: () => void;
  /**
   * Start a brand-new checkout payment (no orderId resume). Clears leftover
   * gateway UI and terminal payState from a previous finished order. Keeps an
   * unpaid online attempt only when it still matches this cart.
   */
  prepareFreshPaymentSession: (options?: {
    currentCartSignature?: string;
    resumeOrderId?: string;
  }) => void;
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
  method: PayMethod,
): string {
  const lines = items
    .map(i => `${i.productId}:${i.variantId || ''}:${i.quantity}`)
    .sort()
    .join('|');
  // Payment method is part of the key so a COD retry cannot replay the failed UPI order.
  return [lines, addressId, coupon || '', tip || 0, method].join('#');
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
  const [payState, setPayStateRaw] = useState<PayState>('idle');
  const payStateRef = useRef<PayState>('idle');
  const setPayState = useCallback((next: PayState) => {
    payStateRef.current = next;
    setPayStateRaw(next);
  }, []);
  const [payError, setPayError] = useState('');
  const [failedMethod, setFailedMethod] = useState<PayMethod | null>(null);
  const [gatewaySessionPayload, setGatewaySessionPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingGatewayOrderId, setPendingGatewayOrderId] = useState<string | null>(null);
  const [pendingGatewayTxnId, setPendingGatewayTxnId] = useState<string | null>(null);
  const placeIdempotencyKeyRef = useRef<string | null>(null);
  const placeSignatureRef = useRef<string | null>(null);
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
    placeSignatureRef.current = null;
    setFailedMethod(null);
    setPayState('idle');
    setPayError('');
    setOrders([]);
    setActiveOrder(null);
    if (!userId) return;
    loadOrders();
    refreshActiveOrder();
  }, [userId, loadOrders, refreshActiveOrder]);

  const clearGatewayUi = useCallback(() => {
    setGatewaySessionPayload(null);
    setPendingGatewayOrderId(null);
    setPendingGatewayTxnId(null);
  }, []);

  // Keep cart/address in refs so prepareFreshPaymentSession stays referentially
  // stable — an unstable callback re-fires PaymentScreen's useFocusEffect and
  // wipes an in-flight Paynimo session (Pay Online appears to reload forever).
  const cartRef = useRef(cart);
  cartRef.current = cart;
  const selectedAddressIdRef = useRef(selectedAddressId);
  selectedAddressIdRef.current = selectedAddressId;

  const prepareFreshPaymentSession = useCallback(
    (options?: { currentCartSignature?: string; resumeOrderId?: string }) => {
      // Never wipe an in-flight create/Paynimo session. Spurious focus re-entry
      // (e.g. wallet reload recreating a useFocusEffect callback) used to call
      // this while awaiting_gateway and bounce the shopper back to method picker.
      if (shouldSkipPrepareFreshPaymentSession(payStateRef.current)) {
        return;
      }
      clearGatewayUi();
      setPayError('');
      setFailedMethod(null);
      if (shouldResetPayStateForNewCheckout(payStateRef.current)) {
        setPayState('idle');
      }
      if (options?.resumeOrderId) {
        const unpaid = unpaidOnlineOrderRef.current;
        if (unpaid && unpaid.id !== options.resumeOrderId) {
          unpaidOnlineOrderRef.current = null;
        }
        return;
      }
      const unpaid = unpaidOnlineOrderRef.current;
      if (!unpaid) return;
      const currentCart = cartRef.current;
      const addressId = selectedAddressIdRef.current;
      let sig = options?.currentCartSignature;
      if (!sig && addressId && currentCart.items.length > 0) {
        sig = cartSignature(
          currentCart.items.map(i => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          addressId,
          currentCart.coupon,
          currentCart.tip,
          'online',
        );
      }
      if (sig && !unpaidBelongsToCurrentCart(unpaid, sig)) {
        // Previous order's gateway attempt — detach only. Do not cancel that order here.
        unpaidOnlineOrderRef.current = null;
        placeIdempotencyKeyRef.current = null;
      }
    },
    [clearGatewayUi],
  );

  const placeOrder = useCallback(
    async (method: PayMethod, receiver?: OrderReceiver): Promise<PlaceOrderResult> => {
      const currentPayState = payStateRef.current;
      // A prior order left payState at `success`/`failed`. Never block a new cart.
      if (shouldResetPayStateForNewCheckout(currentPayState)) {
        setPayState('idle');
        clearGatewayUi();
      }
      // COD / wallet may run while a WebView session is still marked awaiting —
      // placeOrder clears that session below. Online must not double-open.
      if (payStateRef.current === 'processing') {
        return { success: false };
      }
      if (method === 'online' && payStateRef.current === 'awaiting_gateway') {
        return { success: false };
      }
      if (cart.items.length === 0) return { success: false, message: 'Your cart is empty' };
      if (!selectedAddressId) return { success: false, message: 'Please select a delivery address' };

      if (!isPayMethod(method)) {
        const msg = 'Choose a payment method and try again.';
        setPayState('error');
        setPayError(msg);
        setFailedMethod(null);
        return { success: false, message: msg };
      }

      if (!Storage.getItem('accessToken')) {
        const msg = 'Please sign in again to place this order.';
        setPayState('error');
        setPayError(msg);
        setFailedMethod(method);
        return { success: false, message: msg };
      }

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

      const signature = cartSignature(payload.items, selectedAddressId, cart.coupon, cart.tip, method);
      if (placeSignatureRef.current && placeSignatureRef.current !== signature) {
        placeIdempotencyKeyRef.current = null;
      }
      placeSignatureRef.current = signature;

      setPayState('processing');
      setPayError('');
      setFailedMethod(null);

      // COD and wallet never go through Worldline.
      if (method !== 'online') {
        const staleOnline = unpaidOnlineOrderRef.current;
        if (staleOnline?.id && !unpaidBelongsToCurrentCart(staleOnline, signature)) {
          // New cart after a previous order — detach gateway state only.
          unpaidOnlineOrderRef.current = null;
          placeIdempotencyKeyRef.current = null;
          clearGatewayUi();
        } else if (staleOnline?.id) {
          let status: Awaited<ReturnType<typeof paymentsApi.getWorldlineStatus>> | null = null;
          let decision: ReturnType<typeof switchFromOnlineDecision> = 'clear_and_continue';
          try {
            status = await paymentsApi.getWorldlineStatus(staleOnline.id, { timeoutMs: 8000 });
            decision = switchFromOnlineDecision(status, true);
          } catch {
            decision = switchFromOnlineDecision(null, false);
          }
          if (decision === 'already_paid') {
            unpaidOnlineOrderRef.current = null;
            clearGatewayUi();
            try {
              const existing = toLocalOrder(await ordersApi.getOrder(staleOnline.id));
              existing.paymentStatus = 'paid';
              setOrders(prev => [existing, ...prev.filter(o => o.id !== existing.id)]);
              setActiveOrder(existing);
              setPayState('success');
              void cart.clearCart();
              return { success: true, order: existing };
            } catch {
              setPayState('idle');
              return {
                success: false,
                message: 'This order is already paid. Check Orders before paying again.',
              };
            }
          }
          if (decision === 'block_other_method') {
            clearGatewayUi();
            const msg =
              'A card or UPI payment is still being verified. Check Orders before choosing another method.';
            setPayState('error');
            setPayError(msg);
            setFailedMethod('online');
            return { success: false, message: msg, pendingVerification: true };
          }
          const latest = status?.latestPayment as { txnId?: string } | undefined;
          const txnId = pendingGatewayTxnId || latest?.txnId || (status?.txnId as string | undefined) || null;
          if (txnId) {
            await paymentsApi
              .abortWorldlinePayment({
                orderId: staleOnline.id,
                txnId: String(txnId),
                reason: 'switched_payment_method',
              })
              .catch(() => {});
          }
          await ordersApi.cancelOrder(staleOnline.id, 'Switched to another payment method').catch(() => {});
          unpaidOnlineOrderRef.current = null;
          placeIdempotencyKeyRef.current = null;
          clearGatewayUi();
        } else {
          clearGatewayUi();
        }
      }

      try {
        // Retry of an online payment: reuse the order already created for this
        // exact cart while the server still holds it open and unpaid.
        if (method === 'online' && unpaidOnlineOrderRef.current) {
          const prev = unpaidOnlineOrderRef.current;
          if (!canReuseUnpaidOnlineAttempt(prev, signature)) {
            // Different cart than the leftover attempt — start a new online order.
            unpaidOnlineOrderRef.current = null;
          }
        }
        if (method === 'online' && unpaidOnlineOrderRef.current) {
          const prev = unpaidOnlineOrderRef.current;
          let reusable: Order | null = null;
          try {
            const existing = toLocalOrder(await ordersApi.getOrder(prev.id));
            if (existing.paymentStatus === 'paid') {
              reusable = existing;
            } else if (existing.status !== 'cancelled') {
              if (prev.signature === signature) {
                reusable = existing;
              } else {
                let decision: ReturnType<typeof retryWhileHeld> = 'reuse_online';
                try {
                  decision = retryWhileHeld(await paymentsApi.getWorldlineStatus(prev.id), true, 'online');
                } catch {
                  decision = retryWhileHeld(null, false, 'online');
                }
                if (decision === 'already_paid') {
                  reusable = existing;
                } else if (decision === 'clear_and_continue') {
                  await ordersApi.cancelOrder(prev.id, 'Payment retried with a changed cart').catch(() => {});
                } else {
                  const msg = 'A payment is still open for the previous cart. Check Orders before changing it.';
                  setPayState('error');
                  setPayError(msg);
                  setFailedMethod('online');
                  return { success: false, message: msg, pendingVerification: true };
                }
              }
            }
          } catch {
            const msg = 'Could not check the open payment. Check Orders before paying again.';
            setPayState('error');
            setPayError(msg);
            setFailedMethod('online');
            return { success: false, message: msg, pendingVerification: true };
          }
          unpaidOnlineOrderRef.current = null;
          if (reusable) {
            let alreadyPaid = reusable.paymentStatus === 'paid';
            if (!alreadyPaid) {
              try {
                alreadyPaid = isWorldlinePaidStatus(await paymentsApi.getWorldlineStatus(reusable.id));
              } catch {
                alreadyPaid = false;
              }
            }
            if (alreadyPaid) {
              const paidOrder = { ...reusable, paymentStatus: 'paid' as const };
              setOrders(current => [paidOrder, ...current.filter(o => o.id !== paidOrder.id)]);
              setActiveOrder(paidOrder);
              setPayState('success');
              void cart.clearCart();
              return { success: true, order: paidOrder };
            }
            unpaidOnlineOrderRef.current = { id: reusable.id, signature };
            const session = await paymentsApi.createWorldlineSession({
              orderId: reusable.id,
              paymentMode: 'all',
            });
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
            const kind = settlementKind(raw);
            const wanted = wantedSettlement(method);
            if (kind !== 'unknown' && kind !== wanted) {
              // Stored idempotency response from the failed UPI order. Do not
              // present that order as this COD or wallet payment.
              placeIdempotencyKeyRef.current = null;
              raw = null;
              if (attempt === 0) continue;
              throw new Error(
                method === 'cod'
                  ? 'Cash on delivery could not be started. Please try again.'
                  : method === 'wallet'
                    ? 'Wallet payment could not be started. Please try again.'
                    : 'Could not place order. Please retry.',
              );
            }
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
        if (!raw) {
          const msg = 'Could not place order. Please retry.';
          setPayState('error');
          setPayError(msg);
          setFailedMethod(method);
          return { success: false, message: msg };
        }
        placeIdempotencyKeyRef.current = null;
        const order = toLocalOrder(raw);

        if (method === 'wallet') {
          const status = String(raw.paymentStatus || '').toLowerCase();
          const covered =
            (status === 'paid' || (settlementKind(raw) === 'wallet' && status !== 'failed')) &&
            raw.requiresOnlinePayment !== true;
          if (!covered) {
            const msg = raw.requiresOnlinePayment
              ? 'Your wallet did not cover this order. Add money or choose another method.'
              : 'Wallet payment was not completed. Your balance was not charged.';
            setPayState('error');
            setPayError(msg);
            setFailedMethod('wallet');
            return { success: false, message: msg, order };
          }
        }

        if (method === 'cod' && String(raw.paymentStatus || '').toLowerCase() === 'failed') {
          const msg = 'Cash on delivery was not accepted. Please try again.';
          setPayState('error');
          setPayError(msg);
          setFailedMethod('cod');
          return { success: false, message: msg, order };
        }

        if (method === 'online') {
          unpaidOnlineOrderRef.current = { id: order.id, signature };
          const session = await paymentsApi.createWorldlineSession({
            orderId: order.id,
            paymentMode: 'all',
          });
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
        void cart.clearCart();
        return { success: true, order };
      } catch (err: unknown) {
        const msg = getErrorMessage(err, 'Could not place order. Please retry.');
        setPayState('error');
        setPayError(msg);
        setFailedMethod(method);
        // Duplicate-key / conflict responses are safe to retry with a fresh key.
        if (/orderNumber already exists|duplicate|E11000|conflict/i.test(msg)) {
          placeIdempotencyKeyRef.current = null;
        }
        // Keep idempotency key so a retry after timeout cannot create a second order.
        return { success: false, message: msg };
      }
    },
    [cart, selectedAddressId, pendingGatewayTxnId, clearGatewayUi],
  );

  const payExistingOrder = useCallback(
    async (orderId: string): Promise<PlaceOrderResult> => {
      const currentPayState = payStateRef.current;
      if (
        currentPayState === 'processing' ||
        currentPayState === 'awaiting_gateway' ||
        currentPayState === 'success'
      ) {
        return { success: false };
      }
      if (!orderId) return { success: false, message: 'Order not found' };
      setPayState('processing');
      setPayError('');
      setFailedMethod(null);
      try {
        const existing = toLocalOrder(await ordersApi.getOrder(orderId));
        if (!existing.id) throw new Error('Order not found');
        if (existing.status === 'cancelled') {
          throw new Error('This order was cancelled. Place a new order to pay.');
        }
        if (existing.paymentStatus === 'paid' || existing.paymentStatus === 'cod_pending') {
          setActiveOrder(existing);
          setPayState('success');
          return { success: true, order: existing };
        }
        if (existing.method !== 'online') {
          throw new Error('This order does not use online payment.');
        }
        const session = await paymentsApi.createWorldlineSession({
          orderId: existing.id,
          paymentMode: 'all',
        });
        if (!session.sessionPayload) throw new Error('Payment gateway unavailable');
        unpaidOnlineOrderRef.current = { id: existing.id, signature: `resume:${existing.id}` };
        setPendingGatewayOrderId(existing.id);
        setPendingGatewayTxnId(session.txnId || null);
        setGatewaySessionPayload(session.sessionPayload as Record<string, unknown>);
        setActiveOrder(existing);
        setPayState('awaiting_gateway');
        return {
          success: true,
          order: existing,
          needsGateway: true,
          sessionPayload: session.sessionPayload as Record<string, unknown>,
          gatewayOrderId: existing.id,
          gatewayTxnId: session.txnId,
        };
      } catch (err: unknown) {
        const msg = getErrorMessage(err, 'Could not start online payment. Please retry.');
        setPayState('error');
        setPayError(msg);
        setFailedMethod('online');
        return { success: false, message: msg };
      }
    },
    [],
  );

  const completeGatewayPayment = useCallback(
    async (orderId: string, returnUrlOrResponse: string | Record<string, unknown>): Promise<PlaceOrderResult> => {
      const response =
        typeof returnUrlOrResponse === 'string' ? parseReturnUrl(returnUrlOrResponse) : returnUrlOrResponse;
      const bridgeHint =
        typeof returnUrlOrResponse === 'string' ? presentationMessageFromReturn(response) : '';
      const submittingGateway = shouldSubmitGatewayResponse(response);

      // Keep the WebView mounted while we only poll status. Switching to
      // `processing` unmounts Paynimo and can cancel an in-flight bank return POST.
      if (submittingGateway) {
        setPayState('processing');
      }
      setPayError('');
      try {
        // A redirect (`paynimo_bridge=1` or a bare return URL) is not a capture.
        // Posting it to /complete can overwrite a good payment. Only raw gateway
        // crypto fields are submitted. Paid is decided by /worldline/status.
        if (submittingGateway) {
          await paymentsApi.completeWorldlinePayment({
            orderId,
            txnId: pendingGatewayTxnId || undefined,
            response,
          });
        } else {
          // The return POST is handled by the API. Give that a moment, then poll.
          await new Promise<void>(r => setTimeout(() => r(), 800));
        }

        let paid = false;
        let failed = false;
        let sawStatus = false;
        for (let i = 0; i < 12; i += 1) {
          try {
            const status = await paymentsApi.getWorldlineStatus(orderId, { timeoutMs: 12000 });
            sawStatus = true;
            if (isWorldlinePaidStatus(status)) {
              paid = true;
              break;
            }
            if (isWorldlineFailedStatus(status)) {
              failed = true;
              break;
            }
            if (!isWorldlinePendingStatus(status)) break;
          } catch {
            // Network blip — keep polling; never treat silence as decline.
          }
          await new Promise<void>(r => setTimeout(() => r(), 1500));
        }

        let order: Order | undefined;
        try {
          const detail = await ordersApi.getOrder(orderId);
          order = toLocalOrder(detail);
          if (paid) order.paymentStatus = 'paid';
          setOrders(prev => [order!, ...prev.filter(o => o.id !== order!.id)]);
          setActiveOrder(order);
        } catch {
          if (paid) {
            // Status already confirmed paid — do not fail the customer on a detail fetch blip.
            setPayState('success');
            setFailedMethod(null);
            setGatewaySessionPayload(null);
            setPendingGatewayOrderId(null);
            setPendingGatewayTxnId(null);
            unpaidOnlineOrderRef.current = null;
            void cart.clearCart();
            return { success: true, order: { id: orderId, paymentStatus: 'paid' } as Order };
          }
        }

        setGatewaySessionPayload(null);
        setPendingGatewayOrderId(null);
        setPendingGatewayTxnId(null);
        if (paid) {
          unpaidOnlineOrderRef.current = null;
          setPayState('success');
          setFailedMethod(null);
          void cart.clearCart();
          return { success: true, order };
        }
        if (!sawStatus || !failed) {
          // Still created, pending, unknown, or status unreachable. Never hard-fail.
          if (!unpaidOnlineOrderRef.current) {
            unpaidOnlineOrderRef.current = { id: orderId, signature: `resume:${orderId}` };
          }
          setPayState('idle');
          setFailedMethod(null);
          setPayError('');
          return {
            success: false,
            pendingVerification: true,
            message: 'Payment is still being verified. Check Orders before paying again.',
            order,
          };
        }
        setPayState('failed');
        setFailedMethod('online');
        const msg = bridgeHint || 'Payment was not completed. You can retry from checkout.';
        setPayError(msg);
        return { success: false, message: msg, order };
      } catch (err: unknown) {
        // Outer errors (complete POST, unexpected) must not look like a bank decline.
        if (!unpaidOnlineOrderRef.current) {
          unpaidOnlineOrderRef.current = { id: orderId, signature: `resume:${orderId}` };
        }
        setPayState('idle');
        setPayError('');
        setFailedMethod(null);
        return {
          success: false,
          pendingVerification: true,
          message: getErrorMessage(err, 'Payment is still being verified. Check Orders before paying again.'),
        };
      }
    },
    [cart, pendingGatewayTxnId],
  );

  const cancelGatewayPayment = useCallback(
    async (options?: { bankAuthenticationStarted?: boolean }): Promise<GatewayDismissAction> => {
      const orderId = pendingGatewayOrderId;
      const txnId = pendingGatewayTxnId;
      let action: GatewayDismissAction = orderId ? 'hold' : 'abort';
      if (orderId) {
        try {
          const status = await paymentsApi.getWorldlineStatus(orderId);
          action = gatewayDismissAction(status, {
            statusKnown: true,
            bankAuthenticationStarted: !!options?.bankAuthenticationStarted,
          });
        } catch {
          action = 'hold';
        }
      }
      if (action === 'abort' && orderId && txnId) {
        try {
          const abortResult = await paymentsApi.abortWorldlinePayment({
            orderId,
            txnId,
            reason: 'user_cancelled',
          });
          // Backend may refuse to void when Worldline still shows capture/pending.
          if (abortResult?.settledFromInquiry) {
            action = 'finish_paid';
          } else if (abortResult?.held || abortResult?.aborted === false) {
            action = 'hold';
          }
        } catch {
          // The abort did not land. Leave the order open so a capture can still reconcile.
          action = 'hold';
        }
      }
      setGatewaySessionPayload(null);
      setPendingGatewayOrderId(null);
      setPendingGatewayTxnId(null);
      if (action === 'abort') {
        unpaidOnlineOrderRef.current = null;
        placeIdempotencyKeyRef.current = null;
      } else if (action === 'hold' && orderId) {
        // Keep the unpaid attempt so status polling / retry can still settle a debit.
        if (!unpaidOnlineOrderRef.current) {
          unpaidOnlineOrderRef.current = { id: orderId, signature: `resume:${orderId}` };
        }
      }
      if (action !== 'finish_paid') {
        setPayState('idle');
        setPayError('');
        setFailedMethod(null);
      }
      return action;
    },
    [pendingGatewayOrderId, pendingGatewayTxnId],
  );

  const retryPayment = useCallback(() => {
    setPayState('idle');
    setPayError('');
    setFailedMethod(null);
    // Drop the WebView / session UI. Keep unpaidOnlineOrderRef so an online
    // retry can reuse the same order; COD/wallet clear that ref in placeOrder.
    clearGatewayUi();
  }, [clearGatewayUi]);

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
      setOrders(prev => {
        const existing = prev.find(o => o.id === order.id);
        if (existing) {
          return prev.map(o => (o.id === order.id ? { ...o, ...order, timeline: order.timeline } : o));
        }
        return [order, ...prev];
      });
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
      failedMethod,
      gatewaySessionPayload,
      pendingGatewayOrderId,
      placeOrder,
      payExistingOrder,
      completeGatewayPayment,
      cancelGatewayPayment,
      retryPayment,
      prepareFreshPaymentSession,
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
      failedMethod,
      gatewaySessionPayload,
      pendingGatewayOrderId,
      placeOrder,
      payExistingOrder,
      completeGatewayPayment,
      cancelGatewayPayment,
      retryPayment,
      prepareFreshPaymentSession,
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
