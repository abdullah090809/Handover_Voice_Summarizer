import { useState, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { userApi, ApiError } from '@/lib/api';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// New this session (post-M6f nav-parity pass). Ported from the web app's
// ChangePasswordModal.jsx, as its own pushed modal screen -- same reasoning
// as edit-profile.tsx: expo-router's own screen navigation beats a
// phone-width modal-over-modal. Reached from the More tab's account menu
// (see (tabs)/more.tsx), matching Sidebar.jsx's "Change password" item.

export default function ChangePasswordScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function onSave() {
        setError('');
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('New password and confirmation do not match.');
            return;
        }
        setSaving(true);
        try {
            await userApi.changePassword(currentPassword, newPassword);
            Alert.alert('Password updated', 'Your password has been changed.');
            router.back();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not change your password.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen options={{ title: 'Change password' }} />
            <Text style={styles.subtitle}>Choose a new password for your account.</Text>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Current password</Text>
                <TextInput
                    style={styles.input}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    autoFocus
                    placeholder="Current password"
                    placeholderTextColor={colors.textTertiary}
                />
            </View>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>New password</Text>
                <TextInput
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textTertiary}
                />
            </View>

            <View style={styles.field}>
                <Text style={styles.fieldLabel}>Confirm new password</Text>
                <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    placeholder="Retype new password"
                    placeholderTextColor={colors.textTertiary}
                />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Update password</Text>}
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
