import { useCallback, useRef, useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, RefreshControl, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '@/lib/auth-context';
import { userApi, resolveFileUrl, ApiError } from '@/lib/api';
import { displayName, formatDate, roleLabel, employmentStatusLabel, employmentTypeLabel } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { Avatar } from '@/components/avatar';
import { RoleBadge } from '@/components/role-badge';
import { HeroGlow } from '@/components/hero-glow';
import { isLongUnbrokenValue } from '@/components/profile-fields';

// Stage M6c -- ported from the web app's ProfilePage.jsx as the 5th tab.
//
// Visual pass (this session): the original port matched web's *structure*
// (hero / field-grid / employment panels) but not its *finish* -- plain
// text values instead of boxed fields, no icons on field labels, no dark
// hero decoration, three separately-carded sections stacked with big gaps.
// This pass closes that gap against pages.css's actual rules (profile-card,
// profile-field-value, panel-section-header, the hero's decorative ring)
// rather than re-guessing the look from screenshots alone, and goes a step
// further where RN allows it cheaply (verified badge on the avatar, an
// icon well on each section header) without pulling in new dependencies --
// the hero's radial glow is approximated with two plain Views (concentric
// rings) instead of reaching for expo-linear-gradient purely for this one
// decorative touch, same call the previous pass made.
//
// The identity block (hero + completion + editable fields + bio) is now
// ONE continuous card, matching web's `.profile-card` (padding: 0, hero
// squared off at the top, one field-grid below it) -- not three stacked
// boxes with visible gaps between them. The employment panels stay their
// own separate cards below, same as web.
//
// Sign-out button removed from this screen. Web's ProfilePage has no
// sign-out affordance of its own -- "Log out" lives once, in Sidebar.jsx's
// footer account menu -- and this screen was the odd one out with its own
// second copy. This app's equivalent footer menu already exists on the
// More tab (app/(tabs)/more.tsx's account sheet), so removing the
// duplicate here is a straight parity fix, not a loss of the feature.
//
// `user` comes from useAuth() (loaded once by auth-context, see the
// M6b-fix session) rather than a fresh /users/me fetch here, per this
// project's own standing principle. Unlike the web app's ProfilePage, this
// screen does NOT call refreshUser() again on every mount -- the web
// version does that specifically to pick up changes made on *other* pages
// (e.g. a resident's care_home affecting a manager's `residents_overseen`
// count), a scenario this pass doesn't need to handle since nothing else
// in the mobile app currently edits those derived fields. Pull-to-refresh
// below covers the common case (re-check after editing from the desktop
// app) without paying for a redundant fetch on every tab visit.
//
// The "Employment & management information" panel below is still
// read-only ON THIS SCREEN -- it's not this screen's own edit form. Stage
// M7 added that form (profile-form.tsx, same 13-field set as web's
// ManagerFormModal) reachable from a manager's *Team-list* row instead
// (see team.tsx's row menu / manager/[id].tsx's own "Edit" button) --
// tapping your own "You" row on Team opens the same manager/[id] detail
// screen for yourself (the backend's PUT /users/{id} has no self-edit
// block, unlike delete/deactivate), so that path also covers editing your
// own employment/management fields without duplicating the form here. The
// smaller, genuinely self-service "Edit profile" fields (name/username/
// job title/phone/bio) get their own dedicated RN form right on this
// screen -- see app/edit-profile.tsx -- since that's a 5-field form, not
// a large admin form, and it's core to what "your own profile" screen
// means.

// auth-context's MeResponse type only guarantees id/name/email/role (plus an
// index signature for anything else) -- it's shared by every screen and
// deliberately doesn't enumerate every extended profile field. This screen
// is the first to actually read those fields, so it defines its own shape
// here (same pattern as resident/[id].tsx's own `Resident` type) and casts
// `user` into it below, rather than widening the shared type for one screen.
type CareWorkerBrief = { id: number | string; name?: string | null; username?: string };
type Profile = {
    id: number | string;
    name?: string | null;
    username?: string;
    email: string;
    role?: string | null;
    phone_number?: string | null;
    job_title?: string | null;
    bio?: string | null;
    created_at?: string | null;
    profile_photo_url?: string | null;
    employee_id?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    home_address?: string | null;
    employment_type?: string | null;
    department?: string | null;
    shift_pattern?: string | null;
    employment_status?: string | null;
    join_date?: string | null;
    years_of_service?: number | null;
    care_home?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_phone?: string | null;
    assigned_residents?: { id: number | string; name: string }[];
    managed_care_workers?: CareWorkerBrief[];
    residents_overseen?: { id: number | string; name: string }[];
};

type IconSpec = { set: 'feather' | 'mci'; name: string };

function FieldIcon({ icon, color }: { icon: IconSpec; color: string }) {
    if (icon.set === 'mci') {
        return <MaterialCommunityIcons name={icon.name as any} size={13} color={color} />;
    }
    return <Feather name={icon.name as any} size={13} color={color} />;
}

// Mirrors web's ReadField/StaticField: a labeled value rendered inside a
// bordered "pill" box (profile-field-value), or -- when empty and
// editable -- a dashed teal affordance box instead of a flat "Not
// recorded". Used for every field on this screen (both the self-editable
// identity fields and the manager/care-worker employment fields), unlike
// profile-fields.tsx's plain-text ReadField which other screens
// (resident/team detail) still use as-is.
function FieldBox({
    icon,
    label,
    value,
    emptyLabel,
    onAdd,
    fullWidth,
}: {
    icon: IconSpec;
    label: string;
    value?: string | number | null;
    emptyLabel?: string;
    onAdd?: () => void;
    fullWidth?: boolean;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const effectiveFullWidth = fullWidth || isLongUnbrokenValue(value);
    const hasValue = value !== null && value !== undefined && value !== '';
    return (
        <View style={[styles.field, effectiveFullWidth && styles.fieldFull]}>
            <View style={styles.fieldLabelRow}>
                <FieldIcon icon={icon} color={colors.textTertiary} />
                <Text style={styles.fieldLabel}>{label}</Text>
            </View>
            {hasValue ? (
                <View style={styles.fieldValueBox}>
                    <Text style={styles.fieldValueText}>{value}</Text>
                </View>
            ) : onAdd ? (
                <Pressable style={styles.fieldValueAdd} onPress={onAdd}>
                    <Feather name="plus" size={12} color={colors.textLink} />
                    <Text style={styles.fieldValueAddText}>Add {emptyLabel || label.toLowerCase()}</Text>
                </Pressable>
            ) : (
                <View style={styles.fieldValueBox}>
                    <Text style={styles.fieldValueEmptyText}>Not recorded</Text>
                </View>
            )}
        </View>
    );
}

function FieldChips({
    icon,
    label,
    items,
    emptyLabel,
}: {
    icon: IconSpec;
    label: string;
    items: string[];
    emptyLabel: string;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={[styles.field, styles.fieldFull]}>
            <View style={styles.fieldLabelRow}>
                <FieldIcon icon={icon} color={colors.textTertiary} />
                <Text style={styles.fieldLabel}>{label}</Text>
            </View>
            {items.length > 0 ? (
                <View style={styles.chipRow}>
                    {items.map((item, i) => (
                        <View key={i} style={styles.chip}>
                            <Text style={styles.chipText}>{item}</Text>
                        </View>
                    ))}
                </View>
            ) : (
                <View style={styles.fieldValueBox}>
                    <Text style={styles.fieldValueEmptyText}>{emptyLabel}</Text>
                </View>
            )}
        </View>
    );
}

// Section header for a standalone employment panel -- icon well + title +
// subtitle, mirrors web's .panel-section-header, separated from the field
// grid below it by a hairline instead of a floating subtitle.
function SectionHeader({
    icon,
    title,
    subtitle,
    onEdit,
}: {
    icon: IconSpec;
    title: string;
    subtitle: string;
    onEdit?: () => void;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderIcon}>
                <FieldIcon icon={icon} color={colors.teal[700]} />
            </View>
            <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>{title}</Text>
                <Text style={styles.sectionSubtitle}>{subtitle}</Text>
            </View>
            {onEdit && (
                <Pressable style={styles.sectionEditBtn} onPress={onEdit} hitSlop={8}>
                    <Feather name="edit-2" size={12} color={colors.teal[700]} />
                    <Text style={styles.sectionEditBtnText}>Edit</Text>
                </Pressable>
            )}
        </View>
    );
}

export default function ProfileScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { user: authUser, isManager, refreshUser } = useAuth();
    const user = authUser as unknown as Profile | null;
    const [uploading, setUploading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    async function onRefresh() {
        setRefreshing(true);
        await refreshUser().catch(() => { });
        setRefreshing(false);
    }

    // Re-fetch the shared user on focus so returning from edit-profile.tsx
    // or profile-form.tsx (editing your own employment/management fields)
    // shows the change immediately -- previously this tab only picked up
    // edits via a manual pull-to-refresh, so a save could look like it
    // "didn't update" even though it had.
    const didMount = useRef(false);
    useFocusEffect(
        useCallback(() => {
            if (!didMount.current) {
                didMount.current = true;
                return;
            }
            refreshUser().catch(() => { });
        }, [refreshUser])
    );

    async function onPickPhoto() {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            Alert.alert('Photo access needed', 'Enable photo library access in your phone Settings to change your profile picture.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
            allowsEditing: true,
            aspect: [1, 1],
        });
        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        setUploading(true);
        try {
            await userApi.uploadProfilePicture({
                uri: asset.uri,
                name: asset.fileName || `profile-${Date.now()}.jpg`,
                type: asset.mimeType || 'image/jpeg',
            });
            await refreshUser();
        } catch (err) {
            Alert.alert('Upload failed', err instanceof ApiError ? err.message : 'Could not upload your photo.');
        } finally {
            setUploading(false);
        }
    }

    if (!user) {
        return (
            <View style={styles.centerFill}>
                <ActivityIndicator />
            </View>
        );
    }

    const completionFlags = [Boolean(user.profile_photo_url), Boolean(user.job_title), Boolean(user.phone_number), Boolean(user.bio)];
    const completedFields = completionFlags.filter(Boolean).length;
    const totalFields = completionFlags.length;
    const completionPct = Math.round((completedFields / totalFields) * 100);
    const isIncomplete = completedFields < totalFields;

    const openEdit = () => router.push('/edit-profile');

    return (
        <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <Text style={styles.pageTitle}>Profile</Text>
            <Text style={styles.pageSubtitle}>Your account details and how your team sees you.</Text>

            <View style={styles.identityCard}>
                <View style={styles.hero}>
                    <HeroGlow />

                    <View style={styles.avatarWrap}>
                        <Avatar name={displayName(user)} size="xl" src={resolveFileUrl(user.profile_photo_url)} />
                        <View style={styles.avatarVerifiedBadge}>
                            <Feather name="check" size={11} color={colors.white} />
                        </View>
                        <Pressable style={styles.avatarUploadBtn} onPress={onPickPhoto} disabled={uploading}>
                            {uploading ? <ActivityIndicator size="small" color={colors.white} /> : <Feather name="camera" size={12} color={colors.white} />}
                        </Pressable>
                    </View>

                    {/* Same fallback-to-email guard as manager/[id].tsx / team-member/[id].tsx
                        -- when there's no name set yet, displayName() falls back to the raw
                        email, which previously wrapped mid-word into a ragged multi-line hero
                        heading (see the "Add your name" prompt just below this hero -- the
                        full email is always visible there and in the Email field below). */}
                    <Text style={styles.heroName} numberOfLines={2} ellipsizeMode="tail">
                        {displayName(user)}
                    </Text>
                    <Text style={styles.heroEmail}>{user.email}</Text>
                    {user.job_title ? <Text style={styles.heroJobTitle}>{user.job_title}</Text> : null}
                    <View style={{ marginTop: space[2] }}>
                        <RoleBadge role={user.role} />
                    </View>

                    <Pressable style={styles.heroEditBtn} onPress={openEdit}>
                        <Feather name="edit-2" size={13} color={colors.white} />
                        <Text style={styles.heroEditBtnText}>Edit</Text>
                    </Pressable>
                </View>

                {isIncomplete && (
                    <View style={styles.progressRow}>
                        <View style={styles.progressSteps}>
                            {completionFlags.map((done, i) => (
                                <View key={i} style={[styles.progressStep, done && styles.progressStepFilled]} />
                            ))}
                        </View>
                        <Text style={styles.progressLabel}>{completionPct}% profile complete</Text>
                    </View>
                )}

                {/* Post-M6f nav-parity pass: Team / Alerts / Audit link cards
                    that used to live here (see the removed M6d/M6e/M6f notes)
                    moved to the new "More" tab's nav list (app/(tabs)/more.tsx)
                    instead. That gives them a real always-visible entry point
                    -- matching web's Sidebar.jsx, where those three are
                    top-level nav items, not tucked under the Profile page --
                    and this screen goes back to matching web's ProfilePage.jsx,
                    which has no navigation links of its own either. */}

                <View style={styles.fieldGrid}>
                    <FieldBox icon={{ set: 'feather', name: 'user' }} label="Full name" value={user.name} emptyLabel="your name" onAdd={openEdit} />
                    <FieldBox icon={{ set: 'feather', name: 'at-sign' }} label="Username" value={user.username ? `@${user.username}` : null} />
                    <FieldBox icon={{ set: 'feather', name: 'mail' }} label="Email" value={user.email} />
                    <FieldBox icon={{ set: 'feather', name: 'phone' }} label="Phone number" value={user.phone_number} emptyLabel="phone number" onAdd={openEdit} />
                    <FieldBox icon={{ set: 'feather', name: 'shield' }} label="Role" value={roleLabel(user.role)} />
                    <FieldBox icon={{ set: 'feather', name: 'briefcase' }} label="Job title" value={user.job_title} emptyLabel="job title" onAdd={openEdit} />
                    <FieldBox icon={{ set: 'feather', name: 'calendar' }} label="Member since" value={formatDate(user.created_at)} fullWidth />
                </View>

                <View style={styles.bioSection}>
                    <View style={styles.fieldLabelRow}>
                        <Feather name="file-text" size={13} color={colors.textTertiary} />
                        <Text style={styles.fieldLabel}>Bio</Text>
                    </View>
                    {user.bio ? (
                        <View style={styles.bioBox}>
                            <Text style={styles.bioText}>{user.bio}</Text>
                        </View>
                    ) : (
                        <Pressable style={styles.fieldValueAdd} onPress={openEdit}>
                            <Feather name="plus" size={12} color={colors.textLink} />
                            <Text style={styles.fieldValueAddText}>Add a short bio so your team knows more about you</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {user.role === 'care_worker' && (
                <View style={styles.card}>
                    <SectionHeader
                        icon={{ set: 'feather', name: 'briefcase' }}
                        title="Employment information"
                        subtitle="Managed by your manager — ask them to update anything here."
                    />
                    <View style={styles.fieldGrid}>
                        <FieldBox icon={{ set: 'feather', name: 'hash' }} label="Employee ID" value={user.employee_id} />
                        <FieldBox icon={{ set: 'mci', name: 'cake-variant-outline' }} label="Date of birth" value={user.date_of_birth ? formatDate(user.date_of_birth) : null} />
                        <FieldBox icon={{ set: 'feather', name: 'user' }} label="Gender" value={user.gender} />
                        <FieldBox icon={{ set: 'feather', name: 'map-pin' }} label="Home address" value={user.home_address} fullWidth />
                        <FieldBox icon={{ set: 'feather', name: 'briefcase' }} label="Employment type" value={user.employment_type ? employmentTypeLabel(user.employment_type) : null} />
                        <FieldBox icon={{ set: 'feather', name: 'grid' }} label="Department / Ward" value={user.department} />
                        <FieldBox icon={{ set: 'feather', name: 'clock' }} label="Shift pattern" value={user.shift_pattern} />
                        <FieldBox icon={{ set: 'feather', name: 'shield' }} label="Employment status" value={user.employment_status ? employmentStatusLabel(user.employment_status) : null} />
                        <FieldBox icon={{ set: 'feather', name: 'calendar' }} label="Join date" value={user.join_date ? formatDate(user.join_date) : null} />
                        <FieldBox
                            icon={{ set: 'feather', name: 'calendar' }}
                            label="Years of service"
                            value={user.years_of_service != null ? `${user.years_of_service} yr${user.years_of_service === 1 ? '' : 's'}` : null}
                        />
                        <FieldChips
                            icon={{ set: 'feather', name: 'users' }}
                            label="Assigned residents"
                            items={(user.assigned_residents || []).map((r: any) => r.name)}
                            emptyLabel="No residents assigned"
                        />
                        <FieldBox
                            icon={{ set: 'feather', name: 'phone-call' }}
                            label="Emergency contact"
                            value={
                                user.emergency_contact_name
                                    ? `${user.emergency_contact_name}${user.emergency_contact_relationship ? ` · ${user.emergency_contact_relationship}` : ''}${user.emergency_contact_phone ? ` · ${user.emergency_contact_phone}` : ''}`
                                    : null
                            }
                            fullWidth
                        />
                    </View>
                </View>
            )}

            {isManager && (
                <View style={styles.card}>
                    <SectionHeader
                        icon={{ set: 'mci', name: 'account-cog-outline' }}
                        title="Employment & management information"
                        subtitle="Your employment details and the care home you manage."
                        onEdit={() => router.push({ pathname: '/profile-form', params: { id: String(user.id), role: 'manager' } })}
                    />
                    <View style={styles.fieldGrid}>
                        <FieldBox icon={{ set: 'feather', name: 'hash' }} label="Manager ID" value={user.employee_id} />
                        <FieldBox icon={{ set: 'mci', name: 'cake-variant-outline' }} label="Date of birth" value={user.date_of_birth ? formatDate(user.date_of_birth) : null} />
                        <FieldBox icon={{ set: 'feather', name: 'user' }} label="Gender" value={user.gender} />
                        <FieldBox icon={{ set: 'feather', name: 'map-pin' }} label="Home address" value={user.home_address} fullWidth />
                        <FieldBox icon={{ set: 'feather', name: 'briefcase' }} label="Employment type" value={user.employment_type ? employmentTypeLabel(user.employment_type) : null} />
                        <FieldBox icon={{ set: 'feather', name: 'grid' }} label="Department" value={user.department} />
                        <FieldBox icon={{ set: 'feather', name: 'shield' }} label="Employment status" value={user.employment_status ? employmentStatusLabel(user.employment_status) : null} />
                        <FieldBox icon={{ set: 'feather', name: 'calendar' }} label="Join date" value={user.join_date ? formatDate(user.join_date) : null} />
                        <FieldBox
                            icon={{ set: 'feather', name: 'calendar' }}
                            label="Years of service"
                            value={user.years_of_service != null ? `${user.years_of_service} yr${user.years_of_service === 1 ? '' : 's'}` : null}
                        />
                        <FieldBox icon={{ set: 'feather', name: 'home' }} label="Care home assigned" value={user.care_home} fullWidth />
                        <FieldChips
                            icon={{ set: 'mci', name: 'account-cog-outline' }}
                            label="Care workers managed"
                            items={(user.managed_care_workers || []).map((w: any) => w.name?.trim() || w.username)}
                            emptyLabel="No care workers assigned to you yet"
                        />
                        <FieldChips
                            icon={{ set: 'feather', name: 'users' }}
                            label="Residents overseen"
                            items={(user.residents_overseen || []).map((r: any) => r.name)}
                            emptyLabel="No residents overseen yet"
                        />
                        <FieldBox
                            icon={{ set: 'feather', name: 'phone-call' }}
                            label="Emergency contact"
                            value={
                                user.emergency_contact_name
                                    ? `${user.emergency_contact_name}${user.emergency_contact_relationship ? ` · ${user.emergency_contact_relationship}` : ''}${user.emergency_contact_phone ? ` · ${user.emergency_contact_phone}` : ''}`
                                    : null
                            }
                            fullWidth
                        />
                    </View>
                </View>
            )}
        </ScrollView>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.surfaceApp },
        container: { padding: space[5], paddingBottom: space[10], gap: space[6] },
        centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceApp },

        pageTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: -space[4] },
        pageSubtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },

        // One continuous card: dark identity banner on top (square corners,
        // clipped by the card's own overflow:hidden), then completion +
        // field-grid + bio below -- mirrors web's .profile-card, replacing the
        // previous pass's separate bordered box with a visible gap after it.
        identityCard: {
            backgroundColor: colors.surfaceCard,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            borderRadius: radius.lg,
            overflow: 'hidden',
            ...shadow.xs,
        },

        // Mirrors .profile-hero.profile-hero-centered's radial-gradient glow
        // over --surface-dark -- see components/hero-glow.tsx for how the glow
        // itself is built (and the bug it fixes in the previous pass's version
        // of this decoration).
        hero: {
            backgroundColor: colors.ink[900],
            paddingVertical: space[8],
            paddingHorizontal: space[6],
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
        },
        avatarWrap: { position: 'relative' },
        avatarVerifiedBadge: {
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: colors.teal[500],
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.ink[900],
        },
        avatarUploadBtn: {
            position: 'absolute',
            bottom: -2,
            left: -2,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: colors.teal[600],
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.ink[900],
        },
        heroName: { fontFamily: fontFamily.uiBold, fontSize: fontSize.lg, color: colors.white, marginTop: space[3], textAlign: 'center' },
        heroEmail: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.ink[300], marginTop: 2, textAlign: 'center' },
        heroJobTitle: { fontFamily: fontFamily.uiMedium, fontSize: fontSize.xs, color: colors.ink[300], marginTop: 1 },
        heroEditBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[1],
            marginTop: space[4],
            backgroundColor: colors.teal[600],
            borderRadius: radius.md,
            paddingVertical: space[2],
            paddingHorizontal: space[4],
        },
        heroEditBtnText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.white },

        progressRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingHorizontal: space[6],
            paddingTop: space[5],
        },
        progressSteps: { flexDirection: 'row', gap: 3, flex: 1 },
        progressStep: { flex: 1, height: 5, minWidth: 6, borderRadius: radius.full, backgroundColor: colors.surfaceHoverStrong },
        progressStepFilled: { backgroundColor: colors.teal[500] },
        progressLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textTertiary },

        card: {
            backgroundColor: colors.surfaceCard,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            borderRadius: radius.lg,
            overflow: 'hidden',
            marginTop: space[1],
            ...shadow.xs,
        },

        // Mirrors .panel-section-header: icon well + title/subtitle, separated
        // from the field grid below by a hairline instead of a floating
        // subtitle under a plain heading.
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[3],
            padding: space[5],
            borderBottomWidth: 1,
            borderBottomColor: colors.borderSubtle,
        },
        sectionHeaderIcon: {
            width: 32,
            height: 32,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.teal[50],
        },
        sectionHeaderText: { flex: 1, gap: 2 },
        sectionTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.base, color: colors.textPrimary },
        sectionSubtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary },
        sectionEditBtn: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            alignSelf: 'flex-start',
            paddingVertical: space[1],
            paddingHorizontal: space[2],
            borderRadius: radius.sm,
            backgroundColor: colors.teal[50],
        },
        sectionEditBtnText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.teal[700] },

        fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space[4], padding: space[5] },
        // Full-width, single-column fields. This used to be width:'48%' for
        // a two-column grid, but on phone-width screens 48%+48%+gap doesn't
        // actually fit -- flexWrap forced every field onto its own row
        // anyway, just stuck at half the row's width with dead space beside
        // it (the "Ali" box not reaching the edge). Since it was already
        // rendering one-per-row, this makes that literal.
        field: { width: '100%', gap: space[2] },
        fieldFull: { width: '100%' },
        fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'uppercase' },

        // Mirrors .profile-field-value: a bordered "pill" box on a sunken
        // background, not bare text -- gives every value a consistent, tappable-
        // looking footprint whether it's a name, an email, or a status.
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
        fieldValueText: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textPrimary },
        fieldValueEmptyText: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary },

        // Mirrors button.profile-field-value.profile-field-value-empty: a
        // dashed teal affordance box in place of a flat "Not recorded" --
        // an empty field is somewhere to act, not just a gap.
        fieldValueAdd: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: 42,
            paddingHorizontal: space[3],
            paddingVertical: space[2],
            borderRadius: radius.md,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.borderStrong,
        },
        fieldValueAddText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textLink, flexShrink: 1 },

        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
        chip: {
            backgroundColor: colors.info.bg,
            borderWidth: 1,
            borderColor: colors.info.border,
            borderRadius: radius.full,
            height: 26,
            justifyContent: 'center',
            paddingHorizontal: space[3],
        },
        chipText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, lineHeight: fontSize.xs * 1.35, color: colors.info.DEFAULT },

        bioSection: { paddingHorizontal: space[5], paddingBottom: space[5], gap: space[2], marginTop: -space[4] },
        bioBox: {
            padding: space[3],
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderSubtle,
            backgroundColor: colors.surfaceSunken,
        },
        bioText: { fontFamily: fontFamily.reading, fontSize: fontSize.base, color: colors.textPrimary, lineHeight: fontSize.base * 1.6 },
    });
}