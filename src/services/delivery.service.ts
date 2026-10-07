import SelorgApi from '../api';
import { mmkvStorage } from '../lib/storage';
import { storeApi } from './store.service';

export interface DeliveryEstimate {
  distanceKm?: number;
  etaMinutes?: number;
  /** Backend `/delivery/estimate` sends `estimatedMinutes`; `etaMinutes` is kept for older payloads. */
  estimatedMinutes?: number;
  /** Human-readable ETA range from backend, e.g. "30-40 mins". */
  promiseText?: string;
  deliveryFee?: number;
  serviceable?: boolean;
  [key: string]: unknown;
}

/** Shown when the live estimate can't be fetched for a serviceable address. */
export const DEFAULT_ETA_TEXT = '10-15 mins';

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

  /**
   * Resolves the darkstore serving this point, then its live ETA.
   * Null when the point isn't serviceable.
   */
  getEstimateForLocation: async (params: {
    latitude: number;
    longitude: number;
    cartItemCount?: number;
  }): Promise<DeliveryEstimate | null> => {
    const assignment = await storeApi.assign(params.latitude, params.longitude).catch(() => null);
    if (assignment?.serviceable === false) return null;
    if (assignment?.store?._id) mmkvStorage.setItem('assignedStoreId', assignment.store._id);
    const storeId = assignment?.store?._id || mmkvStorage.getItem('assignedStoreId');
    if (!storeId) return null;
    return deliveryApi.getEstimate({ storeId, ...params });
  },

  getFee: (params: {
    storeId: string;
    latitude: number;
    longitude: number;
    orderTotal?: number;
  }): Promise<DeliveryEstimate> =>
    SelorgApi.get('/delivery/fee', { query: params }).then(unwrap<DeliveryEstimate>),
};

export function etaTextFromEstimate(estimate: DeliveryEstimate | null | undefined): string | null {
  if (estimate?.promiseText) return estimate.promiseText;
  const mins = estimate?.estimatedMinutes ?? estimate?.etaMinutes;
  return typeof mins === 'number' && mins > 0 ? `${mins} mins` : null;
}
