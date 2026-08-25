import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Native port of the web app's ResidentFormModal.jsx TagInput -- type a
// value and press "Add" (or submit) to append it as a chip. Backs the
// resident form's three array fields (medical conditions, allergies,
// current medications), same as web.

export function TagInput({
    values,
    onChange,
    placeholder,
}: {
    values: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [draft, setDraft] = useState('');

    function commit() {
        const v = draft.trim();
        if (!v) return;
        onChange([...values, v]);
        setDraft('');
    }

    function remove(i: number) {
        onChange(values.filter((_, idx) => idx !== i));
    }

    return (
        <View style={styles.wrap}>
            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textTertiary}
                    onSubmitEditing={commit}
                    onBlur={commit}
                    returnKeyType="done"
                />
                <Pressable style={styles.addBtn} onPress={commit} hitSlop={8}>
                    <Feather name="plus" size={16} color={colors.teal[600]} />
                </Pressable>
            </View>
            {values.length > 0 && (
                <View style={styles.chipRow}>
                    {values.map((v, i) => (
                        <View key={`${v}-${i}`} style={styles.chip}>
                            <Text style={styles.chipText}>{v}</Text>
                            <Pressable onPress={() => remove(i)} hitSlop={6} accessibilityLabel={`Remove ${v}`}>
                                <Feather name="x" size={12} color={colors.teal[700]} />
                            </Pressable>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        wrap: { gap: space[2] },
        inputRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
        input: {
            flex: 1,
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
        addBtn: {
            width: 44,
            height: 44,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceCard,
        },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[1],
            paddingVertical: space[1],
            paddingHorizontal: space[3],
            borderRadius: radius.full,
            backgroundColor: colors.teal[100],
        },
        chipText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.teal[700] },
    });
}
