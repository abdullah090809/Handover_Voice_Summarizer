import {
    useFonts as useIBMPlexSans,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
    SourceSerif4_400Regular,
    SourceSerif4_500Medium,
    SourceSerif4_600SemiBold,
} from '@expo-google-fonts/source-serif-4';
import {
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';

// Mirrors the web app's index.html Google Fonts <link> exactly (same three
// families, same weights) -- see constants/design-tokens.ts's fontFamily
// export for the string names these register under.
export function useBrandFonts() {
    return useIBMPlexSans({
        IBMPlexSans_400Regular,
        IBMPlexSans_500Medium,
        IBMPlexSans_600SemiBold,
        IBMPlexSans_700Bold,
        SourceSerif4_400Regular,
        SourceSerif4_500Medium,
        SourceSerif4_600SemiBold,
        IBMPlexMono_400Regular,
        IBMPlexMono_500Medium,
        IBMPlexMono_600SemiBold,
    });
}