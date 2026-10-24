import SelorgApi from '../api';
import { mmkvStorage } from '../lib/storage';

function storeQuery(extra?: Record<string, string | undefined>): { storeId?: string } & Record<string, string | undefined> {
  const storeId = (mmkvStorage.getItem('assignedStoreId') || '').trim();
  return storeId ? { ...extra, storeId } : { ...extra };
}

export interface ApiCartLine {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantSize: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  gstRate?: number;
  image: string;
  stock?: number;
  inStock?: boolean;
  maxOrderLimit?: number | null;
}

export interface ApiCart {
  items: ApiCartLine[];
  itemTotal: number;
  discount: number;
  deliveryFee: number;
  handlingCharge?: number;
  tax: number;
  total: number;
  skippedItems?: Array<{ productId: string; reason: string }>;
}

export interface CartMergeItem {
  productId: string;
  variantId?: string;
  quantity?: number;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

export const cartApi = {
  getCart: (params?: { coupon_code?: string; zone?: string; payment_method?: string }): Promise<ApiCart> =>
    SelorgApi.get('/cart', { query: storeQuery(params) }).then(unwrap<ApiCart>),

  addItem: (data: { productId: string; variantId?: string; quantity?: number }): Promise<ApiCart> =>
    SelorgApi.post('/cart/items', { data, query: storeQuery() }).then(unwrap<ApiCart>),

  updateItem: (itemId: string, data: { quantity: number; productId?: string; variantId?: string }): Promise<ApiCart> =>
    SelorgApi.update(`/cart/items/${itemId}`, { data, query: storeQuery() }).then(unwrap<ApiCart>),

  updateItemByProduct: (data: { productId: string; variantId?: string; quantity: number }): Promise<ApiCart> =>
    SelorgApi.update('/cart/items', { data, query: storeQuery() }).then(unwrap<ApiCart>),

  removeItem: (itemId: string, data?: { productId?: string; variantId?: string }): Promise<ApiCart> =>
    SelorgApi.delete(`/cart/items/${itemId}`, { data, query: storeQuery() }).then(unwrap<ApiCart>),

  clear: (): Promise<ApiCart> =>
    SelorgApi.delete('/cart/clear', { query: storeQuery() }).then(unwrap<ApiCart>),

  merge: (mergeKey: string, items: CartMergeItem[]): Promise<ApiCart> =>
    SelorgApi.post('/cart/merge', { data: { mergeKey, items }, query: storeQuery() }).then(unwrap<ApiCart>),
};
