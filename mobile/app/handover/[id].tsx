import { useCallback, useEffect, useState, useMemo } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { residentApi, handoverApi, ApiError } from '@/lib/api';
import { formatDateTime, formatHandoverCode } from '@/lib/format';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';
import { UrgencyBadge, HandoverStatusBadge } from '@/components/handover-badges';
import { useAuth } from '@/lib/auth-context';

// Stage M6 -- ported from the web app's HandoverDetailModal.jsx as a full
// screen instead of a modal overlay (a phone-width modal-over-modal doesn't
// read well, and expo-router already gives us a real "back" affordance).
// Deliberately NOT ported: the .txt/.json export buttons -- those trigger a
// browser download, which doesn't have a direct RN equivalent without
// expo-sharing/expo-file-system. Can follow later if it's actually wanted.

type Submitter = { name?: string | null; username: string };
type HandoverNote = {
    id: number;
    shift_id: number;
    shift_number?: number | null;
    resident_id: number | null;
    raw_transcript: string | null;
    summary_json: {
        summary?: string;
        key_events?: string[];
        medications_given?: string[];
        incidents?: string[];
        follow_up_actions?: string[];
        mood_notes?: string;
        translated_transcript?: string;
    } | null;
    urgency_flag: string | null;
    status: string;
    error_message: string | null;
    created_at: string;
    submitted_by?: Submitter | null;
};
type Resident = { id: number | string; name: string; resident_code?: string | null };

export default function HandoverDetailScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    // isManager now comes from the shared AuthProvider instead of this
    // screen fetching /users/me itself -- see auth-context.tsx.
    const { isManager } = useAuth();

    const [note, setNote] = useState<HandoverNote | null>(null);
    const [resident, setResident] = useState<Resident | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [showTranscript, setShowTranscript] = useState(false);
    const [showTranslated, setShowTranslated] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            const noteData = await handoverApi.get(id);
            setNote(noteData);
            if (noteData.resident_id) {
                residentApi.get(noteData.resident_id).then(setResident).catch(() => setResident(null));
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load this handover note.');
        }
    }, [id]);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await load();
            setLoading(false);
        })();
    }, [load]);

    const s = note?.summary_json || {};
    const submitterName = note?.submitted_by?.name?.trim() || note?.submitted_by?.username;

    function confirmDelete() {
        if (!note) return;
        Alert.alert(
            'Delete this handover note?',
            `This permanently removes ${formatHandoverCode(note.id)} for ${resident?.name || 'this resident'}. This can't be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete note', style: 'destructive', onPress: doDelete },
            ]
        );
    }

    async function doDelete() {
        if (!note) return;
        setDeleting(true);
        try {
            await handoverApi.remove(note.id);
            router.back();
        } catch (err) {
            Alert.alert('Could not delete', err instanceof ApiError ? err.message : 'Something went wrong.');
            setDeleting(false);
        }
    }

    if (loading) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Handover' }} />
                <ActivityIndicator />
            </View>
        );
    }

    if (error || !note) {
        return (
            <View style={styles.centerFill}>
                <Stack.Screen options={{ title: 'Handover' }} />
                <Text style={styles.errorText}>{error || 'This handover note could not be found.'}</Text>
                <Pressable onPress={load}>
                    <Text style={styles.retryText}>Retry</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
            <Stack.Screen options={{ title: resident?.name || formatHandoverCode(note.id) }} />

            <View style={styles.headerBlock}>
                <Text style={styles.residentName}>{resident?.name || `Resident #${note.resident_id}`}</Text>
                <Text style={styles.metaLine}>
                    {resident?.resident_code ? `${resident.resident_code} · ` : ''}
                    {formatHandoverCode(note.id)} · Shift #{note.shift_number ?? note.shift_id} · {formatDateTime(note.created_at)}
                </Text>
            </View>

            <View style={styles.metaRow}>
                {note.status === 'complete' ? (
                    <UrgencyBadge urgency={note.urgency_flag} />
                ) : (
                    <HandoverStatusBadge status={note.status} />
                )}
                {submitterName && <Text style={styles.submittedBy}>Submitted by {submitterName}</Text>}
            </View>

            {note.status !== 'complete' && (
                <View style={[styles.banner, note.status === 'failed' ? styles.bannerError : styles.bannerInfo]}>
                    <Text style={note.status === 'failed' ? styles.bannerErrorText : styles.bannerInfoText}>
                        {note.status === 'failed'
                            ? note.error_message || 'This recording could not be processed.'
                            : 'This note is still being transcribed and summarized. Pull to refresh to check again.'}
                    </Text>
                </View>
            )}

            {note.status === 'failed' && note.raw_transcript && (
                <CollapsibleSection
                    title="Transcript (summary generation failed)"
                    open={showTranscript}
                    onToggle={() => setShowTranscript((v) => !v)}
                >
                    {note.raw_transcript}
                </CollapsibleSection>
            )}

            {note.status === 'complete' && (
                <>
                    <Section title="Summary">
                        <Text style={styles.readingText}>{s.summary || 'No summary text was generated.'}</Text>
                    </Section>

                    {!!s.key_events?.length && (
                        <Section title="Key events">
                            {s.key_events.map((item, i) => (
                                <BulletRow key={i} text={item} />
                            ))}
                        </Section>
                    )}

                    {!!s.medications_given?.length && (
                        <Section title="Medications given">
                            {s.medications_given.map((item, i) => (
                                <BulletRow key={i} text={item} tone="medication" />
                            ))}
                        </Section>
                    )}

                    {!!s.incidents?.length && (
                        <Section title="Incidents" titleColor={colors.urgency.high}>
                            {s.incidents.map((item, i) => (
                                <BulletRow key={i} text={item} tone="incident" />
                            ))}
                        </Section>
                    )}

                    {!!s.follow_up_actions?.length && (
                        <Section title="Follow-up actions">
                            {s.follow_up_actions.map((item, i) => (
                                <BulletRow key={i} text={item} tone="action" />
                            ))}
                        </Section>
                    )}

                    {!!s.mood_notes && (
                        <Section title="Mood & wellbeing">
                            <Text style={styles.readingText}>{s.mood_notes}</Text>
                        </Section>
                    )}

                    {!!s.translated_transcript && (
                        <CollapsibleSection
                            title="Translated transcript"
                            open={showTranslated}
                            onToggle={() => setShowTranslated((v) => !v)}
                        >
                            {s.translated_transcript}
                        </CollapsibleSection>
                    )}

                    {!!note.raw_transcript && (
                        <CollapsibleSection
                            title="Raw transcript"
                            open={showTranscript}
                            onToggle={() => setShowTranscript((v) => !v)}
                        >
                            {note.raw_transcript}
                        </CollapsibleSection>
                    )}
                </>
            )}

            {isManager && (
                <Pressable style={styles.deleteButton} onPress={confirmDelete} disabled={deleting}>
                    {deleting ? <ActivityIndicator color={colors.urgency.high} /> : <Text style={styles.deleteButtonText}>Delete note</Text>}
                </Pressable>
            )}
        </ScrollView>
    );
}

function Section({ title, titleColor, children }: { title: string; titleColor?: string; children: React.ReactNode }) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.section}>
            <Text style={[styles.sectionHeading, titleColor ? { color: titleColor } : null]}>{title}</Text>
            {children}
        </View>
    );
}

function BulletRow({ text, tone }: { text: string; tone?: 'medication' | 'incident' | 'action' }) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const dotColor =
        tone === 'incident' ? colors.urgency.high : tone === 'medication' ? colors.teal[600] : colors.textTertiary;
    return (
        <View style={styles.bulletRow}>
            <View style={[styles.bulletDot, { backgroundColor: dotColor }]} />
            <Text style={styles.bulletText}>{text}</Text>
        </View>
    );
}

function CollapsibleSection({
    title,
    open,
    onToggle,
    children,
}: {
    title: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
    return (
        <View style={styles.section}>
            <Pressable style={styles.collapsibleTrigger} onPress={onToggle}>
                <Text style={styles.collapsibleTitle}>{title}</Text>
                <Text style={styles.collapsibleChevron}>{open ? '▲' : '▼'}</Text>
            </Pressable>
            {open && (
                <View style={styles.transcriptBlock}>
                    <Text style={styles.readingText}>{children}</Text>
                </View>
            )}
        </View>
    );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surfaceApp },
    container: { padding: space[5], paddingBottom: space[10], gap: space[5] },
    centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6], backgroundColor: colors.surfaceApp },
    headerBlock: { gap: space[1] },
    residentName: { fontFamily: fontFamily.uiBold, fontSize: fontSize.lg, color: colors.textPrimary },
    metaLine: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.textTertiary },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
    submittedBy: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
    banner: { borderRadius: radius.md, padding: space[4], borderWidth: 1 },
    bannerError: { backgroundColor: colors.urgency.highBg, borderColor: colors.urgency.highBorder },
    bannerErrorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
    bannerInfo: { backgroundColor: colors.info.bg, borderColor: colors.info.border },
    bannerInfoText: { fontFamily: fontFamily.ui, color: colors.info.DEFAULT, fontSize: fontSize.sm },
    section: {
        backgroundColor: colors.surfaceCard,
        borderWidth: 1,
        borderColor: colors.borderDefault,
        borderRadius: radius.lg,
        padding: space[4],
        gap: space[2],
        ...shadow.xs,
    },
    sectionHeading: { fontFamily: fontFamily.uiBold, fontSize: fontSize.sm, color: colors.textPrimary, textTransform: 'uppercase' },
    readingText: { fontFamily: fontFamily.reading, fontSize: fontSize.base, color: colors.textPrimary, lineHeight: fontSize.base * 1.6 },
    bulletRow: { flexDirection: 'row', gap: space[2], alignItems: 'flex-start' },
    bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
    bulletText: { flex: 1, fontFamily: fontFamily.reading, fontSize: fontSize.base, color: colors.textPrimary, lineHeight: fontSize.base * 1.5 },
    collapsibleTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    collapsibleTitle: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary },
    collapsibleChevron: { fontSize: fontSize.xs, color: colors.textTertiary },
    transcriptBlock: { marginTop: space[2], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.borderSubtle },
    errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm, textAlign: 'center' },
    retryText: { fontFamily: fontFamily.uiSemiBold, color: colors.textLink, fontSize: fontSize.sm },
    deleteButton: {
        height: 48,
        borderWidth: 1,
        borderColor: colors.urgency.highBorder,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.urgency.high, fontSize: fontSize.base },
});
}