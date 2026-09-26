import SelorgApi from '../api';

export const pushApi = {
  registerToken: (token: string, platform: 'ios' | 'android') =>
    SelorgApi.post('/notifications/register-token', { data: { token, platform, tokenType: 'fcm' } }),
};
