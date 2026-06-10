import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // ── Backgrounds ────────────────────────────────────────────────────────────
    bgScreen:     '#edf0f0', // main scroll-view background
    bgCard:       '#ffffff', // card / sheet / modal surface
    bgElement:    '#f5f5f5', // secondary element bg (locked badges, chips)
    bgInput:      '#fafafa', // text-input background
    bgInputMid:   '#f8fafa', // slightly tinted input bg
    bgTeal:       '#e6f7f7', // teal-accent light bg (mood buttons, chips)
    bgTealMid:    '#d0e8e8', // deeper teal-accent bg
    bgTealDeep:   '#f0fafa', // selected rows with teal tint
    bgError:      '#fff5f5', // danger/error surface
    bgErrorMid:   '#fde8e8', // deeper error surface
    bgWarm:       '#f5ece4', // warm off-white

    // ── Text ───────────────────────────────────────────────────────────────────
    textPrimary:   '#111111', // headings, primary content
    textSecondary: '#333333', // secondary content
    textBody:      '#555555', // body / form labels
    textMuted:     '#888888', // captions, section labels
    textFaint:     '#aaaaaa', // disabled-state text, hints
    textDisabled:  '#cccccc', // very faint / version text
    textLink:      '#0F6E6E', // interactive links
    textError:     '#c0392b', // error / danger text

    // ── Borders & dividers ─────────────────────────────────────────────────────
    borderSubtle:    '#f0f0f0', // very subtle row dividers
    borderLight:     '#e0e0e0', // standard input borders
    borderMid:       '#dddddd', // slightly more visible borders
    borderTeal:      '#a8d8d0', // teal-tinted border
    borderError:     '#ffcdd2', // danger border
    borderErrorMid:  '#fde8e8', // danger border (mid)

    // ── Brand (same in both modes — identity colours) ──────────────────────────
    primary:          '#0F6E6E',
    primaryMid:       '#1a9a9a',
    primaryLight:     '#a8d8d0',
    headerGradStart:  '#0F6E6E',
    headerGradEnd:    '#1a9a9a',

    // ── Status ─────────────────────────────────────────────────────────────────
    success: '#0a7a4e',
    error:   '#c0392b',

    // ── Fixed values (never flip — used on gradients / overlays) ───────────────
    white:        '#ffffff',
    overlay:      'rgba(0,0,0,0.45)',
    overlayDeep:  'rgba(0,0,0,0.65)',
  },
  dark: {
    // ── Backgrounds ────────────────────────────────────────────────────────────
    bgScreen:     '#0f1616',
    bgCard:       '#192222',
    bgElement:    '#222e2e',
    bgInput:      '#1e2a2a',
    bgInputMid:   '#1a2626',
    bgTeal:       '#0e2626',
    bgTealMid:    '#0a2020',
    bgTealDeep:   '#182828',
    bgError:      '#2a1515',
    bgErrorMid:   '#2e1818',
    bgWarm:       '#2a2018',

    // ── Text ───────────────────────────────────────────────────────────────────
    textPrimary:   '#eef0f0',
    textSecondary: '#c0cccc',
    textBody:      '#9aacac',
    textMuted:     '#7a9090',
    textFaint:     '#527070',
    textDisabled:  '#3a5050',
    textLink:      '#3ab8b8',
    textError:     '#e05040',

    // ── Borders & dividers ─────────────────────────────────────────────────────
    borderSubtle:    '#263030',
    borderLight:     '#2a3838',
    borderMid:       '#2e3e3e',
    borderTeal:      '#1a4e4e',
    borderError:     '#4a2424',
    borderErrorMid:  '#3e2020',

    // ── Brand ─────────────────────────────────────────────────────────────────
    primary:          '#0F6E6E',
    primaryMid:       '#1a9a9a',
    primaryLight:     '#a8d8d0',
    headerGradStart:  '#0a2626',
    headerGradEnd:    '#0F6E6E',

    // ── Status ─────────────────────────────────────────────────────────────────
    success: '#18a86a',
    error:   '#e05040',

    // ── Fixed ─────────────────────────────────────────────────────────────────
    white:       '#ffffff',
    overlay:     'rgba(0,0,0,0.6)',
    overlayDeep: 'rgba(0,0,0,0.75)',
  },
} as const;

export type AppColors = typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
