import SelorgApi from '../api';

export interface StoreAssignment {
  serviceable: boolean;
  store?: {
    _id: string;
    name?: string;
    [key: string]: unknown;
  };
  distanceKm?: number;
  message?: string;
}

const unwrap = <T,>(res: unknown): T => {
  if (res && typeof res === 'object') {
    if ('data' in res) return (res as { data: T }).data;
    if ('serviceable' in res) return res as T;
  }
  return res as T;
};

export const storeApi = {
  assign: (latitude: number, longitude: number): Promise<StoreAssignment> =>
    SelorgApi.post('/store/assign', { data: { latitude, longitude } }).then(unwrap<StoreAssignment>),

  getInventory: (storeId: string) =>
    SelorgApi.get(`/store/${storeId}/inventory`).then(unwrap),
};
