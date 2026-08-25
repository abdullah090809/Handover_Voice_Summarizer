import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth-context';
import { residentApi, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { ResidentStatusBadge } from '@/components/resident-badges';
import { AppHeader } from '@/components/app-header';
import { AnimatedPressable } from '@/components/animated-pressable';

// Stage M6b -- ported from the web app's ResidentsPage.jsx. On desktop that
// page renders a <table>; below 640px mobile.css turns each row into a
// stacked card (see the "RESPONSIVE TABLE -> CARD LIST" block in
// mobile.css) -- a FlatList of cards is the direct native equivalent of
// that mobile breakpoint, not a scrollable table.
//
// The backend already restricts a care worker's /residents/ response to
// just their own assigned caseload (see residents.py's list_residents --
// enforced server-side via a join on ResidentAssignment, not just hidden
// in the UI), so this screen doesn't need its own role-based filtering.
//
// Deliberately deferred for this first pass (manager-only actions, same
// "scope deliberately deferred, not scope creep" discipline as M6a):
//   - "Add resident" (form modal + FAB) -- ResidentFormModal has a lot of
//     fields and no RN equivalent yet.
//   - "Manage care workers" assignment picker on the detail screen.
// A manager can still do both from the desktop web app in the meantime.

const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'active', label: 'Active' },
    { value: 'discharged', label: 'Discharged' },
    { value: 'deceased', label: 'Deceased' },
    { value: 'all', label: 'All' },
];

type Resident = {
    id: number | string;
    name: string;
    preferred_name?: string | null;
    resident_code?: string | null;
    status: string;
    age?: number | null;
    room_number?: string | null;
    ward_unit?: string | null;
    care_level?: string | null;
    admission_date?: string | null;
    allergies?: string[];
    assigned_care_worker_count?: number;
    assigned_care_workers?: unknown[];
};

export default function ResidentsScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { isManager } = useAuth();
    const [residents, setResidents] = useState<Resident[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('active');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            // includeInactive=true, same as web -- lets the status filter chips
            // below switch to discharged/deceased/all from one fetched list
            // instead of re-fetching per filter.
            const data = await residentApi.list(true);
            setResidents(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load residents.');
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [load]);

    // Re-fetch on focus so returning from resident-form.tsx (add/edit)
    // shows the change immediately instead of the stale mount-time list.
    const didMount = useRef(false);
    useFocusEffect(
        useCallback(() => {
            if (!didMount.current) {
                didMount.current = true;
                return;
            }
            load();
        }, [load])
    );

    async function onRefresh() {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }

    const filtered = useMemo(() => {
        if (!residents) return [];
        const q = search.trim().toLowerCase();
        return residents.filter((r) => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (!q) return true;
            return (
                r.name?.toLowerCase().includes(q) ||
                r.preferred_name?.toLowerCase().includes(q) ||
                r.resident_code?.toLowerCase().includes(q) ||
                r.room_number?.toLowerCase().includes(q) ||
                r.ward_unit?.toLowerCase().includes(q)
            );
        });
    }, [residents, search, statusFilter]);

    function renderCard({ item }: { item: Resident }) {
        const careWorkerCount = item.assigned_care_worker_count ?? item.assigned_care_workers?.length ?? 0;
        const roomWard = [item.room_number ? `Room ${item.room_number}` : null, item.ward_unit].filter(Boolean).join(' · ');

        return (
            <AnimatedPressable
                style={styles.card}
                onPress={() => router.push({ pathname: '/resident/[id]', params: { id: String(item.id) } })}
            >
                <View style={styles.cardTop}>
                    <View style={styles.cardHeadingText}>
                        <View style={styles.nameRow}>
                            <Text style={styles.cardTitle}>{item.preferred_name || item.name}</Text>
                            {!!item.allergies?.length && <Text style={styles.allergyMark}>⚠</Text>}
                        </View>
                        <Text style={styles.cardSubtitle}>
                            {item.resident_code || `Resident #${item.id}`}
                            {item.age != null ? ` · Age ${item.age}` : ''}
                        </Text>
                    </View>
                    <ResidentStatusBadge status={item.status} />
                </View>

                <View style={styles.cardMetaRow}>
                    <Text style={styles.metaText}>{roomWard || '—'}</Text>
                    <Text style={styles.metaText}>
                        {item.care_level ? item.care_level[0].toUpperCase() + item.care_level.slice(1) : '—'}
                    </Text>
                </View>

                <View style={styles.cardFooter}>
                    <Text style={styles.footerChip}>
                        {careWorkerCount} care worker{careWorkerCount === 1 ? '' : 's'}
                    </Text>
                    {item.admission_date && <Text style={styles.footerChip}>· Admitted {formatDate(item.admission_date)}</Text>}
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
                <Text style={styles.title}>Residents</Text>
                <Text style={styles.subtitle}>Resident records, care details, and handover history.</Text>
            </View>

            <View style={styles.searchWrap}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, room, or ward…"
                    placeholderTextColor={colors.textTertiary}
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            <FlatList
                horizontal
                data={STATUS_OPTIONS}
                keyExtractor={(o) => o.value}
                style={styles.filterRow}
                contentContainerStyle={styles.filterRowContent}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => {
                    const active = statusFilter === item.value;
                    return (
                        <Pressable
                            style={[styles.filterChip, active && styles.filterChipActive]}
                            onPress={() => setStatusFilter(item.value)}
                        >
                            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item.label}</Text>
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
                data={filtered}
                keyExtractor={(r) => String(r.id)}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                renderItem={renderCard}
                ListEmptyComponent={
                    !error ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyTitle}>
                                {residents && residents.length === 0 ? 'No residents yet' : 'No residents match your filters'}
                            </Text>
                            <Text style={styles.emptyBody}>
                                {residents && residents.length === 0
                                    ? 'Residents added by your manager will appear here.'
                                    : 'Try a different search term or status filter.'}
                            </Text>
                        </View>
                    ) : null
                }
            />

            {isManager && (
                <Pressable
                    style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
                    onPress={() => router.push({ pathname: '/resident-form', params: {} })}
                    accessibilityLabel="Add resident"
                >
                    <Feather name="plus" size={24} color={colors.white} />
                </Pressable>
            )}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
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
        ...shadow.lg,
    },
    fabPressed: { backgroundColor: colors.teal[700], transform: [{ scale: 0.94 }] },
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
    // Bug fix -- same fixed-height treatment as the Handovers screen's own
    // urgency filter row (see that file's comment for the full reasoning):
    // an auto-sized row measured against IBM Plex's metrics before they
    // were ready, locking in a height too short for the label text and
    // clipping every chip but the active one. Explicit height + centered
    // content removes the ambiguous auto-sizing pass entirely.
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
    listContent: { paddingHorizontal: space[5], paddingBottom: space[10], gap: space[4] },
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
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    cardTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.base, color: colors.textPrimary },
    allergyMark: { fontSize: fontSize.sm, color: colors.urgency.high },
    cardSubtitle: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.textTertiary },
    cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
    metaText: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    cardFooter: { flexDirection: 'row', gap: space[2] },
    footerChip: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    emptyState: { alignItems: 'center', paddingVertical: space[10], paddingHorizontal: space[6], gap: space[2] },
    emptyTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    emptyBody: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
});
}