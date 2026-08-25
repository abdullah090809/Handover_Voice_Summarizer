import { useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { userApi, ApiError } from '@/lib/api';
import { toDateInputValue } from '@/lib/format';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { SelectField } from '@/components/select-field';

// Stage M7 -- ported from the web app's CareWorkerFormModal.jsx /
// ManagerFormModal.jsx (the two are near-identical, differing only in
// "Shift pattern" vs "Care home assigned" -- see ManagerFormModal.jsx's
// own comment on this). One screen covers both, switching on the `role`
// param, same as this app's team-form.tsx covers both roles with one
// screen for the smaller account-fields form. Account essentials (email,
// username, password, role) are NOT here -- those live on team-form.tsx,
// same split of responsibilities as web.

const GENDER_OPTIONS = [
    { value: '', label: 'Not specified' },
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'non_binary', label: 'Non-binary' },
    { value: 'other', label: 'Other' },
];

const EMPLOYMENT_TYPE_OPTIONS = [
    { value: '', label: 'Not specified' },
    { value: 'full_time', label: 'Full-time' },
    { value: 'part_time', label: 'Part-time' },
    { value: 'bank', label: 'Bank' },
    { value: 'agency', label: 'Agency' },
    { value: 'volunteer', label: 'Volunteer' },
];

const EMPLOYMENT_STATUS_OPTIONS = [
    { value: 'active', label: 'Active' },
    { value: 'on_leave', label: 'On leave' },
    { value: 'suspended', label: 'Suspended' },
    { value: 'left', label: 'Left' },
];

const EMPTY_FORM = {
    employee_id: '',
    date_of_birth: '',
    gender: '',
    home_address: '',
    job_title: '',
    employment_type: '',
    department: '',
    shift_pattern: '',
    employment_status: 'active',
    join_date: '',
    care_home: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
};

type FormState = typeof EMPTY_FORM;

export default function ProfileFormScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { isManager, user: authUser, refreshUser } = useAuth();
    const { id, role } = useLocalSearchParams<{ id: string; role?: string }>();
    const isManagerProfile = role === 'manager';

    const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isManager) {
            router.back();
            return;
        }
        (async () => {
            setLoading(true);
            try {
                const user = await userApi.get(id);
                setForm({
                    employee_id: user.employee_id || '',
                    date_of_birth: user.date_of_birth ? toDateInputValue(user.date_of_birth) : '',
                    gender: user.gender || '',
                    home_address: user.home_address || '',
                    job_title: user.job_title || '',
                    employment_type: user.employment_type || '',
                    department: user.department || '',
                    shift_pattern: user.shift_pattern || '',
                    employment_status: user.employment_status || 'active',
                    join_date: user.join_date ? toDateInputValue(user.join_date) : '',
                    care_home: user.care_home || '',
                    emergency_contact_name: user.emergency_contact_name || '',
                    emergency_contact_relationship: user.emergency_contact_relationship || '',
                    emergency_contact_phone: user.emergency_contact_phone || '',
                });
            } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not load this profile.');
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, isManager]);

    if (!isManager) return null;

    function set(key: keyof FormState) {
        return (value: string) => setForm((f) => ({ ...f, [key]: value }));
    }

    async function onSave() {
        setSaving(true);
        setError('');
        try {
            const payload: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(form)) {
                if (!isManagerProfile && key === 'care_home') continue;
                if (isManagerProfile && key === 'shift_pattern') continue;
                payload[key] = value === '' ? null : value;
            }
            await userApi.update(id, payload);
            // When editing your own record (Profile tab's manager-info Edit
            // button routes here with your own id), auth-context's cached
            // `user` is the shared copy every screen reads -- including
            // profile.tsx, which doesn't re-fetch on its own after this
            // screen pops. Without this, the save succeeds but the Profile
            // tab keeps showing the pre-edit values until the next pull-to-
            // refresh or app relaunch. Editing someone else's profile (from
            // Team) doesn't touch your own id, so this is a no-op then.
            if (authUser && String(authUser.id) === String(id)) {
                await refreshUser().catch(() => { });
            }
            router.back();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not save this profile.');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Edit profile' }} />
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen options={{ title: isManagerProfile ? 'Edit manager profile' : 'Edit care worker profile' }} />
            <Text style={styles.subtitle}>Employment, personal, and emergency contact details.</Text>

            <Section title="Basic information">
                <Field label={isManagerProfile ? 'Manager ID' : 'Employee ID'} hint="Auto-generated if left blank" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.employee_id} onChangeText={set('employee_id')} placeholderTextColor={colors.textTertiary} autoFocus />
                </Field>
                <Field label="Date of birth" hint="YYYY-MM-DD" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.date_of_birth} onChangeText={set('date_of_birth')} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
                </Field>
                <SelectField label="Gender" value={form.gender} options={GENDER_OPTIONS} onChange={set('gender')} />
                <Field label="Home address" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.home_address} onChangeText={set('home_address')} placeholderTextColor={colors.textTertiary} />
                </Field>
            </Section>

            <Section title="Employment information">
                <Field label="Job title" hint={isManagerProfile ? 'e.g. Care Home Manager' : 'e.g. Senior Care Worker'} colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.job_title} onChangeText={set('job_title')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <SelectField label="Employment type" value={form.employment_type} options={EMPLOYMENT_TYPE_OPTIONS} onChange={set('employment_type')} />
                <Field label={isManagerProfile ? 'Department' : 'Department / Ward'} colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.department} onChangeText={set('department')} placeholderTextColor={colors.textTertiary} />
                </Field>
                {!isManagerProfile && (
                    <Field label="Shift pattern" hint="e.g. Days, Nights, Rotating" colors={colors} styles={styles}>
                        <TextInput style={styles.input} value={form.shift_pattern} onChangeText={set('shift_pattern')} placeholderTextColor={colors.textTertiary} />
                    </Field>
                )}
                <SelectField label="Employment status" value={form.employment_status} options={EMPLOYMENT_STATUS_OPTIONS} onChange={set('employment_status')} />
                <Field label="Join date" hint="YYYY-MM-DD" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.join_date} onChangeText={set('join_date')} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
                </Field>
            </Section>

            {isManagerProfile && (
                <Section title="Management information">
                    <Field label="Care home assigned" hint="Which site this manager oversees" colors={colors} styles={styles}>
                        <TextInput style={styles.input} value={form.care_home} onChangeText={set('care_home')} placeholderTextColor={colors.textTertiary} />
                    </Field>
                </Section>
            )}

            <Section title="Emergency contact">
                <Field label="Contact name" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.emergency_contact_name} onChangeText={set('emergency_contact_name')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Relationship" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.emergency_contact_relationship} onChangeText={set('emergency_contact_relationship')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Phone number" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.emergency_contact_phone} onChangeText={set('emergency_contact_phone')} keyboardType="phone-pad" placeholderTextColor={colors.textTertiary} />
                </Field>
            </Section>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save changes</Text>}
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={() => router.back()}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
        </ScrollView>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    const colors = useThemeColors();
    return (
        <View style={{ gap: space[4] }}>
            <Text style={{ fontFamily: fontFamily.uiBold, fontSize: fontSize.sm, color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 0.3 }}>{title}</Text>
            {children}
        </View>
    );
}

function Field({
    label,
    hint,
    children,
    colors,
    styles,
}: {
    label: string;
    hint?: string;
    children: React.ReactNode;
    colors: BrandColors;
    styles: ReturnType<typeof createStyles>;
}) {
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            {children}
            {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.surfaceApp },
        centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceApp },
        container: { padding: space[5], paddingBottom: space[10], gap: space[6] },
        subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
        field: { gap: space[2] },
        fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
        fieldHint: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        input: {
            height: 44,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: space[3],
            fontFamily: fontFamily.ui,
            fontSize: fontSize.base,
            color: colors.textPrimary,
            backgroundColor: colors.surfaceCard,
        },
        errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
        saveButton: { height: 48, backgroundColor: colors.teal[600], borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
        saveButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.white, fontSize: fontSize.base },
        buttonDisabled: { opacity: 0.5 },
        cancelButton: { alignItems: 'center', paddingVertical: space[2] },
        cancelButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.textSecondary, fontSize: fontSize.base },
    });
}
