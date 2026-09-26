import SelorgApi from '../api';

export interface DeliveryEstimate {
  distanceKm?: number;
  etaMinutes?: number;
  /** Human-readable ETA range from backend, e.g. "30-40 mins". */
  promiseText?: string;
  deliveryFee?: number;
  serviceable?: boolean;
  [key: string]: unknown;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

export const deliveryApi = {
  getEstimate: (params: {
    storeId: string;
    latitude: number;
    longitude: number;
    cartItemCount?: number;
  }): Promise<DeliveryEstimate> =>
    SelorgApi.get('/delivery/estimate', { query: params }).then(unwrap<DeliveryEstimate>),

  getFee: (params: {
    storeId: string;
    latitude: number;
    longitude: number;
    orderTotal?: number;
  }): Promise<DeliveryEstimate> =>
    SelorgApi.get('/delivery/fee', { query: params }).then(unwrap<DeliveryEstimate>),
};
