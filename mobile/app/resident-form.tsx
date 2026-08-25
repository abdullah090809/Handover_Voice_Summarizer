import { useEffect, useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { residentApi, ApiError } from '@/lib/api';
import { toDateInputValue } from '@/lib/format';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { SelectField } from '@/components/select-field';
import { TagInput } from '@/components/tag-input';

// Ported from the web app's ResidentFormModal.jsx. Handles both "Add
// resident" (Residents list FAB, no id param) and "Edit resident"
// (resident/[id].tsx's header menu, id param passed through) with one
// screen, same one-screen-covers-both-modes convention as team-form.tsx
// and profile-form.tsx. Only full name is required -- everything else can
// be filled in later, same as web.

const GENDER_OPTIONS = [
    { value: '', label: 'Not specified' },
    { value: 'female', label: 'Female' },
    { value: 'male', label: 'Male' },
    { value: 'non_binary', label: 'Non-binary' },
    { value: 'other', label: 'Other' },
];

const MOBILITY_OPTIONS = [
    { value: '', label: 'Not specified' },
    { value: 'independent', label: 'Independent' },
    { value: 'uses_walking_aid', label: 'Uses walking aid' },
    { value: 'wheelchair_user', label: 'Wheelchair user' },
    { value: 'bed_bound', label: 'Bed-bound' },
];

const CARE_LEVEL_OPTIONS = [
    { value: '', label: 'Not specified' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'nursing', label: 'Nursing' },
];

const RISK_LEVEL_OPTIONS = [
    { value: '', label: 'Not specified' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

const EMPTY_FORM = {
    name: '',
    preferred_name: '',
    date_of_birth: '',
    gender: '',
    resident_code: '',
    admission_date: '',
    room_number: '',
    ward_unit: '',
    care_home: '',
    disability: '',
    mobility_status: '',
    dietary_requirements: '',
    communication_requirements: '',
    sensory_loss: '',
    care_level: '',
    risk_level: '',
    behaviour_notes: '',
    daily_care_notes: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    religion: '',
    ethnicity: '',
    preferred_language: '',
};

const EMPTY_LISTS = {
    medical_conditions: [] as string[],
    allergies: [] as string[],
    current_medications: [] as string[],
};

type FormState = typeof EMPTY_FORM;
type ListState = typeof EMPTY_LISTS;

export default function ResidentFormScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { isManager } = useAuth();
    const { id } = useLocalSearchParams<{ id?: string }>();
    const isEdit = Boolean(id);

    const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
    const [lists, setLists] = useState<ListState>({ ...EMPTY_LISTS });
    const [loading, setLoading] = useState(isEdit);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isManager) {
            router.back();
            return;
        }
        if (!isEdit) return;
        (async () => {
            setLoading(true);
            try {
                const resident = await residentApi.get(id!);
                const nextForm: any = { ...EMPTY_FORM };
                for (const key of Object.keys(EMPTY_FORM)) {
                    const value = (resident as any)[key];
                    if (key === 'date_of_birth' || key === 'admission_date') {
                        nextForm[key] = value ? toDateInputValue(value) : '';
                    } else {
                        nextForm[key] = value ?? '';
                    }
                }
                setForm(nextForm);
                setLists({
                    medical_conditions: Array.isArray(resident.medical_conditions) ? resident.medical_conditions : [],
                    allergies: Array.isArray(resident.allergies) ? resident.allergies : [],
                    current_medications: Array.isArray(resident.current_medications) ? resident.current_medications : [],
                });
            } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Could not load this resident.');
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, isEdit, isManager]);

    if (!isManager) return null;

    function set(key: keyof FormState) {
        return (value: string) => setForm((f) => ({ ...f, [key]: value }));
    }

    function setList(key: keyof ListState) {
        return (value: string[]) => setLists((l) => ({ ...l, [key]: value }));
    }

    async function onSave() {
        if (!form.name.trim()) {
            setError('Enter a name.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const payload: Record<string, unknown> = { ...lists };
            for (const [key, value] of Object.entries(form)) {
                payload[key] = value === '' ? null : value;
            }
            payload.name = form.name.trim();
            if (isEdit) {
                await residentApi.update(id!, payload);
            } else {
                await residentApi.create(payload);
            }
            router.back();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not save this resident.');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: isEdit ? 'Edit resident' : 'Add resident' }} />
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen options={{ title: isEdit ? 'Edit resident' : 'Add resident' }} />
            {!isEdit && (
                <Text style={styles.subtitle}>Only full name is required — the rest can be filled in any time.</Text>
            )}

            <Section title="Basic information">
                <Field label="Full name" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.name} onChangeText={set('name')} placeholderTextColor={colors.textTertiary} autoFocus={!isEdit} />
                </Field>
                <Field label="Preferred name" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.preferred_name} onChangeText={set('preferred_name')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Date of birth" hint="YYYY-MM-DD" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.date_of_birth} onChangeText={set('date_of_birth')} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
                </Field>
                <SelectField label="Gender" value={form.gender} options={GENDER_OPTIONS} onChange={set('gender')} />
                <Field label="Resident ID" hint="Auto-generated if left blank" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.resident_code} onChangeText={set('resident_code')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Admission date" hint="YYYY-MM-DD" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.admission_date} onChangeText={set('admission_date')} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Room number" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.room_number} onChangeText={set('room_number')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Ward / unit" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.ward_unit} onChangeText={set('ward_unit')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Care home" hint="Defaults to your own care home if left blank" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.care_home} onChangeText={set('care_home')} placeholderTextColor={colors.textTertiary} />
                </Field>
            </Section>

            <Section title="Medical information">
                <Field label="Medical conditions" hint="Type a value and tap + to add" colors={colors} styles={styles}>
                    <TagInput values={lists.medical_conditions} onChange={setList('medical_conditions')} placeholder="e.g. Type 2 diabetes" />
                </Field>
                <Field label="Allergies" hint="Type a value and tap + to add" colors={colors} styles={styles}>
                    <TagInput values={lists.allergies} onChange={setList('allergies')} placeholder="e.g. Penicillin" />
                </Field>
                <Field label="Current medications" hint="Type a value and tap + to add" colors={colors} styles={styles}>
                    <TagInput values={lists.current_medications} onChange={setList('current_medications')} placeholder="e.g. Metformin 500mg" />
                </Field>
                <Field label="Disability" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.disability} onChangeText={set('disability')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <SelectField label="Mobility status" value={form.mobility_status} options={MOBILITY_OPTIONS} onChange={set('mobility_status')} />
                <Field label="Dietary requirements" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.dietary_requirements} onChangeText={set('dietary_requirements')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Communication requirements" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.communication_requirements} onChangeText={set('communication_requirements')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Sensory loss" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.sensory_loss} onChangeText={set('sensory_loss')} placeholderTextColor={colors.textTertiary} />
                </Field>
            </Section>

            <Section title="Care information">
                <SelectField label="Care level" value={form.care_level} options={CARE_LEVEL_OPTIONS} onChange={set('care_level')} />
                <SelectField label="Risk level" value={form.risk_level} options={RISK_LEVEL_OPTIONS} onChange={set('risk_level')} />
                <Field label="Behaviour notes" colors={colors} styles={styles}>
                    <TextInput style={[styles.input, styles.textarea]} value={form.behaviour_notes} onChangeText={set('behaviour_notes')} placeholderTextColor={colors.textTertiary} multiline numberOfLines={3} />
                </Field>
                <Field label="Daily care notes" colors={colors} styles={styles}>
                    <TextInput style={[styles.input, styles.textarea]} value={form.daily_care_notes} onChangeText={set('daily_care_notes')} placeholderTextColor={colors.textTertiary} multiline numberOfLines={3} />
                </Field>
            </Section>

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

            <Section title="Personal information">
                <Field label="Religion / beliefs" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.religion} onChangeText={set('religion')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Ethnicity" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.ethnicity} onChangeText={set('ethnicity')} placeholderTextColor={colors.textTertiary} />
                </Field>
                <Field label="Preferred language" colors={colors} styles={styles}>
                    <TextInput style={styles.input} value={form.preferred_language} onChangeText={set('preferred_language')} placeholderTextColor={colors.textTertiary} />
                </Field>
            </Section>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>{isEdit ? 'Save changes' : 'Add resident'}</Text>}
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
        textarea: { height: 80, paddingTop: space[2], textAlignVertical: 'top' },
        errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
        saveButton: { height: 48, backgroundColor: colors.teal[600], borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
        saveButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.white, fontSize: fontSize.base },
        buttonDisabled: { opacity: 0.5 },
        cancelButton: { alignItems: 'center', paddingVertical: space[2] },
        cancelButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.textSecondary, fontSize: fontSize.base },
    });
}
