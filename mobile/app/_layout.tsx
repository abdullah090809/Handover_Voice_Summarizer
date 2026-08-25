import { DefaultTheme, DarkTheme, ThemeProvider as NavigationThemeProvider, type Theme } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import { useBrandFonts } from '@/hooks/use-brand-fonts';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { fontFamily } from '@/constants/design-tokens';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/lib/theme-context';
import { initApiBase } from '@/lib/api';

SplashScreen.preventAutoHideAsync();

// Dark mode now runs off AppThemeProvider (lib/theme-context.tsx) instead of
// a single fixed `lightColors` import -- see that file's header comment.
// React Navigation's own native Stack header theme is built from the same
// active palette below, so a pushed screen's header (Resident, Team, Team
// member, Manager, Profile, Audit, Alerts, Search…) always matches the
// screen content beneath it, in whichever theme the user has chosen --
// same "keep the native header visually consistent" goal as before, just
// now reactive instead of hardcoded to light.
function buildNavigationTheme(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean): Theme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.teal[600],
      background: colors.surfaceApp,
      card: colors.surfaceCard,
      text: colors.textPrimary,
      border: colors.borderDefault,
      notification: colors.urgency.high,
    },
  };
}

// Root layout. This is the ONE place AuthProvider should wrap the tree --
// do not duplicate it inside (tabs)/_layout.tsx. Route protection is done
// declaratively with Stack.Protected: authenticated users get (tabs) +
// modal, everyone else is restricted to login. Do not add app/index.tsx or
// app/explore.tsx -- those screens live under app/(tabs)/.
function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { colors } = useTheme();

  // Handle mobile push notifications permission, registration and click navigation
  usePushNotifications(isAuthenticated);

  // Shown briefly while auth-context checks SecureStore for a stored
  // token on launch (theme preference is also loaded from SecureStore by
  // then -- see RootLayout below, which waits on both before rendering).
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceApp }}>
        <ActivityIndicator size="large" color={colors.teal[600]} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surfaceCard },
        headerTintColor: colors.teal[600],
        headerTitleStyle: { fontFamily: fontFamily.uiSemiBold, color: colors.textPrimary },
        headerShadowVisible: true,
        // Fix for the white flash on push/pop in dark mode: native-stack's
        // screen container defaults to a WHITE background of its own,
        // independent of anything each screen's own root View renders.
        // Screens don't paint until partway into the slide-in transition,
        // so without this, that default white container shows through
        // underneath/behind the sliding screen for a frame or two -- most
        // visible in dark mode, along the right edge, exactly where a
        // person swiping back or watching a push would look. contentStyle
        // sets the *container's* background to match the active theme so
        // there's nothing white left to show through, on every pushed
        // screen (Team, Alerts, Audit, Resident, Handover, Profile, ...)
        // at once, since it lives on the shared screenOptions rather than
        // needing to be repeated per Stack.Screen.
        contentStyle: { backgroundColor: colors.surfaceApp },
        // Deliberately NOT forcing `animation: 'slide_from_right'` here.
        // That was tried and reverted: forcing a slide on every pushed
        // screen (Team/Alerts/Audit/...) that sits *on top of* the (tabs)
        // Tabs navigator is a known trigger for a broken-preview glitch on
        // Android -- the previous tab screen briefly renders squeezed into
        // a thin strip at one edge mid-transition instead of a clean
        // slide, because react-native-screens has to animate two nested
        // navigators' surfaces at once. Leaving `animation` unset lets
        // each platform use native-stack's own default transition, which
        // doesn't hit that bug -- and now that contentStyle above is set,
        // that default animation is finally visible instead of being
        // masked by the white flash, which is what made it look like
        // "no animation" before.
      }}
    >
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="handover/[id]" options={{ title: 'Handover' }} />
        <Stack.Screen name="resident/[id]" options={{ title: 'Resident' }} />
        {/* Stage M6c -- per this project's own M3-stage rule, new routes
            under the authenticated group must be listed here or they won't
            be reachable (see the M6b-fix session's resident/[id] bug for
            exactly what happens when this step is skipped). */}
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal', title: 'Edit profile', animation: 'slide_from_bottom' }} />
        {/* Stage M6d -- same "must be listed here or it isn't reachable"
            rule as edit-profile above. All three are manager-only (see each
            screen's own isManager guard); routing them into the login group
            instead was considered and rejected, since these still require
            an authenticated session, not merely a non-manager one. */}
        <Stack.Screen name="team" options={{ title: 'Team' }} />
        <Stack.Screen name="team-member/[id]" options={{ title: 'Team member' }} />
        <Stack.Screen name="manager/[id]" options={{ title: 'Manager' }} />
        {/* Stage M7 -- same registration rule as above. team-form covers
            both "Add team member" (from team.tsx's header button) and the
            row menu's "Edit" (account fields); profile-form covers the
            larger employment/personal/emergency-contact edit reached from
            team-member/[id].tsx and manager/[id].tsx's own "Edit" button. */}
        <Stack.Screen name="team-form" options={{ presentation: 'modal', title: 'Team member', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="profile-form" options={{ presentation: 'modal', title: 'Edit profile', animation: 'slide_from_bottom' }} />
        {/* Stage M6e -- same registration rule as above. */}
        <Stack.Screen name="notifications" options={{ title: 'Alerts' }} />
        {/* Stage M6f -- same registration rule as above (this is now the
            fifth stage in a row to hit this exact step). */}
        <Stack.Screen name="audit" options={{ title: 'Audit Log' }} />
        {/* Post-M6f nav-parity pass -- same registration rule as above.
            Profile moved out of the tab bar (see (tabs)/_layout.tsx and
            (tabs)/more.tsx) into a pushed screen, and Search is new. */}
        <Stack.Screen name="profile" options={{ title: 'Profile' }} />
        <Stack.Screen name="search" options={{ title: 'Search', presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="change-password" options={{ presentation: 'modal', title: 'Change password', animation: 'slide_from_bottom' }} />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
      </Stack.Protected>
      {/* Deliberately NOT inside either Stack.Protected group above --
          this needs to be reachable both signed-out (login can't succeed
          at all if the URL is wrong, so it can't require auth to fix) and
          signed-in (WiFi/IP changes mid-session too). See
          server-settings.tsx and the More tab / login screen entry
          points. */}
      <Stack.Screen name="server-settings" options={{ title: 'Server settings', presentation: 'modal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

function ThemedApp() {
  const { colors, isDark, isLoading: themeLoading } = useTheme();
  const navigationTheme = useMemo(() => buildNavigationTheme(colors, isDark), [colors, isDark]);

  // Wait for the stored theme preference to load before rendering, same
  // as fonts below -- avoids a light->dark flash on launch for someone
  // who has dark mode on.
  if (themeLoading) {
    return null;
  }

  return (
    <AuthProvider>
      <NavigationThemeProvider value={navigationTheme}>
        <RootNavigator />
        {/* Status bar content color now follows the active theme -- light
            icons on dark surfaces in dark mode, dark icons on light
            surfaces in light mode -- instead of being hardcoded. */}
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </NavigationThemeProvider>
    </AuthProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useBrandFonts();
  const [apiBaseReady, setApiBaseReady] = useState(false);

  useEffect(() => {
    // Loads any server URL saved via server-settings.tsx from SecureStore
    // before anything (AuthProvider's own launch-time /users/me check
    // included) can issue a request -- otherwise the very first request
    // of the session could race ahead using the stale build-time default.
    initApiBase().then(() => setApiBaseReady(true));
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && apiBaseReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, apiBaseReady]);

  // Keep the native splash screen up (rather than rendering a blank/wrong-font
  // frame, or letting an early request race the server-URL load) until
  // IBM Plex Sans / Source Serif 4 / IBM Plex Mono AND the server URL are ready.
  if ((!fontsLoaded && !fontError) || !apiBaseReady) {
    return null;
  }

  return (
    <AppThemeProvider>
      <ThemedApp />
    </AppThemeProvider>
  );
}