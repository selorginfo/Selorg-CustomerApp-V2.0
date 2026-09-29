// Central API configuration.
//
// The heavy lifting of resolving the right base URL (env-driven prod host,
// Metro-host inference, Android emulator loopback, LAN fallbacks) lives in
// `src/config/api.ts`. This module is the small, stable surface the rest of
// the API layer imports — mirroring UGEC's `src/api/configs.ts`.
import { API_BASE_URL, API_BASE_URLS } from '../config/api';

const configs = {
  /** 'dev' enables request/response logging in `src/api/index.ts`; 'prod' is silent. */
  APP_ENV: __DEV__ ? ('dev' as const) : ('prod' as const),

  /** Primary API origin, e.g. `https://api.selorg.in/api`. */
  API_HOST: API_BASE_URL,

  /**
   * Ordered fallback origins. The fetch wrapper retries the next one when a
   * request fails with a network error (server unreachable / wrong LAN IP).
   */
  API_HOSTS: API_BASE_URLS,

  /** Default per-request timeout. Uploads override this with `timeoutMs`. */
  REQUEST_TIMEOUT_MS: 20_000,

  /**
   * Cap for trying a candidate origin that still has a fallback behind it.
   * These are local/LAN dev hosts, so a live one answers well inside this;
   * an unroutable one (e.g. the emulator's 10.0.2.2 on a physical device)
   * would otherwise hang for the full REQUEST_TIMEOUT_MS on every call.
   */
  HOST_PROBE_TIMEOUT_MS: 3_000,
};

export default configs;
