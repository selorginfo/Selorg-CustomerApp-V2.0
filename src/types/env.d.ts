declare module '@env' {
  export const APP_MODE: string;
  export const API_BASE_URL: string;
  export const DEV_API_BASE_URL: string;
  export const PROD_API_BASE_URL: string;
  export const PAYMENT_API_BASE_URL: string | undefined;
  export const GOOGLE_MAPS_API_KEY: string;
  export const BRAND_KEY: string | undefined;
  export const APP_ENV: string | undefined;
}
