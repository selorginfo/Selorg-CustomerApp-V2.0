import {
  API_BASE_URL,
  APP_MODE,
  BRAND_KEY,
  DEV_API_BASE_URL,
  PAYMENT_API_BASE_URL,
  PROD_API_BASE_URL,
} from '@env';
import { ACTIVE_BRAND_REQUESTED, BRAND_KEY as ACTIVE } from '../brands';

const LAN_HOST = /localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\./;
const SELORG_HOST = /^https?:\/\/([^/?#]*\.)?selorg\.com(?=[:/?#]|$)/i;
const CUSTOMER_URL_KEYS = ['API_BASE_URL', 'DEV_API_BASE_URL', 'PROD_API_BASE_URL'] as const;
const URL_KEYS = [...CUSTOMER_URL_KEYS, 'PAYMENT_API_BASE_URL'] as const;

export type EnvInput = {
  activeBrand: string;
  requestedBrand: string;
  env: Partial<Record<'APP_MODE' | 'BRAND_KEY' | (typeof URL_KEYS)[number], string | undefined>>;
};

/**
 * Selorg production may omit the URL because `src/config/api.ts` falls back to
 * Selorg's own API. Any other brand must set it, must declare BRAND_KEY, and may
 * not point its customer API at a Selorg host. Maps and the payment API may stay
 * on Selorg. A copied customer API would otherwise send Sodakku traffic to Selorg.
 */
export function envProblems({ activeBrand, requestedBrand, env }: EnvInput): string[] {
  const read = (k: keyof EnvInput['env']) => (env[k] ?? '').trim();
  const problems: string[] = [];
  const mode = read('APP_MODE').toLowerCase();
  const envBrand = read('BRAND_KEY');
  const partner = activeBrand !== 'selorg';

  if (requestedBrand !== activeBrand) {
    problems.push(
      `Brand "${requestedBrand}" was requested but "${activeBrand}" resolved. Re-run: npm run brand -- ${requestedBrand} <mode>`,
    );
  }
  if ((envBrand || partner) && envBrand !== activeBrand) {
    problems.push(
      `BRAND_KEY="${envBrand}" in .env but active brand is "${activeBrand}". Re-run: npm run brand -- ${activeBrand} <mode>`,
    );
  }

  if (partner) {
    const selorgKeys = CUSTOMER_URL_KEYS.filter(k => SELORG_HOST.test(read(k)));
    if (selorgKeys.length) {
      problems.push(`Brand "${activeBrand}" must not use Selorg API hosts. Replace: ${selorgKeys.join(', ')}`);
    }
  }

  if (mode === 'production') {
    const url = read('PROD_API_BASE_URL') || read('API_BASE_URL');
    if (!url && partner) {
      problems.push(`PROD_API_BASE_URL is required for brand "${activeBrand}" in production.`);
    }
    if (url && LAN_HOST.test(url)) {
      problems.push(`API URL "${url}" is a LAN address in production.`);
    }
    if (url && !url.startsWith('https://')) {
      problems.push(`API URL "${url}" must be https in production.`);
    }
  }
  return problems;
}

/**
 * Selorg release builds log instead of throwing so a shipped app is never
 * crashed at launch by this check; partner brands always throw.
 */
export function assertEnv(): void {
  const problems = envProblems({
    activeBrand: ACTIVE,
    requestedBrand: ACTIVE_BRAND_REQUESTED,
    env: { APP_MODE, BRAND_KEY, API_BASE_URL, DEV_API_BASE_URL, PROD_API_BASE_URL, PAYMENT_API_BASE_URL },
  });
  if (problems.length === 0) return;
  const message = `[env] ${problems.join('\n[env] ')}`;
  if (__DEV__ || ACTIVE !== 'selorg') throw new Error(message);
  console.error(message);
}
