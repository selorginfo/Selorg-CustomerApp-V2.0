/**
 * App color palette. Values match the Selorg brand tokens used across the
 * customer app: forest green primary, warm neutrals, and semantic accents.
 *
 * Page / surface fills are pure white (#FFFFFF). Soft tint tokens used as
 * section backgrounds are also white so the full app stays consistently white;
 * brand greens remain on buttons, status, and accents.
 */
export const colors = {
  primary: '#034703',
  primaryDark: '#023502',
  primarySoft: '#FFFFFF',

  background: '#FFFFFF',
  card: '#FFFFFF',
  surfaceAlt: '#FFFFFF',
  /** Image / skeleton fills — pure white (separation via border). */
  placeholder: '#FFFFFF',

  text: '#1A1A1A',
  textSecondary: '#4C4C4C',
  textMuted: '#7B857A',

  border: '#E0E0E0',
  borderLight: '#EFEFEF',

  /** Soft fill token — forced white for global pure-white UI. */
  tint: '#FFFFFF',
  danger: '#D32F2F',
  dangerSoft: '#FDECEC',
  amber: '#B5741A',
  amberSoft: '#FAF1DF',

  disabled: '#C9D2CB',
  overlay: 'rgba(15,20,14,0.5)',
  white: '#FFFFFF',
  black: '#000000',

  star: '#F5A623',

  statusPending: { c: '#B5741A', bg: '#FAF1DF' },
  statusConfirmed: { c: '#2B6C8C', bg: '#E4F0F6' },
  statusPacking: { c: '#8A5CC0', bg: '#EFE7F8' },
  statusOnTheWay: { c: '#034703', bg: '#E4F2E8' },
  statusArrived: { c: '#034703', bg: '#E4F2E8' },
  statusDelivered: { c: '#2F7D32', bg: '#EAF1E1' },
  statusCancelled: { c: '#D32F2F', bg: '#FDECEC' },
} as const;

export type AppColors = typeof colors;

export default colors;
