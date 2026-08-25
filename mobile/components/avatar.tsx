import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { fontFamily, fontSize, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { initials } from '@/lib/format';

// Stage M6c -- ported from the web app's States.jsx `Avatar`. Renders the
// profile photo when one exists and hasn't failed to load, falling back to
// initials-on-teal otherwise -- same fallback behavior as web, including
// resetting the "failed" flag whenever `src` changes so a stale failure
// doesn't stick around after a fresh upload.

const SIZES = { sm: 28, md: 36, lg: 44, xl: 84 } as const;
const FONT_SIZES = { sm: fontSize.xs, md: fontSize.sm, lg: fontSize.base, xl: fontSize.xl } as const;

export function Avatar({
    name,
    size = 'md',
    src,
}: {
    name?: string | null;
    size?: keyof typeof SIZES;
    src?: string | null;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [src]);

    const dimension = SIZES[size];
    const wrapStyle = {
        width: dimension,
        height: dimension,
        borderRadius: dimension / 2,
    };

    if (src && !failed) {
        return (
            <Image
                source={{ uri: src }}
                style={[styles.photo, wrapStyle]}
                onError={() => setFailed(true)}
                contentFit="cover"
            />
        );
    }

    return (
        <View style={[styles.fallback, wrapStyle]}>
            <Text style={{ fontFamily: fontFamily.uiSemiBold, fontSize: FONT_SIZES[size], color: colors.teal[700] }}>
                {initials(name)}
            </Text>
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        fallback: {
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.teal[100],
            flexShrink: 0,
        },
        photo: {
            backgroundColor: colors.surfaceMuted,
            flexShrink: 0,
        },
    });
}
