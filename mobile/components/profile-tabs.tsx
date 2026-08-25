import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { fontFamily, fontSize, space, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M6b -- ported from the web app's ProfileTabs.jsx.
//
// IMPORTANT: the web version renders TWO different layouts depending on
// viewport -- a pill tab strip on desktop, and a stacked accordion (one
// header per section, only the active section's content expanded beneath
// it) below 640px. Since the mobile app IS the phone view, this component
// only ever needs the accordion behavior -- there's no desktop pill strip
// to port here. See ProfileTabs.jsx's own comment for the reasoning behind
// why phones get an accordion instead of a horizontal tab strip: four
// labels ("Overview", "Medical Information", "Care Information", "Handover
// History") don't fit a pill strip on a phone without truncating or forcing
// undiscoverable horizontal scrolling.

export type ProfileTab = { key: string; label: string };

export default function ProfileTabs({
    tabs,
    active,
    onChange,
    children,
}: {
    tabs: ProfileTab[];
    active: string;
    onChange: (key: string) => void;
    children: React.ReactNode;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View>
            {tabs.map((t) => {
                const isActive = active === t.key;
                return (
                    <View key={t.key}>
                        <Pressable style={styles.header} onPress={() => onChange(t.key)}>
                            <Text style={[styles.headerText, isActive && styles.headerTextActive]}>{t.label}</Text>
                            <Text style={[styles.chevron, isActive && styles.chevronOpen]}>▼</Text>
                        </Pressable>
                        {isActive && <View style={styles.content}>{children}</View>}
                    </View>
                );
            })}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: space[4],
        borderTopWidth: 1,
        borderTopColor: colors.borderSubtle,
    },
    headerText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textSecondary },
    headerTextActive: { color: colors.textPrimary },
    chevron: { fontSize: fontSize.xs, color: colors.textTertiary },
    chevronOpen: { color: colors.teal[600] },
    content: { paddingBottom: space[4] },
    });
}