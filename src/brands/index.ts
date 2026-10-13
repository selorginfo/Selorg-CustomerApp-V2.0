import type { Brand } from './types';
import { ACTIVE_BRAND_KEY, ACTIVE_BRAND_MODULE } from './active.generated';

// Only the generated active brand is imported, so a build never carries
// another brand's name, ids or artwork. Every brand is therefore complete.
const ACTIVE: Brand = ACTIVE_BRAND_MODULE;

export const brand = ACTIVE;
export const BRAND_KEY = ACTIVE.key;
export const brandColors = ACTIVE.colors;
export const brandConfig = ACTIVE.config;
export const brandAssets = ACTIVE.assets;
export const brandStrings = ACTIVE.strings;
export const ACTIVE_BRAND_REQUESTED = ACTIVE_BRAND_KEY;
export function getBrand(): Brand {
  return ACTIVE;
}
