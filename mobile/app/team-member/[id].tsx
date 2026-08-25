import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth-context';
import { userApi, residentApi, assignmentApi, resolveFileUrl, ApiError } from '@/lib/api';
import { displayName, formatDate, roleLabel, employmentStatusLabel, employmentTypeLabel, residentStatusLabel } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { RoleBadge } from '@/components/role-badge';
import { ReadField, AssignmentChips } from '@/components/profile-fields';
import { DetailHero } from '@/components/detail-hero';
import ProfileTabs from '@/components/profile-tabs';
import { ActionSheet, type ActionSheetItem } from '@/components/action-sheet';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ResetPasswordModal } from '@/components/reset-password-modal';
import { AssignmentModal, type AssignmentOption } from '@/components/assignment-modal';

// Stage M6d -- ported from the web app's CareWorkerProfilePage.jsx, reached
// by tapping a non-manager row on the Team list (team.tsx). Manager-only
// screen, same route-level guard reasoning as team.tsx (the backend's
// /users/{id} is already require_manager -- this is defense in depth, not
// the real enforcement point).
//
// Stage M7 -- "Edit" (profile-form.tsx, full employment/personal/emergency
// field set) and a "..." header menu (Reset password / Deactivate or
// Reactivate / Delete, same as team.tsx's row menu) are now wired up here
// too, so these mutations are reachable from a care worker's own profile,
// not just the Team list.
//
// Stage M8 -- "Manage caseload" (assign residents, multi-select) and
// "Change manager" (assign manager, single-select) are now wired up here
// too, via the native AssignmentModal port -- mirrors web's
// CareWorkerProfilePage.jsx openAssignResidents/openAssignManager exactly,
// including the same "still show who's currently assigned even if their
// status would otherwise exclude them from the picker" filtering, and the
// same "worker has left" guard around the caseload button (the backend's
// _ensure_assignable_care_worker in app/routers/assignments.py is the real
// enforcement point -- this is defense in depth).

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'employment', label: 'Employment Information' },
    { key: 'assignments', label: 'Work Assignment' },
];

type ManagerBrief = { id: number | string; name?: string | null; username?: string };
type ResidentBrief = { id: number | string; name?: string | null };
type CareWorker = {
    id: number | string;
    name?: string | null;
    username: string;
    email: string;
    role: string;
    phone_number?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    home_address?: string | null;
    employee_id?: string | null;
    job_title?: string | null;
    employment_type?: string | null;
    department?: string | null;
    shift_pattern?: string | null;
    employment_status?: string | null;
    join_date?: string | null;
    years_of_service?: number | null;
    age?: number | null;
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_phone?: string | null;
    profile_photo_url?: string | null;
    manager?: ManagerBrief | null;
    assigned_residents?: ResidentBrief[];
};

export default function CareWorkerDetailScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user: me, isManager } = useAuth();

    const [member, setMember] = useState<CareWorker | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview');
    const [menuOpen, setMenuOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [resetOpen, setResetOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const [assigningResidents, setAssigningResidents] = useState(false);
    const [residentOptions, setResidentOptions] = useState<AssignmentOption[] | null>(null);
    const [assigningManager, setAssigningManager] = useState(false);
    const [managerOptions, setManagerOptions] = useState<AssignmentOption[] | null>(null);

    function showNotice(message: string) {
        setNotice(message);
        setTimeout(() => setNotice((cur) => (cur === message ? null : cur)), 3000);
    }

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await userApi.get(id);
            setMember(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load this team member.');
        }
    }, [id]);

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

    // Re-fetch on focus so returning from profile-form.tsx after saving
    // an edit shows the updated employment fields immediately, instead of
    // the stale data captured on this screen's initial mount.
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

    if (!isManager) return null;

    const isSelf = member ? member.id === me?.id : false;
    const isDeactivated = member?.role === 'deactivated';
    const hasLeft = member?.employment_status === 'left';

    async function openAssignResidents() {
        if (!member || hasLeft) return;
        setAssigningResidents(true);
        if (residentOptions === null) {
            try {
                // Fetch *all* residents (including discharged/deceased), not
                // just active ones -- otherwise a resident who's currently on
                // this worker's caseload but has since been discharged would
                // vanish from the picker entirely, leaving no way to untick
                // them. Same reasoning as web's openAssignResidents.
                const residents = await residentApi.list(true);
                const currentlyAssignedIds = new Set((member.assigned_residents || []).map((r) => r.id));
                const filtered = residents.filter((r: any) => r.status === 'active' || currentlyAssignedIds.has(r.id));
                setResidentOptions(
                    filtered.map((r: any) => ({
                        id: r.id,
                        label: r.preferred_name || r.name,
                        sublabel:
                            r.status !== 'active'
                                ? [r.resident_code, residentStatusLabel(r.status)].filter(Boolean).join(' · ')
                                : r.resident_code,
                    }))
                );
            } catch (err) {
                showNotice(err instanceof ApiError ? err.message : 'Could not load residents.');
                setAssigningResidents(false);
            }
        }
    }

    async function handleSaveResidents(residentIds: (number | string)[] | number | string | null) {
        if (!member) return;
        await assignmentApi.setCareWorkerResidents(member.id, residentIds as (number | string)[]);
        setAssigningResidents(false);
        showNotice('Resident caseload updated.');
        load();
    }

    async function openAssignManager() {
        if (!member) return;
        setAssigningManager(true);
        if (managerOptions === null) {
            try {
                const users = await userApi.list();
                const currentManagerId = member.manager?.id;
                // Only offer active/on-leave managers as *new* assignments --
                // someone who has left or is suspended shouldn't take on new
                // reports. Still show the current manager even if their
                // status has since changed, so they can be reassigned away
                // from -- same reasoning as web's openAssignManager.
                const filtered = users.filter(
                    (u: any) =>
                        u.role === 'manager' &&
                        (u.id === currentManagerId || !['left', 'suspended'].includes(u.employment_status))
                );
                setManagerOptions(
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
                showNotice(err instanceof ApiError ? err.message : 'Could not load managers.');
                setAssigningManager(false);
            }
        }
    }

    async function handleSaveManager(managerId: (number | string)[] | number | string | null) {
        if (!member) return;
        await assignmentApi.setCareWorkerManager(member.id, managerId as number | string | null);
        setAssigningManager(false);
        showNotice('Manager assignment updated.');
        load();
    }

    async function runToggleActive(kind: 'deactivate' | 'activate') {
        if (!member) return;
        setBusy(true);
        try {
            if (kind === 'activate') {
                await userApi.activate(member.id);
                showNotice('Reactivated.');
            } else {
                await userApi.deactivate(member.id);
                showNotice('Deactivated.');
            }
            await load();
        } catch (err) {
            showNotice(err instanceof ApiError ? err.message : 'Could not update this account.');
        } finally {
            setBusy(false);
        }
    }

    async function runDelete() {
        if (!member) return;
        setBusy(true);
        try {
            await userApi.remove(member.id);
            router.back();
        } catch (err) {
            showNotice(err instanceof ApiError ? err.message : 'Could not remove this account.');
            setBusy(false);
        }
    }

    const menuItems: ActionSheetItem[] = member
        ? [
              {
                  label: 'Edit',
                  icon: 'edit-2',
                  onPress: () => router.push({ pathname: '/profile-form', params: { id: String(member.id), role: 'care_worker' } }),
              },
              { label: 'Reset password', icon: 'key', onPress: () => setResetOpen(true) },
              isDeactivated
                  ? { label: 'Reactivate', icon: 'check-circle', onPress: () => runToggleActive('activate'), disabled: isSelf }
                  : { label: 'Deactivate', icon: 'slash', onPress: () => runToggleActive('deactivate'), disabled: isSelf },
              { label: 'Delete', icon: 'trash-2', danger: true, onPress: () => setDeleteConfirmOpen(true), disabled: isSelf },
          ]
        : [];

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Team member' }} />
                <ActivityIndicator />
            </View>
        );
    }

    if (error || !member) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Team member' }} />
                <Text style={styles.errorText}>{error || 'This team member could not be found.'}</Text>
                <Pressable onPress={load}>
                    <Text style={styles.retryText}>Retry</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen
                options={{
                    title: displayName(member),
                    headerRight: () => (
                        <Pressable hitSlop={10} onPress={() => setMenuOpen(true)} style={styles.menuButton} disabled={busy}>
                            {busy ? <ActivityIndicator size="small" /> : <Feather name="more-vertical" size={20} color={colors.teal[600]} />}
                        </Pressable>
                    ),
                }}
            />

            {notice && (
                <View style={styles.noticeBox}>
                    <Text style={styles.noticeText}>{notice}</Text>
                </View>
            )}

            {/* Visual pass: same dark-hero treatment given to
                resident/[id].tsx -- see that file's comment for the full
                reasoning. This screen had the identical "header block +
                accordion floating directly on the app background, no
                identity banner" gap. `displayName`'s fallback-to-email
                guard (see manager/[id].tsx) is what keeps a name-less
                member's hero heading from wrapping mid-word -- DetailHero
                already truncates to 2 lines for that case. */}
            <View style={styles.card}>
                <DetailHero
                    name={displayName(member)}
                    avatarSrc={resolveFileUrl(member.profile_photo_url)}
                    subtitle={
                        `${member.employee_id || `Staff #${member.id}`}` +
                        (member.job_title ? ` · ${member.job_title}` : '') +
                        (member.age != null ? ` · Age ${member.age}` : '')
                    }
                    badges={
                        <>
                            <RoleBadge role={member.role} />
                            {member.department && (
                                <View style={styles.infoBadge}>
                                    <Text style={styles.infoBadgeText}>{member.department}</Text>
                                </View>
                            )}
                            {member.employment_status && member.employment_status !== 'active' && (
                                <View style={styles.statusBadge}>
                                    <Text style={styles.statusBadgeText}>{employmentStatusLabel(member.employment_status)}</Text>
                                </View>
                            )}
                        </>
                    }
                />

                <View style={styles.content}>
                    <ProfileTabs tabs={TABS} active={tab} onChange={setTab}>
                        {tab === 'overview' && (
                            <View style={styles.fieldGrid}>
                                <ReadField label="Full name" value={member.name} />
                                <ReadField label="Username" value={`@${member.username}`} />
                                <ReadField label="Email" value={member.email} />
                                <ReadField label="Phone number" value={member.phone_number} />
                                <ReadField label="Date of birth" value={member.date_of_birth ? formatDate(member.date_of_birth) : null} />
                                <ReadField label="Gender" value={member.gender} />
                                <ReadField label="Role" value={roleLabel(member.role)} />
                                <ReadField label="Home address" value={member.home_address} fullWidth />
                                <View style={[styles.field, styles.fieldFull]}>
                                    <Text style={styles.fieldLabel}>Emergency contact</Text>
                                    <View style={styles.fieldValueBox}>
                                        {member.emergency_contact_name ? (
                                            <Text style={styles.fieldValue}>
                                                {member.emergency_contact_name}
                                                {member.emergency_contact_relationship ? ` · ${member.emergency_contact_relationship}` : ''}
                                                {member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ''}
                                            </Text>
                                        ) : (
                                            <Text style={styles.fieldValueEmpty}>Not recorded</Text>
                                        )}
                                    </View>
                                </View>
                            </View>
                        )}

                        {tab === 'employment' && (
                            <View style={styles.fieldGrid}>
                                <ReadField label="Employee ID" value={member.employee_id} />
                                <ReadField label="Job title" value={member.job_title} />
                                <ReadField label="Employment type" value={member.employment_type ? employmentTypeLabel(member.employment_type) : null} />
                                <ReadField label="Department / Ward" value={member.department} />
                                <ReadField label="Shift pattern" value={member.shift_pattern} />
                                <ReadField label="Employment status" value={employmentStatusLabel(member.employment_status)} />
                                <ReadField label="Join date" value={member.join_date ? formatDate(member.join_date) : null} />
                                <ReadField
                                    label="Years of service"
                                    value={member.years_of_service != null ? `${member.years_of_service} yr${member.years_of_service === 1 ? '' : 's'}` : null}
                                />
                            </View>
                        )}

                        {tab === 'assignments' && (
                            <View style={styles.fieldGrid}>
                                <View style={[styles.field, styles.fieldFull]}>
                                    <Text style={styles.fieldLabel}>Assigned residents</Text>
                                    <AssignmentChips items={member.assigned_residents} emptyLabel="No residents assigned" />
                                    {isManager && (
                                        hasLeft ? (
                                            <Text style={styles.fieldHint}>
                                                {displayName(member)} has left and can no longer be assigned residents.
                                            </Text>
                                        ) : (
                                            <Pressable
                                                style={({ pressed }) => [styles.assignBtn, pressed && styles.assignBtnPressed]}
                                                onPress={openAssignResidents}
                                            >
                                                <Feather name="user-plus" size={14} color={colors.teal[700]} />
                                                <Text style={styles.assignBtnText}>Manage caseload</Text>
                                            </Pressable>
                                        )
                                    )}
                                </View>
                                <View style={[styles.field, styles.fieldFull]}>
                                    <Text style={styles.fieldLabel}>Assigned manager</Text>
                                    <AssignmentChips items={member.manager ? [member.manager] : []} emptyLabel="No manager assigned" />
                                    {isManager && (
                                        <Pressable
                                            style={({ pressed }) => [styles.assignBtn, pressed && styles.assignBtnPressed]}
                                            onPress={openAssignManager}
                                        >
                                            <Feather name="user-plus" size={14} color={colors.teal[700]} />
                                            <Text style={styles.assignBtnText}>Change manager</Text>
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        )}
                    </ProfileTabs>
                </View>
            </View>
            <ActionSheet visible={menuOpen} title={displayName(member)} items={menuItems} onClose={() => setMenuOpen(false)} />

            <ConfirmDialog
                visible={deleteConfirmOpen}
                title={`Remove ${displayName(member)}?`}
                message="This permanently deletes their account. Consider deactivating instead if they may return."
                confirmLabel="Delete account"
                destructive
                onCancel={() => setDeleteConfirmOpen(false)}
                onConfirm={() => {
                    setDeleteConfirmOpen(false);
                    runDelete();
                }}
            />

            <ResetPasswordModal
                visible={resetOpen}
                targetName={displayName(member)}
                targetId={member.id}
                onClose={() => setResetOpen(false)}
                onDone={showNotice}
            />

            <AssignmentModal
                visible={assigningResidents}
                title="Manage caseload"
                subtitle={`Choose which residents ${displayName(member)} is assigned to.`}
                mode="multi"
                options={residentOptions}
                initialSelectedIds={(member.assigned_residents || []).map((r) => r.id)}
                onClose={() => setAssigningResidents(false)}
                onSave={handleSaveResidents}
                saveLabel="Save caseload"
                emptyOptionsLabel="No active residents found."
            />

            <AssignmentModal
                visible={assigningManager}
                title="Change manager"
                subtitle={`Choose who ${displayName(member)} reports to.`}
                mode="single"
                options={managerOptions}
                initialSelectedIds={member.manager ? [member.manager.id] : []}
                onClose={() => setAssigningManager(false)}
                onSave={handleSaveManager}
                saveLabel="Save manager"
                emptyOptionsLabel="No managers found."
                noneLabel="No manager"
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
        statusBadge: {
            backgroundColor: colors.urgency.mediumBg,
            borderWidth: 1,
            borderColor: colors.urgency.mediumBorder,
            borderRadius: radius.full,
            paddingHorizontal: space[2],
            paddingVertical: 4,
        },
        statusBadgeText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, lineHeight: fontSize.xs * 1.35, color: colors.urgency.medium },
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
        fieldHint: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary, marginTop: space[1] },
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
        errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm, textAlign: 'center' },
        retryText: { fontFamily: fontFamily.uiSemiBold, color: colors.textLink, fontSize: fontSize.sm },
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
    });
}
