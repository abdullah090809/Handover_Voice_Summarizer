import { View, Text, StyleSheet } from 'react-native';
import { fontFamily, fontSize, radius, space, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { roleLabel } from '@/lib/format';

// Stage M6c -- ported from the web app's Badge.jsx `RoleBadge`, same
// badge-manager / badge-worker / badge-deactivated tone mapping as
// components.css. Kept as its own file rather than folded into
// resident-badges.tsx / handover-badges.tsx since this is the third
// distinct tone scale in the app (role, not urgency or resident status).
function toneFor(colors: BrandColors, role?: string | null) {
    if (role === 'manager') {
        // Mirrors .badge-manager: teal-100 bg / teal-700 fg / a slightly
        // deeper teal border than the shared token, taken directly from
        // components.css since design-tokens.ts doesn't carry that exact
        // border shade.
        return { bg: colors.teal[100], border: '#bfe4de', fg: colors.teal[700] };
    }
    if (role === 'deactivated') {
        return { bg: colors.urgency.highBg, border: colors.urgency.highBorder, fg: colors.urgency.high };
    }
    // "care_worker" (and any unexpected value) mirrors .badge-worker's
    // neutral surface-muted treatment.
    return { bg: colors.surfaceMuted, border: colors.borderDefault, fg: colors.textSecondary };
}

export function RoleBadge({ role }: { role?: string | null }) {
    const colors = useThemeColors();
    const tone = toneFor(colors, role);
    return (
        <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{roleLabel(role)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    // Same minHeight + paddingVertical + includeFontPadding fix as
    // handover-badges.tsx / resident-badges.tsx -- the old hard
    // `height: 24` left no room for Android's extra font padding on top
    // of lineHeight, clipping the label.
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
