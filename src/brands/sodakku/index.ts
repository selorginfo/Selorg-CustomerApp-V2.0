import type { Brand } from '../types';
import { shade } from '../../theme/palette';
import { assets } from './assets';
import native from './native.json';

const PRIMARY = '#F3E008';
/** The blue of the SODAKKU wordmark in the logo. */
const ACCENT = '#0D4D96';
/** White on the yellow primary is unreadable (1.36:1); the app's text colour is 12.8:1. */
const ON_PRIMARY = '#1A1A1A';

const brand: Brand = {
  key: 'sodakku',
  colors: {
    primary: PRIMARY,
    // Derived from the primary / accent until design supplies explicit values.
    primaryDark: shade(PRIMARY, -0.2),
    primarySoft: '#FFFFFF',
    primaryTint: shade(PRIMARY, 0.85),
    onPrimary: ON_PRIMARY,
    accent: ACCENT,
    accentDark: shade(ACCENT, -0.2),
    cartRing: ACCENT,
    accentShadow: shade(PRIMARY, -0.2),
    confetti: [PRIMARY, ACCENT],
    confettiArt: [shade(PRIMARY, 0.6), PRIMARY, shade(PRIMARY, 0.3), shade(ACCENT, 0.7)],
    invoiceAccent: ACCENT,
  },
  config: {
    appName: native.displayName,
    shortName: native.displayName,
    website: '',
    androidPackage: native.androidApplicationId ?? '',
    iosBundleId: native.iosBundleId ?? '',
    splashTagline: '',
    splashSubtitle: '',
    shareTagline: '',
    productBrandFallback: '',
    supportPhone: '+919498050649',
    supportEmail: 'admin@sodakku.com',
  },
  assets,
};

export default brand;
