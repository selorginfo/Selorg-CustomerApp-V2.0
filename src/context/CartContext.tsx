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

const GUEST_CART_KEY = 'guestCart';
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
    setTax: (v: number) => void;
    setServerTotal: (v: number) => void;
  },
) {
  const mapped = mapApiCart(cart);
  setters.setItems(mapped.items);
  setters.setItemTotal(mapped.itemTotal);
  setters.setDiscount(mapped.discount);
  setters.setDeliveryFee(mapped.deliveryFee);
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
  const [tax, setTax] = useState(0);
  const [serverTotal, setServerTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const syncing = useRef(false);

  const isAuthenticated = () => Boolean(Storage.getItem('accessToken'));

  const cartSetters = useMemo(
    () => ({ setItems, setItemTotal, setDiscount, setDeliveryFee, setTax, setServerTotal }),
    [],
  );

  const refreshCart = useCallback(async () => {
    if (!isAuthenticated()) {
      setItems(readGuestCart());
      const localTotal = readGuestCart().reduce((s, i) => s + i.price * i.quantity, 0);
      setItemTotal(localTotal);
      setDeliveryFee(0);
      setTax(0);
      setServerTotal(localTotal);
      return;
    }
    setLoading(true);
    try {
      const cart = await cartApi.getCart(
        coupon ? { coupon_code: coupon, payment_method: 'upi' } : undefined,
      );
      applyCartResponse(cart, cartSetters);
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, [coupon, cartSetters]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

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
        applyCartResponse(cart, cartSetters);
      } catch (err) {
        const msg = getErrorMessage(err, 'Could not add to cart');
        const only = msg.match(/only\s+(\d+)/i);
        showToast(only ? `You can add only ${only[1]} of this item` : msg, 'err');
      } finally {
        setLoading(false);
      }
    },
    [addToCartGuest, cartSetters, items],
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
        applyCartResponse(cart, cartSetters);
      } catch (err) {
        const msg = getErrorMessage(err, 'Could not update cart');
        const only = msg.match(/only\s+(\d+)/i);
        showToast(only ? `You can add only ${only[1]} of this item` : msg, 'err');
      } finally {
        setLoading(false);
      }
    },
    [items, cartSetters],
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
        applyCartResponse(cart, cartSetters);
        showToast('Removed from cart');
      } catch {
        showToast('Could not remove item', 'err');
      } finally {
        setLoading(false);
      }
    },
    [items, cartSetters],
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
        if (result.valid && (result.discount_amount ?? 0) > 0) {
          setCoupon(normalized);
          setDiscount(result.discount_amount ?? 0);
          showToast(`Coupon ${normalized} applied`);
          if (isAuthenticated()) await refreshCart();
        } else {
          setCoupon(null);
          setDiscount(0);
          showToast(result.message || result.error || 'Invalid or expired coupon', 'err');
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
      setTax(0);
      setServerTotal(0);
    } finally {
      setLoading(false);
    }
  }, [cartSetters]);

  const totalItems = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);
  const grandTotal = useMemo(() => {
    if (isAuthenticated() && serverTotal > 0) {
      return Math.max(0, serverTotal - discount) + tip;
    }
    return Math.max(0, itemTotal - discount) + deliveryFee + tax + tip;
  }, [serverTotal, itemTotal, discount, deliveryFee, tax, tip]);

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
