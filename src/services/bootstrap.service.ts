import SelorgApi from '../api';

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

export const bootstrapApi = {
  getBootstrap: <T = Record<string, unknown>>(): Promise<T> =>
    SelorgApi.get('/bootstrap').then(unwrap<T>),
};
