import { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { userApi, ApiError } from '@/lib/api';

// Stage M7 -- native equivalent of TeamPage.jsx's handleResetPassword,
// which uses window.prompt() on web (no RN equivalent, so this is a small
// themed Modal with its own TextInput instead -- same reasoning as
// confirm-dialog.tsx replacing Alert.alert).

export function ResetPasswordModal({
    visible,
    targetName,
    targetId,
    onClose,
    onDone,
}: {
    visible: boolean;
    targetName: string;
    targetId: number | string | null;
    onClose: () => void;
    onDone: (message: string) => void;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    function handleClose() {
        setPassword('');
        setError('');
        setSaving(false);
        onClose();
    }

    async function onSubmit() {
        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (targetId == null) return;
        setSaving(true);
        setError('');
        try {
            await userApi.resetPassword(targetId, password);
            handleClose();
            onDone('Password reset.');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not reset the password.');
            setSaving(false);
        }
    }

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Pressable style={styles.card} onPress={() => {}}>
                    <Text style={styles.title}>Reset password</Text>
                    <Text style={styles.message}>Set a new password for {targetName}.</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={(t) => {
                            setPassword(t);
                            if (error) setError('');
                        }}
                        placeholder="New password (min. 8 characters)"
                        placeholderTextColor={colors.textTertiary}
                        secureTextEntry
                        autoFocus
                        autoCapitalize="none"
                    />
                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                    <View style={styles.actions}>
                        <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]} onPress={handleClose} hitSlop={6}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]} onPress={onSubmit} disabled={saving} hitSlop={6}>
                            {saving ? <ActivityIndicator color={colors.teal[600]} /> : <Text style={styles.confirmText}>Reset</Text>}
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(11, 17, 27, 0.55)', alignItems: 'center', justifyContent: 'center', padding: space[6] },
        card: {
            width: '100%',
            maxWidth: 360,
            backgroundColor: colors.surfaceCard,
            borderWidth: 1,
            borderColor: colors.borderDefault,
            borderRadius: radius.lg,
            padding: space[6],
            gap: space[3],
            ...shadow.lg,
        },
        title: { fontFamily: fontFamily.uiBold, fontSize: fontSize.lg, color: colors.textPrimary },
        message: { fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textSecondary, lineHeight: fontSize.base * 1.4 },
        input: {
            height: 44,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: space[3],
            fontFamily: fontFamily.ui,
            fontSize: fontSize.base,
            color: colors.textPrimary,
            backgroundColor: colors.surfaceSunken,
        },
        errorText: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.urgency.high },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[5], marginTop: space[2] },
        actionBtn: { paddingVertical: space[2], paddingHorizontal: space[1], borderRadius: radius.sm, minWidth: 48, alignItems: 'flex-end' },
        actionBtnPressed: { backgroundColor: colors.surfaceHover },
        cancelText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textLink },
        confirmText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textLink },
    });
}
