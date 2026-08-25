import { useCallback, useEffect, useState, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/lib/auth-context';
import { notificationApi, handoverApi, ApiError } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { AnimatedPressable } from '@/components/animated-pressable';

// Stage M6e -- ported from the web app's NotificationsPage.jsx (nav label
// "Alerts", route /notifications -- see Sidebar.jsx), manager-only. Reached
// from the same manager-only link-card pattern M6d introduced on the
// Profile tab for Team, for the same reason: web tucks this behind the
// sidebar drawer's "More" button on mobile viewports, and this app has no
// drawer to tuck it behind.
//
// Web's NotificationsPage subscribes to a live WebSocket event
// (useLiveUpdates -- see WebSocketContext.jsx) to auto-refresh the moment a
// new alert comes in. The mobile app has no WebSocketContext equivalent
// built yet (api.ts's WS_BASE_URL has been defined since M2 but nothing
// has ever used it), so that's out of scope for this pass -- pull-to-refresh
// covers picking up new alerts manually, same tradeoff M6c made for its own
// profile-refresh behavior. Revisit once/if the app needs real-time push
// updates for more than just this one screen (worth building once, shared,
// not bolted onto this screen alone).
//
// Tapping an alert with a linked handover note pushes to the *existing*
// handover detail route (/handover/[id]) instead of porting
// HandoverDetailModal.jsx a second time -- same "one detail screen, reused
// from wherever a note is opened" reasoning resident/[id].tsx's own Handover
// History tab already uses.
//
// Deliberately deferred for this pass: none of the actions here are large
// admin forms (mark-as-read and mark-all-read are both single-purpose
// mutations, not a form), so unlike M6d there isn't really a mutation
// surface to defer -- this screen ports close to 1:1 with web, minus the
// live-WebSocket piece above.
//
// Visual pass: this screen used to be the plainest one in the app -- a
// generic "⚠" text glyph for every row regardless of what actually
// happened, and a reused UrgencyBadge that rendered a green "Unknown" pill
// for assignment-change alerts (which have no urgency_flag at all, since
// they're not urgency-rated handover notes) -- reading like an error state
// for something that isn't one. Rows now get a real category: an
// assignment-change alert is an "Update" (blue, refresh icon), a handover
// note keeps its actual urgency tone and gets a triangle/circle/bell icon
// scaled to how urgent it is, matching the same tone system Audit already
// uses for its own category icons (see audit.tsx's categoryTone). Each
// row also gets a thin colored spine down its left edge in that same tone
// -- the "urgency spine" motif referenced in the web app's own .card
// styles -- so the severity reads at a glance without needing to parse
// the badge text.
type AlertKind = 'update' | 'low' | 'medium' | 'high';

function kindFor(urgency: string | null): AlertKind {
    if (urgency === 'high' || urgency === 'urgent') return 'high';
    if (urgency === 'medium') return 'medium';
    if (urgency === 'low') return 'low';
    // No urgency_flag at all -- this is an assignment/status-change alert,
    // not a rated handover note. Treated as a neutral "update", not an
    // unrated urgency.
    return 'update';
}

function toneFor(colors: BrandColors, kind: AlertKind) {
    if (kind === 'high') return { bg: colors.urgency.highBg, border: colors.urgency.highBorder, fg: colors.urgency.high, icon: 'alert-triangle' as const, label: 'High' };
    if (kind === 'medium') return { bg: colors.urgency.mediumBg, border: colors.urgency.mediumBorder, fg: colors.urgency.medium, icon: 'alert-circle' as const, label: 'Medium' };
    if (kind === 'low') return { bg: colors.urgency.lowBg, border: colors.urgency.lowBorder, fg: colors.urgency.low, icon: 'bell' as const, label: 'Low' };
    return { bg: colors.info.bg, border: colors.info.border, fg: colors.info.DEFAULT, icon: 'refresh-cw' as const, label: 'Update' };
}

type NotificationItem = {
    id: number;
    message: string;
    urgency_flag: string | null;
    resident_id: number | null;
    handover_note_id: number | null;
    is_read: boolean;
    created_at: string;
};

export default function AlertsScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { isManager } = useAuth();

    const [items, setItems] = useState<NotificationItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [markingAll, setMarkingAll] = useState(false);
    const [openingId, setOpeningId] = useState<number | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await notificationApi.list(100);
            setItems(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load alerts.');
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

    if (!isManager) return null;

    async function onRefresh() {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }

    async function markRead(n: NotificationItem) {
        if (n.is_read) return;
        try {
            await notificationApi.markRead(n.id);
            setItems((prev) => (prev ? prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) : prev));
        } catch {
            // Same as web -- a failed mark-read isn't worth interrupting the
            // tap-through to the handover note below.
        }
    }

    async function markAllRead() {
        setMarkingAll(true);
        try {
            await notificationApi.markAllRead();
            setItems((prev) => (prev ? prev.map((x) => ({ ...x, is_read: true })) : prev));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not update alerts.');
        } finally {
            setMarkingAll(false);
        }
    }

    async function openNotification(n: NotificationItem) {
        markRead(n);
        if (!n.handover_note_id) return;
        setOpeningId(n.id);
        try {
            // Confirms the note still exists/is reachable before navigating,
            // same guard web's openHandoverNote does -- a notification can
            // outlive the handover note it points at (e.g. deleted since).
            await handoverApi.get(n.handover_note_id);
            router.push({ pathname: '/handover/[id]', params: { id: String(n.handover_note_id) } });
        } catch {
            setError('That handover note is no longer available.');
        } finally {
            setOpeningId(null);
        }
    }

    const unreadCount = items?.filter((n) => !n.is_read).length ?? 0;

    function renderRow({ item, index }: { item: NotificationItem; index: number }) {
        const kind = kindFor(item.urgency_flag);
        const tone = toneFor(colors, kind);
        const isOpening = openingId === item.id;
        return (
            <Animated.View
                // Staggered entrance on first mount only -- FlatList keeps the
                // same component instance across re-renders for a stable key
                // (e.g. when markRead flips is_read), so this doesn't replay
                // every time the list updates, only when a row is first laid
                // out. Delay is capped so a long list doesn't leave the last
                // rows waiting behind a multi-second queue.
                entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(280)}
            >
                <AnimatedPressable
                    style={[styles.row, !item.is_read && styles.rowUnread, { borderLeftColor: tone.fg }]}
                    onPress={() => openNotification(item)}
                    disabled={isOpening}
                >
                    <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
                        {isOpening ? (
                            <ActivityIndicator size="small" color={tone.fg} />
                        ) : (
                            <Feather name={tone.icon} size={16} color={tone.fg} />
                        )}
                        {!item.is_read && <View style={[styles.unreadDot, { borderColor: colors.surfaceCard }]} />}
                    </View>
                    <View style={styles.rowBody}>
                        <Text style={[styles.rowMessage, !item.is_read && styles.rowMessageUnread]}>{item.message}</Text>
                        <View style={styles.rowMetaRow}>
                            <View style={[styles.kindPill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                                <Text style={[styles.kindPillText, { color: tone.fg }]}>{tone.label}</Text>
                            </View>
                            <Text style={styles.rowMeta}>{formatRelative(item.created_at)}</Text>
                        </View>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.textTertiary} />
                </AnimatedPressable>
            </Animated.View>
        );
    }

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Alerts' }} />
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <View style={styles.flex}>
            <Stack.Screen options={{ title: 'Alerts' }} />
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View style={{ flex: 1 }}>
                        <View style={styles.titleRow}>
                            <Text style={styles.title}>Alerts</Text>
                            {unreadCount > 0 && (
                                <View style={styles.unreadCountPill}>
                                    <Text style={styles.unreadCountPillText}>{unreadCount} new</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.subtitle}>Urgent handovers and resident status changes across your care home.</Text>
                    </View>
                </View>
                {unreadCount > 0 && (
                    <Pressable style={styles.markAllButton} onPress={markAllRead} disabled={markingAll}>
                        {markingAll ? (
                            <ActivityIndicator size="small" color={colors.teal[700]} />
                        ) : (
                            <>
                                <Feather name="check" size={14} color={colors.teal[700]} />
                                <Text style={styles.markAllButtonText}>Mark all read</Text>
                            </>
                        )}
                    </Pressable>
                )}
            </View>

            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable onPress={load}>
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                </View>
            )}

            <FlatList
                data={items || []}
                keyExtractor={(n) => String(n.id)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                renderItem={renderRow}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={
                    !error ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>No alerts</Text>
                            <Text style={styles.emptyBody}>Urgent handovers and resident status changes will appear here.</Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceApp },
    header: { paddingHorizontal: space[5], paddingTop: space[5], paddingBottom: space[3], gap: space[3] },
    headerTop: { flexDirection: 'row', alignItems: 'flex-start' },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    title: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, letterSpacing: -0.2, color: colors.textPrimary },
    unreadCountPill: {
        backgroundColor: colors.teal[600],
        borderRadius: radius.full,
        height: 20,
        justifyContent: 'center',
        paddingHorizontal: space[2],
    },
    unreadCountPillText: { fontFamily: fontFamily.uiSemiBold, fontSize: 11, lineHeight: 14, color: colors.white },
    subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
    markAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: colors.borderDefault,
        backgroundColor: colors.surfaceCard,
        borderRadius: radius.md,
        paddingVertical: space[2],
        paddingHorizontal: space[4],
    },
    markAllButtonText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.teal[700] },
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
    listContent: { paddingHorizontal: space[5], paddingBottom: space[10] },
    separator: { height: space[2] },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        // Urgency spine -- a colored left edge (set per-row from the alert's
        // tone) instead of a plain uniform border, so severity reads at a
        // glance the same way Handovers' own card-urgency treatment does on
        // web. 3px keeps it a quiet accent, not a stripe.
        borderLeftWidth: 3,
        borderRadius: radius.lg,
        padding: space[4],
        ...shadow.xs,
    },
    rowUnread: { backgroundColor: colors.teal[50] },
    rowIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
    },
    rowBody: { flex: 1, gap: 4 },
    rowMessage: { fontFamily: fontFamily.uiMedium, fontSize: fontSize.base, color: colors.textPrimary, lineHeight: fontSize.base * 1.3 },
    rowMessageUnread: { fontFamily: fontFamily.uiBold },
    rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    kindPill: {
        height: 20,
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: radius.full,
        paddingHorizontal: space[2],
    },
    kindPillText: { fontFamily: fontFamily.uiSemiBold, fontSize: 10, lineHeight: 13 },
    rowMeta: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    // Small ring-bordered dot pinned to the icon's corner rather than a
    // separate dot floating at the row's far edge -- ties the "unread"
    // signal to the same glyph the eye already lands on first.
    unreadDot: {
        position: 'absolute',
        top: -1,
        right: -1,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.teal[600],
        borderWidth: 2,
    },
    emptyState: { alignItems: 'center', paddingVertical: space[10], paddingHorizontal: space[6], gap: space[2] },
    emptyTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    emptyBody: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});
}
