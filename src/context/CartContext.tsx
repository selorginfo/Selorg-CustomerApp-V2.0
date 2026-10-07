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
import { cartApi } from '../services/cart.service';
import type { ApiCart } from '../services/cart.service';
import { couponsApi } from '../services/coupons.service';
import { Storage } from '../api/storage';
import { mmkvStorage } from '../lib/storage';
import { mapApiCart } from '../utils/mappers';
import { showToast } from '../utils/toast';
import { getErrorMessage } from '../utils/apiError';
import { useAuth } from './AuthContext';

const GUEST_CART_KEY = 'guestCart';

const COUPON_ERRORS: Record<string, string> = {
  INVALID_CODE: 'This code is not valid',
  COUPON_INACTIVE: 'This code is paused',
  COUPON_NOT_VALID_NOW: 'This code is not valid right now',
  MIN_ORDER_NOT_MET: 'Your cart is below the minimum for this code',
  COUPON_EXHAUSTED: 'This code has already been used',
  NOT_ELIGIBLE: 'This code is not available for your account',
  PAYMENT_METHOD_NOT_ELIGIBLE: 'This code does not apply to this payment method',
};

function couponErrorText(code?: string): string {
  return (code && COUPON_ERRORS[code]) || 'Invalid or expired coupon';
}
const MERGE_KEY = 'cartMergeKey';

export interface CartProduct {
  id: string;
  variantId?: string;
  name: string;
  unit: string;
  price: number;
  mrp?: number;
  /** `null` when the API didn't report stock — no cap, and no count to quote. */
  stockQuantity: number | null;
  image?: unknown;
  maxOrderLimit?: number | null;
}

export interface CartLine {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  unit: string;
  price: number;
  mrp?: number;
  quantity: number;
  image?: unknown;
  stockQuantity?: number | null;
  maxOrderLimit?: number | null;
}

interface CartContextType {
  items: CartLine[];
  coupon: string | null;
  discount: number;
  tip: number;
  loading: boolean;
  quantityOf: (productId: string, variantId?: string) => number;
  totalItems: number;
  itemTotal: number;
  deliveryFee: number;
  handlingCharge: number;
  tax: number;
  grandTotal: number;
  addToCart: (product: CartProduct) => Promise<void>;
  incrementItem: (productId: string, variantId?: string, maxOrderLimit?: number | null) => Promise<void>;
  decrementItem: (productId: string, variantId?: string) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => void;
  setTip: (v: number) => void;
  refreshCart: () => Promise<void>;
  /** Feed the pricing engine the current address zone / payment method. */
  setPricingContext: (next: { zone?: string | null; paymentMethod?: string | null }) => void;
  mergeGuestCartOnLogin: () => Promise<void>;
  clearCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function sameCartLine(line: { productId: string; variantId?: string }, productId: string, variantId?: string) {
  const wanted = variantId || productId;
  const lineVariant = line.variantId || line.productId;
  return (line.productId === productId || line.productId === wanted) && lineVariant === wanted;
}

function getMergeKey(): string {
  let key = mmkvStorage.getItem(MERGE_KEY);
  if (!key) {
    key = `merge_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    mmkvStorage.setItem(MERGE_KEY, key);
  }
  return key;
}

function readGuestCart(): CartLine[] {
  try {
    const raw = mmkvStorage.getItem(GUEST_CART_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

function writeGuestCart(items: CartLine[]) {
  if (items.length === 0) mmkvStorage.removeItem(GUEST_CART_KEY);
  else mmkvStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
}

function applyCartResponse(
  cart: ApiCart,
  setters: {
    setItems: (v: CartLine[]) => void;
    setItemTotal: (v: number) => void;
    setDiscount: (v: number) => void;
    setDeliveryFee: (v: number) => void;
    setHandlingCharge: (v: number) => void;
    setTax: (v: number) => void;
    setServerTotal: (v: number) => void;
  },
) {
  const mapped = mapApiCart(cart);
  setters.setItems(mapped.items);
  setters.setItemTotal(mapped.itemTotal);
  setters.setDiscount(mapped.discount);
  setters.setDeliveryFee(mapped.deliveryFee);
  setters.setHandlingCharge(mapped.handlingCharge);
  setters.setTax(mapped.tax);
  setters.setServerTotal(mapped.total);
}

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [tip, setTipState] = useState(0);
  const [itemTotal, setItemTotal] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [handlingCharge, setHandlingCharge] = useState(0);
  // Zone + payment method feed the server-side pricing engine. Holding them in
  // context means any change re-runs refreshCart, so the quoted delivery fee
  // tracks the current address and payment selection instead of going stale.
  const [pricingContext, setPricingContextState] = useState<{
    zone: string | null;
    paymentMethod: string | null;
  }>({ zone: null, paymentMethod: null });
  const [tax, setTax] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const syncing = useRef(false);

  const { user } = useAuth();
  const accountId = user?.id || '';
  const accountRef = useRef(accountId);
  const isAuthenticated = () => Boolean(Storage.getItem('accessToken'));

  const cartSetters = useMemo(
    () => ({ setItems, setItemTotal, setDiscount, setDeliveryFee, setHandlingCharge, setTax, setServerTotal }),
    [],
  );

  const setPricingContext = useCallback(
    (next: { zone?: string | null; paymentMethod?: string | null }) => {
      setPricingContextState(prev => {
        const zone = next.zone ?? null;
        const paymentMethod = next.paymentMethod ?? null;
        if (prev.zone === zone && prev.paymentMethod === paymentMethod) return prev;
        return { zone, paymentMethod };
      });
    },
    [],
  );

  const refreshCart = useCallback(async () => {
    const forAccount = accountId;
    if (!isAuthenticated()) {
      setItems(readGuestCart());
      const localTotal = readGuestCart().reduce((s, i) => s + i.price * i.quantity, 0);
      setItemTotal(localTotal);
      setDeliveryFee(0);
      setHandlingCharge(0);
      setTax(0);
      setServerTotal(localTotal);
      return;
    }
    setLoading(true);
    try {
      const query: { coupon_code?: string; zone?: string; payment_method?: string } = {};
      if (coupon) query.coupon_code = coupon;
      if (pricingContext.zone) query.zone = pricingContext.zone;
      if (pricingContext.paymentMethod) query.payment_method = pricingContext.paymentMethod;
      const cart = await cartApi.getCart(Object.keys(query).length ? query : undefined);
      if (accountRef.current !== forAccount) return;
      applyCartResponse(cart, cartSetters);
    } catch {
      // Same account keeps its cart; a switched account must not.
      if (accountRef.current !== forAccount) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, coupon, cartSetters, pricingContext]);

  useEffect(() => {
    accountRef.current = accountId;
    setItems([]);
    setItemTotal(0);
    setDiscount(0);
    setCoupon(null);
    setDeliveryFee(0);
    setHandlingCharge(0);
    setTax(0);
    setServerTotal(0);
  }, [accountId]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  // Item add/update/remove responses are priced without the coupon, which
  // silently dropped the discount after a quantity change. Re-price with the
  // applied coupon whenever one is active.
  const applyMutation = useCallback(
    async (cart: ApiCart) => {
      applyCartResponse(cart, cartSetters);
      if (coupon) await refreshCart();
    },
    [coupon, cartSetters, refreshCart],
  );

  const mergeGuestCartOnLogin = useCallback(async () => {
    if (!isAuthenticated() || syncing.current) return;
    const guestItems = readGuestCart();
    if (guestItems.length === 0) {
      await refreshCart();
      return;
    }
    syncing.current = true;
    try {
      const cart = await cartApi.merge(
        getMergeKey(),
        guestItems.map(i => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
      );
      writeGuestCart([]);
      applyCartResponse(cart, cartSetters);
    } catch {
      await refreshCart();
    } finally {
      syncing.current = false;
    }
  }, [cartSetters, refreshCart]);

  const quantityOf = useCallback(
    (productId: string, variantId?: string) =>
      items.find(i => sameCartLine(i, productId, variantId))?.quantity || 0,
    [items],
  );

  const addToCartGuest = useCallback((product: CartProduct) => {
    const prev = readGuestCart();
    const existing = prev.find(i => sameCartLine(i, product.id, product.variantId));
    let next: CartLine[];
    if (existing) {
      if (product.maxOrderLimit != null && product.maxOrderLimit > 0 && existing.quantity >= product.maxOrderLimit) {
        showToast(`You can add only ${product.maxOrderLimit} of this item`, 'err');
        return;
      }
      if (product.stockQuantity !== null && existing.quantity >= product.stockQuantity) {
        showToast(`Only ${product.stockQuantity} unit(s) available.`, 'err');
        return;
      }
      next = prev.map(i =>
        sameCartLine(i, product.id, product.variantId) ? { ...i, quantity: i.quantity + 1 } : i,
      );
    } else {
      next = [
        ...prev,
        {
          id: `guest_${product.id}`,
          productId: product.id,
          variantId: product.variantId,
          name: product.name,
          unit: product.unit,
          price: product.price,
          mrp: product.mrp,
          quantity: 1,
          image: product.image,
          stockQuantity: product.stockQuantity,
          maxOrderLimit: product.maxOrderLimit,
        },
      ];
    }
    writeGuestCart(next);
    setItems(next);
    const total = next.reduce((s, i) => s + i.price * i.quantity, 0);
    setItemTotal(total);
    setServerTotal(total);
  }, []);

  const addToCart = useCallback(
    async (product: CartProduct) => {
      if (product.stockQuantity === 0) {
        showToast('This product is currently out of stock.', 'err');
        return;
      }
      const already = items.find(i => sameCartLine(i, product.id, product.variantId));
      if (
        already &&
        product.maxOrderLimit != null &&
        product.maxOrderLimit > 0 &&
        already.quantity >= product.maxOrderLimit
      ) {
        showToast(`You can add only ${product.maxOrderLimit} of this item`, 'err');
        return;
      }
      if (!isAuthenticated()) {
        addToCartGuest(product);
        return;
      }
      setLoading(true);
      try {
        const cart = await cartApi.addItem({
          productId: product.id,
          variantId: product.variantId,
          quantity: 1,
        });
        await applyMutation(cart);
      } catch (err) {
        const msg = getErrorMessage(err, 'Could not add to cart');
        const only = msg.match(/only\s+(\d+)/i);
        showToast(only ? `You can add only ${only[1]} of this item` : msg, 'err');
      } finally {
        setLoading(false);
      }
    },
    [addToCartGuest, applyMutation, items],
  );

  const changeQty = useCallback(
    async (productId: string, delta: number, variantId?: string, maxOrderLimit?: number | null) => {
      const line = items.find(i => sameCartLine(i, productId, variantId));
      if (!line) return;
      const nextQty = line.quantity + delta;
      const max = line.maxOrderLimit ?? maxOrderLimit;
      if (delta > 0 && max != null && max > 0 && line.quantity >= max) {
        showToast(`You can add only ${max} of this item`, 'err');
        return;
      }
      // Guest carts never round-trip through the server, so the stock cap must be
      // enforced here (signed-in carts are also validated server-side).
      const stock = line.stockQuantity;
      if (delta > 0 && stock != null && line.quantity >= stock) {
        showToast(`Only ${stock} unit(s) available.`, 'err');
        return;
      }

      if (!isAuthenticated()) {
        const prev = readGuestCart();
        const updated =
          nextQty <= 0
            ? prev.filter(i => !sameCartLine(i, productId, variantId))
            : prev.map(i => (sameCartLine(i, productId, variantId) ? { ...i, quantity: nextQty } : i));
        writeGuestCart(updated);
        setItems(updated);
        const total = updated.reduce((s, i) => s + i.price * i.quantity, 0);
        setItemTotal(total);
        setServerTotal(total);
        return;
      }

      setLoading(true);
      try {
        let cart: ApiCart;
        if (nextQty <= 0) {
          cart = await cartApi.removeItem(line.id);
        } else {
          cart = await cartApi.updateItem(line.id, { quantity: nextQty });
        }
        await applyMutation(cart);
      } catch (err) {
        const msg = getErrorMessage(err, 'Could not update cart');
        const only = msg.match(/only\s+(\d+)/i);
        showToast(only ? `You can add only ${only[1]} of this item` : msg, 'err');
      } finally {
        setLoading(false);
      }
    },
    [items, applyMutation],
  );

  const incrementItem = useCallback(
    (productId: string, variantId?: string, maxOrderLimit?: number | null) =>
      changeQty(productId, 1, variantId, maxOrderLimit),
    [changeQty],
  );
  const decrementItem = useCallback(
    (productId: string, variantId?: string) => changeQty(productId, -1, variantId),
    [changeQty],
  );

  const removeItem = useCallback(
    async (productId: string) => {
      const line = items.find(i => i.productId === productId);
      if (!line) return;
      if (!isAuthenticated()) {
        const updated = readGuestCart().filter(i => i.productId !== productId);
        writeGuestCart(updated);
        setItems(updated);
        showToast('Removed from cart');
        return;
      }
      setLoading(true);
      try {
        const cart = await cartApi.removeItem(line.id);
        await applyMutation(cart);
        showToast('Removed from cart');
      } catch {
        showToast('Could not remove item', 'err');
      } finally {
        setLoading(false);
      }
    },
    [items, applyMutation],
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      const normalized = code.trim().toUpperCase();
      if (!normalized) return;
      try {
        const result = await couponsApi.validate({
          coupon_code: normalized,
          cart_value: itemTotal,
          cart_items: items.map(i => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            price: i.price,
          })),
          delivery_fee: deliveryFee,
        });
        const amount = result.discount_amount ?? 0;
        const accepted = result.valid && (amount > 0 || result.is_cashback || /free_delivery/i.test(result.coupon_type || ''));
        if (accepted) {
          setCoupon(normalized);
          setDiscount(amount);
          showToast(result.is_cashback ? `${normalized} applied — cashback after delivery` : `Coupon ${normalized} applied`);
          if (isAuthenticated()) await refreshCart();
        } else {
          setCoupon(null);
          setDiscount(0);
          showToast(result.message || result.error || couponErrorText(result.error_code), 'err');
        }
      } catch {
        showToast('Could not validate coupon', 'err');
      }
    },
    [itemTotal, items, deliveryFee, refreshCart],
  );

  const removeCoupon = useCallback(() => {
    setCoupon(null);
    setDiscount(0);
    if (isAuthenticated()) refreshCart();
  }, [refreshCart]);

  const setTip = useCallback((v: number) => setTipState(v), []);

  const clearCart = useCallback(async () => {
    setCoupon(null);
    setDiscount(0);
    setTipState(0);
    writeGuestCart([]);
    if (!isAuthenticated()) {
      setItems([]);
      setItemTotal(0);
      setDeliveryFee(0);
      setHandlingCharge(0);
      setTax(0);
      setServerTotal(0);
      return;
    }
    setLoading(true);
    try {
      const cart = await cartApi.clear();
      applyCartResponse(cart, cartSetters);
    } catch {
      setItems([]);
      setItemTotal(0);
      setDeliveryFee(0);
      setHandlingCharge(0);
      setTax(0);
      setServerTotal(0);
    } finally {
      setLoading(false);
    }
  }, [cartSetters]);

  const totalItems = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const grandTotal = useMemo(() => {
    // serverTotal is the pricing engine's finalAmount, which already has the
    // discount deducted and the fees added — subtracting discount again here
    // under-quoted the total once the engine started returning real numbers.
    if (isAuthenticated() && serverTotal > 0) {
      return serverTotal + tip;
    }
    return Math.max(0, itemTotal - discount) + deliveryFee + handlingCharge + tax + tip;
  }, [serverTotal, itemTotal, discount, deliveryFee, handlingCharge, tax, tip]);

  const value = useMemo<CartContextType>(
    () => ({
      items,
      coupon,
      discount,
      tip,
      loading,
      quantityOf,
      totalItems,
      itemTotal,
      deliveryFee,
      handlingCharge,
      tax,
      grandTotal,
      addToCart,
      incrementItem,
      decrementItem,
      removeItem,
      applyCoupon,
      removeCoupon,
      setTip,
      refreshCart,
      setPricingContext,
      mergeGuestCartOnLogin,
      clearCart,
    }),
    [
      items,
      coupon,
      discount,
      tip,
      loading,
      quantityOf,
      totalItems,
      itemTotal,
      deliveryFee,
      handlingCharge,
      tax,
      grandTotal,
      addToCart,
      incrementItem,
      decrementItem,
      removeItem,
      applyCoupon,
      removeCoupon,
      setTip,
      refreshCart,
      setPricingContext,
      mergeGuestCartOnLogin,
      clearCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
};
