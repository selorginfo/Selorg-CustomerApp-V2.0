import SelorgApi from '../api';

export interface LocationSuggestion {
  placeId?: string;
  description?: string;
  mainText?: string;
  secondaryText?: string;
  latitude?: number;
  longitude?: number;
  [key: string]: unknown;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

type ResolvedLocation = {
  latitude?: number;
  longitude?: number;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  formattedAddress?: string;
} | null;

export const locationsApi = {
  getSuggestions: (params: { q: string; latitude?: number; longitude?: number }): Promise<LocationSuggestion[]> =>
    SelorgApi.get('/locations/suggestions', { query: params }).then(unwrap<LocationSuggestion[]>),

  getApproximate: (): Promise<{ latitude: number; longitude: number } | null> =>
    SelorgApi.get('/locations/approximate').then(unwrap<{ latitude: number; longitude: number } | null>),

  reverse: (
    latitude: number,
    longitude: number,
  ): Promise<ResolvedLocation> =>
    SelorgApi.get('/locations/reverse', { query: { latitude, longitude } }).then(res => unwrap<ResolvedLocation>(res)),

  placeDetails: (placeId: string): Promise<ResolvedLocation> =>
    SelorgApi.get('/locations/place-details', { query: { placeId } }).then(res => unwrap<ResolvedLocation>(res)),
};
