/**
 * Font family is Poppins (already bundled/linked in this project via
 * assets/fonts + react-native.config.js). Sizes/weights follow the
 * Selorg redesign type scale (originally specified against Inter).
 */
const family = {
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
  bold: 'Poppins-Bold',
};

export const fontFamily = family;

export const typography = {
  h1: { fontFamily: family.bold, fontSize: 32, lineHeight: 38 },
  h2: { fontFamily: family.semibold, fontSize: 24, lineHeight: 30 },
  h3: { fontFamily: family.semibold, fontSize: 20, lineHeight: 26 },
  title: { fontFamily: family.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: family.medium, fontSize: 16, lineHeight: 22 },
  menu: { fontFamily: family.medium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: family.regular, fontSize: 12, lineHeight: 16 },
  tiny: { fontFamily: family.medium, fontSize: 10.5, lineHeight: 14 },
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export default typography;
