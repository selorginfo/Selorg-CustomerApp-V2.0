import SelorgApi from '../api';

export type PaymentMethodType = 'card' | 'upi' | 'cash' | 'wallet' | 'digital';

export type CreateOrderPayload = {
  items: Array<{
    productId: string;
    variantId?: string;
    quantity?: number;
  }>;
  addressId: string;
  paymentMethodId?: string;
  paymentMethodType?: PaymentMethodType;
  couponCode?: string;
  deliveryTip?: number;
  deliveryNotes?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
};

export interface ApiOrder {
  _id: string;
  orderNumber?: string;
  status?: string;
  paymentStatus?: string;
  paymentMethodType?: string;
  items?: Array<Record<string, unknown>>;
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  deliveryTip?: number;
  total?: number;
  addressId?: string;
  couponCode?: string;
  createdAt?: string;
  timeline?: Array<{ status: string; timestamp?: string; createdAt?: string }>;
  [key: string]: unknown;
}

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface OrderTracking {
  status?: string;
  timeline?: Array<{ status: string; timestamp?: string; note?: string }>;
  /** Legacy/compat field — prefer deliveryTimeMinutes from backend. */
  etaMinutes?: number;
  deliveryTimeMinutes?: number | null;
  estimatedDelivery?: string;
  deliveryAddressLine?: string;
  rider?: { name?: string; phone?: string };
  deliveryPartner?: {
    id?: string;
    name?: string;
    phone?: string | null;
    photoUri?: string | null;
    vehicleType?: string | null;
    rating?: number | null;
  };
  riderLocation?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    heading?: number | null;
    recordedAt?: string;
  };
  destination?: MapPoint;
  storeLocation?: MapPoint & { name?: string };
  [key: string]: unknown;
}

export interface OrderInvoice {
  invoiceNumber?: string;
  orderNumber?: string;
  items?: Array<Record<string, unknown>>;
  subtotal?: number;
  tax?: number;
  total?: number;
  [key: string]: unknown;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

type OrderListPayload<T> = T[] | {
  list?: T[];
  data?: T[];
  orders?: T[];
  pagination?: unknown;
};

const listFrom = <T,>(res: unknown): T[] => {
  const data = unwrap<OrderListPayload<T>>(res);
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    // Backend listOrders returns { data: Order[], pagination }; also accept list/orders.
    if (Array.isArray(data.list)) return data.list;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.orders)) return data.orders;
  }
  return [];
};

export const ordersApi = {
  getOrders: (params?: { status?: string; page?: number; limit?: number }) =>
    SelorgApi.get('/orders', { query: params }).then(listFrom<ApiOrder>),

  getActiveOrders: (): Promise<ApiOrder | null> =>
    SelorgApi.get('/orders/active').then(unwrap<ApiOrder | null>),

  getOrder: (id: string): Promise<ApiOrder> =>
    SelorgApi.get(`/orders/${id}`).then(unwrap<ApiOrder>),

  createOrder: (data: CreateOrderPayload, opts?: { idempotencyKey?: string }): Promise<ApiOrder> =>
    SelorgApi.post('/orders', {
      data,
      header: opts?.idempotencyKey
        ? { 'Idempotency-Key': opts.idempotencyKey }
        : undefined,
    }).then(unwrap<ApiOrder>),

  cancelOrder: (id: string, reason?: string): Promise<ApiOrder> =>
    SelorgApi.post(`/orders/${id}/cancel`, { data: reason ? { reason } : {} }).then(unwrap<ApiOrder>),

  canCancel: async (
    id: string,
  ): Promise<{ canCancel: boolean; allowed?: boolean; reason?: string }> => {
    const raw = unwrap<{ canCancel?: boolean; allowed?: boolean; reason?: string }>(
      await SelorgApi.get(`/orders/${id}/can-cancel`),
    );
    const canCancel = Boolean(raw?.allowed ?? raw?.canCancel);
    return { ...raw, canCancel, allowed: raw?.allowed ?? canCancel };
  },

  getTracking: (id: string): Promise<OrderTracking> =>
    SelorgApi.get(`/orders/${id}/tracking`).then(unwrap<OrderTracking>),

  getStatus: (id: string): Promise<{ status: string; paymentStatus?: string }> =>
    SelorgApi.get(`/orders/${id}/status`).then(unwrap<{ status: string; paymentStatus?: string }>),

  rateOrder: (id: string, data: { rating: number; comment?: string }): Promise<void> =>
    SelorgApi.post(`/orders/${id}/rate`, { data }).then(() => undefined),

  verifyDeliveryOtp: (id: string, otp: string): Promise<void> =>
    SelorgApi.post(`/orders/${id}/verify-otp`, { data: { otp } }).then(() => undefined),

  reorder: (id: string): Promise<unknown> =>
    SelorgApi.post(`/orders/${id}/reorder`).then(unwrap),

  getInvoice: (orderId: string): Promise<OrderInvoice> =>
    SelorgApi.get(`/orders/${orderId}/invoice`).then(unwrap<OrderInvoice>),
};
