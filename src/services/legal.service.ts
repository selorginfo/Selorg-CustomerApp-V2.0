import SelorgApi from '../api';

export interface LegalDocument {
  title?: string;
  content?: string;
  version?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

const unwrap = <T,>(res: unknown): T =>
  (res && typeof res === 'object' && 'data' in res ? (res as { data: T }).data : res) as T;

export const legalApi = {
  getConfig: () => SelorgApi.get('/legal/config').then(unwrap),

  getTerms: (): Promise<LegalDocument> =>
    SelorgApi.get('/legal/terms').then(unwrap<LegalDocument>),

  getPrivacy: (): Promise<LegalDocument> =>
    SelorgApi.get('/legal/privacy').then(unwrap<LegalDocument>),

  getLicense: (): Promise<LegalDocument> =>
    SelorgApi.get('/legal/license').then(unwrap<LegalDocument>),

  accept: (data: { documentType: string; version?: string }) =>
    SelorgApi.post('/legal/accept', { data }).then(unwrap),
};
