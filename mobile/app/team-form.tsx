import { useMemo, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { userApi, ApiError } from '@/lib/api';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { SelectField } from '@/components/select-field';

// Stage M7 -- ported from the web app's UserFormModal.jsx. Handles both
// "Add team member" (no params) and the Team list's row-menu "Edit"
// action (id/name/username/email/role passed as params from team.tsx, so
// this opens pre-filled without a second network round trip -- team.tsx
// already has the full list loaded). Covers account essentials only
// (name, username, email, role, password) -- the larger employment/
// personal/emergency-contact field set lives on profile-form.tsx instead,
// same split of responsibilities as web's UserFormModal vs
// CareWorkerFormModal/ManagerFormModal.

const ROLE_OPTIONS = [
    { value: 'care_worker', label: 'Care Staff' },
    { value: 'manager', label: 'Manager' },
];

export default function TeamFormScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { isManager } = useAuth();
    const params = useLocalSearchParams<{ id?: string; name?: string; username?: string; email?: string; role?: string }>();
    const isEdit = Boolean(params.id);

    const [name, setName] = useState(params.name || '');
    const [username, setUsername] = useState(params.username || '');
    const [email, setEmail] = useState(params.email || '');
    const [role, setRole] = useState(params.role === 'manager' ? 'manager' : 'care_worker');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    if (!isManager) return null;

    async function onSave() {
        setError('');
        if (!email.trim()) {
            setError('Enter an email address.');
            return;
        }
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
            setError('Username must be 3-30 characters, letters, numbers, "." or "_" only.');
            return;
        }
        if (!isEdit && (!password || password.length < 8)) {
            setError('Password must be at least 8 characters.');
            return;
        }
        setSaving(true);
        try {
            if (isEdit && params.id) {
                const payload: Record<string, unknown> = { email: email.trim(), username: username.trim(), role, name: name.trim() || null };
                if (password) payload.password = password;
                await userApi.update(params.id, payload);
            } else {
                await userApi.create({ email: email.trim(), username: username.trim(), password, role, name: name.trim() || null });
            }
            router.back();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not save this team member.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen options={{ title: isEdit ? 'Edit team member' : 'Add team member' }} />
            <Text style={styles.subtitle}>
                {isEdit ? 'Update this team member\u2019s account details.' : 'Create a new staff account for your team.'}
            </Text>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Full name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Optional" placeholderTextColor={colors.textTertiary} autoFocus />
            </View>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={(t) => setUsername(t.trim())}
                    autoCapitalize="none"
                    placeholder="username"
                    placeholderTextColor={colors.textTertiary}
                />
                <Text style={styles.fieldHint}>3-30 characters: letters, numbers, . or _</Text>
            </View>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    placeholder="name@example.com"
                    placeholderTextColor={colors.textTertiary}
                />
            </View>

            <SelectField label="Role" value={role} options={ROLE_OPTIONS} onChange={setRole} />

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>{isEdit ? 'New password' : 'Password'}</Text>
                <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    placeholder={isEdit ? 'Leave blank to keep current password' : 'Minimum 8 characters'}
                    placeholderTextColor={colors.textTertiary}
                />
                <Text style={styles.fieldHint}>Minimum 8 characters</Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>{isEdit ? 'Save changes' : 'Add member'}</Text>}
            </Pressable>

            <Pressable style={styles.cancelButton} onPress={() => router.back()}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
        </ScrollView>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.surfaceApp },
        container: { padding: space[5], paddingBottom: space[10], gap: space[5] },
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
