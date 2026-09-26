import { NativeModules, Platform } from 'react-native';
// @ts-ignore
import {
  API_BASE_URL as ENV_API_BASE_URL_DOT,
  APP_MODE as ENV_APP_MODE_DOT,
  DEV_API_BASE_URL as ENV_DEV_API_BASE_URL_DOT,
  PROD_API_BASE_URL as ENV_PROD_API_BASE_URL_DOT,
} from '@env';

const ENV_API_BASE_URL = (ENV_API_BASE_URL_DOT as string | undefined)?.trim();
const ENV_APP_MODE = (ENV_APP_MODE_DOT as string | undefined)
  ?.trim()
  .toLowerCase();
const ENV_DEV_API_BASE_URL = (
  ENV_DEV_API_BASE_URL_DOT as string | undefined
)?.trim();
const ENV_PROD_API_BASE_URL = (
  ENV_PROD_API_BASE_URL_DOT as string | undefined
)?.trim();

const PROD_FALLBACK_API_BASE_URL = 'https://api.selorg.com/api/v1/customer';

// selorg-service runs on port 3333 in dev and mounts customer routes under
// /api/v1/customer.
const DEV_API_PORT = 3333;
const DEV_API_PATH = '/api/v1/customer';

const sanitizeApiBaseUrl = (value?: string | null) => {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) return '';
  return v.replace(/\/+$/, '');
};

const getMetroHost = () => {
  try {
    const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
    if (!scriptURL) return '';
    const match = scriptURL.match(/^https?:\/\/([^/:?#]+)/i);
    return (match?.[1] || '').trim();
  } catch {
    return '';
  }
};

const isLocalHost = (host: string) => {
  const normalized = host.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0'
  );
};

const isLoopbackOrEmulatorHost = (host: string) => {
  const normalized = host.toLowerCase();
  return isLocalHost(normalized) || normalized === '10.0.2.2';
};

const isPrivateLanHost = (host: string) =>
  /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);

/** Prefer reachable local selorg-service hosts; keep remote env URLs as last resort. */
const getDevApiCandidates = () => {
  const localCandidates: string[] = [];
  const remoteCandidates: string[] = [];

  const pushCandidate = (raw?: string | null) => {
    const url = sanitizeApiBaseUrl(raw);
    if (!url) return;
    try {
      const hostMatch = url.match(/^https?:\/\/([^/:?#]+)/i);
      const host = (hostMatch?.[1] || '').toLowerCase();
      if (isLoopbackOrEmulatorHost(host) || isPrivateLanHost(host)) {
        localCandidates.push(url);
      } else {
        remoteCandidates.push(url);
      }
    } catch {
      remoteCandidates.push(url);
    }
  };

  // Physical device / LAN — Metro packager host is the most reliable local target.
  const metroHost = getMetroHost();
  if (metroHost && !isLocalHost(metroHost)) {
    localCandidates.push(`http://${metroHost}:${DEV_API_PORT}${DEV_API_PATH}`);
  }

  // Android emulator → host machine loopback.
  if (Platform.OS === 'android') {
    localCandidates.push(`http://10.0.2.2:${DEV_API_PORT}${DEV_API_PATH}`);
  }

  localCandidates.push(`http://localhost:${DEV_API_PORT}${DEV_API_PATH}`);

  // Explicit env values (local first if they point at LAN/loopback).
  pushCandidate(ENV_DEV_API_BASE_URL);
  pushCandidate(ENV_API_BASE_URL);

  return Array.from(
    new Set(
      [...localCandidates, ...remoteCandidates]
        .map(sanitizeApiBaseUrl)
        .filter(Boolean),
    ),
  );
};

console.log('--- ENV DEBUG START ---');
console.log('ENV_APP_MODE (from dot):', ENV_APP_MODE_DOT);
console.log('ENV_APP_MODE (processed):', ENV_APP_MODE);
console.log('ENV_PROD_API_BASE_URL:', ENV_PROD_API_BASE_URL);
console.log('ENV_DEV_API_BASE_URL:', ENV_DEV_API_BASE_URL);
console.log('__DEV__:', __DEV__);
console.log('--- ENV DEBUG END ---');

export const getApiBaseUrls = () => {
  const isProductionMode = ENV_APP_MODE === 'production';
  const isDevelopmentMode = ENV_APP_MODE === 'development';

  // If explicitly set to production, use production even in debug/dev mode
  if (isProductionMode) {
    console.log('API CONFIG: Explicit production mode detected');
    const prodUrl =
      sanitizeApiBaseUrl(ENV_PROD_API_BASE_URL) ||
      sanitizeApiBaseUrl(ENV_API_BASE_URL) ||
      PROD_FALLBACK_API_BASE_URL;
    return [prodUrl];
  }

  const useDevRouting = __DEV__ || isDevelopmentMode;

  if (useDevRouting) {
    console.log('API CONFIG: Using development routing');
    return getDevApiCandidates();
  }

  const defaultUrl =
    sanitizeApiBaseUrl(ENV_PROD_API_BASE_URL) ||
    sanitizeApiBaseUrl(ENV_API_BASE_URL) ||
    PROD_FALLBACK_API_BASE_URL;
  return [defaultUrl];
};

export const API_BASE_URLS = getApiBaseUrls();
export const API_BASE_URL = API_BASE_URLS[0];
export const API_ORIGIN = API_BASE_URL.replace(/\/api(\/v\d+\/customer)?\/?$/, '');
const API_PROTOCOL = API_ORIGIN.startsWith('https://') ? 'https:' : 'http:';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2']);

export const normalizeApiAssetUrl = (value?: string | null): string => {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) return '';
  if (
    rawValue.startsWith('data:') ||
    rawValue.startsWith('file:') ||
    rawValue.startsWith('content:')
  ) {
    return rawValue;
  }

  if (/^https?:\/\//i.test(rawValue)) {
    const hostMatch = rawValue.match(/^https?:\/\/([^/:?#]+)(?::\d+)?/i);
    const host = hostMatch?.[1]?.toLowerCase() || '';
    if (LOCAL_HOSTS.has(host)) {
      return rawValue.replace(/^https?:\/\/[^/]+/i, API_ORIGIN);
    }
    return rawValue;
  }

  if (rawValue.startsWith('//')) {
    return `${API_PROTOCOL}${rawValue}`;
  }

  const normalizedPath = rawValue.startsWith('/') ? rawValue : `/${rawValue}`;
  return `${API_ORIGIN}${normalizedPath}`;
};

console.log('API Base URL FINAL:', API_BASE_URL, 'Candidates:', API_BASE_URLS);
