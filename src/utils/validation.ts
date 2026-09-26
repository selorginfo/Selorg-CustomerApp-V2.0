/**
 * Shared form validators — mirror `selorg-web-app/src/lib/validation.ts` so the
 * customer app enforces the exact same client-side rules as the web app.
 * Server-side Zod rules in selorg-service remain the final authority.
 */

/** Normalize an Indian mobile to its last 10 digits (accepts +91 / 91 / 0 prefixes). */
export const normalizeIndianPhone = (raw: string): string => {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** Web rule: 10 digits starting 6–9. */
export const isValidIndianMobile = (raw: string): boolean =>
  /^[6-9]\d{9}$/.test(normalizeIndianPhone(raw));

/** Web rule: 6–254 chars, no consecutive dots, single @ with a dotted domain. */
export const isValidEmail = (raw: string): boolean => {
  const email = (raw || '').trim();
  if (email.length < 6 || email.length > 254) return false;
  if (email.includes('..')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/** Web rule: 2–60 chars; letters, spaces and . ' - only. */
export const isValidPersonName = (raw: string): boolean => {
  const name = (raw || '').trim();
  if (name.length < 2 || name.length > 60) return false;
  return /^[A-Za-z][A-Za-z .'-]*$/.test(name);
};

/** Web rule: address line trimmed length 3–120. */
export const isValidAddressLine = (raw: string): boolean => {
  const len = (raw || '').trim().length;
  return len >= 3 && len <= 120;
};

/** Web rule: optional, max 80 chars. */
export const isValidLandmark = (raw: string): boolean =>
  (raw || '').trim().length <= 80;

/** Web rule: city/state — 2–40 chars; letters, spaces and . ' - only. */
export const isValidPlaceName = (raw: string): boolean => {
  const place = (raw || '').trim();
  if (place.length < 2 || place.length > 40) return false;
  return /^[A-Za-z][A-Za-z .'-]*$/.test(place);
};

/** Web rule: Indian PIN code — exactly 6 digits. */
export const isValidPincode = (raw: string): boolean => /^\d{6}$/.test((raw || '').trim());
