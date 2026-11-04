/** Health lives on the API origin, not under the customer route prefix. */
export function healthProbeUrl(apiBase: string): string {
  const origin = String(apiBase || '').replace(/\/+$/, '').replace(/\/api(\/v\d+\/customer)?$/i, '');
  return `${origin}/health`;
}
