import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { residentApi, handoverApi, ApiError } from '@/lib/api';
import { formatRelative, formatHandoverCode, truncate } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { UrgencyBadge, HandoverStatusBadge } from '@/components/handover-badges';
import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/lib/auth-context';
import { AnimatedPressable } from '@/components/animated-pressable';

// Stage M6 -- ported from the web app's HandoversPage.jsx + HandoverCard.jsx.
// Deliberately scoped narrower for this first mobile pass:
//   - No resident filter yet (web has a second dropdown) -- urgency filter
//     only. Resident filter can follow later if it's actually wanted; a
//     search-heavy picker like modal.tsx's resident search felt like more
//     chrome than this screen needs for v1.
//   - "Load more" button instead of numbered pagination (page-number UI
//     doesn't translate well to a phone-width list) -- still uses the same
//     server-side skip/limit the web app's Pagination component drives.
const PAGE_SIZE = 10;
const URGENCY_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' },
];

type HandoverNote = {
    id: number;
    shift_id: number;
    shift_number?: number | null;
    resident_id: number | null;
    status: string;
    urgency_flag: string | null;
    error_message: string | null;
    raw_transcript: string | null;
    summary_json: { summary?: string } | null;
    created_at: string;
    submitted_by?: { name?: string | null; username: string } | null;
};
type Resident = { id: number | string; name: string; resident_code?: string | null };

export default function HandoversScreen() {
    const router = useRouter();
    // isManager now comes from the shared AuthProvider instead of this
    // screen fetching /users/me itself -- see auth-context.tsx.
    const { isManager } = useAuth();
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [notes, setNotes] = useState<HandoverNote[] | null>(null);
    const [total, setTotal] = useState(0);
    const [residents, setResidents] = useState<Resident[]>([]);
    const [urgencyFilter, setUrgencyFilter] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async (urgency: string) => {
        setError(null);
        try {
            const [notesData, residentsData] = await Promise.all([
                handoverApi.list({ urgency: urgency || undefined, skip: 0, limit: PAGE_SIZE }),
                residentApi.list(true),
            ]);
            setNotes(notesData.results);
            setTotal(typeof notesData.total === 'number' ? notesData.total : notesData.results.length);
            setResidents(residentsData || []);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load handover notes.');
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load(urgencyFilter);
            setLoading(false);
        })();
        // Deliberately only reloads from scratch when the filter changes, same
        // as the web app resetting to page 1 on a filter change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urgencyFilter]);

    async function onRefresh() {
        setRefreshing(true);
        await load(urgencyFilter);
        setRefreshing(false);
    }

    async function loadMore() {
        if (loadingMore || notes === null || notes.length >= total) return;
        setLoadingMore(true);
        try {
            const more = await handoverApi.list({
                urgency: urgencyFilter || undefined,
                skip: notes.length,
                limit: PAGE_SIZE,
            });
            setNotes([...notes, ...more.results]);
        } catch {
            // A failed "load more" isn't worth a full error state -- the list
            // that's already loaded is still valid, just let the user retry by
            // scrolling again or pulling to refresh.
        } finally {
            setLoadingMore(false);
        }
    }

    const residentMap = useMemo(
        () => Object.fromEntries(residents.map((r) => [r.id, r.name])),
        [residents]
    );
    const residentCodeMap = useMemo(
        () => Object.fromEntries(residents.map((r) => [r.id, r.resident_code])),
        [residents]
    );

    function renderCard({ item }: { item: HandoverNote }) {
        const isPending = item.status === 'pending' || item.status === 'processing';
        const isFailed = item.status === 'failed';
        const residentName = (item.resident_id !== null && residentMap[item.resident_id]) || `Resident #${item.resident_id}`;
        const residentCode = item.resident_id !== null ? residentCodeMap[item.resident_id] : null;
        const submitterName = item.submitted_by?.name?.trim() || item.submitted_by?.username;

        return (
            <AnimatedPressable style={styles.card} onPress={() => router.push({ pathname: '/handover/[id]', params: { id: String(item.id) } })}>
                <View style={styles.cardTop}>
                    <View style={styles.cardHeadingText}>
                        <Text style={styles.cardTitle}>
                            {residentName}
                            {residentCode ? <Text style={styles.cardTitleCode}> · {residentCode}</Text> : null}
                        </Text>
                        <Text style={styles.cardSubtitle}>
                            {formatHandoverCode(item.id)} · Shift #{item.shift_number ?? item.shift_id}
                        </Text>
                    </View>
                    {isPending || isFailed ? (
                        <HandoverStatusBadge status={item.status} />
                    ) : (
                        <UrgencyBadge urgency={item.urgency_flag} />
                    )}
                </View>

                <View style={styles.cardBody}>
                    {item.status === 'complete' && item.summary_json?.summary ? (
                        <Text style={styles.cardSummary}>{truncate(item.summary_json.summary, 140)}</Text>
                    ) : isPending ? (
                        <Text style={styles.cardMutedRow}>Transcribing audio…</Text>
                    ) : isFailed ? (
                        <Text style={styles.cardErrorRow}>{item.error_message || 'Processing failed'}</Text>
                    ) : (
                        <Text style={styles.cardMutedRow}>No summary available.</Text>
                    )}
                </View>

                <View style={styles.cardFooter}>
                    <Text style={styles.footerChip}>{formatRelative(item.created_at)}</Text>
                    {submitterName && <Text style={styles.footerChip}>· {submitterName}</Text>}
                </View>
            </AnimatedPressable>
        );
    }

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
            <View style={styles.header}>
                <Text style={styles.title}>Handover Notes</Text>
                <Text style={styles.subtitle}>Voice handovers, transcribed and structured automatically.</Text>
            </View>

            <FlatList
                horizontal
                data={URGENCY_OPTIONS}
                keyExtractor={(o) => o.value}
                style={styles.filterRow}
                contentContainerStyle={styles.filterRowContent}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => {
                    const active = urgencyFilter === item.value;
                    return (
                        <Pressable
                            style={[styles.filterChip, active && styles.filterChipActive]}
                            onPress={() => setUrgencyFilter(item.value)}
                        >
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
                        </Pressable>
                    );
                }}
            />

            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable onPress={() => load(urgencyFilter)}>
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                </View>
            )}

            <FlatList
                data={notes || []}
                keyExtractor={(n) => String(n.id)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                renderItem={renderCard}
                onEndReachedThreshold={0.4}
                onEndReached={loadMore}
                ListEmptyComponent={
                    !error ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>No handover notes yet</Text>
                            <Text style={styles.emptyBody}>
                                {isManager
                                    ? 'Handover notes submitted by your team will appear here.'
                                    : 'Record your first handover at the end of your shift and it will show up here.'}
                            </Text>
                        </View>
                    ) : null
                }
                ListFooterComponent={
                    loadingMore ? (
                        <ActivityIndicator style={styles.footerLoading} />
                    ) : notes && notes.length > 0 && notes.length < total ? (
                        <Pressable style={styles.loadMoreButton} onPress={loadMore}>
                            <Text style={styles.loadMoreText}>Load more</Text>
                        </Pressable>
                    ) : null
                }
            />

            {!isManager && (
                <Pressable style={styles.fab} onPress={() => router.push('/modal')}>
                    <Text style={styles.fabText}>+</Text>
                </Pressable>
            )}
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
    // Bug fix (round 2): the previous fix (tighter padding so 5 chips fit
    // without scrolling) didn't address the actual problem seen on-device --
    // the chip ROW's height was being resolved before IBM Plex's real glyph
    // metrics were available, so the row locked in a height too short for
    // its own text and everything but the active "All" chip rendered with
    // its top sliced off. Giving the row and each chip an explicit height
    // (not just padding, which only affects the *content* box, not what the
    // row measures itself against on first paint) removes the ambiguous
    // auto-sizing pass entirely -- there's no shorter-than-text frame left
    // to lock in. `alignItems: 'center'` on the content container plus
    // `justifyContent: 'center'` on each chip keeps the label vertically
    // centered inside that fixed height regardless of the exact glyph
    // metrics used.
    filterRow: { flexGrow: 0, height: 44, marginBottom: space[2] },
    filterRowContent: { paddingHorizontal: space[5], alignItems: 'center', gap: space[2] },
    filterChip: {
        height: 36,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.borderDefault,
        backgroundColor: colors.surfaceCard,
        borderRadius: radius.full,
        paddingHorizontal: space[3],
    },
    filterChipActive: { backgroundColor: colors.teal[600], borderColor: colors.teal[600] },
    filterChipText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, lineHeight: fontSize.sm * 1.35, color: colors.textSecondary },
    filterChipTextActive: { color: colors.white },
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
    listContent: { paddingHorizontal: space[5], paddingBottom: space[12], gap: space[4] },
    // Mirrors .card.card-urgency in components.css -- left-spine motif keyed
    // off urgency isn't applied per-card here (the UrgencyBadge already
    // carries that signal), keeping the card itself neutral like the web
    // app's .entity-card base.
    card: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[3],
        ...shadow.xs,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3] },
    cardHeadingText: { flex: 1, gap: 2 },
    cardTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.base, color: colors.textPrimary },
    cardTitleCode: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary },
    cardSubtitle: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.textTertiary },
    cardBody: {},
    cardSummary: { fontFamily: fontFamily.reading, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: fontSize.sm * 1.5 },
    cardMutedRow: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary },
    cardErrorRow: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.urgency.high },
    cardFooter: { flexDirection: 'row', gap: space[2] },
    footerChip: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    emptyState: { alignItems: 'center', paddingVertical: space[10], paddingHorizontal: space[6], gap: space[2] },
    emptyTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    emptyBody: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
    footerLoading: { paddingVertical: space[5] },
    loadMoreButton: { alignItems: 'center', paddingVertical: space[4] },
    loadMoreText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textLink },
    // Mirrors .mobile-fab in the web app's own mobile breakpoint styles.
    fab: {
        position: 'absolute',
        right: space[5],
        bottom: space[6],
        width: 56,
        height: 56,
        borderRadius: radius.full,
        backgroundColor: colors.teal[600],
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow.md,
    },
    fabText: { fontFamily: fontFamily.uiBold, fontSize: 28, color: colors.white, marginTop: -2 },
    });
}