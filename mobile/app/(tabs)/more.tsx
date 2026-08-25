import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Image, Pressable, StyleSheet, Modal } from 'react-native';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { notificationApi, resolveFileUrl } from '@/lib/api';
import { displayName, roleLabel } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { Avatar } from '@/components/avatar';

// New this session (post-M6f nav-parity pass), replacing the old Profile
// tab (moved to app/profile.tsx, a pushed screen -- see auth-context/
// profile.tsx's own updated header comment). This tab is the mobile
// equivalent of web's Sidebar.jsx as it renders on a phone: on web, tapping
// the bottom tab bar's "More" button (see BottomNav.jsx) opens that same
// sidebar as a slide-in drawer. Expo Router's tab screens are always
// full-screen, not an overlay-over-content drawer, so this renders as a
// dedicated screen with the same content instead -- same nav item list
// (Dashboard/Handovers/Residents/Shifts, then manager-only Team/Alerts/
// Audit, then an Account section with Profile), and the same footer
// account menu (Profile / Dark mode / Change password / Log out) as
// Sidebar.jsx's `sidebar-footer`.
//
// This also replaces the ad-hoc "manager-only link card" entry points that
// used to live on the Profile tab for Team/Alerts/Audit (see the M6d/M6e/
// M6f handover notes) -- those are now real nav items here instead, giving
// every screen a consistent, always-visible way in rather than being
// tucked one level down inside Profile.
//
// Bug fix: this screen has no native Stack header (same as AppHeader's
// four sibling tabs), so its own header needs to account for the status
// bar itself or the brand row sits half-hidden under the clock/battery
// icons on notch/status-bar devices -- exactly the bug AppHeader already
// solved with `insets.top`. This screen just hadn't picked up that fix.
//
// Visual pass: nav rows now sit inside a bordered/shadowed card and get a
// pressed state, matching the card language the rest of the app uses (see
// index.tsx's `.panel` style) -- previously this screen was flat text on a
// bare background, which read noticeably plainer than every other screen
// once you actually looked at it side by side.
//
// Dark mode: wired to the shared ThemeContext (lib/theme-context.tsx) --
// tapping the toggle now actually switches the app's palette and persists
// the choice, instead of showing a "not available yet" alert.

type NavItem = {
    key: string;
    label: string;
    icon: React.ReactNode;
    route: string;
    managerOnly?: boolean;
    badge?: number;
};

export default function MoreScreen() {
    const router = useRouter();
    const { user, isManager, logout } = useAuth();
    const { colors, isDark, toggleColorScheme } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const insets = useSafeAreaInsets();
    const [unreadCount, setUnreadCount] = useState(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const [signOutVisible, setSignOutVisible] = useState(false);

    useFocusEffect(
        useCallback(() => {
            if (!isManager) return;
            // Bug fix: this used to be a plain useEffect keyed only on
            // isManager, so it fetched once on first mount and never
            // again. Expo Router's tab screens stay mounted when you
            // switch away (they don't unmount/remount), so that effect
            // never re-ran -- meaning after visiting Alerts and marking
            // everything read there, coming back to More still showed
            // the stale unread count from whenever this tab first
            // mounted, sometimes long after the real count had dropped
            // to zero. useFocusEffect re-fetches every time this tab
            // actually comes into view instead, so the badge here always
            // reflects the same count Alerts itself would show.
            notificationApi
                .list(50)
                .then((items) => setUnreadCount((items || []).filter((n: any) => !n.is_read).length))
                .catch(() => { });
        }, [isManager])
    );

    const navItems: NavItem[] = [
        { key: 'dashboard', label: 'Dashboard', icon: <Feather name="grid" size={19} color={colors.textSecondary} />, route: '/(tabs)' },
        { key: 'handovers', label: 'Handovers', icon: <MaterialCommunityIcons name="file-music-outline" size={20} color={colors.textSecondary} />, route: '/(tabs)/handovers' },
        { key: 'residents', label: 'Residents', icon: <Feather name="users" size={19} color={colors.textSecondary} />, route: '/(tabs)/residents' },
        { key: 'shifts', label: 'Shifts', icon: <Feather name="clock" size={19} color={colors.textSecondary} />, route: '/(tabs)/explore' },
        { key: 'team', label: 'Team', icon: <MaterialCommunityIcons name="account-cog-outline" size={20} color={colors.textSecondary} />, route: '/team', managerOnly: true },
        { key: 'alerts', label: 'Alerts', icon: <Feather name="bell" size={19} color={colors.textSecondary} />, route: '/notifications', managerOnly: true, badge: unreadCount },
        { key: 'audit', label: 'Audit', icon: <Feather name="shield" size={19} color={colors.textSecondary} />, route: '/audit', managerOnly: true },
    ];

    function confirmSignOut() {
        setMenuOpen(false);
        setSignOutVisible(true);
    }

    return (
        <View style={styles.flex}>
            <View style={[styles.header, { paddingTop: insets.top + space[4] }]}>
                <View style={styles.brandRow}>
                    <View style={styles.brandMark}>
                        <Image source={require('@/assets/images/logo.png')} style={styles.brandMarkImage} resizeMode="contain" />
                    </View>
                    <View>
                        <Text style={styles.brandName}>Handover</Text>
                        <Text style={styles.brandSubtitle}>Shift &amp; Care Records</Text>
                    </View>
                </View>
            </View>

            <View style={styles.body}>
                <View style={styles.navCard}>
                    {navItems
                        .filter((item) => !item.managerOnly || isManager)
                        .map((item, i, arr) => (
                            <Pressable
                                key={item.key}
                                style={({ pressed }) => [
                                    styles.navRow,
                                    i < arr.length - 1 && styles.navRowDivider,
                                    pressed && styles.navRowPressed,
                                ]}
                                onPress={() => router.push(item.route as any)}
                            >
                                <View style={styles.navIconWell}>{item.icon}</View>
                                <Text style={styles.navLabel}>{item.label}</Text>
                                {!!item.badge && (
                                    <View style={styles.navBadge}>
                                        <Text style={styles.navBadgeText}>{item.badge}</Text>
                                    </View>
                                )}
                                <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                            </Pressable>
                        ))}
                </View>

                <Text style={styles.sectionLabel}>Account</Text>
                <View style={styles.navCard}>
                    <Pressable
                        style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
                        onPress={() => router.push('/profile')}
                    >
                        <View style={styles.navIconWell}>
                            <Feather name="user" size={19} color={colors.textSecondary} />
                        </View>
                        <Text style={styles.navLabel}>Profile</Text>
                        <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                    </Pressable>
                </View>
            </View>

            <View style={styles.footer}>
                <Pressable
                    style={({ pressed }) => [styles.userRow, pressed && styles.navRowPressed]}
                    onPress={() => setMenuOpen(true)}
                >
                    <Avatar name={displayName(user)} size="md" src={resolveFileUrl((user as any)?.profile_photo_url)} />
                    <View style={styles.userInfo}>
                        <Text style={styles.userName} numberOfLines={1}>{displayName(user)}</Text>
                        <Text style={styles.userRole}>{roleLabel(user?.role)}</Text>
                    </View>
                    <Feather name="chevron-up" size={16} color={colors.textTertiary} />
                </Pressable>
            </View>

            <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
                <Pressable style={styles.scrim} onPress={() => setMenuOpen(false)}>
                    <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space[4]) + space[4] }]} onPress={() => { }}>
                        <View style={styles.sheetGrabber} />
                        <View style={styles.sheetHeader}>
                            <Avatar name={displayName(user)} size="md" src={resolveFileUrl((user as any)?.profile_photo_url)} />
                            <View style={styles.userInfo}>
                                <Text style={styles.userName} numberOfLines={1}>{displayName(user)}</Text>
                                <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
                            </View>
                        </View>
                        <View style={styles.sheetDivider} />
                        <Pressable
                            style={({ pressed }) => [styles.sheetItem, pressed && styles.navRowPressed]}
                            onPress={() => { setMenuOpen(false); router.push('/profile'); }}
                        >
                            <Feather name="user" size={16} color={colors.textPrimary} />
                            <Text style={styles.sheetItemText}>Profile</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.sheetItem, pressed && styles.navRowPressed]}
                            onPress={toggleColorScheme}
                        >
                            <Feather name="moon" size={16} color={colors.textPrimary} />
                            <Text style={[styles.sheetItemText, { flex: 1 }]}>Dark mode</Text>
                            <View style={[styles.toggleTrack, isDark && styles.toggleTrackOn]}>
                                <View style={[styles.toggleThumb, isDark && styles.toggleThumbOn]} />
                            </View>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.sheetItem, pressed && styles.navRowPressed]}
                            onPress={() => { setMenuOpen(false); router.push('/change-password'); }}
                        >
                            <Feather name="key" size={16} color={colors.textPrimary} />
                            <Text style={styles.sheetItemText}>Change password</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.sheetItem, pressed && styles.navRowPressed]}
                            onPress={() => { setMenuOpen(false); router.push('/server-settings'); }}
                        >
                            <Feather name="server" size={16} color={colors.textPrimary} />
                            <Text style={styles.sheetItemText}>Server settings</Text>
                        </Pressable>
                        <View style={styles.sheetDivider} />
                        <Pressable
                            style={({ pressed }) => [styles.sheetItem, pressed && styles.navRowPressed]}
                            onPress={confirmSignOut}
                        >
                            <Feather name="log-out" size={16} color={colors.urgency.high} />
                            <Text style={[styles.sheetItemText, { color: colors.urgency.high }]}>Log out</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>

            <ConfirmDialog
                visible={signOutVisible}
                title="Sign out"
                message="You’ll need to sign in again to access your account."
                confirmLabel="Sign out"
                destructive
                onCancel={() => setSignOutVisible(false)}
                onConfirm={() => {
                    setSignOutVisible(false);
                    // Bug fix: calling logout() in the same tick as closing this
                    // Modal stacks a native window teardown (this ConfirmDialog)
                    // directly against another one (the account-menu Modal, closed
                    // just before this dialog opened) *and* the Stack.Protected
                    // navigator swap that logout() triggers (isAuthenticated flips
                    // false, the entire (tabs) tree is torn down and replaced by
                    // login). Three native view-hierarchy transitions firing back
                    // to back like that is a known Android crash source for RN's
                    // <Modal> component, especially with edgeToEdgeEnabled: true
                    // (see app.json). Deferring logout() lets this Modal's close
                    // animation/native teardown finish first.
                    setTimeout(() => logout(), 250);
                }}
            />
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.surfaceApp },
        header: {
            paddingHorizontal: space[5],
            paddingBottom: space[4],
            backgroundColor: colors.surfaceCard,
            borderBottomWidth: 1,
            borderBottomColor: colors.borderDefault,
        },
        brandRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
        brandMark: {
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
        },
        brandMarkImage: { width: 36, height: 36 },
        brandName: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
        brandSubtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        body: { flex: 1, padding: space[4], gap: space[2] },
        navCard: {
            backgroundColor: colors.surfaceCard,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            borderRadius: radius.lg,
            overflow: 'hidden',
            ...shadow.xs,
        },
        navRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingVertical: space[3],
            paddingHorizontal: space[4],
        },
        navRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
        navRowPressed: { backgroundColor: colors.surfaceHover },
        navIconWell: {
            width: 32,
            height: 32,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
        },
        navLabel: { flex: 1, fontFamily: fontFamily.uiMedium, fontSize: fontSize.base, color: colors.textPrimary },
        navBadge: {
            minWidth: 20,
            height: 20,
            borderRadius: radius.full,
            backgroundColor: colors.urgency.high,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 5,
        },
        navBadgeText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.white },
        sectionLabel: {
            fontFamily: fontFamily.uiSemiBold,
            fontSize: fontSize.xs,
            color: colors.textTertiary,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            marginTop: space[3],
            marginBottom: space[1],
            marginLeft: space[1],
        },
        footer: { padding: space[3], borderTopWidth: 1, borderTopColor: colors.borderDefault, backgroundColor: colors.surfaceCard },
        userRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            padding: space[2],
            borderRadius: radius.md,
        },
        userInfo: { flex: 1, gap: 1 },
        userName: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
        userRole: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        userEmail: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        scrim: { flex: 1, backgroundColor: 'rgba(15, 23, 34, 0.4)', justifyContent: 'flex-end' },
        sheet: {
            backgroundColor: colors.surfaceCard,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: space[4],
            paddingTop: space[3],
            gap: space[1],
            ...shadow.lg,
        },
        sheetGrabber: {
            width: 36,
            height: 4,
            borderRadius: radius.full,
            backgroundColor: colors.borderStrong,
            alignSelf: 'center',
            marginBottom: space[3],
        },
        sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingBottom: space[2] },
        sheetDivider: { height: 1, backgroundColor: colors.borderDefault, marginVertical: space[2] },
        sheetItem: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderRadius: radius.md, paddingHorizontal: space[1] },
        sheetItemText: { fontFamily: fontFamily.uiMedium, fontSize: fontSize.base, color: colors.textPrimary },
        toggleTrack: {
            width: 36,
            height: 20,
            borderRadius: radius.full,
            backgroundColor: colors.borderStrong,
            padding: 2,
            justifyContent: 'center',
        },
        toggleTrackOn: { backgroundColor: colors.teal[600] },
        toggleThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.white },
        toggleThumbOn: { alignSelf: 'flex-end' },
    });
}