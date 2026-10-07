import configs from '../api/configs';

/**
 * Lightweight online/offline tracking without a native NetInfo module.
 *
 * The API client reports every request outcome: any HTTP response means the
 * device is online; a transport failure ("Network request failed") triggers a
 * probe of the API origin to confirm. While offline the origin is re-probed
 * every few seconds so the app notices when the connection returns.
 */
type Listener = (online: boolean) => void;

const PROBE_TIMEOUT_MS = 4000;
const PROBE_INTERVAL_MS = 5000;

let online = true;
let probeTimer: ReturnType<typeof setInterval> | null = null;
let probing: Promise<boolean> | null = null;
const listeners = new Set<Listener>();

export const isOnline = () => online;

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setOnline(next: boolean) {
  if (online === next) return;
  online = next;
  if (next) stopProbeLoop();
  else startProbeLoop();
  listeners.forEach(l => {
    try {
      l(next);
    } catch {
      // a bad listener must not break the others
    }
  });
}

/** Any HTTP response at all (even 4xx/5xx) proves the network is up. */
export function probeConnectivity(): Promise<boolean> {
  if (probing) return probing;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  probing = fetch(configs.API_HOST, { method: 'GET', signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } })
    .then(() => true)
    .catch(() => false)
    .then(ok => {
      clearTimeout(t);
      probing = null;
      setOnline(ok);
      return ok;
    });
  return probing;
}

function startProbeLoop() {
  if (probeTimer) return;
  probeTimer = setInterval(() => {
    probeConnectivity();
  }, PROBE_INTERVAL_MS);
}

function stopProbeLoop() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
}

export function reportNetworkSuccess() {
  setOnline(true);
}

/** Transport-level failure (not an HTTP error) — confirm before declaring offline. */
export function reportNetworkFailure() {
  probeConnectivity();
}

/** True for fetch's "no connection" failures, not for HTTP errors or timeouts on a live server. */
export function isNetworkFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; __apiError?: boolean };
  if (e.__apiError) return false;
  return e.name === 'TypeError' || /network request failed|failed to fetch|network error/i.test(String(e.message || ''));
}
