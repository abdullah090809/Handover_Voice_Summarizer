import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { residentApi, userApi, assignmentApi, handoverApi, ApiError } from '@/lib/api';
import { formatDate, formatRelative, formatHandoverCode, truncate, displayName, employmentStatusLabel } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { ResidentStatusBadge } from '@/components/resident-badges';
import { UrgencyBadge, HandoverStatusBadge } from '@/components/handover-badges';
import { ReadField, ChipListField, AssignmentChips } from '@/components/profile-fields';
import { DetailHero } from '@/components/detail-hero';
import ProfileTabs from '@/components/profile-tabs';
import Feather from '@expo/vector-icons/Feather';
import { AssignmentModal, type AssignmentOption } from '@/components/assignment-modal';
import { ActionSheet, type ActionSheetItem } from '@/components/action-sheet';
import { ConfirmDialog } from '@/components/confirm-dialog';

// Stage M6b -- ported from the web app's ResidentProfilePage.jsx as a full
// screen instead of staying inline (same reasoning as app/handover/[id].tsx:
// expo-router's own "back" affordance beats a phone-width modal-over-modal).
//
// The Handover History tab reuses the *existing* handover detail route
// (push to /handover/[id]) instead of porting HandoverDetailModal.jsx a
// second time -- one detail screen for a handover note, reused from
// wherever a note is opened, same as the web app reuses HandoverCard +
// HandoverDetailModal across HandoversPage.jsx and this page.
//
// Stage M8 -- "Manage care workers" (assign care workers, multi-select) is
// now wired up here via the native AssignmentModal port, mirroring web's
// ResidentProfilePage.jsx openAssignCareWorkers exactly (including the
// same "still show already-assigned workers even if left/suspended"
// filtering).
//
// "Edit resident" (resident-form.tsx, full field set) and a "..." header
// menu (Edit / Delete, same pattern as team-member/[id].tsx) are now
// wired up here too, mirroring web's ResidentProfilePage.jsx Edit/Remove
// buttons -- a manager can now fully manage a resident record from the
// app, not just view it.
const HANDOVERS_PAGE_SIZE = 6;

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'medical', label: 'Medical Information' },
    { key: 'care', label: 'Care Information' },
    { key: 'handovers', label: 'Handover History' },
];

type CareWorkerBrief = { id: number; name?: string | null; username: string };
type Resident = {
    id: number | string;
    name: string;
    preferred_name?: string | null;
    resident_code?: string | null;
    status: string;
    age?: number | null;
    date_of_birth?: string | null;
    gender?: string | null;
    admission_date?: string | null;
    room_number?: string | null;
    ward_unit?: string | null;
    care_home?: string | null;
    religion?: string | null;
    ethnicity?: string | null;
    preferred_language?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_phone?: string | null;
    medical_conditions?: string[];
    allergies?: string[];
    current_medications?: string[];
    disability?: string | null;
    mobility_status?: string | null;
    dietary_requirements?: string | null;
    communication_requirements?: string | null;
    sensory_loss?: string | null;
    care_level?: string | null;
    risk_level?: string | null;
    behaviour_notes?: string | null;
    daily_care_notes?: string | null;
    assigned_care_workers?: CareWorkerBrief[];
};
type HandoverNote = {
    id: number;
    shift_id: number;
    shift_number?: number | null;
    status: string;
    urgency_flag: string | null;
    error_message: string | null;
    summary_json: { summary?: string } | null;
    created_at: string;
    submitted_by?: { name?: string | null; username: string } | null;
};

export default function ResidentDetailScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { isManager } = useAuth();

    const [resident, setResident] = useState<Resident | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview');

    const [handovers, setHandovers] = useState<HandoverNote[] | null>(null);
    const [handoverTotal, setHandoverTotal] = useState(0);
    const [handoverError, setHandoverError] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const [notice, setNotice] = useState<string | null>(null);
    const [assigning, setAssigning] = useState(false);
    const [careWorkerOptions, setCareWorkerOptions] = useState<AssignmentOption[] | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    function showNotice(message: string) {
        setNotice(message);
        setTimeout(() => setNotice((cur) => (cur === message ? null : cur)), 3000);
    }

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await residentApi.get(id);
            setResident(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load this resident.');
        }
    }, [id]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [load]);

    // Re-fetch (without the full-screen spinner) whenever this screen
    // regains focus -- covers returning from resident-form.tsx after
    // saving an edit, which otherwise left this detail screen showing
    // the pre-edit data until a manual pull-to-refresh or app reload.
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

    const loadHandovers = useCallback(async () => {
        setHandoverError(null);
        try {
            const data = await handoverApi.list({ residentId: id, skip: 0, limit: HANDOVERS_PAGE_SIZE });
            setHandovers(data.results);
            setHandoverTotal(typeof data.total === 'number' ? data.total : data.results.length);
        } catch (err) {
            setHandoverError(err instanceof ApiError ? err.message : 'Could not load handover history.');
        }
    }, [id]);

    useEffect(() => {
        // Loaded lazily, same as the web app -- only fetch handover history
        // once the tab is actually opened, not up front with the resident.
        if (tab === 'handovers' && handovers === null) loadHandovers();
    }, [tab, handovers, loadHandovers]);

    async function openAssignCareWorkers() {
        if (!resident) return;
        setAssigning(true);
        if (careWorkerOptions === null) {
            try {
                const users = await userApi.list();
                const currentlyAssignedIds = new Set((resident.assigned_care_workers || []).map((u) => u.id));
                // Only offer active/on-leave care workers as *new* assignments
                // -- someone who has left or is suspended shouldn't be newly
                // assigned a resident. Still show anyone already assigned
                // here (regardless of status) so a manager can see and untick
                // them; label their status so it's clear why they're there.
                // Same reasoning as web's openAssignCareWorkers.
                const filtered = users.filter(
                    (u: any) =>
                        u.role === 'care_worker' &&
                        (currentlyAssignedIds.has(u.id) || !['left', 'suspended'].includes(u.employment_status))
                );
                setCareWorkerOptions(
                    filtered.map((u: any) => ({
                        id: u.id,
                        label: displayName(u),
                        sublabel:
                            u.employment_status && u.employment_status !== 'active'
                                ? [u.job_title, employmentStatusLabel(u.employment_status)].filter(Boolean).join(' · ')
                                : u.job_title,
                    }))
                );
            } catch (err) {
                showNotice(err instanceof ApiError ? err.message : 'Could not load care workers.');
                setAssigning(false);
            }
        }
    }

    async function handleSaveCareWorkers(careWorkerIds: (number | string)[] | number | string | null) {
        if (!resident) return;
        await assignmentApi.setResidentCareWorkers(resident.id, careWorkerIds as (number | string)[]);
        setAssigning(false);
        showNotice('Care worker assignments updated.');
        load();
    }

    async function runDelete() {
        if (!resident) return;
        setBusy(true);
        try {
            await residentApi.remove(resident.id);
            router.back();
        } catch (err) {
            showNotice(err instanceof ApiError ? err.message : 'Could not remove this resident.');
            setBusy(false);
        }
    }

    const menuItems: ActionSheetItem[] = resident
        ? [
              {
                  label: 'Edit',
                  icon: 'edit-2',
                  onPress: () => router.push({ pathname: '/resident-form', params: { id: String(resident.id) } }),
              },
              { label: 'Delete', icon: 'trash-2', danger: true, onPress: () => setDeleteConfirmOpen(true) },
          ]
        : [];

    async function loadMoreHandovers() {
        if (loadingMore || handovers === null || handovers.length >= handoverTotal) return;
        setLoadingMore(true);
        try {
            const more = await handoverApi.list({ residentId: id, skip: handovers.length, limit: HANDOVERS_PAGE_SIZE });
            setHandovers([...handovers, ...more.results]);
        } catch {
            // Same as the Handovers tab's own loadMore -- a failed page fetch
            // isn't worth a full error state when what's already loaded is
            // still valid.
        } finally {
            setLoadingMore(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Resident' }} />
                <ActivityIndicator />
            </View>
        );
    }

    if (error || !resident) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Resident' }} />
                <Text style={styles.errorText}>{error || 'This resident could not be found.'}</Text>
                <Pressable onPress={load}>
                    <Text style={styles.retryText}>Retry</Text>
                </Pressable>
            </View>
        );
    }

    const allergiesCount = resident.allergies?.length ?? 0;

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen
                options={{
                    title: resident.preferred_name || resident.name,
                    headerRight: isManager
                        ? () => (
                              <Pressable hitSlop={10} onPress={() => setMenuOpen(true)} style={styles.menuButton} disabled={busy}>
                                  {busy ? <ActivityIndicator size="small" /> : <Feather name="more-vertical" size={20} color={colors.teal[600]} />}
                              </Pressable>
                          )
                        : undefined,
                }}
            />

            {notice && (
                <View style={styles.noticeBox}>
                    <Text style={styles.noticeText}>{notice}</Text>
                </View>
            )}

            {/* Visual pass: this screen used to render a plain-text header
                block directly on the same white card as the field grid
                below it -- no dark identity banner the way Profile has one,
                so next to Profile it read as flat/unfinished rather than
                just a different screen. DetailHero gives it the same dark,
                centered "identity card" top section as Profile (glow
                decoration included), with the field-grid/tabs content
                continuing below in the same continuous card, matching
                profile.tsx's own `identityCard` structure. Same change made
                to team-member/[id].tsx for the same reason. */}
            <View style={styles.card}>
                <DetailHero
                    name={resident.preferred_name || resident.name}
                    subtitle={
                        `${resident.resident_code || `Resident #${resident.id}`}` +
                        (resident.preferred_name ? ` · ${resident.name}` : '') +
                        (resident.age != null ? ` · Age ${resident.age}` : '')
                    }
                    badges={
                        <>
                            <ResidentStatusBadge status={resident.status} />
                            {resident.ward_unit && <View style={styles.infoBadge}><Text style={styles.infoBadgeText}>{resident.ward_unit}</Text></View>}
                            {resident.room_number && (
                                <View style={styles.infoBadge}><Text style={styles.infoBadgeText}>Room {resident.room_number}</Text></View>
                            )}
                            {allergiesCount > 0 && (
                                <View style={styles.allergyBadge}>
                                    <Text style={styles.allergyBadgeText}>
                                        ⚠ {allergiesCount} {allergiesCount === 1 ? 'allergy' : 'allergies'}
                                    </Text>
                                </View>
                            )}
                        </>
                    }
                />

                <View style={styles.content}>
                    <ProfileTabs tabs={TABS} active={tab} onChange={setTab}>
                        {tab === 'overview' && (
                            <View style={styles.fieldGrid}>
                                <ReadField label="Full name" value={resident.name} />
                                <ReadField label="Preferred name" value={resident.preferred_name} />
                                <ReadField label="Date of birth" value={resident.date_of_birth ? formatDate(resident.date_of_birth) : null} />
                                <ReadField label="Gender" value={resident.gender} />
                                <ReadField label="Admission date" value={resident.admission_date ? formatDate(resident.admission_date) : null} />
                                <ReadField label="Room number" value={resident.room_number} />
                                <ReadField label="Ward / unit" value={resident.ward_unit} />
                                <ReadField label="Care home" value={resident.care_home} />
                                <ReadField label="Religion / beliefs" value={resident.religion} />
                                <ReadField label="Ethnicity" value={resident.ethnicity} />
                                <ReadField label="Preferred language" value={resident.preferred_language} />
                                <View style={[styles.field, styles.fieldFull]}>
                                    <Text style={styles.fieldLabel}>Emergency contact</Text>
                                    <View style={styles.fieldValueBox}>
                                        {resident.emergency_contact_name ? (
                                            <Text style={styles.fieldValue}>
                                                {resident.emergency_contact_name}
                                                {resident.emergency_contact_relationship ? ` · ${resident.emergency_contact_relationship}` : ''}
                                                {resident.emergency_contact_phone ? ` · ${resident.emergency_contact_phone}` : ''}
                                            </Text>
                                        ) : (
                                            <Text style={styles.fieldValueEmpty}>Not recorded</Text>
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}

                        {tab === 'medical' && (
                            <View style={styles.fieldGrid}>
                                <ChipListField label="Medical conditions" items={resident.medical_conditions} emptyLabel="None recorded" />
                                <ChipListField label="Allergies" items={resident.allergies} emptyLabel="No known allergies recorded" />
                                <ChipListField label="Current medications" items={resident.current_medications} emptyLabel="None recorded" />
                                <ReadField label="Disability" value={resident.disability} fullWidth />
                                <ReadField label="Mobility status" value={resident.mobility_status} />
                                <ReadField label="Dietary requirements" value={resident.dietary_requirements} />
                                <ReadField label="Communication requirements" value={resident.communication_requirements} />
                                <ReadField label="Sensory loss" value={resident.sensory_loss} />
                            </View>
                        )}

                        {tab === 'care' && (
                            <View style={styles.fieldGrid}>
                                <ReadField label="Care level" value={resident.care_level} />
                                <ReadField label="Risk level" value={resident.risk_level} />
                                <View style={[styles.field, styles.fieldFull]}>
                                    <Text style={styles.fieldLabel}>Assigned care workers</Text>
                                    <AssignmentChips items={resident.assigned_care_workers} emptyLabel="No care workers assigned" />
                                    {isManager && (
                                        <Pressable
                                            style={({ pressed }) => [styles.assignBtn, pressed && styles.assignBtnPressed]}
                                            onPress={openAssignCareWorkers}
                                        >
                                            <Feather name="user-plus" size={14} color={colors.teal[700]} />
                                            <Text style={styles.assignBtnText}>Manage care workers</Text>
                                        </Pressable>
                                    )}
                                </View>
                                <ReadField label="Behaviour notes" value={resident.behaviour_notes} fullWidth />
                                <ReadField label="Daily care notes" value={resident.daily_care_notes} fullWidth />
                            </View>
                        )}

                        {tab === 'handovers' && (
                            <View style={styles.handoversTab}>
                                {handovers === null && !handoverError && <ActivityIndicator style={{ paddingVertical: space[6] }} />}
                                {handoverError && (
                                    <View style={styles.errorBox}>
                                        <Text style={styles.errorText}>{handoverError}</Text>
                                        <Pressable onPress={loadHandovers}>
                                            <Text style={styles.retryText}>Retry</Text>
                                        </Pressable>
                                    </View>
                                )}
                                {handovers !== null && handovers.length === 0 && !handoverError && (
                                    <Text style={styles.fieldValueEmpty}>No handovers yet for this resident.</Text>
                                )}
                                {handovers !== null &&
                                    handovers.map((note) => {
                                        const isPending = note.status === 'pending' || note.status === 'processing';
                                        const isFailed = note.status === 'failed';
                                        return (
                                            <Pressable
                                                key={note.id}
                                                style={styles.handoverCard}
                                                onPress={() => router.push({ pathname: '/handover/[id]', params: { id: String(note.id) } })}
                                            >
                                                <View style={styles.handoverCardTop}>
                                                    <Text style={styles.handoverCardTitle}>
                                                        {formatHandoverCode(note.id)} · Shift #{note.shift_number ?? note.shift_id}
                                                    </Text>
                                                    {isPending || isFailed ? (
                                                        <HandoverStatusBadge status={note.status} />
                                                    ) : (
                                                        <UrgencyBadge urgency={note.urgency_flag} />
                                                    )}
                                                </View>
                                                <Text style={styles.handoverCardSummary} numberOfLines={2}>
                                                    {note.status === 'complete' && note.summary_json?.summary
                                                        ? truncate(note.summary_json.summary, 140)
                                                        : isPending
                                                            ? 'Transcribing audio…'
                                                            : isFailed
                                                                ? note.error_message || 'Processing failed'
                                                                : 'No summary available.'}
                                                </Text>
                                                <Text style={styles.handoverCardFooter}>{formatRelative(note.created_at)}</Text>
                                            </Pressable>
                                        );
                                    })}
                                {handovers !== null && handovers.length > 0 && handovers.length < handoverTotal && (
                                    <Pressable style={styles.loadMoreButton} onPress={loadMoreHandovers} disabled={loadingMore}>
                                        {loadingMore ? <ActivityIndicator /> : <Text style={styles.loadMoreText}>Load more</Text>}
                                    </Pressable>
                                )}
                            </View>
                        )}
                    </ProfileTabs>
                </View>
            </View>

            <AssignmentModal
                visible={assigning}
                title="Manage care workers"
                subtitle={`Choose who is assigned to ${resident.preferred_name || resident.name}.`}
                mode="multi"
                options={careWorkerOptions}
                initialSelectedIds={(resident.assigned_care_workers || []).map((u) => u.id)}
                onClose={() => setAssigning(false)}
                onSave={handleSaveCareWorkers}
                saveLabel="Save assignments"
                emptyOptionsLabel="No care workers found. Add one from the Team page first."
            />

            <ActionSheet visible={menuOpen} items={menuItems} onClose={() => setMenuOpen(false)} />

            <ConfirmDialog
                visible={deleteConfirmOpen}
                title={`Remove ${resident.preferred_name || resident.name}?`}
                message="This permanently deletes the resident record. Their existing handover notes are kept for the record."
                confirmLabel="Remove resident"
                destructive
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={() => {
                    setDeleteConfirmOpen(false);
                    runDelete();
                }}
            />
        </ScrollView>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.surfaceApp },
        container: { padding: space[5], paddingBottom: space[10] },
        centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6], backgroundColor: colors.surfaceApp },
        // Continuous card: dark DetailHero on top (squared corners, clipped by
        // this card's own overflow:hidden), field-grid/tabs content below it in
        // `content` -- mirrors profile.tsx's `identityCard` structure.
        card: {
            backgroundColor: colors.surfaceCard,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            borderRadius: radius.lg,
            overflow: 'hidden',
            ...shadow.xs,
        },
        content: { padding: space[5] },
        infoBadge: {
            backgroundColor: colors.info.bg,
            borderWidth: 1,
            borderColor: colors.info.border,
            borderRadius: radius.full,
            paddingHorizontal: space[2],
            paddingVertical: 4,
        },
        infoBadgeText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, lineHeight: fontSize.xs * 1.35, color: colors.info.DEFAULT },
        allergyBadge: {
            backgroundColor: colors.urgency.highBg,
            borderWidth: 1,
            borderColor: colors.urgency.highBorder,
            borderRadius: radius.full,
            paddingHorizontal: space[2],
            paddingVertical: 4,
        },
        allergyBadgeText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, lineHeight: fontSize.xs * 1.35, color: colors.urgency.high },
        fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space[4] },
        // Full-width, single-column fields -- see profile.tsx's `field`
        // style comment for why this changed from '48%'.
        field: { width: '100%', gap: space[2] },
        fieldFull: { width: '100%' },
        fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'uppercase' },
        // Bordered "pill" box, matching profile-fields.tsx's ReadField --
        // used here for the one hand-rolled field on this screen (emergency
        // contact) that doesn't go through ReadField itself.
        fieldValueBox: {
            minHeight: 42,
            justifyContent: 'center',
            paddingHorizontal: space[3],
            paddingVertical: space[2],
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.surfaceSunken,
        },
        fieldValue: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textPrimary },
        fieldValueEmpty: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary },
        assignBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            alignSelf: 'flex-start',
            marginTop: space[2],
            paddingVertical: space[2],
            paddingHorizontal: space[3],
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.teal[100],
            backgroundColor: colors.teal[50],
        },
        assignBtnPressed: { backgroundColor: colors.teal[100] },
        assignBtnText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.teal[700] },
        menuButton: { padding: space[1] },
        noticeBox: {
            marginBottom: space[3],
            backgroundColor: colors.info.bg,
            borderWidth: 1,
            borderColor: colors.info.border,
            borderRadius: radius.md,
            padding: space[3],
        },
        noticeText: { fontFamily: fontFamily.ui, color: colors.info.DEFAULT, fontSize: fontSize.sm },
        handoversTab: { gap: space[3] },
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
        handoverCard: {
            backgroundColor: colors.surfaceCard,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            borderRadius: radius.lg,
            padding: space[4],
            gap: space[2],
            ...shadow.xs,
        },
        handoverCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
        handoverCardTitle: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.textTertiary },
        handoverCardSummary: { fontFamily: fontFamily.reading, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: fontSize.sm * 1.5 },
        handoverCardFooter: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        loadMoreButton: { alignItems: 'center', paddingVertical: space[4] },
        loadMoreText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textLink },
    });
}