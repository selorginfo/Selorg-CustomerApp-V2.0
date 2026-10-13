/** Every brand is complete; nothing is inherited from another brand. */
export type BrandColors = {
  primary: string;
  primaryDark: string;
  primarySoft: string;
  /** Soft fill behind brand-coloured status chips (on the way / arrived). */
  primaryTint: string;
  /** Text and icons drawn on a `primary` fill. */
  onPrimary: string;
  /** Brand colour for text and icons on white; must stay readable there. */
  accent: string;
  accentDark: string;
  /** Ring around the active cart button. */
  cartRing: string;
  /** Tinted shadow under selected auth method pills. */
  accentShadow: string;
  /** The two brand colours mixed into celebration confetti. */
  confetti: [string, string];
  /**
   * Replacements for the four greens baked into the rating confetti artwork,
   * in order: #CEFFDA, #96E8AA, #A7FABB, #BFF3CB. Omit to keep the artwork as drawn.
   */
  confettiArt?: [string, string, string, string];
  /** Brand name and rule colour on the PDF invoice. */
  invoiceAccent: string;
};

/**
 * Identity and copy. Empty string means "not provided"; consumers hide the
 * copy or fall back to `appName`.
 */
export type BrandConfig = {
  /** Shown in UI copy. */
  appName: string;
  /** Short name for tight spaces (tab bars, splash). */
  shortName: string;
  website: string;
  androidPackage: string;
  iosBundleId: string;
  splashTagline: string;
  splashSubtitle: string;
  /** Appended to product share messages. */
  shareTagline: string;
  /** Product brand label when the catalogue has none. */
  productBrandFallback: string;
  /** E.164, e.g. +919000000000. Help & support shows a call row when set. */
  supportPhone: string;
  /** Help & support shows an email row when set. */
  supportEmail: string;
};

/** `require()` results — Metro resolves these statically, never build a path. */
export type BrandAssets = {
  appLogo: number;
  organicTagline?: number;
  /** Full-screen splash artwork; when absent the logo + wordmark layout is used. */
  splash?: number;
};

/** Per-language copy overrides, merged deeply over the base bundle. */
export type BrandStrings = Record<string, Record<string, unknown>>;

export type Brand = {
  key: string;
  colors: BrandColors;
  config: BrandConfig;
  assets: BrandAssets;
  strings?: BrandStrings;
};
