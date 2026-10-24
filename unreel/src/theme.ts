import { useColorScheme } from 'react-native';

/**
 * Unreel's look: a cool, quiet instrument rather than another feed.
 *
 * - Ultramarine is the brand surface (the status block on the dashboard).
 * - Amber marks what was stopped — the crossed-out frames.
 * - Barlow Condensed for numbers and headings: tall, narrow numerals echo the 9:16 frames the
 *   app is cutting out. Everything else uses the platform font (SF / Roboto) for legibility.
 *
 * The Android overlay (BlockOverlay.kt) and iOS shield (ShieldConfigurationExtension.swift)
 * mirror these values; change them together.
 */
const light = {
  background: '#EDEFF3',
  surface: '#FFFFFF',
  ink: '#10162F',
  muted: '#5A6075',
  line: '#D5D9E2',
  brand: '#2B3BD6',
  /** Text links and small brand-coloured text on the page background. */
  link: '#2B3BD6',
  onBrand: '#FFFFFF',
  onBrandMuted: '#C9CEF7',
  signal: '#FFB020',
  ok: '#1E8E5A',
  warn: '#A66300',
  warnSurface: '#FFF1D6',
  danger: '#C23A22',
};

const dark: typeof light = {
  background: '#0D1124',
  surface: '#171C35',
  ink: '#EEF0F7',
  muted: '#9AA1BC',
  line: '#2A3050',
  brand: '#3443E0',
  link: '#9AA6FF',
  onBrand: '#FFFFFF',
  onBrandMuted: '#C2C8F5',
  signal: '#FFB020',
  ok: '#4CC38A',
  warn: '#F2B24C',
  warnSurface: '#33270F',
  danger: '#FF7A61',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const fonts = {
  display: 'BarlowCondensed_600SemiBold',
  displayBold: 'BarlowCondensed_700Bold',
};

/** Type scale (roughly a 1.25 ratio from a 16pt body). */
export const type = {
  hero: { fontFamily: fonts.displayBold, fontSize: 96, lineHeight: 92, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36 },
  heading: { fontFamily: fonts.display, fontSize: 24, lineHeight: 28 },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Radii follow hierarchy: the hero block is softest, grouped lists less so, controls least. */
export const radius = { hero: 28, group: 16, control: 12 } as const;
