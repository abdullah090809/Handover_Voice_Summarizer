import { useMemo } from 'react';
import { Modal, Text, Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M7 -- native equivalent of the web app's ActionMenu.jsx (TeamPage's
// per-row "..." menu). Web renders a floating dropdown on desktop widths
// and a full-width bottom sheet below 640px (see TeamPage.jsx's own
// comment on this) -- a phone is always the narrow case, so this always
// renders as a bottom sheet, same convention as confirm-dialog.tsx being a
// themed replacement for a native-only primitive.

export type ActionSheetItem = {
    label: string;
    icon: keyof typeof Feather.glyphMap;
    onPress: () => void;
    danger?: boolean;
    disabled?: boolean;
};

export function ActionSheet({
    visible,
    title,
    items,
    onClose,
}: {
    visible: boolean;
    title?: string;
    items: ActionSheetItem[];
    onClose: () => void;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <Pressable style={styles.sheet} onPress={() => {}}>
                    {title ? <Text style={styles.title}>{title}</Text> : null}
                    {items.map((item, i) => (
                        <Pressable
                            key={i}
                            disabled={item.disabled}
                            style={({ pressed }) => [
                                styles.row,
                                pressed && !item.disabled && styles.rowPressed,
                                item.disabled && styles.rowDisabled,
                            ]}
                            onPress={() => {
                                onClose();
                                item.onPress();
                            }}
                        >
                            <Feather name={item.icon} size={18} color={item.danger ? colors.urgency.high : colors.textPrimary} />
                            <Text style={[styles.rowText, item.danger && styles.rowTextDanger]}>{item.label}</Text>
                        </Pressable>
                    ))}
                    <Pressable style={({ pressed }) => [styles.cancelRow, pressed && styles.rowPressed]} onPress={onClose}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(11, 17, 27, 0.55)', justifyContent: 'flex-end' },
        sheet: {
            backgroundColor: colors.surfaceCard,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: space[4],
            paddingTop: space[4],
            paddingBottom: space[8],
            gap: space[1],
            ...shadow.lg,
        },
        title: {
            fontFamily: fontFamily.uiSemiBold,
            fontSize: fontSize.xs,
            color: colors.textTertiary,
            textTransform: 'uppercase',
            paddingHorizontal: space[3],
            paddingBottom: space[2],
        },
        row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], paddingHorizontal: space[3], borderRadius: radius.md },
        rowPressed: { backgroundColor: colors.surfaceHover },
        rowDisabled: { opacity: 0.4 },
        rowText: { fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textPrimary },
        rowTextDanger: { color: colors.urgency.high, fontFamily: fontFamily.uiSemiBold },
        cancelRow: { alignItems: 'center', paddingVertical: space[3], marginTop: space[2], borderTopWidth: 1, borderTopColor: colors.borderSubtle },
        cancelText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textSecondary },
    });
}
