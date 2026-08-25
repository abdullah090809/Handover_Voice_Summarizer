import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// React Native's Alert.alert() always renders as a native OS dialog, which
// on Android is opaque white regardless of the app's own theme -- there's
// no color/style prop that reaches it, because it isn't drawn by RN at
// all, it's a real native AlertDialog the OS owns. That's why the "Sign
// out" confirmation was a bright white card in the middle of an otherwise
// dark screen: no bug in this app's own styling to fix, the component
// itself was simply never going to pick up the theme. This is a themed
// replacement, built as an ordinary RN Modal (transparent, our own
// backdrop + card, our own theme colors) so it repaints with the rest of
// the app in both light and dark mode. Used in place of Alert.alert
// specifically for the sign-out confirmation in (tabs)/more.tsx and
// profile.tsx; other Alert.alert calls elsewhere (simple one-button
// notices, not theme-sensitive confirm/cancel choices) are left as-is.

export function ConfirmDialog({
    visible,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    onConfirm,
    onCancel,
}: {
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const colors = useThemeColors();
    const styles = createStyles(colors);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <Pressable style={styles.backdrop} onPress={onCancel}>
                {/* Swallow taps on the card itself so they don't bubble to the
                    backdrop Pressable and dismiss the dialog. */}
                <Pressable style={styles.card} onPress={() => {}}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.message}>{message}</Text>
                    <View style={styles.actions}>
                        <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]} onPress={onCancel} hitSlop={6}>
                            <Text style={styles.cancelText}>{cancelLabel}</Text>
                        </Pressable>
                        <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]} onPress={onConfirm} hitSlop={6}>
                            <Text style={destructive ? styles.destructiveText : styles.confirmText}>{confirmLabel}</Text>
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: 'rgba(11, 17, 27, 0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: space[6],
        },
        card: {
            width: '100%',
            maxWidth: 340,
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
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[5], marginTop: space[2] },
        actionBtn: { paddingVertical: space[2], paddingHorizontal: space[1], borderRadius: radius.sm },
        actionBtnPressed: { backgroundColor: colors.surfaceHover },
        cancelText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textLink },
        confirmText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textLink },
        destructiveText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.urgency.high },
    });
}
