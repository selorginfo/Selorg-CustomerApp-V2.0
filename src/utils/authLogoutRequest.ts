/** Options for POST /auth/logout so the bearer survives Storage.clearAuth(). */
export function authLogoutRequestOptions(
  accessToken: string | null | undefined,
  params: { refreshToken?: string } = {},
): { data: { refreshToken?: string }; header?: { Authorization: string } } {
  const data: { refreshToken?: string } = {};
  if (params.refreshToken) data.refreshToken = params.refreshToken;
  if (!accessToken) return { data };
  return {
    data,
    header: { Authorization: `Bearer ${accessToken}` },
  };
}
