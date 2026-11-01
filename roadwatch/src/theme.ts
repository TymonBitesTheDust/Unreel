import { useColorScheme } from 'react-native';

import type { HazardKind } from './lib/hazards';

/**
 * Built to be read at a glance from a phone mount: big type, few colours, and each hazard kind
 * always the same colour — police blue, speed cameras red, traffic cameras amber.
 */
const light = {
  background: '#F2F4F3',
  surface: '#FFFFFF',
  raised: '#FFFFFF',
  ink: '#0D1B1A',
  muted: '#55635F',
  line: '#D6DDDA',
  brand: '#0F766E',
  onBrand: '#FFFFFF',
  danger: '#C62828',
  ok: '#15803D',
  warnSurface: '#FFF4D6',
  warnInk: '#7A4D00',
  shadow: '#000000',
};

const dark: typeof light = {
  background: '#0B1211',
  surface: '#141E1D',
  raised: '#1C2928',
  ink: '#EEF4F2',
  muted: '#9AAEA9',
  line: '#2A3A38',
  brand: '#2DD4BF',
  onBrand: '#04201D',
  danger: '#FF6B5E',
  ok: '#4ADE80',
  warnSurface: '#3A2C0A',
  warnInk: '#FFD27A',
  shadow: '#000000',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const KIND_COLOR: Record<HazardKind, string> = {
  police: '#2563EB',
  speed_camera: '#DC2626',
  traffic_camera: '#D97706',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const type = {
  hero: { fontSize: 34, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '800' as const },
  heading: { fontSize: 18, fontWeight: '700' as const },
  body: { fontSize: 16 },
  small: { fontSize: 14 },
  caption: { fontSize: 12 },
};
