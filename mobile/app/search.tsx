import { useEffect, useMemo, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { residentApi, handoverApi, ApiError } from '@/lib/api';
import { formatRelative, formatHandoverCode, truncate } from '@/lib/format';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { ResidentStatusBadge } from '@/components/resident-badges';
import { UrgencyBadge } from '@/components/handover-badges';

// New this session (post-M6f nav-parity pass). Reached by tapping the
// search icon in AppHeader -- mirrors the web app's GlobalSearch.jsx, which
// on mobile opens a full-screen overlay rather than the desktop dropdown
// (see GlobalSearch.jsx's own `mobileOpen` state).
//
// Deliberately narrower than GlobalSearch.jsx for this pass: that component
// also resolves bare "R-0001"/"EMP-0005"/"HO-0001"-style prefixed record
// codes to a single direct hit (see its ID_LOOKUPS table) and searches team
// members. This screen covers the two entity types that matter most for a
// quick lookup mid-shift -- residents and handovers -- via a simple
// substring match against records already reachable from the Residents/
// Handovers tabs, rather than porting the full prefixed-code resolver.
// Team-member search can follow later if it's actually wanted.

type Resident = { id: number | string; name: string; resident_code?: string | null; status?: string | null; room_number?: string | null };
type HandoverNote = {
    id: number;
    resident_id: number | null;
    urgency_flag: string | null;
    status: string;
    created_at: string;
    summary_json?: { summary?: string } | null;
};

export default function SearchScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [residents, setResidents] = useState<Resident[] | null>(null);
    const [handovers, setHandovers] = useState<HandoverNote[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const [residentData, handoverData] = await Promise.all([
                    residentApi.list(false),
                    handoverApi.list({ limit: 50 }),
                ]);
                setResidents(residentData || []);
                setHandovers(handoverData?.results ?? handoverData ?? []);
            } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not load search data.');
            }
        })();
    }, []);

    const residentMap = useMemo(
        () => Object.fromEntries((residents || []).map((r) => [r.id, r.name])),
        [residents]
    );

    const q = query.trim().toLowerCase();

    const residentResults = useMemo(() => {
        if (!q || !residents) return [];
        return residents
            .filter((r) => r.name?.toLowerCase().includes(q) || r.resident_code?.toLowerCase().includes(q))
            .slice(0, 8);
    }, [residents, q]);

    const handoverResults = useMemo(() => {
        if (!q || !handovers) return [];
        return handovers
            .filter((h) => {
                const code = formatHandoverCode(h.id).toLowerCase();
                const resident = (residentMap[h.resident_id as any] || '').toLowerCase();
                return code.includes(q) || resident.includes(q) || String(h.id) === q;
            })
            .slice(0, 8);
    }, [handovers, residentMap, q]);

    const loading = residents === null || handovers === null;
    const noResults = q.length > 0 && !loading && residentResults.length === 0 && handoverResults.length === 0;

    return (
        <View style={styles.flex}>
            <Stack.Screen options={{ title: 'Search' }} />
            <View style={styles.searchBar}>
                <Feather name="search" size={17} color={colors.textTertiary} />
                <TextInput
                    style={styles.input}
                    placeholder="Search residents or handovers"
                    placeholderTextColor={colors.textTertiary}
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    returnKeyType="search"
                />
                {query.length > 0 && (
                    <Pressable onPress={() => setQuery('')} hitSlop={8}>
                        <Feather name="x" size={17} color={colors.textTertiary} />
                    </Pressable>
                )}
            </View>

            {loading && (
                <View style={styles.centerFill}>
                    <ActivityIndicator />
                </View>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            {!loading && q.length === 0 && (
                <Text style={styles.hintText}>Start typing to search residents and handovers.</Text>
            )}

            {noResults && <Text style={styles.hintText}>No matches for &quot;{query}&quot;.</Text>}

            <FlatList
                contentContainerStyle={styles.list}
                data={[
                    ...(residentResults.length ? [{ type: 'header', key: 'h-residents', label: 'Residents' } as const] : []),
                    ...residentResults.map((r) => ({ type: 'resident', key: `r-${r.id}`, resident: r } as const)),
                    ...(handoverResults.length ? [{ type: 'header', key: 'h-handovers', label: 'Handovers' } as const] : []),
                    ...handoverResults.map((h) => ({ type: 'handover', key: `n-${h.id}`, note: h } as const)),
                ]}
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => {
                    if (item.type === 'header') {
                        return <Text style={styles.sectionLabel}>{item.label}</Text>;
                    }
                    if (item.type === 'resident') {
                        const r = item.resident;
                        return (
                            <Pressable style={styles.row} onPress={() => router.push(`/resident/${r.id}`)}>
                                <View style={styles.rowIcon}>
                                    <Feather name="user" size={16} color={colors.teal[600]} />
                                </View>
                                <View style={styles.rowBody}>
                                    <Text style={styles.rowTitle}>{r.name}</Text>
                                    <Text style={styles.rowMeta}>
                                        {r.resident_code || `#${r.id}`}
                                        {r.room_number ? ` · Room ${r.room_number}` : ''}
                                    </Text>
                                </View>
                                {r.status && <ResidentStatusBadge status={r.status} />}
                            </Pressable>
                        );
                    }
                    const n = item.note;
                    return (
                        <Pressable style={styles.row} onPress={() => router.push(`/handover/${n.id}`)}>
                            <View style={styles.rowIcon}>
                                <Feather name="file-text" size={16} color={colors.teal[600]} />
                            </View>
                            <View style={styles.rowBody}>
                                <Text style={styles.rowTitle}>
                                    {formatHandoverCode(n.id)} · {residentMap[n.resident_id as any] || `Resident #${n.resident_id}`}
                                </Text>
                                <Text style={styles.rowMeta} numberOfLines={1}>
                                    {truncate(n.summary_json?.summary, 60) || formatRelative(n.created_at)}
                                </Text>
                            </View>
                            {n.status === 'complete' && <UrgencyBadge urgency={n.urgency_flag} />}
                        </Pressable>
                    );
                }}
            />
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        margin: space[4],
        paddingHorizontal: space[3],
        height: 44,
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.md,
    },
    input: { flex: 1, fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textPrimary },
    centerFill: { paddingTop: space[10], alignItems: 'center' },
    errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm, marginHorizontal: space[4] },
    hintText: { fontFamily: fontFamily.ui, color: colors.textTertiary, fontSize: fontSize.sm, marginHorizontal: space[4], marginTop: space[2] },
    list: { paddingHorizontal: space[4], paddingBottom: space[10], gap: space[2] },
    sectionLabel: {
        fontFamily: fontFamily.uiSemiBold,
        fontSize: fontSize.xs,
        color: colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        marginTop: space[3],
        marginBottom: space[1],
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.md,
        padding: space[3],
    },
    rowIcon: {
        width: 34,
        height: 34,
        borderRadius: radius.full,
        backgroundColor: colors.teal[50],
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowBody: { flex: 1, gap: 2 },
    rowTitle: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
    rowMeta: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
});
}
