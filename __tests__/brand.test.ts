import { BRAND_KEY, brandAssets, brandColors, brandConfig, getBrand } from '../src/brands';
import selorgBrand from '../src/brands/selorg';
import sodakkuBrand from '../src/brands/sodakku';
import { envProblems } from '../src/config/assertEnv';
import { colors } from '../src/theme/colors';
import { alpha } from '../src/theme/palette';
import { statusMeta } from '../src/utils/format';

describe('selorg brand is a no-op over the pre-white-label values', () => {
  it('resolves selorg by default', () => {
    expect(BRAND_KEY).toBe('selorg');
    expect(brandConfig.androidPackage).toBe('com.selorg.com');
    expect(brandConfig.iosBundleId).toBe('com.selorg.com');
  });

  it('keeps the theme tokens byte-identical', () => {
    expect(brandColors).toEqual({
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
    });
    expect(colors.onPrimary).toBe('#FFFFFF');
    expect(colors.accent).toBe('#034703');
    expect(colors.accentDark).toBe('#023502');
    expect(colors.primary).toBe('#034703');
    expect(colors.primaryDark).toBe('#023502');
    expect(colors.primarySoft).toBe('#FFFFFF');
    expect(colors.statusOnTheWay).toEqual({ c: '#034703', bg: '#E4F2E8' });
    expect(colors.statusArrived).toEqual({ c: '#034703', bg: '#E4F2E8' });
  });

  it('keeps the order status chips identical', () => {
    expect(statusMeta('on-the-way')).toEqual({ label: 'On the way', c: '#034703', bg: '#E4F2E8' });
    expect(statusMeta('arrived')).toEqual({ label: 'Arrived', c: '#034703', bg: '#E4F2E8' });
  });

  it('derives the rider marker halo exactly', () => {
    expect(alpha('#034703', 0.22)).toBe('rgba(3,71,3,0.22)');
  });

  it('keeps the user-facing copy identical', () => {
    expect(brandConfig.appName).toBe('Selorg');
    expect(brandConfig.shortName).toBe('Selorg');
    expect(brandConfig.website).toBe('https://selorg.com');
    expect(brandConfig.splashTagline).toBe('Avoid poison on your plate');
    expect(brandConfig.splashSubtitle).toBe('India\u2019s first lab-tested organic grocery app');
    expect(brandConfig.shareTagline).toBe("India's lab-tested organic grocery app");
    expect(brandConfig.productBrandFallback).toBe('Selorg Organic');
    expect(brandConfig.supportPhone).toBe('');
    expect(brandConfig.supportEmail).toBe('');
    expect(brandAssets.splash).toBeUndefined();
  });
});

describe('sodakku never inherits Selorg identity', () => {
  const selorg = getBrand();
  const sodakku = sodakkuBrand;

  it('uses the supplied primary colour and derived shades', () => {
    expect(sodakku.colors.primary).toBe('#F3E008');
    expect(sodakku.colors.primaryDark).toBe('#c2b306');
    expect(sodakku.colors.primaryTint).toBe('#fdfada');
  });

  it('pairs the yellow with readable foregrounds', () => {
    expect(sodakku.colors.onPrimary).toBe('#1A1A1A');
    expect(sodakku.colors.accent).toBe('#0D4D96');
    expect(sodakku.colors.confettiArt).toHaveLength(4);
  });

  it('has no Selorg colours other than white', () => {
    const selorgHex = Object.values(selorgBrand.colors)
      .flat()
      .map(c => String(c).toLowerCase())
      .filter(c => c !== '#ffffff');
    for (const value of Object.values(sodakku.colors).flat()) {
      expect(selorgHex).not.toContain(String(value).toLowerCase());
    }
  });

  it('has no Selorg text, website or native ids', () => {
    expect(sodakku.config.appName).toBe('Sodakku');
    for (const value of Object.values(sodakku.config)) {
      expect(String(value).toLowerCase()).not.toContain('selorg');
    }
    expect(sodakku.config.androidPackage).not.toBe(selorgBrand.config.androidPackage);
    expect(sodakku.config.iosBundleId).not.toBe(selorgBrand.config.iosBundleId);
  });

  it('has its own support contact', () => {
    expect(sodakku.config.supportPhone).toBe('+919498050649');
    expect(sodakku.config.supportEmail).toBe('admin@sodakku.com');
  });

  it('has its own artwork', () => {
    expect(sodakku.assets.appLogo).not.toBe(selorg.assets.appLogo);
    expect(sodakku.assets.splash).toBeDefined();
    expect(sodakku.assets.organicTagline).toBeUndefined();
  });

  it('leaves the resolved Selorg brand untouched', () => {
    expect(selorg).toBe(selorgBrand);
    expect(selorg.colors.primary).toBe('#034703');
  });
});

describe('env guard', () => {
  const base = { activeBrand: 'sodakku', requestedBrand: 'sodakku' };

  it('rejects a partner env without its BRAND_KEY', () => {
    expect(envProblems({ ...base, env: { API_BASE_URL: 'https://api.example.test' } })).toEqual([
      expect.stringContaining('BRAND_KEY=""'),
    ]);
  });

  it('rejects any Selorg host for a partner brand, in every mode', () => {
    for (const APP_MODE of ['development', 'production']) {
      const problems = envProblems({
        ...base,
        env: {
          APP_MODE,
          BRAND_KEY: 'sodakku',
          DEV_API_BASE_URL: 'https://dev-api.selorg.com/api/v1/customer',
          PROD_API_BASE_URL: 'https://api.selorg.com/api/v1/customer',
          PAYMENT_API_BASE_URL: 'https://api.selorg.com',
        },
      });
      expect(problems.join('\n')).toContain('DEV_API_BASE_URL, PROD_API_BASE_URL');
      expect(problems.join('\n')).not.toContain('PAYMENT_API_BASE_URL');
    }
  });

  it('requires a production URL for a partner brand', () => {
    expect(envProblems({ ...base, env: { APP_MODE: 'production', BRAND_KEY: 'sodakku' } })).toEqual([
      expect.stringContaining('PROD_API_BASE_URL is required'),
    ]);
  });

  it('accepts a partner env on its own host', () => {
    const env = { APP_MODE: 'production', BRAND_KEY: 'sodakku', PROD_API_BASE_URL: 'https://api.example.test' };
    expect(envProblems({ ...base, env })).toEqual([]);
  });

  it('does not match look-alike hosts', () => {
    const env = { BRAND_KEY: 'sodakku', API_BASE_URL: 'https://notselorg.com.example.test' };
    expect(envProblems({ ...base, env })).toEqual([]);
  });

  it('keeps Selorg rules unchanged', () => {
    const selorgBase = { ...base, activeBrand: 'selorg', requestedBrand: 'selorg' };
    expect(envProblems({ ...selorgBase, env: { APP_MODE: 'production' } })).toEqual([]);
    expect(
      envProblems({ ...selorgBase, env: { APP_MODE: 'production', PROD_API_BASE_URL: 'https://api.selorg.com/api/v1/customer' } }),
    ).toEqual([]);
  });
});
