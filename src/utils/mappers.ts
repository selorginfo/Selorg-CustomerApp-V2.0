import type { ApiCart, ApiCartLine } from '../services/cart.service';
import type { ApiOrder } from '../services/orders.service';
import type { CartLine } from '../context/CartContext';
import type { Order, OrderStatus, PaymentStatus, PayMethod } from '../context/OrdersContext';

export function mapCartLine(raw: ApiCartLine): CartLine {
  return {
    id: raw.id,
    productId: raw.productId,
    name: raw.productName,
    unit: raw.variantSize || '1 unit',
    price: raw.price,
    mrp: raw.originalPrice,
    quantity: raw.quantity,
    image: raw.image ? { uri: raw.image } : undefined,
    variantId: raw.variantId || undefined,
    stockQuantity: raw.stock,
    maxOrderLimit: raw.maxOrderLimit,
  };
}

export function mapApiCart(cart: ApiCart): {
  items: CartLine[];
  itemTotal: number;
  discount: number;
  deliveryFee: number;
  handlingCharge: number;
  tax: number;
  total: number;
} {
  return {
    items: (cart.items || []).map(mapCartLine),
    itemTotal: cart.itemTotal ?? 0,
    discount: cart.discount ?? 0,
    deliveryFee: cart.deliveryFee ?? 0,
    // Part of the server total; without it the bill rows do not add up to
    // the amount charged.
    handlingCharge: cart.handlingCharge ?? 0,
    tax: cart.tax ?? 0,
    total: cart.total ?? 0,
  };
}

export function toLocalOrder(raw: ApiOrder): Order {
  const statusMap: Record<string, OrderStatus> = {
    pending: 'pending',
    confirmed: 'confirmed',
    'getting-packed': 'getting-packed',
    'on-the-way': 'on-the-way',
    arrived: 'arrived',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };
  const payStatusMap: Record<string, PaymentStatus> = {
    pending: 'pending',
    paid: 'paid',
    failed: 'failed',
    cod_pending: 'cod_pending',
  };
  const method: PayMethod | undefined =
    raw.paymentMethodType === 'cash'
      ? 'cod'
      : raw.paymentMethodType === 'wallet'
        ? 'wallet'
        : raw.paymentMethodType
          ? 'online'
          : undefined;

  // The API formats orders with `id` (a stringified _id) and omits `_id`
  // entirely; reading only `_id` left every order with an undefined id, which
  // broke every request built from it (cancel, invoice, tracking).
  const orderId = String(raw.id || raw._id || '');

  return {
    id: orderId,
    orderNumber: raw.orderNumber || orderId.slice(-6).toUpperCase(),
    status: statusMap[String(raw.status || '').toLowerCase()] || 'pending',
    paymentStatus: payStatusMap[String(raw.paymentStatus || '').toLowerCase()] || 'pending',
    method,
    // Order documents store productName/variantSize/originalPrice and a
    // fully-qualified image URL; the shorter aliases are kept as fallbacks for
    // older records.
    items: (raw.items || []).map((it: Record<string, unknown>, idx: number) => {
      const imageUrl = it.image || it.imageUrl || it.thumbnail;
      return {
        id: String(it.id || it._id || `item_${idx}`),
        productId: String(it.productId || ''),
        name: String(it.productName || it.name || 'Item'),
        unit: String(it.variantSize || it.variant || it.unit || '1 unit'),
        price: Number(it.price || 0),
        mrp: Number(it.originalPrice || it.mrp || it.price || 0),
        quantity: Number(it.quantity || 1),
        image: typeof imageUrl === 'string' && imageUrl ? { uri: imageUrl } : undefined,
      };
    }),
    itemTotal: Number(raw.itemTotal ?? raw.subtotal ?? 0),
    discount: Number(raw.discount || 0),
    deliveryFee: Number(raw.deliveryFee || 0),
    tip: Number(raw.deliveryTip || 0),
    totalBill: Number(raw.totalBill ?? raw.total ?? 0),
    addressId: String(raw.addressId || ''),
    coupon: (raw.couponCode as string) || null,
    placedAt: String(raw.createdAt || new Date().toISOString()),
    timeline: (raw.timeline || []).map(t => ({
      status: t.status,
      timestamp: t.timestamp || t.createdAt || new Date().toISOString(),
    })),
  };
}
