import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth-context';
import { notificationApi } from '@/lib/api';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// New this session (post-M6f nav-parity pass). Mirrors the web app's
// AppShell.jsx <header className="topbar"> as it renders below the 767px
// breakpoint (see mobile.css's "@media (max-width: 767px)" block): the
// hamburger button and page title are hidden there (every screen already
// has its own heading, and the bottom tab bar/"More" button already show
// which section you're in -- mobile.css's own comment says so directly),
// leaving just brand mark + GlobalSearch + the manager-only alerts bell.
// That's exactly what this component renders -- it is NOT a full port of
// AppShell's desktop topbar (no breadcrumbs, no collapsible-rail button).
//
// Rendered once per top-level tab screen (Dashboard, Handovers, Residents,
// Shifts), same as AppShell wraps every route. Pushed screens (Team,
// Alerts, Audit, Profile, resident/handover detail) keep their native
// Stack header instead -- that's a different, already-solved treatment
// (back arrow + title), not something this component replaces.

export function AppHeader() {
    const router = useRouter();
    const { isManager } = useAuth();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [unreadCount, setUnreadCount] = useState(0);
    // Bug fix (post-M6f follow-up): this bar used to render flush against
    // y=0, so on notch/status-bar devices the brand mark and search/bell
    // icons sat half-hidden under the status bar -- this screen has no
    // native Stack header (see the file-level comment), so nothing else was
    // accounting for the safe area. Padding the bar's own top by the inset
    // (in addition to its existing vertical padding) fixes that without
    // touching the four screens that render this component.
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (!isManager) return;
        // Best-effort, matches the rest of the app's "no live updates yet"
        // posture (see the mobile progress notes' WS_BASE_URL callouts) --
        // this is a snapshot taken when the screen mounts, not a live feed.
        notificationApi
            .list(50)
            .then((items) => setUnreadCount((items || []).filter((n: any) => !n.is_read).length))
            .catch(() => { });
    }, [isManager]);

    return (
        <View style={[styles.bar, { paddingTop: insets.top + space[3] }]}>
            <View style={styles.brandRow}>
                <View style={styles.brandMark}>
                    <Text style={styles.brandMarkGlyph}>H</Text>
                </View>
                <Text style={styles.brandName}>Handover</Text>
            </View>
            <View style={styles.actions}>
                <Pressable
                    style={styles.iconBtn}
                    onPress={() => router.push('/search')}
                    hitSlop={8}
                    accessibilityLabel="Search"
                >
                    <Feather name="search" size={19} color={colors.textSecondary} />
                </Pressable>
                {isManager && (
                    <Pressable
                        style={styles.iconBtn}
                        onPress={() => router.push('/notifications')}
                        hitSlop={8}
                        accessibilityLabel={`Alerts${unreadCount ? `, ${unreadCount} unread` : ''}`}
                    >
                        <Feather name="bell" size={19} color={colors.textSecondary} />
                        {unreadCount > 0 && <View style={styles.dot} />}
                    </Pressable>
                )}
            </View>
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space[5],
        paddingVertical: space[3],
        backgroundColor: colors.surfaceCard,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderDefault,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    brandMark: {
        width: 26,
        height: 26,
        borderRadius: radius.sm,
        backgroundColor: colors.teal[600],
        alignItems: 'center',
        justifyContent: 'center',
    },
    brandMarkGlyph: { color: colors.white, fontFamily: fontFamily.uiBold, fontSize: fontSize.sm },
    brandName: { fontFamily: fontFamily.uiBold, fontSize: fontSize.base, color: colors.textPrimary },
    actions: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
    dot: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.urgency.high,
        borderWidth: 1.5,
        borderColor: colors.surfaceCard,
    },
    });
}
