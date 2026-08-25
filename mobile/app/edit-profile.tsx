import { useState, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { userApi, ApiError } from '@/lib/api';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M6c -- ported from the web app's EditProfileModal.jsx, as its own
// pushed screen (presentation: 'modal' in app/_layout.tsx) rather than an
// in-place overlay -- same reasoning as app/modal.tsx and
// app/handover/[id].tsx: expo-router's own screen navigation beats a
// phone-width modal-over-tab. This is intentionally the ONLY editable form
// on the Profile tab -- the larger manager-only employment/management panel
// is deferred to the desktop app, see profile.tsx's header comment.

export default function EditProfileScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const { user, refreshUser } = useAuth();

    const [name, setName] = useState((user as any)?.name || '');
    const [username, setUsername] = useState((user as any)?.username || '');
    const [phoneNumber, setPhoneNumber] = useState((user as any)?.phone_number || '');
    const [jobTitle, setJobTitle] = useState((user as any)?.job_title || '');
    const [bio, setBio] = useState((user as any)?.bio || '');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function onSave() {
        setError('');
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
            setError('Username must be 3-30 characters, letters, numbers, "." or "_" only.');
            return;
        }
        setSaving(true);
        try {
            await userApi.updateMe({
                name: name.trim() || null,
                username: username.trim(),
                phone_number: phoneNumber.trim() || null,
                job_title: jobTitle.trim() || null,
                bio: bio.trim() || null,
            });
            await refreshUser();
            router.back();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not update your profile.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen options={{ title: 'Edit profile' }} />
            <Text style={styles.subtitle}>This is shown to your team on handovers and shifts.</Text>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Full name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} autoFocus placeholder="Your name" placeholderTextColor={colors.textTertiary} />
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
                <Text style={styles.fieldLabel}>Job title</Text>
                <TextInput
                    style={styles.input}
                    value={jobTitle}
                    onChangeText={setJobTitle}
                    placeholder="e.g. Senior Care Worker, Registered Manager"
                    placeholderTextColor={colors.textTertiary}
                />
            </View>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Phone number</Text>
                <TextInput
                    style={styles.input}
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="phone-pad"
                    placeholderTextColor={colors.textTertiary}
                />
            </View>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Bio</Text>
                <TextInput
                    style={[styles.input, styles.textarea]}
                    value={bio}
                    onChangeText={setBio}
                    multiline
                    numberOfLines={4}
                    maxLength={1000}
                    placeholder="A short note about yourself, visible to your team"
                    placeholderTextColor={colors.textTertiary}
                />
            </View>

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
    textarea: { height: 96, paddingTop: space[3], textAlignVertical: 'top' },
    errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
    saveButton: { height: 48, backgroundColor: colors.teal[600], borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
    saveButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.white, fontSize: fontSize.base },
    buttonDisabled: { opacity: 0.5 },
    cancelButton: { alignItems: 'center', paddingVertical: space[2] },
    cancelButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.textSecondary, fontSize: fontSize.base },
});
}
