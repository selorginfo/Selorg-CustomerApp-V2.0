import SelorgApi from '../api';

export const pushApi = {
  registerToken: (token: string, platform: 'ios' | 'android') =>
    SelorgApi.post('/notifications/register-token', { data: { token, platform, tokenType: 'fcm' } }),
  /** Explicit bearer: logout clears the stored token right after issuing this call. */
  removeToken: (token: string, accessToken: string) =>
    SelorgApi.post('/notifications/remove-token', {
      data: { token },
      header: { Authorization: `Bearer ${accessToken}` },
    }),
};
