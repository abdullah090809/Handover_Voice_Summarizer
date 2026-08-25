import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '@/lib/auth-context';
import { userApi, resolveFileUrl, ApiError } from '@/lib/api';
import { displayName, formatDate, roleLabel, employmentStatusLabel, employmentTypeLabel } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { RoleBadge } from '@/components/role-badge';
import { ReadField, AssignmentChips } from '@/components/profile-fields';
import { DetailHero } from '@/components/detail-hero';
import ProfileTabs from '@/components/profile-tabs';
import { ActionSheet, type ActionSheetItem } from '@/components/action-sheet';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ResetPasswordModal } from '@/components/reset-password-modal';

// Stage M6d -- ported from the web app's ManagerProfilePage.jsx, reached by
// tapping a manager row on the Team list (team.tsx). Same manager-only
// route guard reasoning as team.tsx / team-member/[id].tsx.
//
// "Care workers managed" and "residents overseen" are both derived rollups
// (see the web page's own comment on this), not stored, and both render
// read-only here -- same "defer the assignment picker" treatment as
// team-member/[id].tsx gives its own assignment tab. Reassigning a care
// worker's manager happens from that care worker's own profile on the
// desktop web app; a resident's care_home is set from the resident's own
// profile there too.
//
// Stage M7 -- "Edit" (profile-form.tsx, the 13-field form across the
// Basic/Employment/Management/Emergency-contact sections) and a "..."
// header menu (Reset password / Deactivate or Reactivate / Delete, same
// as team.tsx's row menu) are now wired up here too.

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'employment', label: 'Employment Information' },
    { key: 'management', label: 'Management Information' },
];

type PersonBrief = { id: number | string; name?: string | null; username?: string };
type Manager = {
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
    employment_status?: string | null;
    join_date?: string | null;
    years_of_service?: number | null;
    age?: number | null;
    care_home?: string | null;
    care_workers_managed_count: number;
    residents_overseen_count: number;
    managed_care_workers?: PersonBrief[];
    residents_overseen?: PersonBrief[];
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_phone?: string | null;
    profile_photo_url?: string | null;
};

export default function ManagerDetailScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user: me, isManager } = useAuth();

    const [member, setMember] = useState<Manager | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview');
    const [menuOpen, setMenuOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [resetOpen, setResetOpen] = useState(false);
    const [busy, setBusy] = useState(false);

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
            setError(err instanceof ApiError ? err.message : 'Could not load this manager.');
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
    // an edit shows the updated employment/management fields immediately,
    // instead of the stale data captured on this screen's initial mount.
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
                  onPress: () => router.push({ pathname: '/profile-form', params: { id: String(member.id), role: 'manager' } }),
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
                <Stack.Screen options={{ title: 'Manager' }} />
                <ActivityIndicator />
            </View>
        );
    }

    if (error || !member) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Manager' }} />
                <Text style={styles.errorText}>{error || 'This manager could not be found.'}</Text>
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
                resident/[id].tsx and team-member/[id].tsx -- see
                resident/[id].tsx's comment for the full reasoning. This was
                the one detail screen (reached from a manager row on the
                Team list) still on the old plain header block -- easy to
                miss since Team lists mostly show care workers, not other
                managers. */}
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
                            {member.care_home && (
                                <View style={styles.infoBadge}>
                                    <Text style={styles.infoBadgeText}>{member.care_home}</Text>
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
                        )}

                        {tab === 'employment' && (
                            <View style={styles.fieldGrid}>
                                <ReadField label="Manager ID" value={member.employee_id} />
                                <ReadField label="Job title" value={member.job_title} />
                                <ReadField label="Employment type" value={member.employment_type ? employmentTypeLabel(member.employment_type) : null} />
                                <ReadField label="Department" value={member.department} />
                                <ReadField label="Employment status" value={employmentStatusLabel(member.employment_status)} />
                                <ReadField label="Join date" value={member.join_date ? formatDate(member.join_date) : null} />
                                <ReadField
                                    label="Years of service"
                                    value={member.years_of_service != null ? `${member.years_of_service} yr${member.years_of_service === 1 ? '' : 's'}` : null}
                                />
                            </View>
                        )}

                        {tab === 'management' && (
                            <View style={styles.fieldGrid}>
                                <ReadField label="Care home assigned" value={member.care_home} fullWidth />
                                <ReadField label="Number of care workers managed" value={String(member.care_workers_managed_count)} />
                                <ReadField label="Number of residents overseen" value={String(member.residents_overseen_count)} />
                                <View style={[styles.field, styles.fieldFull]}>
                                    <Text style={styles.fieldLabel}>Care workers managed</Text>
                                    <AssignmentChips items={member.managed_care_workers} emptyLabel="No care workers assigned to this manager yet" />
                                    <Text style={styles.fieldHint}>
                                        To add or remove someone, open their profile on the desktop web app and use "Change manager."
                                    </Text>
                                </View>
                                <View style={[styles.field, styles.fieldFull]}>
                                    <Text style={styles.fieldLabel}>Residents overseen</Text>
                                    <AssignmentChips items={member.residents_overseen} emptyLabel="No residents overseen yet" />
                                    <Text style={styles.fieldHint}>
                                        Every resident whose "Care home" matches this manager's. Set a resident's care home from their own profile.
                                    </Text>
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
        field: { width: '48%', gap: space[1] },
        fieldFull: { width: '100%' },
        fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'uppercase' },
        fieldValue: { fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textPrimary },
        fieldValueEmpty: { fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textTertiary },
        fieldHint: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary, marginTop: space[1] },
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