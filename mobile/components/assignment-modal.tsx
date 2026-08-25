import { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { Avatar } from '@/components/avatar';
import { ApiError } from '@/lib/api';

export type AssignmentOption = {
    id: number | string;
    label: string;
    sublabel?: string | null;
};

/**
 * Native port of the web app's AssignmentModal.jsx -- the generic
 * assignment picker behind all three Stage 5 assignment workflows: a
 * resident's care-worker set, a care worker's resident caseload, and a
 * care worker's manager. Renders as a full-height bottom sheet (a phone is
 * always the "narrow" case web has to squeeze a whole picker into, so this
 * skips web's inline-panel layout entirely, same convention as
 * action-sheet.tsx / confirm-dialog.tsx being themed RN-native replacements
 * for things the browser gets for free).
 *
 * `mode="multi"` renders checkboxes and calls onSave with the full new id
 * array (matches the backend's "replace the entire set" PUT endpoints).
 * `mode="single"` renders radio-style rows (plus a "None" row when
 * `allowNone`) and calls onSave with a single id or null (matches the
 * PATCH .../manager endpoint).
 */
export function AssignmentModal({
    visible,
    title,
    subtitle,
    mode = 'multi',
    options, // AssignmentOption[] | null while still loading
    initialSelectedIds = [],
    onClose,
    onSave,
    saveLabel = 'Save',
    emptyOptionsLabel = 'Nothing available to assign.',
    allowNone = true,
    noneLabel = 'No manager',
}: {
    visible: boolean;
    title: string;
    subtitle?: string;
    mode?: 'multi' | 'single';
    options: AssignmentOption[] | null;
    initialSelectedIds?: (number | string)[];
    onClose: () => void;
    onSave: (payload: (number | string)[] | number | string | null) => Promise<void>;
    saveLabel?: string;
    emptyOptionsLabel?: string;
    allowNone?: boolean;
    noneLabel?: string;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const loadingOptions = options === null;

    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<Set<number | string> | number | string | null>(() =>
        mode === 'single' ? (initialSelectedIds[0] ?? null) : new Set(initialSelectedIds)
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Re-seed selection state whenever the sheet is opened fresh for a
    // different target -- Modal keeps this component mounted between opens
    // (visible just toggles), so without this a second "Change manager" tap
    // on a different care worker would still show the previous person's
    // selection until options finished reloading.
    const [seededFor, setSeededFor] = useState(initialSelectedIds);
    if (visible && seededFor !== initialSelectedIds) {
        setSeededFor(initialSelectedIds);
        setSelected(mode === 'single' ? (initialSelectedIds[0] ?? null) : new Set(initialSelectedIds));
    }

    const filtered = useMemo(() => {
        if (loadingOptions) return [];
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(
            (o) => o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)
        );
    }, [options, query, loadingOptions]);

    function toggle(id: number | string) {
        if (mode === 'single') {
            setSelected(id);
            return;
        }
        setSelected((current) => {
            const next = new Set(current as Set<number | string>);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function handleClose() {
        if (saving) return;
        setQuery('');
        setError('');
        onClose();
    }

    async function handleSave() {
        setSaving(true);
        setError('');
        try {
            const payload = mode === 'single' ? (selected as number | string | null) : Array.from(selected as Set<number | string>);
            await onSave(payload);
            setQuery('');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not save these assignments.');
        } finally {
            setSaving(false);
        }
    }

    const isNoneSelected = mode === 'single' && selected === null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
            <Pressable style={styles.backdrop} onPress={handleClose}>
                <Pressable style={styles.sheet} onPress={() => {}}>
                    <View style={styles.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{title}</Text>
                            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                        </View>
                        <Pressable hitSlop={8} onPress={handleClose} style={styles.closeBtn}>
                            <Feather name="x" size={20} color={colors.textTertiary} />
                        </Pressable>
                    </View>

                    {loadingOptions ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator color={colors.teal[600]} />
                        </View>
                    ) : (
                        <>
                            {options.length > 0 && (
                                <View style={styles.searchBox}>
                                    <Feather name="search" size={16} color={colors.textTertiary} />
                                    <TextInput
                                        style={styles.searchInput}
                                        value={query}
                                        onChangeText={setQuery}
                                        placeholder="Search…"
                                        placeholderTextColor={colors.textTertiary}
                                        autoCapitalize="none"
                                    />
                                </View>
                            )}

                            <FlatList
                                data={filtered}
                                keyExtractor={(item) => String(item.id)}
                                style={styles.list}
                                contentContainerStyle={styles.listContent}
                                keyboardShouldPersistTaps="handled"
                                ListHeaderComponent={
                                    mode === 'single' && allowNone ? (
                                        <Pressable
                                            style={[styles.row, isNoneSelected && styles.rowSelected]}
                                            onPress={() => setSelected(null)}
                                        >
                                            <View style={[styles.noneAvatar, { borderColor: colors.borderStrong }]}>
                                                <Text style={{ color: colors.textTertiary, fontFamily: fontFamily.uiSemiBold }}>–</Text>
                                            </View>
                                            <Text style={[styles.rowLabel, { color: colors.textTertiary }]}>{noneLabel}</Text>
                                            {isNoneSelected && <Feather name="check" size={16} color={colors.teal[600]} />}
                                        </Pressable>
                                    ) : null
                                }
                                ListEmptyComponent={
                                    <Text style={styles.emptyText}>
                                        {options.length === 0 ? emptyOptionsLabel : 'No matches.'}
                                    </Text>
                                }
                                renderItem={({ item }) => {
                                    const isChecked =
                                        mode === 'single' ? selected === item.id : (selected as Set<number | string>).has(item.id);
                                    return (
                                        <Pressable style={[styles.row, isChecked && styles.rowSelected]} onPress={() => toggle(item.id)}>
                                            <Avatar name={item.label} size="sm" />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.rowLabel}>{item.label}</Text>
                                                {item.sublabel ? <Text style={styles.rowSublabel}>{item.sublabel}</Text> : null}
                                            </View>
                                            {isChecked && <Feather name="check" size={16} color={colors.teal[600]} />}
                                        </Pressable>
                                    );
                                }}
                            />
                        </>
                    )}

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <View style={styles.actions}>
                        <Pressable
                            style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                            onPress={handleClose}
                            disabled={saving}
                            hitSlop={6}
                        >
                            <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
                            onPress={handleSave}
                            disabled={saving || loadingOptions}
                        >
                            {saving ? <ActivityIndicator color={colors.textOnDark} size="small" /> : <Text style={styles.saveText}>{saveLabel}</Text>}
                        </Pressable>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: 'rgba(11, 17, 27, 0.55)', justifyContent: 'flex-end' },
        sheet: {
            maxHeight: '85%',
            backgroundColor: colors.surfaceCard,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            paddingHorizontal: space[5],
            paddingTop: space[5],
            paddingBottom: space[6],
            gap: space[3],
            ...shadow.lg,
        },
        header: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3] },
        title: { fontFamily: fontFamily.uiBold, fontSize: fontSize.lg, color: colors.textPrimary },
        subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
        closeBtn: { padding: space[1] },
        loadingBox: { paddingVertical: space[8], alignItems: 'center' },
        searchBox: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: space[3],
            backgroundColor: colors.surfaceSunken,
        },
        searchInput: { flex: 1, height: 42, fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textPrimary },
        list: { flexGrow: 0 },
        listContent: { gap: space[1], paddingVertical: space[1] },
        row: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingVertical: space[3],
            paddingHorizontal: space[2],
            borderRadius: radius.md,
        },
        rowSelected: { backgroundColor: colors.teal[50] },
        rowLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
        rowSublabel: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary, marginTop: 1 },
        noneAvatar: {
            width: 28,
            height: 28,
            borderRadius: 14,
            borderWidth: 1,
            borderStyle: 'dashed',
            alignItems: 'center',
            justifyContent: 'center',
        },
        emptyText: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary, textAlign: 'center', paddingVertical: space[6] },
        errorText: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.urgency.high },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space[4], marginTop: space[1] },
        actionBtn: { paddingVertical: space[2], paddingHorizontal: space[2], borderRadius: radius.sm },
        actionBtnPressed: { backgroundColor: colors.surfaceHover },
        cancelText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textLink },
        saveBtn: {
            minWidth: 96,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: space[3],
            paddingHorizontal: space[5],
            borderRadius: radius.md,
            backgroundColor: colors.teal[600],
        },
        saveBtnPressed: { backgroundColor: colors.teal[700] },
        saveText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textOnDark },
    });
}
