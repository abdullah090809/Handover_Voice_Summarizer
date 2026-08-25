// Design tokens ported 1:1 from the web app's src/styles/tokens.css.
// Keep this file in sync with tokens.css by hand -- there's no shared build
// step between the web and mobile projects, so any palette/type change made
// on the web side needs to be copied over here manually.
//
// "A calm, clinical-trust palette: deep ink navy, warm paper, one confident
// teal accent. Urgency (low/medium/high) is a first-class semantic channel."
//
// Named design-tokens.ts (not theme.ts) deliberately -- constants/theme.ts
// already exists from the create-expo-app scaffold and is wired into
// hooks/use-theme-color.ts + the (tabs) layout's native tab-bar colors.
// This file is the actual brand system; theme.ts stays as the thin
// light/dark plumbing Expo Router's own components expect.

// ---- Base neutrals --------------------------------------------------------
const ink = {
    950: '#0b111b',
    900: '#0f1722',
    800: '#16212f',
    700: '#1f2d3d',
    600: '#2c3d51',
    500: '#445a72',
    400: '#64798f',
    300: '#8ea0b3',
    200: '#c1cdd9',
    100: '#dfe6ed',
};

const paper = {
    100: '#faf9f6',
    200: '#f4f2ec',
    300: '#ece8e0',
    400: '#ddd7c9',
};

const white = '#ffffff';

// ---- Brand / accent --------------------------------------------------------
// A single confident clinical teal. Used sparingly: primary actions, active
// nav state, links, focus rings.
const tealLight = {
    800: '#0a4d47',
    700: '#0e625a',
    600: '#12776d',
    500: '#178a7e',
    400: '#2ba296',
    100: '#e1f2ef',
    50: '#f0f9f7',
};

// ---- Semantic / urgency -----------------------------------------------------
// Deliberately muted, not neon -- these need to sit calmly on a page full of
// other information, not shout for attention constantly.
const urgencyLight = {
    low: '#2f7d5b',
    lowBg: '#eaf5ee',
    lowBorder: '#bfe0cd',
    medium: '#a6690f',
    mediumBg: '#fbf1de',
    mediumBorder: '#edd4a3',
    high: '#b5342b',
    highBg: '#fbeae8',
    highBorder: '#f0c1bb',
};

const infoLight = {
    DEFAULT: '#2b5f8a',
    bg: '#e9f1f8',
    border: '#bcd6e9',
};

// ---- Light palette (default) -------------------------------------------------
export const lightColors = {
    surfaceApp: paper[200],
    surfaceCard: white,
    surfaceSunken: paper[100],
    surfaceHover: paper[100],
    surfaceHoverStrong: paper[200],
    surfaceMuted: paper[300],

    borderSubtle: paper[400],
    borderDefault: '#e0dbcd',
    borderStrong: ink[200],

    textPrimary: ink[900],
    textSecondary: ink[500],
    textTertiary: ink[400],
    textOnDark: paper[100],
    textLink: tealLight[700],

    teal: tealLight,
    urgency: urgencyLight,
    info: infoLight,
    white,
    ink,
    paper,
};

// ---- Dark palette (mirrors :root[data-theme='dark'] in tokens.css) --------
export const darkColors = {
    surfaceApp: ink[950],
    surfaceCard: ink[800],
    surfaceSunken: ink[900],
    surfaceHover: 'rgba(255, 255, 255, 0.05)',
    surfaceHoverStrong: 'rgba(255, 255, 255, 0.09)',
    surfaceMuted: 'rgba(255, 255, 255, 0.08)',

    borderSubtle: ink[700],
    borderDefault: ink[700],
    borderStrong: ink[600],

    textPrimary: paper[100],
    textSecondary: ink[200],
    textTertiary: ink[300],
    textOnDark: paper[100],
    textLink: '#2ba296',

    teal: { ...tealLight, 50: 'rgba(43, 162, 150, 0.14)', 100: 'rgba(43, 162, 150, 0.22)' },
    urgency: {
        low: '#5fb98c',
        lowBg: 'rgba(47, 125, 91, 0.18)',
        lowBorder: urgencyLight.lowBorder,
        medium: '#dba75a',
        mediumBg: 'rgba(166, 105, 15, 0.18)',
        mediumBorder: urgencyLight.mediumBorder,
        high: '#e08078',
        highBg: 'rgba(181, 52, 43, 0.18)',
        highBorder: urgencyLight.highBorder,
    },
    info: { ...infoLight, bg: 'rgba(43, 95, 138, 0.2)' },
    white,
    ink,
    paper,
};

export type BrandColors = typeof lightColors;

export function getBrandColors(scheme: 'light' | 'dark' | null | undefined): BrandColors {
    return scheme === 'dark' ? (darkColors as BrandColors) : lightColors;
}

// ---- Typography --------------------------------------------------------------
// UI face: IBM Plex Sans -- precise, technical, healthcare/instrument feel.
// Reading face: Source Serif 4 -- used specifically for the body of handover
// transcripts & summaries, where comfortable long-form reading matters more
// than anything else in the product.
// Data face: IBM Plex Mono -- timestamps, IDs, exports.
// Loaded via useFonts() in app/_layout.tsx -- see hooks/use-brand-fonts.ts.
export const fontFamily = {
    ui: 'IBMPlexSans_400Regular',
    uiMedium: 'IBMPlexSans_500Medium',
    uiSemiBold: 'IBMPlexSans_600SemiBold',
    uiBold: 'IBMPlexSans_700Bold',
    reading: 'SourceSerif4_400Regular',
    readingMedium: 'SourceSerif4_500Medium',
    readingSemiBold: 'SourceSerif4_600SemiBold',
    mono: 'IBMPlexMono_400Regular',
    monoMedium: 'IBMPlexMono_500Medium',
    monoSemiBold: 'IBMPlexMono_600SemiBold',
};

export const fontSize = {
    xs: 12,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
};

export const lineHeight = {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
    reading: 1.8,
};

// ---- Spacing (8px grid, pre-converted from rem @ 16px base) ---------------
export const space = {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
    16: 64,
};

// ---- Radius -------------------------------------------------------------------
export const radius = {
    sm: 6,
    md: 10,
    lg: 14,
    full: 999,
};

// ---- Shadow (soft, low elevation -- no glow/blur glassmorphism) -----------
// RN doesn't support multi-layer box-shadow, so each maps to one
// representative shadow*/elevation pair rather than the exact multi-shadow
// CSS stack the web version uses.
export const shadow = {
    xs: { shadowColor: '#0f1722', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    sm: { shadowColor: '#0f1722', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    md: { shadowColor: '#0f1722', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    lg: { shadowColor: '#0f1722', shadowOpacity: 0.14, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
};