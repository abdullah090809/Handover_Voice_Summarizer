import { useState, useMemo } from 'react';
import { Stack, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { getServerUrl, getDefaultServerUrl, setServerUrl, resetServerUrl, testServerUrl } from '@/lib/api';
import { fontFamily, fontSize, space, radius, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Reachable both signed-out (from login.tsx's gear icon -- someone can't
// log in at all if this is wrong, so it can't live only behind auth) and
// signed-in (from the More tab -- WiFi changes mid-session too). See
// app/_layout.tsx: registered outside both Stack.Protected groups so it's
// always navigable regardless of auth state.
//
// Saving here takes effect immediately, no rebuild/restart -- lib/api.ts
// reads the current server URL fresh on every request. This replaces the
// old workflow of editing eas.json's EXPO_PUBLIC_API_URL and running
// `eas build` every time the dev machine's LAN IP changed.

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export default function ServerSettingsScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const router = useRouter();
    const [url, setUrl] = useState(getServerUrl());
    const [saving, setSaving] = useState(false);
    const [testState, setTestState] = useState<TestState>('idle');
    const [error, setError] = useState('');

    const defaultUrl = getDefaultServerUrl();
    const isDefault = url.trim().replace(/\/$/, '') === defaultUrl;

    async function onTest() {
        setError('');
        setTestState('testing');
        const ok = await testServerUrl(url);
        setTestState(ok ? 'ok' : 'fail');
    }

    async function onSave() {
        setError('');
        setSaving(true);
        try {
            await setServerUrl(url);
            Alert.alert('Server updated', 'The app will now use this address for all requests.');
            router.back();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not save that URL.');
        } finally {
            setSaving(false);
        }
    }

    async function onResetDefault() {
        await resetServerUrl();
        setUrl(getServerUrl());
        setTestState('idle');
    }

    return (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
                <Stack.Screen options={{ title: 'Server settings', presentation: 'modal' }} />

                <Text style={styles.subtitle}>
                    Point this app at your backend&apos;s address, e.g. your PC&apos;s LAN IP and the Nginx port
                    (<Text style={styles.mono}>http://192.168.1.xxx:5173</Text>). Changing this takes effect
                    immediately -- no reinstall or rebuild needed.
                </Text>

                <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Backend URL</Text>
                    <TextInput
                        style={styles.input}
                        value={url}
                        onChangeText={(t) => { setUrl(t); setTestState('idle'); }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        keyboardType="url"
                        placeholder={defaultUrl}
                        placeholderTextColor={colors.textTertiary}
                    />
                    <Text style={styles.fieldHint}>Current default: {defaultUrl}</Text>
                </View>

                {testState !== 'idle' && (
                    <View style={[styles.testBanner, testState === 'ok' && styles.testBannerOk, testState === 'fail' && styles.testBannerFail]}>
                        <Feather
                            name={testState === 'testing' ? 'loader' : testState === 'ok' ? 'check-circle' : 'alert-circle'}
                            size={16}
                            color={testState === 'ok' ? colors.urgency.low : testState === 'fail' ? colors.urgency.high : colors.textSecondary}
                        />
                        <Text style={[styles.testBannerText, { color: testState === 'ok' ? colors.urgency.low : testState === 'fail' ? colors.urgency.high : colors.textSecondary }]}>
                            {testState === 'testing' ? 'Checking…' : testState === 'ok' ? 'Reachable -- server responded.' : 'Could not reach that address. Check WiFi and the IP/port.'}
                        </Text>
                    </View>
                )}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Pressable style={styles.testButton} onPress={onTest} disabled={testState === 'testing'}>
                    {testState === 'testing' ? <ActivityIndicator color={colors.teal[600]} /> : <Text style={styles.testButtonText}>Test connection</Text>}
                </Pressable>

                <Pressable style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
                    {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save</Text>}
                </Pressable>

                {!isDefault && (
                    <Pressable style={styles.cancelButton} onPress={onResetDefault}>
                        <Text style={styles.cancelButtonText}>Reset to default</Text>
                    </Pressable>
                )}

                <Pressable style={styles.cancelButton} onPress={() => router.back()}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
        flex: { flex: 1, backgroundColor: colors.surfaceApp },
        container: { padding: space[5], paddingBottom: space[10], gap: space[5] },
        subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: fontSize.sm * 1.5 },
        mono: { fontFamily: fontFamily.mono, fontSize: fontSize.xs },
        field: { gap: space[2] },
        fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
        fieldHint: { fontFamily: fontFamily.ui, fontSize: fontSize.xs, color: colors.textTertiary },
        input: {
            height: 44,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            paddingHorizontal: space[3],
            fontFamily: fontFamily.mono,
            fontSize: fontSize.base,
            color: colors.textPrimary,
            backgroundColor: colors.surfaceCard,
        },
        testBanner: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            borderWidth: 1,
            borderRadius: radius.md,
            padding: space[3],
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.borderDefault,
        },
        testBannerOk: { backgroundColor: colors.urgency.lowBg, borderColor: colors.urgency.lowBorder },
        testBannerFail: { backgroundColor: colors.urgency.highBg, borderColor: colors.urgency.highBorder },
        testBannerText: { flex: 1, fontFamily: fontFamily.ui, fontSize: fontSize.sm },
        errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
        testButton: {
            height: 44,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
        },
        testButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.teal[600], fontSize: fontSize.base },
        saveButton: { height: 48, backgroundColor: colors.teal[600], borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
        saveButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.white, fontSize: fontSize.base },
        buttonDisabled: { opacity: 0.5 },
        cancelButton: { alignItems: 'center', paddingVertical: space[2] },
        cancelButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.textSecondary, fontSize: fontSize.base },
    });
}
