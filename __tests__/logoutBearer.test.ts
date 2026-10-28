import { authLogoutRequestOptions } from '../src/utils/authLogoutRequest';
import { Storage } from '../src/api/storage';

describe('logout bearer after clearAuth (REG-02)', () => {
  it('keeps the captured access token on the logout request after Storage.clearAuth()', () => {
    Storage.setItem('accessToken', 'captured-access-token');
    const accessToken = Storage.getItem('accessToken');
    expect(accessToken).toBe('captured-access-token');

    Storage.clearAuth();
    expect(Storage.getItem('accessToken')).toBeFalsy();

    const opts = authLogoutRequestOptions(accessToken);
    expect(opts.header).toEqual({ Authorization: 'Bearer captured-access-token' });
  });
});
