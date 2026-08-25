import { View, Text, StyleSheet } from 'react-native';
import { fontFamily, fontSize, radius, space, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { residentStatusLabel } from '@/lib/format';

// Stage M6b -- ported from the web app's Badge.jsx (ResidentStatusBadge).
// Kept as its own file (not merged into handover-badges.tsx) since the tone
// mapping is different: resident status isn't an urgency/info scale, it's
// active/discharged/deceased, matching .badge-active/.badge-discharged/
// .badge-deceased in components.css rather than the urgency palette.
function toneFor(colors: BrandColors, status?: string | null) {
    if (status === 'active') {
        return { bg: colors.urgency.lowBg, border: colors.urgency.lowBorder, fg: colors.urgency.low };
    }
    if (status === 'deceased') {
        // Mirrors .badge-deceased's ink-100/ink-600/ink-200 -- deliberately a
        // flatter, colder grey than "discharged" so the two read as visually
        // distinct at a glance, same as the web app.
        return { bg: colors.ink[100], border: colors.ink[200], fg: colors.ink[600] };
    }
    // "discharged" (and any unexpected value) falls back to the same neutral
    // surface-muted treatment as .badge-discharged.
    return { bg: colors.surfaceMuted, border: colors.borderDefault, fg: colors.textSecondary };
}

export function ResidentStatusBadge({ status }: { status?: string | null }) {
    const colors = useThemeColors();
    const tone = toneFor(colors, status);
    return (
        <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{residentStatusLabel(status)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    // Same minHeight + paddingVertical + includeFontPadding fix now applied
    // to every small pill/badge in the app (see handover-badges.tsx for the
    // full explanation) -- the old hard `height: 24` left no room for
    // Android's extra font padding on top of lineHeight, clipping the label.
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[1],
        minHeight: 24,
        borderWidth: 1,
        borderRadius: radius.full,
        paddingHorizontal: space[2],
        paddingVertical: 3,
        alignSelf: 'flex-start',
    },
    badgeText: {
        fontFamily: fontFamily.uiSemiBold,
        fontSize: fontSize.xs,
        lineHeight: fontSize.xs * 1.35,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
});