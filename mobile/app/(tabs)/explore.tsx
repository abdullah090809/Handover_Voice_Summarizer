import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, TextInput, Modal, FlatList } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { shiftApi, userApi, ApiError } from '@/lib/api';
import { formatTime, formatDurationHM, formatElapsedClock, toDateInputValue, dayNumber, weekdayAbbrev } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { AppHeader } from '@/components/app-header';
import { useAuth } from '@/lib/auth-context';

// Post-M6f nav-parity pass: this screen previously showed managers a bare
// "not available on mobile yet" placeholder (see the removed Stage M4
// note) instead of the manager team-shift view the web app's ShiftsPage.jsx
// actually has -- confirmed against the reference screenshots (Total
// hours / Overtime / Weekend days stat row + a worker picker + a From/To
// date range, viewed as a manager). That placeholder is gone; this is now
// a real port of ShiftsPage.jsx's manager branch.
//
// Deliberately different from web here, and why:
//   - Worker picker: web uses a native <select>. RN has no select/dropdown
//     primitive (same problem M6f's audit.tsx solved for its method
//     filter) -- for a potentially-long team roster, a chip row doesn't
//     scale the way it did for 5 fixed HTTP methods, so this opens a
//     modal list instead (search-free for now; team rosters are small
//     enough per the M6d handover's own reasoning for skipping pagination
//     there).
//   - Date range: web uses native <input type="date">, which has no RN
//     equivalent without adding a date-picker dependency (none is
//     installed, see package.json, and this session has no guaranteed
//     network to add one). Plain YYYY-MM-DD text fields stand in instead,
//     validated loosely on blur. Worth revisiting if a real date-picker
//     package gets added later.
// Everything else -- the stat math (per-day totals, >8h/day overtime,
// weekend-day count), the session list, the care-worker clock-in/out
// tracker card -- ports 1:1 from ShiftsPage.jsx.
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

type Shift = {
    id: number | string;
    start_time: string;
    end_time: string | null;
};

type Worker = { id: number | string; email: string; name?: string | null; role?: string | null };

function shiftDurationMs(shift: Shift, now: number): number {
    const start = new Date(shift.start_time).getTime();
    const end = shift.end_time ? new Date(shift.end_time).getTime() : now;
    return Math.max(0, end - start);
}

function defaultRangeFrom(): string {
    const d = new Date();
    d.setDate(d.getDate() - 13); // last 14 days, inclusive of today
    return toDateInputValue(d);
}

function isValidDateInput(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

export default function ShiftsScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { isManager } = useAuth();
    const [shifts, setShifts] = useState<Shift[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [clockActionBusy, setClockActionBusy] = useState(false);
    const [now, setNow] = useState(Date.now());

    // Manager-only state.
    const [members, setMembers] = useState<Worker[]>([]);
    const [selectedWorkerId, setSelectedWorkerId] = useState<number | string | ''>('');
    const [workerPickerOpen, setWorkerPickerOpen] = useState(false);
    const [rangeFrom, setRangeFrom] = useState(defaultRangeFrom());
    const [rangeTo, setRangeTo] = useState(toDateInputValue(new Date()));
    const [rangeFromDraft, setRangeFromDraft] = useState(rangeFrom);
    const [rangeToDraft, setRangeToDraft] = useState(rangeTo);

    const load = useCallback(async (workerId?: number | string) => {
        setError(null);
        try {
            const data = await shiftApi.list(workerId || undefined);
            const sorted = (data as Shift[])
                .slice()
                .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
            setShifts(sorted);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load shifts.');
        }
    }, []);

    useEffect(() => {
        if (isManager) {
            userApi
                .list()
                .then((data: Worker[]) => {
                    const workers = data.filter((u) => u.role !== 'manager' && u.role !== 'deactivated');
                    setMembers(workers);
                    if (workers.length > 0) {
                        setSelectedWorkerId(workers[0].id);
                        load(workers[0].id);
                    } else {
                        setShifts([]);
                    }
                })
                .catch(() => setShifts([]));
        } else {
            load();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isManager]);

    const activeShift = useMemo(
        () => (!isManager ? (shifts || []).find((s) => !s.end_time) || null : null),
        [shifts, isManager]
    );

    // Tick every second while a session is running so the live timer stays
    // accurate without a manual refresh.
    useEffect(() => {
        if (!activeShift) return undefined;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [activeShift]);

    const inRangeShifts = useMemo(() => {
        if (!shifts) return [];
        return shifts.filter((s) => {
            const day = toDateInputValue(new Date(s.start_time));
            if (rangeFrom && day < rangeFrom) return false;
            if (rangeTo && day > rangeTo) return false;
            return true;
        });
    }, [shifts, rangeFrom, rangeTo]);

    const stats = useMemo(() => {
        const byDay = new Map<string, { ms: number; dow: number }>();
        for (const s of inRangeShifts) {
            const day = toDateInputValue(new Date(s.start_time));
            const ms = shiftDurationMs(s, now);
            const dow = new Date(s.start_time).getDay();
            const entry = byDay.get(day) || { ms: 0, dow };
            entry.ms += ms;
            byDay.set(day, entry);
        }
        let totalMs = 0;
        let overtimeMs = 0;
        let weekendDays = 0;
        for (const { ms, dow } of byDay.values()) {
            totalMs += ms;
            if (ms > EIGHT_HOURS_MS) overtimeMs += ms - EIGHT_HOURS_MS;
            if (dow === 0 || dow === 6) weekendDays += 1;
        }
        return { totalMs, overtimeMs, weekendDays };
    }, [inRangeShifts, now]);

    async function onRefresh() {
        setRefreshing(true);
        await load(isManager ? selectedWorkerId || undefined : undefined);
        setRefreshing(false);
    }

    function onWorkerChange(worker: Worker) {
        setSelectedWorkerId(worker.id);
        setWorkerPickerOpen(false);
        setShifts(null);
        load(worker.id);
    }

    function commitRangeFrom() {
        if (isValidDateInput(rangeFromDraft)) setRangeFrom(rangeFromDraft);
        else setRangeFromDraft(rangeFrom);
    }

    function commitRangeTo() {
        if (isValidDateInput(rangeToDraft)) setRangeTo(rangeToDraft);
        else setRangeToDraft(rangeTo);
    }

    async function handleClockIn() {
        setClockActionBusy(true);
        try {
            await shiftApi.create(new Date().toISOString(), null);
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not clock in.');
        } finally {
            setClockActionBusy(false);
        }
    }

    async function handleClockOut() {
        if (!activeShift) return;
        setClockActionBusy(true);
        try {
            await shiftApi.update(activeShift.id, activeShift.start_time, new Date().toISOString());
            await load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not clock out.');
        } finally {
            setClockActionBusy(false);
        }
    }

    const selectedWorker = members.find((m) => m.id === selectedWorkerId) || null;

    return (
        <View style={styles.flex}>
            <AppHeader />
            <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.container}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <Text style={styles.title}>Shifts</Text>
                <Text style={styles.subtitle}>
                    {isManager ? "Review your team's logged hours." : 'Clock in and out, and review your logged hours.'}
                </Text>

                {!isManager && shifts !== null && (
                    <View style={[styles.trackerCard, activeShift && styles.trackerCardActive]}>
                        <View style={styles.trackerBadgeRow}>
                            <View style={[styles.dot, activeShift ? styles.dotActive : styles.dotNeutral]} />
                            <Text style={styles.trackerBadgeText}>
                                {activeShift ? 'Currently active' : 'Not clocked in'}
                            </Text>
                        </View>
                        <Text style={styles.trackerHeading}>
                            {activeShift ? 'Session in progress' : 'Ready to clock in'}
                        </Text>
                        {activeShift ? (
                            <>
                                <Text style={styles.trackerTimer}>{formatElapsedClock(shiftDurationMs(activeShift, now))}</Text>
                                <Text style={styles.trackerMeta}>Started at {formatTime(activeShift.start_time)}</Text>
                            </>
                        ) : (
                            <Text style={styles.trackerMeta}>Start a session when your shift begins.</Text>
                        )}
                        <Pressable
                            style={[styles.clockButton, activeShift ? styles.clockButtonOut : styles.clockButtonIn, clockActionBusy && styles.buttonDisabled]}
                            onPress={activeShift ? handleClockOut : handleClockIn}
                            disabled={clockActionBusy}
                        >
                            {clockActionBusy ? (
                                <ActivityIndicator color={colors.white} />
                            ) : (
                                <Text style={styles.clockButtonText}>{activeShift ? 'Clock out' : 'Clock in'}</Text>
                            )}
                        </Pressable>
                    </View>
                )}

                {shifts !== null && (
                    <View style={styles.statColumn}>
                        <View style={styles.statCard}>
                            <View style={styles.statCardTop}>
                                <View style={styles.statIconWell}>
                                    <Feather name="clock" size={16} color={colors.textSecondary} />
                                </View>
                                <View style={styles.statPill}>
                                    <Text style={styles.statPillText}>Total hours</Text>
                                </View>
                            </View>
                            <Text style={styles.statValue}>{formatDurationHM(stats.totalMs)}</Text>
                            <Text style={styles.statLabel}>In selected range</Text>
                        </View>
                        <View style={styles.statCard}>
                            <View style={styles.statCardTop}>
                                <View style={[styles.statIconWell, { backgroundColor: colors.urgency.mediumBg }]}>
                                    <Feather name="clock" size={16} color={colors.urgency.medium} />
                                </View>
                                <View style={[styles.statPill, { backgroundColor: colors.urgency.mediumBg, borderColor: colors.urgency.mediumBorder }]}>
                                    <Text style={[styles.statPillText, { color: colors.urgency.medium }]}>Overtime</Text>
                                </View>
                            </View>
                            <Text style={styles.statValue}>{formatDurationHM(stats.overtimeMs)}</Text>
                            <Text style={styles.statLabel}>Hours past 8/day</Text>
                        </View>
                        <View style={styles.statCard}>
                            <View style={styles.statCardTop}>
                                <View style={[styles.statIconWell, { backgroundColor: colors.info.bg }]}>
                                    <Feather name="clock" size={16} color={colors.info.DEFAULT} />
                                </View>
                                <View style={[styles.statPill, { backgroundColor: colors.info.bg, borderColor: colors.info.border }]}>
                                    <Text style={[styles.statPillText, { color: colors.info.DEFAULT }]}>Weekend days</Text>
                                </View>
                            </View>
                            <Text style={styles.statValue}>{stats.weekendDays}</Text>
                            <Text style={styles.statLabel}>Sat/Sun worked</Text>
                        </View>
                    </View>
                )}

                <View style={styles.filterBar}>
                    {isManager && members.length > 0 && (
                        <Pressable style={styles.selectField} onPress={() => setWorkerPickerOpen(true)}>
                            <Feather name="user" size={15} color={colors.textSecondary} />
                            <Text style={styles.selectFieldText} numberOfLines={1}>
                                {selectedWorker?.email || 'Select team member'}
                            </Text>
                            <Feather name="chevron-down" size={15} color={colors.textTertiary} />
                        </Pressable>
                    )}
                    <View style={styles.rangeRow}>
                        <View style={styles.rangeField}>
                            <Text style={styles.rangeLabel}>
                                <Feather name="calendar" size={12} color={colors.textSecondary} /> From
                            </Text>
                            <TextInput
                                style={styles.rangeInput}
                                value={rangeFromDraft}
                                onChangeText={setRangeFromDraft}
                                onBlur={commitRangeFrom}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                            />
                        </View>
                        <View style={styles.rangeField}>
                            <Text style={styles.rangeLabel}>
                                <Feather name="calendar" size={12} color={colors.textSecondary} /> To
                            </Text>
                            <TextInput
                                style={styles.rangeInput}
                                value={rangeToDraft}
                                onChangeText={setRangeToDraft}
                                onBlur={commitRangeTo}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={colors.textTertiary}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>
                </View>

                {shifts === null && !error && (
                    <View style={styles.centerFill}>
                        <ActivityIndicator />
                    </View>
                )}

                {error && (
                    <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                        <Pressable onPress={() => load(isManager ? selectedWorkerId || undefined : undefined)}>
                            <Text style={styles.retryText}>Retry</Text>
                        </Pressable>
                    </View>
                )}

                {shifts !== null && shifts.length > 0 && inRangeShifts.length === 0 && (
                    <Text style={styles.emptyText}>No shifts in this range. Try widening the date range above.</Text>
                )}

                {shifts !== null && shifts.length === 0 && (
                    <Text style={styles.emptyText}>
                        {isManager ? 'This team member has no logged shifts yet.' : 'Clock in above to log your first shift.'}
                    </Text>
                )}

                {inRangeShifts.map((s) => {
                    const durationMs = shiftDurationMs(s, now);
                    const isOngoing = !s.end_time;
                    return (
                        <View key={s.id} style={[styles.sessionRow, isOngoing && styles.sessionRowActive]}>
                            <View style={styles.sessionDay}>
                                <Text style={styles.sessionDayNumber}>{dayNumber(s.start_time)}</Text>
                                <Text style={styles.sessionDayWeekday}>{weekdayAbbrev(s.start_time)}</Text>
                            </View>
                            <View style={styles.sessionTimes}>
                                <Text style={styles.sessionTime}>In {formatTime(s.start_time)}</Text>
                                <Text style={styles.sessionTime}>Out {s.end_time ? formatTime(s.end_time) : '--:--'}</Text>
                            </View>
                            <View style={styles.sessionDurationBlock}>
                                <Text style={styles.sessionDurationLabel}>Duration</Text>
                                <Text style={[styles.sessionDuration, isOngoing && styles.sessionDurationLive]}>
                                    {formatDurationHM(durationMs)}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            <Modal visible={workerPickerOpen} transparent animationType="fade" onRequestClose={() => setWorkerPickerOpen(false)}>
                <Pressable style={styles.scrim} onPress={() => setWorkerPickerOpen(false)}>
                    <Pressable style={styles.pickerSheet} onPress={() => { }}>
                        <Text style={styles.pickerTitle}>Select team member</Text>
                        <FlatList
                            data={members}
                            keyExtractor={(m) => String(m.id)}
                            style={styles.pickerList}
                            renderItem={({ item }) => (
                                <Pressable style={styles.pickerRow} onPress={() => onWorkerChange(item)}>
                                    <Text style={styles.pickerRowText}>{item.email}</Text>
                                    {item.id === selectedWorkerId && <Feather name="check" size={16} color={colors.teal[600]} />}
                                </Pressable>
                            )}
                        />
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
    container: { padding: space[5], paddingBottom: space[10], gap: space[4], backgroundColor: colors.surfaceApp },
    title: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, letterSpacing: -0.2, color: colors.textPrimary },
    subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: space[1] },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space[10], gap: space[2] },
    trackerCard: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[2],
        ...shadow.xs,
    },
    trackerCardActive: { borderColor: colors.urgency.lowBorder, backgroundColor: colors.urgency.lowBg },
    trackerBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotActive: { backgroundColor: colors.urgency.low },
    dotNeutral: { backgroundColor: colors.textTertiary },
    trackerBadgeText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase' },
    trackerHeading: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    trackerTimer: { fontFamily: fontFamily.uiBold, fontSize: fontSize['2xl'], color: colors.textPrimary, fontVariant: ['tabular-nums'] },
    trackerMeta: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    clockButton: { marginTop: space[2], height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    clockButtonIn: { backgroundColor: colors.teal[600] },
    clockButtonOut: { backgroundColor: colors.urgency.high },
    buttonDisabled: { opacity: 0.6 },
    clockButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.white, fontSize: fontSize.base },
    // Stacked column, not a row -- mirrors ShiftsPage.jsx's own
    // `.stat-row-stacked` variant (three cards, used here instead of the
    // Dashboard's 4-across `.stat-row`), which reads better at phone width
    // as a vertical stack than three cramped columns.
    statColumn: { gap: space[3] },
    statCard: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[2],
        ...shadow.xs,
    },
    statCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statIconWell: {
        width: 30,
        height: 30,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statPill: {
        backgroundColor: colors.surfaceSunken,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.full,
        paddingHorizontal: space[2],
        paddingVertical: 3,
    },
    statPillText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textSecondary },
    statLabel: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    statValue: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, letterSpacing: -0.2, color: colors.textPrimary },
    filterBar: { gap: space[3] },
    selectField: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        height: 44,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radius.md,
        paddingHorizontal: space[3],
        backgroundColor: colors.surfaceCard,
    },
    selectFieldText: { flex: 1, fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textPrimary },
    rangeRow: { flexDirection: 'row', gap: space[3] },
    rangeField: { flex: 1, gap: space[1] },
    rangeLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textSecondary },
    rangeInput: {
        height: 40,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: radius.md,
        paddingHorizontal: space[3],
        fontFamily: fontFamily.mono,
        fontSize: fontSize.sm,
        color: colors.textPrimary,
        backgroundColor: colors.surfaceCard,
    },
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
    emptyText: { fontFamily: fontFamily.ui, textAlign: 'center', color: colors.textTertiary, paddingVertical: space[6], fontSize: fontSize.sm },
    sessionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[4],
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderLeftWidth: 4,
        borderLeftColor: colors.borderDefault,
        borderRadius: radius.md,
        padding: space[3],
    },
    sessionRowActive: { borderLeftColor: colors.urgency.low, backgroundColor: colors.urgency.lowBg },
    sessionDay: { width: 44, alignItems: 'center' },
    sessionDayNumber: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary },
    sessionDayWeekday: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textSecondary },
    sessionTimes: { flex: 1, gap: space[1] },
    sessionTime: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textPrimary },
    sessionDurationBlock: { alignItems: 'flex-end' },
    sessionDurationLabel: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
    sessionDuration: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
    sessionDurationLive: { color: colors.urgency.low },
    scrim: { flex: 1, backgroundColor: 'rgba(15, 23, 34, 0.4)', justifyContent: 'flex-end' },
    pickerSheet: {
        backgroundColor: colors.surfaceCard,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        padding: space[4],
        paddingBottom: space[8],
        maxHeight: '70%',
        ...shadow.lg,
    },
    pickerTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.md, color: colors.textPrimary, marginBottom: space[2] },
    pickerList: { flexGrow: 0 },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: space[3],
        borderBottomWidth: 1,
        borderBottomColor: colors.borderDefault,
    },
    pickerRowText: { fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textPrimary },
});
}
