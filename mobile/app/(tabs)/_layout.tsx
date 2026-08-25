import { Tabs } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, fontSize } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M4: tab titles are Home -> Dashboard, Explore -> Shifts.
// Stage M4.5: tab bar restyled with the shared design tokens (teal active
// state, matching the rest of the app) instead of the scaffold's default
// theme.ts colors.
// Stage M6b: added the Residents tab, and reordered the tab bar to match
// the web app's own mobile bottom nav order exactly -- BottomNav.jsx is
// Home / Handovers / Residents / Shifts, so this is now Dashboard /
// Handovers / Residents / Shifts (previously Dashboard / Shifts /
// Handovers). Screen order in this file is what determines display order,
// so `explore` (Shifts) moved to last.
//
// IMPORTANT: this file must stay a Tabs navigator. Screen content for the
// Dashboard tab lives in ./index.tsx and the Shifts tab lives in
// ./explore.tsx -- do not paste screen content directly into this file
// (see mobile progress notes, this exact mistake has happened before).

export default function TabLayout() {
  const colors = useThemeColors();
  return (
    <Tabs
      // Bottom-tabs keeps every inactive screen mounted but detached from
      // the view tree by default. That's normally fine, but it's the
      // documented trigger for a known react-navigation bug where rapidly
      // switching tabs (or double-tapping one) with a scene `animation` set
      // can leave the destination tab blank until you navigate away and
      // back (see react-navigation/react-navigation#12721). Turning
      // detachInactiveScreens off trades a small amount of background
      // memory for never hitting that blank-tab race.
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal[600],
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surfaceCard,
          borderTopColor: colors.borderDefault,
        },
        // Same white-flash fix as the root Stack's contentStyle -- each
        // tab's own scene container defaults to a white background
        // independent of the screen content inside it, in dark mode.
        sceneStyle: { backgroundColor: colors.surfaceApp },
        // Tabs had no transition at all before this -- tapping Dashboard,
        // Handovers, etc. just hard-cut to the new screen. 'fade' is a
        // quick cross-fade (the new tab fades in as the old one fades out)
        // -- enough motion to feel intentional without the screen
        // physically sliding around every time someone taps the bar.
        animation: 'fade',
        tabBarLabelStyle: {
          fontFamily: fontFamily.uiSemiBold,
          fontSize: fontSize.xs,
        },
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="handovers"
        options={{
          title: 'Handovers',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="list.bullet" color={color} />,
        }}
      />
      <Tabs.Screen
        name="residents"
        options={{
          title: 'Residents',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Shifts',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.fill" color={color} />,
        }}
      />
      {/* Post-M6f nav-parity pass: this 5th tab used to be a genuine
          "Profile" tab (see the removed Stage M6c note) -- Profile has
          since moved to a pushed screen (app/profile.tsx), and this slot
          is now "More", matching web's own bottom nav exactly:
          BottomNav.jsx is Home/Handovers/Residents/Shifts + a "More"
          button that opens the sidebar drawer (Dashboard/Handovers/
          Residents/Shifts/Team/Alerts/Audit + Account: Profile). Expo
          Router tab screens can't render as an overlay drawer the way
          web's sidebar does, so (tabs)/more.tsx renders the same content
          as a dedicated screen instead -- see that file's own header
          comment for the full reasoning. */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color }) => <Feather name="menu" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}