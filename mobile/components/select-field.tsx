import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M7 -- RN has no native <select>, so every enum field in the web
// app's ManagerFormModal / CareWorkerFormModal / UserFormModal (role,
// gender, employment type, employment status) becomes a row of tappable
// chips here instead -- same "themed replacement for a web-only
// primitive" pattern as confirm-dialog.tsx and action-sheet.tsx.

export function SelectField({
    label,
    hint,
    value,
    options,
    onChange,
}: {
    label: string;
    hint?: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <View style={styles.row}>
                {options.map((opt) => {
                    const active = opt.value === value;
                    return (
                        <Pressable
                            key={opt.value}
                            style={[styles.chip, active && styles.chipActive]}
                            onPress={() => onChange(opt.value)}
                        >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                        </Pressable>
                    );
                })}
            </View>
            {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        field: { gap: space[2] },
        fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
        fieldHint: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
        chip: {
            paddingVertical: space[2],
            paddingHorizontal: space[3],
            borderRadius: radius.full,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surfaceCard,
        },
        chipActive: { backgroundColor: colors.teal[600], borderColor: colors.teal[600] },
        chipText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
        chipTextActive: { color: colors.white },
    });
}
