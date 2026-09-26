/** Shared env for real-backend automation (no mocks). */
export const API_BASE = (process.env.API_BASE_URL || "http://127.0.0.1:3333").replace(/\/$/, "");
export const CUSTOMER_PREFIX = "/api/v1/customer";

/** Fixed test mobile/OTP from selorg-service non-prod defaults (OTP_TEST_MOBILE / OTP_TEST_OTP). */
export const TEST_MOBILE = (process.env.OTP_TEST_MOBILE || "9698790921").replace(/\D/g, "").slice(-10);
export const TEST_OTP = process.env.OTP_TEST_OTP || "8790";
export const TEST_PHONE_E164 = `+91${TEST_MOBILE}`;

/** Dev API base as configured in customer-app `.env` (includes customer prefix). */
export const APP_API_BASE =
  (process.env.APP_API_BASE_URL || `${API_BASE}${CUSTOMER_PREFIX}`).replace(/\/$/, "");

export function customerUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${CUSTOMER_PREFIX}${p}`;
}
