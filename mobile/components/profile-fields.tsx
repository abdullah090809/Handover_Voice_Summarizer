import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily, fontSize, radius, space, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M6b -- ported from the web app's ProfileFields.jsx. Shared by the
// Resident detail screen now, and intended to be reused by the future
// Care Worker / Manager profile screens too, same as the web version is
// shared across ResidentProfilePage.jsx / CareWorkerProfilePage.jsx /
// ProfilePage.jsx -- keeping one copy here means all profile-style screens
// render fields identically by construction, same reasoning as the web
// app's own comment on this file.
// Shared by every field-grid screen (Profile, Resident, Team member,
// Manager). The grid's fields default to a 48%-width two-column layout,
// which reads fine for short values (a name, a date, a status) but turns
// into a ragged, "congested"-looking stack of near-single-character lines
// for anything long with no spaces to wrap on -- emails and IDs above all.
// Rather than requiring every caller to remember to pass `fullWidth` for
// every field that *might* end up holding a long value (easy to miss, and
// the previous pass did miss "Email" specifically), a field detects this
// itself from its own value and widens automatically. Callers can still
// pass `fullWidth` explicitly for fields that should always span the row
// regardless of length (address, notes, etc.).
const LONG_VALUE_LENGTH = 22;
export function isLongUnbrokenValue(value?: string | number | null): boolean {
    if (typeof value !== 'string') return false;
    // A value with spaces can still wrap naturally inside a narrow column,
    // so this only targets single unbroken tokens (emails, usernames,
    // IDs, URLs) long enough to look cramped at 48% width.
    return !/\s/.test(value) && value.length > LONG_VALUE_LENGTH;
}

export function ReadField({
    label,
    value,
    fullWidth,
}: {
    label: string;
    value?: string | number | null;
    fullWidth?: boolean;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const effectiveFullWidth = fullWidth || isLongUnbrokenValue(value);
    const hasValue = value !== null && value !== undefined && value !== '';
    return (
        <View style={[styles.field, effectiveFullWidth && styles.fieldFull]}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.valueBox}>
                {hasValue ? <Text style={styles.value}>{value}</Text> : <Text style={styles.valueEmpty}>Not recorded</Text>}
            </View>
        </View>
    );
}

export function ChipListField({
    label,
    items,
    emptyLabel,
}: {
    label: string;
    items?: string[] | null;
    emptyLabel: string;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={[styles.field, styles.fieldFull]}>
            <Text style={styles.label}>{label}</Text>
            {items && items.length > 0 ? (
                <View style={styles.chipRow}>
                    {items.map((item, i) => (
                        <View key={i} style={styles.chip}>
                            <Text style={styles.chipText}>{item}</Text>
                        </View>
                    ))}
                </View>
            ) : (
                <View style={styles.valueBox}>
                    <Text style={styles.valueEmpty}>{emptyLabel}</Text>
                </View>
            )}
        </View>
    );
}

/** Read-only list of assigned people (care workers / manager), as a chip
 * row. Mirrors AssignmentChips.jsx's display mode -- the mobile app defers
 * the manager-only "manage assignments" actions for now (see resident/[id]
 * and residents.tsx headers), so this only ever renders read-only. */
export function AssignmentChips({
    items,
    emptyLabel,
}: {
    items?: { id: number | string; name?: string | null; username?: string }[] | null;
    emptyLabel: string;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    if (!items || items.length === 0) {
        return (
            <View style={styles.valueBox}>
                <Text style={styles.valueEmpty}>{emptyLabel}</Text>
            </View>
        );
    }
    return (
        <View style={styles.chipRow}>
            {items.map((item) => (
                <View key={item.id} style={styles.chip}>
                    <Text style={styles.chipText}>{item.name?.trim() || item.username}</Text>
                </View>
            ))}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    // Full-width, single-column fields -- see profile.tsx's `field` style
    // comment for why this changed from '48%' (two-column math didn't
    // actually fit on phone-width screens, so it was already rendering
    // one-per-row, just stuck at half width with dead space beside it).
    field: { width: '100%', gap: space[2] },
    fieldFull: { width: '100%' },
    label: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'uppercase' },
    // Bordered "pill" box on a sunken background -- mirrors profile.tsx's
    // FieldBox (fieldValueBox/fieldValueText/fieldValueEmptyText). Every
    // field-grid screen (Resident, Team member, Manager) shares this one
    // definition so a value always has the same tappable-looking footprint,
    // whether it's a name, a date, or "Not recorded" -- rather than the
    // bare label+text stack this file used to render, which read as flat
    // and unfinished next to Profile's boxed fields.
    valueBox: {
        minHeight: 42,
        justifyContent: 'center',
        paddingHorizontal: space[3],
        paddingVertical: space[2],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceSunken,
    },
    value: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textPrimary },
    valueEmpty: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    // Same explicit-height fix as the badge components -- see
    // handover-badges.tsx for why lineHeight alone isn't reliable here.
    chip: {
        backgroundColor: colors.info.bg,
        borderWidth: 1,
        borderColor: colors.info.border,
        borderRadius: radius.full,
        height: 26,
        justifyContent: 'center',
        paddingHorizontal: space[3],
    },
    chipText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.xs, lineHeight: fontSize.xs * 1.35, color: colors.info.DEFAULT },
    });
}
