import { View, Text, StyleSheet } from 'react-native';
import { fontFamily, fontSize, radius, space, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { urgencyLabel, handoverStatusLabel } from '@/lib/format';

// Ported from the web app's Badge.jsx (UrgencyBadge / HandoverStatusBadge).
// Kept as a shared component (not duplicated per-screen) since both the
// handovers list and the handover detail screen need the same badge.

function toneFor(colors: BrandColors, kind: 'low' | 'medium' | 'high' | 'info') {
    if (kind === 'high') return { bg: colors.urgency.highBg, border: colors.urgency.highBorder, fg: colors.urgency.high };
    if (kind === 'medium') return { bg: colors.urgency.mediumBg, border: colors.urgency.mediumBorder, fg: colors.urgency.medium };
    if (kind === 'info') return { bg: colors.info.bg, border: colors.info.border, fg: colors.info.DEFAULT };
    return { bg: colors.urgency.lowBg, border: colors.urgency.lowBorder, fg: colors.urgency.low };
}

export function UrgencyBadge({ urgency }: { urgency?: string | null }) {
    // Mirrors the web app's grouping: "urgent" reads visually as "high", it
    // doesn't get its own color -- there's no separate urgent token in
    // design-tokens.ts, same as web's tokens.css.
    const colors = useThemeColors();
    const kind = urgency === 'high' || urgency === 'urgent' ? 'high' : urgency === 'medium' ? 'medium' : 'low';
    const tone = toneFor(colors, kind);
    return (
        <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <View style={[styles.dot, { backgroundColor: tone.fg }]} />
            <Text style={[styles.badgeText, { color: tone.fg }]}>{urgencyLabel(urgency)}</Text>
        </View>
    );
}

export function HandoverStatusBadge({ status }: { status?: string | null }) {
    const colors = useThemeColors();
    const kind = status === 'complete' ? 'low' : status === 'failed' ? 'high' : 'info';
    const tone = toneFor(colors, kind);
    return (
        <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{handoverStatusLabel(status)}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    // Bug fix, take 2: the previous fix here (a hard `height: 24`) stopped
    // the ambiguous-first-paint sizing bug, but 24 minus the 1px border on
    // each edge only leaves ~22px for the row, and Android's default font
    // padding (mIncludeFontPadding) adds extra space above/below IBM
    // Plex's glyphs beyond what `lineHeight` alone accounts for -- so the
    // label was landing tall enough to get clipped top/bottom by that
    // fixed box (worst on "High"/"Urgent", least room to spare). Fixed
    // here two ways at once: `minHeight` instead of `height` keeps the
    // "no ambiguous first-paint pass" guarantee (it still never resolves
    // shorter than 24 before glyph metrics are ready) while letting the
    // box grow if a glyph genuinely needs more room, and `paddingVertical`
    // gives it real breathing space instead of relying on lineHeight to
    // exactly match the rendered glyph box. `includeFontPadding: false`
    // on the text itself (Android-only, no-op on iOS) turns off that
    // extra native padding at the source so lineHeight is the actual
    // last word on the text's height again.
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
    dot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: {
        fontFamily: fontFamily.uiSemiBold,
        fontSize: fontSize.xs,
        lineHeight: fontSize.xs * 1.35,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
});