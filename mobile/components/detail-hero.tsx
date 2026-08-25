import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontFamily, fontSize, space, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { Avatar } from '@/components/avatar';
import { HeroGlow } from '@/components/hero-glow';

// Dark identity banner for a read-only detail screen -- resident/[id].tsx
// and team-member/[id].tsx both used to open with a plain header block
// (name + meta line + badges) sitting directly on the same white card as
// the field grid below it, which read noticeably flatter than
// app/profile.tsx's own dark, centered hero once the two were compared
// side by side. This gives both screens the same identity-card treatment
// as Profile -- and matches web's own `.profile-hero` on a phone: the
// mobile breakpoint in pages.css stacks that (non-centered, desktop) hero
// into the same centered column layout as ProfilePage's hero, so a
// centered layout here is actual mobile-web parity, not a stylistic
// departure from it.
//
// Deliberately simpler than profile.tsx's own hero -- no photo-upload
// button, no "Edit" pill, no verified badge -- since this is someone
// else's read-only profile, not the signed-in person's own. `subtitle` and
// `badges` are left generic (a string / a node) so each screen supplies
// its own meta-line format and badge set rather than this component
// guessing at resident-only or care-worker-only fields.
export function DetailHero({
    name,
    subtitle,
    badges,
    avatarSrc,
}: {
    name: string;
    subtitle?: string | null;
    badges?: React.ReactNode;
    avatarSrc?: string | null;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.hero}>
            <HeroGlow />
            <Avatar name={name} size="xl" src={avatarSrc} />
            <Text style={styles.name} numberOfLines={2} ellipsizeMode="tail">
                {name}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {badges ? <View style={styles.badgeRow}>{badges}</View> : null}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        hero: {
            backgroundColor: colors.ink[900],
            paddingVertical: space[8],
            paddingHorizontal: space[6],
            alignItems: 'center',
            position: 'relative',
            overflow: 'hidden',
        },
        name: { fontFamily: fontFamily.uiBold, fontSize: fontSize.lg, color: colors.white, marginTop: space[3], textAlign: 'center' },
        subtitle: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.ink[300], marginTop: 2, textAlign: 'center' },
        badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[2], marginTop: space[3] },
    });
}