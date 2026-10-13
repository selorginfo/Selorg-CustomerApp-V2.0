import type { Brand } from '../types';
import { assets } from './assets';
import native from './native.json';

const brand: Brand = {
  key: 'selorg',
  colors: {
    primary: '#034703',
    primaryDark: '#023502',
    primarySoft: '#FFFFFF',
    primaryTint: '#E4F2E8',
    onPrimary: '#FFFFFF',
    accent: '#034703',
    accentDark: '#023502',
    cartRing: '#CFECCD',
    accentShadow: '#456e29',
    confetti: ['#2F6B2F', '#8BC34A'],
    invoiceAccent: '#14532d',
  },
  config: {
    appName: native.displayName,
    shortName: 'Selorg',
    website: 'https://selorg.com',
    androidPackage: native.androidApplicationId,
    iosBundleId: native.iosBundleId,
    splashTagline: 'Avoid poison on your plate',
    splashSubtitle: 'India\u2019s first lab-tested organic grocery app',
    shareTagline: "India's lab-tested organic grocery app",
    productBrandFallback: 'Selorg Organic',
    supportPhone: '',
    supportEmail: '',
  },
  assets,
};

export default brand;
