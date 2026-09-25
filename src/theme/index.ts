import { DarkTheme, type Theme } from '@react-navigation/native';
import type { TextStyle } from 'react-native';

export const colors = {
  background: '#000000',
  surface: '#0A0A0A',
  secondarySurface: '#111111',
  elevated: '#181818',
  text: '#FFFFFF',
  secondaryText: '#A1A1A1',
  muted: '#666666', // Decorative only; use secondaryText for readable copy.
  border: '#242424',
  accent: '#B8FF3D',
  onAccent: '#000000',
  error: '#FF9494',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
  large: 40,
  hero: 48,
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const motion = {
  press: 100,
  enter: 240,
  distance: 8,
  pressedScale: 0.97,
} as const;

export const typography = {
  title: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  heading: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 2,
  },
} satisfies Record<string, TextStyle>;

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};
