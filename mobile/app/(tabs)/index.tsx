import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '@/lib/auth-context';
import { shiftApi, handoverApi, residentApi, notificationApi, ApiError } from '@/lib/api';
import { formatDateTime, formatRelative, firstName, truncate } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { AppHeader } from '@/components/app-header';
import { UrgencyBadge } from '@/components/handover-badges';

// Post-M6f nav-parity pass: this screen was previously a deliberately
// lighter "Stage M4" version (greeting + shift status + a bare handover
// count, see the removed note that used to live here). It's now brought
// up to parity with the web app's own DashboardPage.jsx -- and, more
// specifically, that page's OWN mobile-responsive rendering (this project's
// standing principle: check web's mobile breakpoint behavior, not just its
// desktop layout, before deciding scope) -- stat-card grid with icons,
// Recent handovers / Residents needing attention / Outstanding follow-ups
// panels, and a Quick actions panel. AppHeader (brand + search + alerts
// bell) is now rendered here too, matching AppShell.jsx wrapping every
// route on web.
//
// Deliberately still deferred, same "not scope creep" discipline as every
// other stage:
//   - The "New handover" / handover-detail modals stay as the existing
//     dedicated screens (app/modal.tsx, app/handover/[id].tsx) rather than
//     porting NewHandoverModal.jsx/HandoverDetailModal.jsx as in-place
//     modals -- tapping a row here pushes to /handover/[id], same pattern
//     already used by handovers.tsx and resident/[id].tsx.
//
// Follow-up "Mark done" -- the API layer already had handoverApi.setFollowUpResolved
// (PATCH /handover/{id}/follow-ups) but nothing called it yet. Each row in
// "Outstanding follow-ups" now has its own checkbox that calls it directly
// (optimistically updating `handovers` in place), instead of routing through
// the handover detail screen -- same one-tap-to-resolve pattern as web's
// DashboardPage.jsx follow-up checkboxes.

type Shift = { id: number | string; start_time: string; end_time: string | null };
type Resident = { id: number | string; name: string; status?: string | null };
type HandoverNote = {
    id: number;
    resident_id: number | null;
    status: string;
    urgency_flag: string | null;
    created_at: string;
    summary_json?: { summary?: string; follow_up_actions?: string[] } | null;
    resolved_follow_ups?: string[] | null;
    submitted_by?: { name?: string | null; username?: string } | null;
};
type Notification = { id: number | string; is_read: boolean };

export default function DashboardScreen() {
    const router = useRouter();
    const { user, isManager } = useAuth();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [residents, setResidents] = useState<Resident[]>([]);
    const [handovers, setHandovers] = useState<HandoverNote[] | null>(null);
    const [handoverTotal, setHandoverTotal] = useState<number | null>(null);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [resolvingKey, setResolvingKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const [shiftData, handoverData, residentData] = await Promise.all([
                shiftApi.list(),
                handoverApi.list({ limit: 30 }),
                residentApi.list(false),
            ]);
            setShifts(shiftData || []);
            setHandovers(handoverData?.results ?? handoverData ?? []);
            setHandoverTotal(
                typeof handoverData?.total === 'number'
                    ? handoverData.total
                    : Array.isArray(handoverData)
                        ? handoverData.length
                        : null
            );
            setResidents(residentData || []);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.');
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            if (isManager) {
                notificationApi.list(50).then(setNotifications).catch(() => { });
            }
            setLoading(false);
        })();
    }, [load, isManager]);

    async function onRefresh() {
        setRefreshing(true);
        await load();
        if (isManager) {
            notificationApi.list(50).then(setNotifications).catch(() => { });
        }
        setRefreshing(false);
    }

    // Marks one follow-up action as resolved on its handover note. Updates
    // `handovers` in place (rather than re-fetching everything) so the
    // "Outstanding follow-ups" list and the "Open follow-ups" stat card --
    // both derived from `allFollowUps` below -- shrink immediately.
    async function markFollowUpDone(f: { action: string; note: HandoverNote }) {
        const key = `${f.note.id}:${f.action}`;
        setResolvingKey(key);
        try {
            await handoverApi.setFollowUpResolved(f.note.id, f.action, true);
            setHandovers((prev) =>
                (prev || []).map((n) =>
                    n.id === f.note.id
                        ? { ...n, resolved_follow_ups: [...(n.resolved_follow_ups || []), f.action] }
                        : n
                )
            );
        } catch (err) {
            Alert.alert('Could not update', err instanceof ApiError ? err.message : 'Could not mark this follow-up as done.');
        } finally {
            setResolvingKey((cur) => (cur === key ? null : cur));
        }
    }

    const residentMap = useMemo(() => Object.fromEntries(residents.map((r) => [r.id, r.name])), [residents]);
    const activeResidents = useMemo(() => residents.filter((r) => r.status === 'active'), [residents]);
    const safeHandovers = handovers || [];
    const recentHandovers = safeHandovers.slice(0, 6);
    const urgentHandovers = useMemo(
        () => safeHandovers.filter((n) => n.urgency_flag === 'high' || n.urgency_flag === 'urgent').slice(0, 5),
        [safeHandovers]
    );
    const allFollowUps = useMemo(
        () =>
            safeHandovers
                .filter((n) => n.status === 'complete' && n.summary_json?.follow_up_actions?.length)
                .flatMap((n) => (n.summary_json!.follow_up_actions || []).map((action) => ({ action, note: n })))
                .filter(({ action, note }) => !(note.resolved_follow_ups || []).includes(action)),
        [safeHandovers]
    );
    const followUps = allFollowUps.slice(0, 6);
    const unreadAlerts = notifications.filter((n) => !n.is_read).length;

    const currentShift = useMemo(() => {
        const now = Date.now();
        return shifts.find((s) => {
            const start = new Date(s.start_time).getTime();
            const end = s.end_time ? new Date(s.end_time).getTime() : null;
            return start <= now && (!end || end > now);
        });
    }, [shifts]);

    const nextShift = useMemo(() => {
        return shifts
            .filter((s) => new Date(s.start_time).getTime() > Date.now())
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];
    }, [shifts]);

    if (loading) {
        return (
            <View style={styles.flex}>
                <AppHeader />
                <View style={styles.centerFill}>
                    <ActivityIndicator />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.flex}>
            <AppHeader />
            <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.container}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <Text style={styles.title}>Welcome back{user ? `, ${firstName(user)}` : ''}</Text>
                <Text style={styles.subtitle}>
                    {isManager ? "Here's what's happening across your care home today." : "Here's your shift overview."}
                </Text>

                {error && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                        <Pressable onPress={load}>
                            <Text style={styles.retryText}>Retry</Text>
                        </Pressable>
                    </View>
                )}

                <View style={styles.statGrid}>
                    {isManager ? (
                        <>
                            <StatCard colors={colors} icon={<Feather name="users" size={17} color={colors.teal[600]} />} label="Active residents" value={activeResidents.length} tone="default" />
                            <StatCard colors={colors} icon={<Feather name="alert-triangle" size={17} color={colors.urgency.high} />} label="Urgent handovers (recent)" value={urgentHandovers.length} tone="high" />
                            <StatCard colors={colors} icon={<Feather name="bell" size={17} color={colors.urgency.medium} />} label="Unread alerts" value={unreadAlerts} tone="medium" />
                            <StatCard colors={colors} icon={<MaterialCommunityIcons name="file-music-outline" size={18} color={colors.info.DEFAULT} />} label="Handovers on record" value={handoverTotal !== null ? handoverTotal : '—'} tone="info" />
                        </>
                    ) : (
                        <>
                            <StatCard colors={colors} icon={<Feather name="clock" size={17} color={colors.teal[600]} />} label="Current shift" value={currentShift ? 'On shift' : 'Off shift'} tone="default" />
                            <StatCard colors={colors} icon={<Feather name="users" size={17} color={colors.teal[600]} />} label="Active residents" value={activeResidents.length} tone="default" />
                            <StatCard colors={colors} icon={<MaterialCommunityIcons name="file-music-outline" size={18} color={colors.info.DEFAULT} />} label="Your recent handovers" value={handoverTotal !== null ? handoverTotal : '—'} tone="info" />
                            <StatCard colors={colors} icon={<Feather name="check-square" size={17} color={colors.urgency.medium} />} label="Open follow-ups" value={allFollowUps.length} tone="medium" />
                        </>
                    )}
                </View>

                <View style={styles.panel}>
                    <View style={styles.panelHeader}>
                        <Text style={styles.panelHeading}>Recent handovers</Text>
                        <Pressable onPress={() => router.push('/(tabs)/handovers')}>
                            <Text style={styles.panelLink}>View all</Text>
                        </Pressable>
                    </View>
                    {recentHandovers.length === 0 && <Text style={styles.emptyText}>No handovers yet.</Text>}
                    {recentHandovers.map((n) => (
                        <Pressable key={n.id} style={styles.listRow} onPress={() => router.push(`/handover/${n.id}`)}>
                            <View style={styles.listRowIcon}>
                                <MaterialCommunityIcons name="file-music-outline" size={16} color={colors.teal[600]} />
                            </View>
                            <View style={styles.listRowBody}>
                                <Text style={styles.listRowTitle}>{residentMap[n.resident_id as any] || `Resident #${n.resident_id}`}</Text>
                                <Text style={styles.listRowMeta}>
                                    {formatRelative(n.created_at)}
                                    {isManager && (n.submitted_by?.name?.trim() || n.submitted_by?.username) && (
                                        <> · {n.submitted_by?.name?.trim() || n.submitted_by?.username}</>
                                    )}
                                </Text>
                            </View>
                            <View style={styles.listRowSide}>
                                {n.status === 'complete' ? (
                                    <UrgencyBadge urgency={n.urgency_flag} />
                                ) : (
                                    <View style={styles.statusPill}>
                                        <Text style={styles.statusPillText}>{n.status}</Text>
                                    </View>
                                )}
                                <Feather name="chevron-right" size={15} color={colors.textTertiary} />
                            </View>
                        </Pressable>
                    ))}
                </View>

                {isManager && (
                    <View style={styles.panel}>
                        <View style={styles.panelHeader}>
                            <Text style={styles.panelHeading}>Residents needing attention</Text>
                            <Pressable onPress={() => router.push('/(tabs)/residents')}>
                                <Text style={styles.panelLink}>View residents</Text>
                            </Pressable>
                        </View>
                        {urgentHandovers.length === 0 && <Text style={styles.emptyText}>Nothing urgent right now.</Text>}
                        {urgentHandovers.map((n) => (
                            <Pressable key={n.id} style={styles.listRow} onPress={() => router.push(`/handover/${n.id}`)}>
                                <View style={[styles.listRowIcon, styles.listRowIconDanger]}>
                                    <Feather name="alert-triangle" size={16} color={colors.urgency.high} />
                                </View>
                                <View style={styles.listRowBody}>
                                    <Text style={styles.listRowTitle}>{residentMap[n.resident_id as any] || `Resident #${n.resident_id}`}</Text>
                                    <Text style={styles.listRowMeta} numberOfLines={1}>{truncate(n.summary_json?.summary, 80)}</Text>
                                </View>
                                <UrgencyBadge urgency={n.urgency_flag} />
                            </Pressable>
                        ))}
                    </View>
                )}

                {!isManager && (
                    <View style={styles.panel}>
                        <View style={styles.panelHeader}>
                            <Text style={styles.panelHeading}>Outstanding follow-ups</Text>
                        </View>
                        {followUps.length === 0 && <Text style={styles.emptyText}>All caught up.</Text>}
                        {followUps.map((f, i) => {
                            const key = `${f.note.id}:${f.action}`;
                            const isResolving = resolvingKey === key;
                            return (
                                <Pressable key={i} style={styles.listRow} onPress={() => router.push(`/handover/${f.note.id}`)}>
                                    <Pressable
                                        hitSlop={8}
                                        disabled={isResolving}
                                        style={styles.followUpCheckbox}
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            markFollowUpDone(f);
                                        }}
                                    >
                                        {isResolving ? <ActivityIndicator size="small" color={colors.teal[600]} /> : null}
                                    </Pressable>
                                    <View style={styles.listRowBody}>
                                        <Text style={styles.listRowTitle}>{f.action}</Text>
                                        <Text style={styles.listRowMeta}>
                                            {residentMap[f.note.resident_id as any] || `Resident #${f.note.resident_id}`} · {formatRelative(f.note.created_at)}
                                        </Text>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                )}

                <View style={styles.panel}>
                    <View style={styles.panelHeader}>
                        <Text style={styles.panelHeading}>Quick actions</Text>
                    </View>
                    <View style={styles.quickActions}>
                        {!isManager && (
                            <Pressable style={styles.quickActionBtn} onPress={() => router.push('/modal')}>
                                <Feather name="plus" size={18} color={colors.teal[600]} />
                                <View style={styles.quickActionText}>
                                    <Text style={styles.quickActionTitle}>New handover</Text>
                                    <Text style={styles.quickActionSubtitle}>Record or upload audio</Text>
                                </View>
                            </Pressable>
                        )}
                        {isManager && (
                            <Pressable style={styles.quickActionBtn} onPress={() => router.push('/(tabs)/residents')}>
                                <Feather name="user-plus" size={18} color={colors.teal[600]} />
                                <View style={styles.quickActionText}>
                                    <Text style={styles.quickActionTitle}>Add resident</Text>
                                    <Text style={styles.quickActionSubtitle}>Register a new resident</Text>
                                </View>
                            </Pressable>
                        )}
                        {isManager && (
                            <Pressable style={styles.quickActionBtn} onPress={() => router.push('/team')}>
                                <MaterialCommunityIcons name="account-cog-outline" size={19} color={colors.teal[600]} />
                                <View style={styles.quickActionText}>
                                    <Text style={styles.quickActionTitle}>Manage team</Text>
                                    <Text style={styles.quickActionSubtitle}>Add or update staff</Text>
                                </View>
                            </Pressable>
                        )}
                        {!isManager && (
                            <Pressable style={styles.quickActionBtn} onPress={() => router.push('/(tabs)/explore')}>
                                <Feather name="clock" size={18} color={colors.teal[600]} />
                                <View style={styles.quickActionText}>
                                    <Text style={styles.quickActionTitle}>Log a shift</Text>
                                    <Text style={styles.quickActionSubtitle}>Record your working hours</Text>
                                </View>
                            </Pressable>
                        )}
                        <Pressable style={styles.quickActionBtn} onPress={() => router.push('/(tabs)/residents')}>
                            <Feather name="users" size={18} color={colors.teal[600]} />
                            <View style={styles.quickActionText}>
                                <Text style={styles.quickActionTitle}>View residents</Text>
                                <Text style={styles.quickActionSubtitle}>{activeResidents.length} active</Text>
                            </View>
                        </Pressable>
                        {isManager && (
                            <Pressable style={styles.quickActionBtn} onPress={() => router.push('/notifications')}>
                                <Feather name="bell" size={18} color={colors.teal[600]} />
                                <View style={styles.quickActionText}>
                                    <Text style={styles.quickActionTitle}>Review alerts</Text>
                                    <Text style={styles.quickActionSubtitle}>{unreadAlerts} unread</Text>
                                </View>
                            </Pressable>
                        )}
                    </View>
                </View>

                {!isManager && (
                    <View style={styles.panel}>
                        <View style={styles.panelHeader}>
                            <Text style={styles.panelHeading}>Your shift</Text>
                        </View>
                        {currentShift ? (
                            <View style={styles.shiftStatusRow}>
                                <View style={styles.ongoingBadge}>
                                    <Text style={styles.ongoingBadgeText}>Ongoing</Text>
                                </View>
                                <Text style={styles.panelMeta}>Started {formatDateTime(currentShift.start_time)}</Text>
                            </View>
                        ) : nextShift ? (
                            <Text style={styles.panelMeta}>Next shift {formatDateTime(nextShift.start_time)}</Text>
                        ) : (
                            <Text style={styles.emptyText}>No upcoming shifts logged.</Text>
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

function StatCard({ icon, label, value, tone, colors }: { icon: React.ReactNode; label: string; value: number | string; tone: 'default' | 'high' | 'medium' | 'info'; colors: BrandColors }) {
    const styles = useMemo(() => createStyles(colors), [colors]);
    const wellBg =
        tone === 'high' ? colors.urgency.highBg : tone === 'medium' ? colors.urgency.mediumBg : tone === 'info' ? colors.info.bg : colors.teal[50];
    return (
        <View style={styles.statCard}>
            <View style={[styles.statIconWell, { backgroundColor: wellBg }]}>{icon}</View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
    container: { padding: space[5], paddingBottom: space[10], gap: space[5], backgroundColor: colors.surfaceApp },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceApp },
    title: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, letterSpacing: -0.2, color: colors.textPrimary },
    subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: space[1] },
    errorBox: {
        backgroundColor: colors.urgency.highBg,
        borderWidth: 1,
        borderColor: colors.urgency.highBorder,
        borderRadius: radius.md,
        padding: space[4],
        gap: space[2],
    },
    errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
    retryText: { fontFamily: fontFamily.uiSemiBold, color: colors.textLink, fontSize: fontSize.sm },
    // 2x2 grid, mirrors .stat-row wrapping to two columns at phone widths
    // (see mobile.css) rather than the desktop 4-across row.
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
    statCard: {
        width: '47%',
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[2],
        ...shadow.xs,
    },
    statIconWell: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    statLabel: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    statValue: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, letterSpacing: -0.2, color: colors.textPrimary },
    panel: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[3],
        ...shadow.xs,
    },
    panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    panelHeading: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    panelLink: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textLink },
    panelMeta: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    emptyText: { fontFamily: fontFamily.ui, color: colors.textTertiary, fontSize: fontSize.sm, paddingVertical: space[2] },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
    listRowIcon: {
        width: 34,
        height: 34,
        borderRadius: radius.full,
        backgroundColor: colors.teal[50],
        alignItems: 'center',
        justifyContent: 'center',
    },
    listRowIconDanger: { backgroundColor: colors.urgency.highBg },
    // A tappable checkbox in place of the follow-up row's old static icon
    // -- an empty teal-bordered circle, filled/checked feedback comes from
    // the ActivityIndicator shown mid-request; the row itself disappears
    // from the list once the save succeeds (see markFollowUpDone).
    followUpCheckbox: {
        width: 26,
        height: 26,
        borderRadius: radius.full,
        borderWidth: 2,
        borderColor: colors.teal[400],
        alignItems: 'center',
        justifyContent: 'center',
    },
    listRowBody: { flex: 1, gap: 2 },
    listRowTitle: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
    listRowMeta: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    listRowSide: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    statusPill: {
        backgroundColor: colors.info.bg,
        borderWidth: 1,
        borderColor: colors.info.border,
        borderRadius: radius.full,
        paddingHorizontal: space[2],
        paddingVertical: 3,
    },
    statusPillText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.info.DEFAULT },
    quickActions: { gap: space[2] },
    quickActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.md,
        padding: space[3],
        backgroundColor: colors.surfaceSunken,
    },
    quickActionText: { gap: 1 },
    quickActionTitle: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
    quickActionSubtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    shiftStatusRow: { gap: space[2], alignItems: 'flex-start' },
    ongoingBadge: {
        backgroundColor: colors.urgency.lowBg,
        borderWidth: 1,
        borderColor: colors.urgency.lowBorder,
        borderRadius: radius.full,
        paddingHorizontal: space[2],
        paddingVertical: 3,
    },
    ongoingBadgeText: { fontFamily: fontFamily.uiSemiBold, color: colors.urgency.low, fontSize: fontSize.xs },
    });
}
