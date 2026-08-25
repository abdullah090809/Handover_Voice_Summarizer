import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as SystemUI from 'expo-system-ui';
import { lightColors, darkColors, type BrandColors } from '@/constants/design-tokens';

// Dark mode, for real this time. Previously every screen imported the
// `lightColors` constant directly at module scope (see e.g. more.tsx's old
// file-level comment, and the removed useColorScheme() import in
// app/_layout.tsx) -- the palette for both themes already existed in
// design-tokens.ts, it just wasn't wired up to anything. This context is
// that wiring: a single source of truth for which theme is active, backed
// by SecureStore (same storage already used for the auth token in
// lib/api.ts) so the choice survives an app restart, with every screen
// reading its colors from `useThemeColors()` instead of the old fixed
// `lightColors` import so the whole app repaints together when the user
// flips the toggle in the More tab / Sidebar account menu.
//
// Deliberately NOT following the OS color scheme automatically -- this is
// a user-controlled in-app setting (a toggle, not a system mirror), same
// as the equivalent control on the web app.

export type ColorScheme = 'light' | 'dark';

const THEME_KEY = 'handover_theme_preference';

type ThemeContextType = {
    colorScheme: ColorScheme;
    colors: BrandColors;
    isDark: boolean;
    isLoading: boolean;
    setColorScheme: (scheme: ColorScheme) => void;
    toggleColorScheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [colorScheme, setColorSchemeState] = useState<ColorScheme>('light');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        SecureStore.getItemAsync(THEME_KEY)
            .then((stored) => {
                if (stored === 'dark' || stored === 'light') {
                    setColorSchemeState(stored);
                }
            })
            .catch(() => { })
            .finally(() => setIsLoading(false));
    }, []);

    function setColorScheme(scheme: ColorScheme) {
        setColorSchemeState(scheme);
        SecureStore.setItemAsync(THEME_KEY, scheme).catch(() => { });
    }

    function toggleColorScheme() {
        setColorScheme(colorScheme === 'dark' ? 'light' : 'dark');
    }

    // The white flash on opening/closing a pushed screen (Team, Alerts,
    // Audit, ...) in dark mode is NOT the same thing as the contentStyle
    // fix already applied in app/_layout.tsx's root <Stack screenOptions>.
    // contentStyle only paints react-native-screens' JS-level content
    // container -- it says nothing about the underlying native root
    // view/window that the OS itself clears to before RN has drawn
    // anything on top of it for that frame, which is white by default
    // regardless of any RN style. expo-system-ui was already a dependency
    // here (part of the Expo SDK) but nothing in the app ever actually
    // called it, so that native background was never told about our
    // theme and stayed on its white default the whole time -- this is
    // the missing half of the fix. Runs whenever the resolved palette
    // changes (initial load finishing, and any later toggle), not just
    // on dark, so light mode's flash-free native background stays
    // explicit too instead of relying on an implicit default.
    useEffect(() => {
        if (isLoading) return;
        const bg = colorScheme === 'dark' ? darkColors.surfaceApp : lightColors.surfaceApp;
        SystemUI.setBackgroundColorAsync(bg).catch(() => { });
    }, [colorScheme, isLoading]);

    const value = useMemo<ThemeContextType>(
        () => ({
            colorScheme,
            colors: colorScheme === 'dark' ? darkColors : lightColors,
            isDark: colorScheme === 'dark',
            isLoading,
            setColorScheme,
            toggleColorScheme,
        }),
        [colorScheme, isLoading]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
    return ctx;
}

// Most screens only need the active palette, not the full theme state --
// this is the one to import for `const colors = useThemeColors();`.
export function useThemeColors(): BrandColors {
    return useTheme().colors;
}
