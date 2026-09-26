import SelorgApi from '../api';

export interface ApiAddress {
  _id: string;
  label?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

export interface CreateAddressInput {
  label?: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

const unwrap = <T,>(res: any): T => (res && 'data' in res ? res.data : res) as T;

export const addressApi = {
  listAddresses: (): Promise<ApiAddress[]> =>
    SelorgApi.get('/addresses').then(unwrap<ApiAddress[]>),

  getDefaultAddress: (): Promise<ApiAddress> =>
    SelorgApi.get('/addresses/default').then(unwrap<ApiAddress>),

  createAddress: (data: CreateAddressInput): Promise<ApiAddress> =>
    SelorgApi.post('/addresses', { data }).then(unwrap<ApiAddress>),

  updateAddress: (id: string, data: Partial<CreateAddressInput>): Promise<ApiAddress> =>
    SelorgApi.update(`/addresses/${id}`, { data }).then(unwrap<ApiAddress>),

  deleteAddress: (id: string): Promise<void> =>
    SelorgApi.delete(`/addresses/${id}`).then(() => undefined),

  setDefaultAddress: (id: string): Promise<ApiAddress> =>
    SelorgApi.post(`/addresses/${id}/default`).then(unwrap<ApiAddress>),
};
