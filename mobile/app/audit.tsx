import { useCallback, useEffect, useState, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, RefreshControl, TextInput } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { auditApi, ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { describeAuditEntry, AuditCategory } from '@/lib/audit-descriptions';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M6f -- ported from the web app's AuditPage.jsx (nav label "Audit
// Log", route /audit -- see Sidebar.jsx), manager-only. Reached from the
// same manager-only link-card pattern M6d/M6e already established on the
// Profile tab (Team, then Alerts) -- a third card slots in below Alerts the
// same way, per the previous handover's own note that this is now an
// established, reusable convention rather than something to reinvent.
//
// Unlike M6d/M6e, this screen has NO mutation surface at all -- audit
// entries are an append-only, read-only log (there's nothing here to edit,
// delete, or act on beyond viewing), so unlike Team/Alerts there isn't a
// "big admin form deferred for this pass" list. What web's AuditPage.jsx
// does have is a method filter <select> and a debounced path search input,
// both simple read-only affordances (not mutations), so both are ported
// here rather than deferred.
//
// Web paginates at 20/page with a Pagination.jsx page-number control -- see
// PAGE_SIZE below, kept the same so a manager reviewing the same window of
// activity on either client sees the same page size. A page-number control
// is not a natural mobile pattern the way it is on a desktop table, though,
// so the RN equivalent here is infinite scroll (onEndReached fetches the
// next 20 and appends) rather than porting Pagination.jsx literally. This
// is a deliberate difference from M6d's team.tsx (which loads its full,
// bounded list at once with no paging at all) -- the audit log is
// explicitly NOT expected to be small the way a care home's team roster is
// (it's every request, forever), so "load everything" isn't a safe
// substitute for real paging the way it was for Team.
//
// Below 640px, mobile.css turns AuditPage's <table> into a stacked card
// list, with the "Action" cell (icon + multi-line sentence) specifically
// carved out to keep its own left-aligned internal layout instead of being
// split into a label/value row like the simpler cells (see the "audit log's
// Action cell" comment in mobile.css's RESPONSIVE TABLE -> CARD LIST
// block). A FlatList of cards, each with its own icon + sentence + meta
// row, is the direct native equivalent of that breakpoint -- same
// reasoning as team.tsx and residents.tsx before it.
//
// describeAuditEntry (lib/audit-descriptions.ts) is a verbatim port of the
// web app's lib/auditDescriptions.js -- the categorization rules must stay
// identical across both clients or the same entry would read differently
// depending on which app a manager opens it from.
//
// The backend's /audit/ endpoints are already manager-only (require_manager,
// see app/routers/audit.py) -- the redirect below is defense in depth for a
// stray deep link, not the real enforcement point, same as every prior
// manager-only screen.
const PAGE_SIZE = 20;
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function categoryTone(colors: BrandColors): Record<AuditCategory, { bg: string; fg: string }> {
    return {
        auth: { bg: colors.surfaceMuted, fg: colors.textSecondary },
        create: { bg: colors.urgency.lowBg, fg: colors.urgency.low },
        update: { bg: colors.info.bg, fg: colors.info.DEFAULT },
        delete: { bg: colors.urgency.highBg, fg: colors.urgency.high },
        other: { bg: colors.surfaceMuted, fg: colors.textTertiary },
    };
}

type AuditEntry = {
    id: number;
    created_at: string;
    user_id: number | null;
    user_role: string | null;
    username: string | null;
    method: string;
    path: string;
    status_code: number | null;
    duration_ms: number | null;
    detail: string | null;
};

export default function AuditScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { isManager } = useAuth();

    const [entries, setEntries] = useState<AuditEntry[] | null>(null);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [methodFilter, setMethodFilter] = useState<string | null>(null);
    const [pathInput, setPathInput] = useState('');
    const [pathFilter, setPathFilter] = useState('');

    // Debounce free-text path search so we don't fire a request per
    // keystroke -- same 400ms debounce as web's own useEffect for this.
    useEffect(() => {
        const handle = setTimeout(() => setPathFilter(pathInput.trim()), 400);
        return () => clearTimeout(handle);
    }, [pathInput]);

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await auditApi.list({ skip: 0, limit: PAGE_SIZE, method: methodFilter || undefined, path: pathFilter || undefined });
            setEntries(data.results);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load the audit log.');
        }
    }, [methodFilter, pathFilter]);

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

    async function loadMore() {
        if (loadingMore || !entries || entries.length >= total) return;
        setLoadingMore(true);
        try {
            const data = await auditApi.list({ skip: entries.length, limit: PAGE_SIZE, method: methodFilter || undefined, path: pathFilter || undefined });
            setEntries((prev) => (prev ? [...prev, ...data.results] : data.results));
            setTotal(data.total);
        } catch {
            // A failed "load more" isn't worth surfacing as a page-level
            // error banner -- the list the person can already see is still
            // valid, they just don't get more of it right now. Scrolling
            // back up and pulling to refresh retries cleanly.
        } finally {
            setLoadingMore(false);
        }
    }

    function toggleMethod(m: string) {
        setMethodFilter((prev) => (prev === m ? null : m));
    }

    function renderCard({ item }: { item: AuditEntry }) {
        const desc = describeAuditEntry(item);
        const tone = desc.failed ? categoryTone(colors).delete : categoryTone(colors)[desc.category];
        const isFail = item.status_code != null && item.status_code >= 400;
        return (
            <View style={styles.card}>
                <View style={styles.cardTop}>
                    <View style={[styles.catIcon, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.catIconGlyph, { color: tone.fg }]}>{desc.failed ? '!' : CATEGORY_GLYPH[desc.category]}</Text>
                    </View>
                    <View style={styles.cardBody}>
                        <Text style={[styles.actionText, desc.failed && { color: colors.urgency.high, fontFamily: fontFamily.uiSemiBold }]}>{desc.text}</Text>
                        <View style={styles.metaRow}>
                            <Text style={[styles.methodText, methodTone(colors)[item.method?.toUpperCase()] && { color: methodTone(colors)[item.method.toUpperCase()] }]}>{item.method}</Text>
                            <Text style={styles.pathText} numberOfLines={1}>{item.path}</Text>
                        </View>
                    </View>
                </View>
                <View style={styles.cardFooter}>
                    <Text style={styles.footerChip}>{item.username || (item.user_id ? `User #${item.user_id}` : 'Anonymous')}</Text>
                    <Text style={styles.footerChip}>· {formatDateTime(item.created_at)}</Text>
                    {isFail ? (
                        <Text style={styles.footerStatusFail}>{item.status_code}</Text>
                    ) : (
                        <Text style={styles.footerChip}>· {item.status_code ?? '—'}</Text>
                    )}
                    {item.duration_ms != null && <Text style={styles.footerChip}>· {item.duration_ms}ms</Text>}
                </View>
            </View>
        );
    }

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Audit Log' }} />
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <View style={styles.flex}>
            <Stack.Screen options={{ title: 'Audit Log' }} />
            <View style={styles.header}>
                <Text style={styles.title}>Audit Log</Text>
                <Text style={styles.subtitle}>Who did what, when — activity across your care home for security and compliance review.</Text>
            </View>

            <View style={styles.searchWrap}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by path…"
                    placeholderTextColor={colors.textTertiary}
                    value={pathInput}
                    onChangeText={setPathInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            <FlatList
                horizontal
                data={METHOD_OPTIONS}
                keyExtractor={(m) => m}
                style={styles.filterRow}
                contentContainerStyle={styles.filterRowContent}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: m }) => {
                    const active = methodFilter === m;
                    return (
                        <Pressable style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => toggleMethod(m)}>
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{m}</Text>
                        </Pressable>
                    );
                }}
            />

            {error && (
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Pressable onPress={load}>
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                </View>
            )}

            <FlatList
                data={entries || []}
                keyExtractor={(e) => String(e.id)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                renderItem={renderCard}
                onEndReachedThreshold={0.4}
                onEndReached={loadMore}
                ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: space[4] }} /> : null}
                ListEmptyComponent={
                    !error ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>No activity found</Text>
                            <Text style={styles.emptyBody}>{methodFilter || pathFilter ? 'No audit entries match your filters.' : 'Activity across your care home will appear here.'}</Text>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

const CATEGORY_GLYPH: Record<AuditCategory, string> = {
    auth: '⇥',
    create: '+',
    update: '✎',
    delete: '×',
    other: '•',
};

function methodTone(colors: BrandColors): Record<string, string> {
    return {
        GET: colors.textTertiary,
        POST: colors.urgency.low,
        PATCH: colors.info.DEFAULT,
        PUT: colors.info.DEFAULT,
        DELETE: colors.urgency.high,
    };
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceApp },
    header: { paddingHorizontal: space[5], paddingTop: space[5], paddingBottom: space[2], gap: space[1] },
    title: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, letterSpacing: -0.2, color: colors.textPrimary },
    subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    searchWrap: { paddingHorizontal: space[5], marginBottom: space[3] },
    searchInput: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.md,
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        fontFamily: fontFamily.ui,
        fontSize: fontSize.base,
        color: colors.textPrimary,
    },
    // Same fixed-height treatment as Residents' and Handovers' own filter
    // rows (see either file's comment for the full reasoning): an
    // auto-sized row measures itself against IBM Plex's metrics before
    // they're ready, locking in a height too short for the label text and
    // clipping every chip but the active one. Explicit height + centered
    // content removes that ambiguous auto-sizing pass entirely, and the
    // horizontal scroll (instead of the old wrap) matches how every other
    // filter row in the app behaves.
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
        marginTop: space[2],
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
    listContent: { paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[10], gap: space[3] },
    card: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[3],
        ...shadow.xs,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
    catIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
    catIconGlyph: { fontFamily: fontFamily.uiBold, fontSize: fontSize.sm },
    cardBody: { flex: 1, gap: 3 },
    actionText: { fontFamily: fontFamily.uiMedium, fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: fontSize.sm * 1.3 },
    metaRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
    methodText: { fontFamily: fontFamily.monoSemiBold, fontSize: 11, color: colors.textTertiary },
    pathText: { fontFamily: fontFamily.mono, fontSize: 11, color: colors.textTertiary, flexShrink: 1, opacity: 0.85 },
    cardFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingTop: space[2], borderTopWidth: 1, borderTopColor: colors.borderSubtle },
    footerChip: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.textTertiary },
    footerStatusFail: {
        fontFamily: fontFamily.monoSemiBold,
        fontSize: fontSize.xs,
        color: colors.urgency.high,
        backgroundColor: colors.urgency.highBg,
        borderWidth: 1,
        borderColor: colors.urgency.highBorder,
        borderRadius: radius.full,
        paddingHorizontal: space[2],
    },
    emptyState: { alignItems: 'center', paddingVertical: space[10], paddingHorizontal: space[6], gap: space[2] },
    emptyTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    emptyBody: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});
}
