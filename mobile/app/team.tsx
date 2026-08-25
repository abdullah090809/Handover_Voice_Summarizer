import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth-context';
import { userApi, ApiError } from '@/lib/api';
import { displayName, formatDate } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { Avatar } from '@/components/avatar';
import { RoleBadge } from '@/components/role-badge';
import { AnimatedPressable } from '@/components/animated-pressable';
import { ActionSheet, type ActionSheetItem } from '@/components/action-sheet';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ResetPasswordModal } from '@/components/reset-password-modal';

// Stage M6d -- ported from the web app's TeamPage.jsx, manager-only. Reached
// from a manager-only entry point on the Profile tab (see profile.tsx) --
// there's no bottom-tab slot for this, same reasoning as web's own mobile
// view tucking "Team" behind the sidebar drawer's "More" button rather than
// giving it a tab (see BottomNav.jsx's own comment). The mobile app has no
// drawer, so this is a pushed Stack screen instead, same pattern as
// resident/[id] and edit-profile.
//
// Below 640px, mobile.css turns TeamPage's <table> into a stacked card list
// (see the "RESPONSIVE TABLE -> CARD LIST" block) -- a FlatList of cards is
// the direct native equivalent of that breakpoint, same reasoning as
// residents.tsx.
//
// The backend's /users/ list + detail endpoints are already manager-only
// (require_manager, see app/routers/user.py) -- the redirect below is
// defense in depth for a stray deep link, not the real enforcement point.
//
// Stage M7 -- "Add team member" (team-form.tsx) and the "..." row action
// menu (Edit / Reset password / Deactivate-Reactivate / Delete) are now
// wired up here too, matching web's TeamPage.jsx feature-for-feature.
// Pagination is still intentionally NOT ported -- web paginates at
// 10/page because it can't otherwise fit a table on screen; a scrolling
// card FlatList doesn't have that constraint, so this loads the full list
// at once (mirrors residents.tsx's own "load once, filter in memory"
// approach). Tapping a row still opens a read-only profile (see
// team-member/[id].tsx and manager/[id].tsx), each of which now also has
// its own "Edit" button for the larger employment/personal field set.

type TeamMember = {
    id: number | string;
    name?: string | null;
    email: string;
    username: string;
    role: string;
    created_at: string;
    care_workers_managed_count: number;
    residents_overseen_count: number;
};

export default function TeamScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { user: me, isManager } = useAuth();

    const [users, setUsers] = useState<TeamMember[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [menuUser, setMenuUser] = useState<TeamMember | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
    const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);
    const [busyId, setBusyId] = useState<number | string | null>(null);

    function showNotice(message: string) {
        setNotice(message);
        setTimeout(() => setNotice((cur) => (cur === message ? null : cur)), 3000);
    }

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await userApi.list();
            setUsers(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load the team.');
        }
    }, []);

    useEffect(() => {
        if (!isManager) {
            router.back();
            return;
        }
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [isManager, load, router]);

    // Re-fetch every time this screen regains focus (e.g. returning from
    // team-form.tsx after adding/editing a member, or profile-form.tsx
    // after editing employment details) -- the mount-only effect above
    // left this list showing stale data until a manual pull-to-refresh.
    // Skip the very first focus so we don't double-fetch on initial mount,
    // which the effect above already handles (with its loading spinner).
    const didMount = useRef(false);
    useFocusEffect(
        useCallback(() => {
            if (!didMount.current) {
                didMount.current = true;
                return;
            }
            if (isManager) load();
        }, [isManager, load])
    );

    async function onRefresh() {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }

    async function runToggleActive(user: TeamMember, kind: 'deactivate' | 'activate') {
        setBusyId(user.id);
        try {
            if (kind === 'activate') {
                await userApi.activate(user.id);
                showNotice(`${displayName(user)} reactivated.`);
            } else {
                await userApi.deactivate(user.id);
                showNotice(`${displayName(user)} deactivated.`);
            }
            await load();
        } catch (err) {
            showNotice(err instanceof ApiError ? err.message : 'Could not update this account.');
        } finally {
            setBusyId(null);
        }
    }

    async function runDelete(user: TeamMember) {
        setBusyId(user.id);
        try {
            await userApi.remove(user.id);
            showNotice('Team member removed.');
            await load();
        } catch (err) {
            showNotice(err instanceof ApiError ? err.message : 'Could not remove this account.');
        } finally {
            setBusyId(null);
        }
    }

    function openMenu(user: TeamMember) {
        setMenuUser(user);
    }

    function menuItems(user: TeamMember): ActionSheetItem[] {
        const isSelf = user.id === me?.id;
        const isDeactivated = user.role === 'deactivated';
        return [
            {
                label: 'Edit',
                icon: 'edit-2',
                onPress: () =>
                    router.push({
                        pathname: '/team-form',
                        params: { id: String(user.id), name: user.name || '', username: user.username, email: user.email, role: user.role },
                    }),
            },
            { label: 'Reset password', icon: 'key', onPress: () => setResetTarget(user) },
            isDeactivated
                ? { label: 'Reactivate', icon: 'check-circle', onPress: () => runToggleActive(user, 'activate'), disabled: isSelf }
                : { label: 'Deactivate', icon: 'slash', onPress: () => runToggleActive(user, 'deactivate'), disabled: isSelf },
            { label: 'Delete', icon: 'trash-2', danger: true, onPress: () => setDeleteTarget(user), disabled: isSelf },
        ];
    }

    if (!isManager) return null;

    function renderCard({ item }: { item: TeamMember }) {
        const assignedLabel =
            item.role === 'manager'
                ? `${item.care_workers_managed_count} care worker${item.care_workers_managed_count === 1 ? '' : 's'}`
                : item.role === 'care_worker'
                    ? `${item.residents_overseen_count} resident${item.residents_overseen_count === 1 ? '' : 's'}`
                    : '—';

        return (
            <AnimatedPressable
                style={styles.card}
                onPress={() =>
                    router.push(
                        item.role === 'manager'
                            ? { pathname: '/manager/[id]', params: { id: String(item.id) } }
                            : { pathname: '/team-member/[id]', params: { id: String(item.id) } }
                    )
                }
            >
                <View style={styles.cardTop}>
                    <Avatar name={displayName(item)} size="md" />
                    <View style={styles.cardHeadingText}>
                        <View style={styles.nameRow}>
                            {/* When a user has no name set, displayName() falls back to their
                                raw email -- an unbroken string with no spaces to wrap on, which
                                previously wrapped mid-word into a ragged 3-line title next to
                                the role badge. Truncating with an ellipsis keeps the header row
                                clean; the full email is always still readable one tap away on
                                the detail screen. */}
                            <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
                                {displayName(item)}
                            </Text>
                            {item.id === me?.id && (
                                <View style={styles.youBadge}>
                                    <Text style={styles.youBadgeText}>You</Text>
                                </View>
                            )}
                        </View>
                        {item.name ? <Text style={styles.cardSubtitle}>{item.email}</Text> : null}
                    </View>
                    <RoleBadge role={item.role} />
                    <Pressable
                        hitSlop={10}
                        style={styles.menuButton}
                        onPress={(e) => {
                            e.stopPropagation();
                            openMenu(item);
                        }}
                    >
                        {busyId === item.id ? <ActivityIndicator size="small" /> : <Feather name="more-vertical" size={18} color={colors.textSecondary} />}
                    </Pressable>
                </View>

                <View style={styles.cardFooter}>
                    <Text style={styles.footerChip}>{assignedLabel}</Text>
                    <Text style={styles.footerChip}>· Joined {formatDate(item.created_at)}</Text>
                </View>
            </AnimatedPressable>
        );
    }

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Team' }} />
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <View style={styles.flex}>
            <Stack.Screen
                options={{
                    title: 'Team',
                    headerRight: () => (
                        <Pressable hitSlop={10} onPress={() => router.push({ pathname: '/team-form', params: {} })} style={styles.addButton}>
                            <Feather name="user-plus" size={20} color={colors.teal[600]} />
                        </Pressable>
                    ),
                }}
            />
            <View style={styles.header}>
                <Text style={styles.title}>Team</Text>
                <Text style={styles.subtitle}>Staff accounts, roles, and access.</Text>
            </View>

            {notice && (
                <View style={styles.noticeBox}>
                    <Text style={styles.noticeText}>{notice}</Text>
                </View>
            )}

            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable onPress={load}>
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                </View>
            )}

            <FlatList
                data={users || []}
                keyExtractor={(u) => String(u.id)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                renderItem={renderCard}
                ListEmptyComponent={
                    !error ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>No team members yet</Text>
                            <Text style={styles.emptyBody}>Add staff accounts from the desktop web app to get started.</Text>
                        </View>
                    ) : null
                }
            />

            <ActionSheet
                visible={Boolean(menuUser)}
                title={menuUser ? displayName(menuUser) : undefined}
                items={menuUser ? menuItems(menuUser) : []}
                onClose={() => setMenuUser(null)}
            />

            <ConfirmDialog
                visible={Boolean(deleteTarget)}
                title={deleteTarget ? `Remove ${displayName(deleteTarget)}?` : ''}
                message="This permanently deletes their account. Consider deactivating instead if they may return."
                confirmLabel="Delete account"
                destructive
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => {
                    const target = deleteTarget;
                    setDeleteTarget(null);
                    if (target) runDelete(target);
                }}
            />

            <ResetPasswordModal
                visible={Boolean(resetTarget)}
                targetName={resetTarget ? displayName(resetTarget) : ''}
                targetId={resetTarget ? resetTarget.id : null}
                onClose={() => setResetTarget(null)}
                onDone={showNotice}
            />
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceApp },
    header: { paddingHorizontal: space[5], paddingTop: space[5], paddingBottom: space[2], gap: space[1] },
    title: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, letterSpacing: -0.2, color: colors.textPrimary },
    subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    errorBox: {
        marginHorizontal: space[5],
        marginBottom: space[2],
        backgroundColor: colors.urgency.highBg,
        borderWidth: 1,
        borderColor: colors.urgency.highBorder,
        borderRadius: radius.md,
        padding: space[4],
        gap: space[2],
    },
    errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
    retryText: { fontFamily: fontFamily.uiSemiBold, color: colors.textLink, fontSize: fontSize.sm },
    noticeBox: {
        marginHorizontal: space[5],
        marginBottom: space[2],
        backgroundColor: colors.info.bg,
        borderWidth: 1,
        borderColor: colors.info.border,
        borderRadius: radius.md,
        padding: space[3],
    },
    noticeText: { fontFamily: fontFamily.ui, color: colors.info.DEFAULT, fontSize: fontSize.sm },
    addButton: { paddingHorizontal: space[2], paddingVertical: space[1] },
    menuButton: { padding: space[1] },
    listContent: { paddingHorizontal: space[5], paddingTop: space[2], paddingBottom: space[10], gap: space[3] },
    card: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[3],
        ...shadow.xs,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    cardHeadingText: { flex: 1, gap: 2 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    cardTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.base, color: colors.textPrimary, flexShrink: 1 },
    cardSubtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    youBadge: {
        backgroundColor: colors.info.bg,
        borderWidth: 1,
        borderColor: colors.info.border,
        borderRadius: radius.full,
        height: 18,
        justifyContent: 'center',
        paddingHorizontal: space[2],
    },
    youBadgeText: { fontFamily: fontFamily.uiSemiBold, fontSize: 10, lineHeight: 13, color: colors.info.DEFAULT },
    cardFooter: { flexDirection: 'row', gap: space[2] },
    footerChip: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    emptyState: { alignItems: 'center', paddingVertical: space[10], paddingHorizontal: space[6], gap: space[2] },
    emptyTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    emptyBody: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});
}
