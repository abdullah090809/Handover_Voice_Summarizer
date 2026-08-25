import { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  FlatList,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

import { residentApi, shiftApi, handoverApi, ApiError } from '@/lib/api';
import { fontFamily, fontSize, space, radius, shadow, type BrandColors } from '@/constants/design-tokens';
import { useThemeColors } from '@/lib/theme-context';

// Stage M4.5 -- restyled with the shared design tokens. Resident rows/chips
// mirror the web app's .list-row + .badge patterns; the record panel's
// recording/idle states use urgency-high (recording) and teal (idle)
// consistent with how the rest of the app reserves teal for primary
// actions and urgency-high for anything actively "hot."

// Stage M5 -- audio capture + upload, ported from the web app's
// NewHandoverModal.jsx. Deliberately NOT ported: the live waveform
// visualizer, the mic-gain slider, and the drag-and-drop file-upload tab --
// those are called out in the mobile progress notes as web-specific
// niceties. This screen is record -> preview -> submit only. A "pick an
// existing audio file" tab can be added later with expo-document-picker if
// it's actually wanted; skipping it here to keep M5 scoped to the core
// recording flow.

type Resident = { id: number | string; name: string; resident_code?: string | null };
type Shift = { id: number | string; start_time: string; end_time: string | null };

// Mirrors getRelevantShift() in the web app exactly: a handover only ever
// attaches to the shift the worker is actually on right now -- the ongoing
// shift if clocked in, otherwise whichever completed shift ended most
// recently. There's no "pick from a list of past shifts" here by design.
function getRelevantShift(shifts: Shift[]): Shift | null {
  if (!shifts || shifts.length === 0) return null;
  const ongoing = shifts.find((s) => !s.end_time);
  if (ongoing) return ongoing;
  const completed = shifts.filter((s) => s.end_time);
  if (completed.length === 0) return null;
  return completed.reduce((latest, s) =>
    new Date(s.end_time as string) > new Date(latest.end_time as string) ? s : latest
  );
}

function formatSeconds(totalMs: number): string {
  const total = Math.floor(totalMs / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function NewHandoverScreen() {
    const colors = useThemeColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();

  const [residents, setResidents] = useState<Resident[] | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [residentQuery, setResidentQuery] = useState('');
  const [residentId, setResidentId] = useState<number | string | ''>('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const relevantShift = useMemo(() => getRelevantShift(shifts), [shifts]);

  // --- Recording ---------------------------------------------------------
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder, 200);
  const [hasRecording, setHasRecording] = useState(false);
  const player = useAudioPlayer(hasRecording ? audioRecorder.uri : null);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setLoadError('Microphone access was denied. Enable it in your phone Settings to record a handover.');
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [residentData, shiftData] = await Promise.all([
        residentApi.list(false),
        shiftApi.list(),
      ]);
      setResidents(residentData || []);
      setShifts(shiftData || []);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load residents and shifts.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startRecording() {
    setSubmitError('');
    setHasRecording(false);
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  }

  async function stopRecording() {
    await audioRecorder.stop();
    setHasRecording(true);
  }

  function togglePlayback() {
    if (player.playing) {
      player.pause();
    } else {
      player.seekTo(0);
      player.play();
    }
  }

  function discardRecording() {
    player.pause();
    setHasRecording(false);
  }

  const filteredResidents = (residents || []).filter((r) =>
    r.name.toLowerCase().includes(residentQuery.trim().toLowerCase())
  );
  const selectedResident = (residents || []).find((r) => r.id === residentId) || null;

  const canSubmit = !!residentId && !!relevantShift && hasRecording && !submitting;

  async function onSubmit() {
    if (!residentId) return setSubmitError('Choose a resident.');
    if (!relevantShift) return setSubmitError('No shift on record — clock in before recording a handover.');
    if (!hasRecording || !audioRecorder.uri) return setSubmitError('Record an audio note first.');

    setSubmitting(true);
    setSubmitError('');
    try {
      await handoverApi.submit(relevantShift.id, residentId, {
        uri: audioRecorder.uri,
        name: `handover-${Date.now()}.m4a`,
        // Hardcoded on purpose -- see the note in lib/api.ts submit().
        type: 'audio/m4a',
      });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Could not submit the handover.');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <View style={styles.centerFill}>
        <Stack.Screen options={{ title: 'New Handover' }} />
        <View style={styles.successIconRing}>
          <View style={styles.successIconCircle}>
            <Feather name="check" size={40} color={colors.white} />
          </View>
        </View>
        <Text style={styles.successTitle}>Handover submitted</Text>
        <Text style={styles.successBody}>
          {selectedResident ? `${selectedResident.name}'s handover is being transcribed and summarized now.` : "It's being transcribed and summarized now."}
        </Text>
        <View style={styles.successNote}>
          <Feather name="clock" size={14} color={colors.textTertiary} />
          <Text style={styles.successNoteText}>You'll see it appear on Handovers shortly.</Text>
        </View>
        <Pressable style={styles.successButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'New Handover' }} />
      <Text style={styles.subtitle}>Record an audio note — it&apos;s transcribed and summarized automatically.</Text>

      {loadError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Resident</Text>
        {selectedResident ? (
          <Pressable style={styles.selectedResident} onPress={() => setResidentId('')}>
            <Text style={styles.selectedResidentText}>{selectedResident.name}</Text>
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Search residents…"
              placeholderTextColor={colors.textTertiary}
              value={residentQuery}
              onChangeText={setResidentQuery}
            />
            {residents === null ? (
              <ActivityIndicator style={styles.residentListLoading} />
            ) : (
              <FlatList
                data={filteredResidents}
                keyExtractor={(r) => String(r.id)}
                style={styles.residentList}
                scrollEnabled={false}
                ListEmptyComponent={<Text style={styles.emptyText}>No residents match.</Text>}
                renderItem={({ item }) => (
                  <Pressable style={styles.residentRow} onPress={() => setResidentId(item.id)}>
                    <Text style={styles.residentRowText}>{item.name}</Text>
                    <Text style={styles.residentRowCode}>{item.resident_code || `#${item.id}`}</Text>
                  </Pressable>
                )}
              />
            )}
          </>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Shift</Text>
        {relevantShift ? (
          <Text style={styles.fieldHint}>
            {relevantShift.end_time
              ? "You're clocked out — this logs against the shift you just finished."
              : "You're clocked in — this logs against your current shift."}
          </Text>
        ) : (
          <Text style={styles.fieldHintWarn}>No shift on record — clock in first.</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Recording</Text>
        <View style={styles.recordPanel}>
          {recorderState.isRecording ? (
            <>
              <Text style={styles.recordTimer}>{formatSeconds(recorderState.durationMillis)}</Text>
              <Pressable style={styles.stopButton} onPress={stopRecording}>
                <Text style={styles.stopButtonText}>Stop recording</Text>
              </Pressable>
            </>
          ) : hasRecording ? (
            <>
              <Text style={styles.recordedLabel}>Recording captured</Text>
              <View style={styles.playbackRow}>
                <Pressable style={styles.playButton} onPress={togglePlayback}>
                  <Text style={styles.playButtonText}>{player.playing ? 'Pause' : 'Play'}</Text>
                </Pressable>
                <Pressable style={styles.discardButton} onPress={discardRecording}>
                  <Text style={styles.discardButtonText}>Re-record</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable style={styles.recordButton} onPress={startRecording}>
              <Text style={styles.recordButtonText}>Start recording</Text>
            </Pressable>
          )}
        </View>
      </View>

      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

      <Pressable
        style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={!canSubmit}
      >
        {submitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Submit handover</Text>}
      </Pressable>

      <Pressable style={styles.cancelButton} onPress={() => router.back()}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors: BrandColors) {
    return StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surfaceApp },
  container: { padding: space[5], paddingBottom: space[10], gap: space[5], backgroundColor: colors.surfaceApp },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[6], backgroundColor: colors.surfaceApp },
  subtitle: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
  // Success state (post-submit). Was a bare title + one line of grey body
  // text + a small unstyled Done link floating in the middle of the
  // screen -- nothing to anchor the eye, no sense of "this succeeded"
  // beyond the word itself. A checkmark badge gives it the same
  // confirmation-moment weight a submit action like this deserves, the
  // extra "you'll see it on Handovers" line answers the obvious "ok, now
  // what" question, and Done is now a real full-width primary button
  // (styles.successButton, same shape as the record flow's own primary
  // button) instead of a small centered link that was easy to miss.
  successIconRing: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.urgency.lowBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[2],
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    backgroundColor: colors.urgency.low,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, color: colors.textPrimary },
  successBody: { fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textSecondary, textAlign: 'center', lineHeight: fontSize.base * 1.4, paddingHorizontal: space[4] },
  successNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.full,
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    marginTop: space[2],
  },
  successNoteText: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textTertiary },
  successButton: {
    height: 48,
    width: '100%',
    backgroundColor: colors.teal[600],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[6],
  },
  field: { gap: space[2] },
  fieldLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textPrimary, textTransform: 'uppercase' },
  fieldHint: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.textSecondary },
  fieldHintWarn: { fontFamily: fontFamily.ui, fontSize: fontSize.sm, color: colors.urgency.high },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    fontFamily: fontFamily.ui,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
  },
  residentListLoading: { marginTop: space[2] },
  residentList: { maxHeight: 260, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radius.md, marginTop: space[1] },
  residentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  residentRowText: { fontFamily: fontFamily.ui, fontSize: fontSize.base, color: colors.textPrimary },
  residentRowCode: { fontFamily: fontFamily.mono, fontSize: fontSize.xs, color: colors.textTertiary },
  emptyText: { fontFamily: fontFamily.ui, padding: space[3], color: colors.textSecondary, fontSize: fontSize.sm },
  selectedResident: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    padding: space[3],
    backgroundColor: colors.surfaceSunken,
  },
  selectedResidentText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.textPrimary },
  changeText: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.sm, color: colors.textLink },
  recordPanel: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    padding: space[6],
    alignItems: 'center',
    gap: space[3],
    ...shadow.xs,
  },
  // Mirrors .btn-danger-solid for "actively recording" and a dark neutral
  // for "stop", matching how the web app reserves urgency-high for
  // anything actively hot / needing attention right now.
  recordButton: { backgroundColor: colors.urgency.high, borderRadius: radius.full, paddingVertical: space[4], paddingHorizontal: space[8] },
  recordButtonText: { fontFamily: fontFamily.uiBold, color: colors.white, fontSize: fontSize.base },
  stopButton: { backgroundColor: colors.ink[900], borderRadius: radius.full, paddingVertical: space[4], paddingHorizontal: space[8] },
  stopButtonText: { fontFamily: fontFamily.uiBold, color: colors.white, fontSize: fontSize.base },
  recordTimer: { fontFamily: fontFamily.uiBold, fontSize: fontSize.xl, color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  recordedLabel: { fontFamily: fontFamily.uiSemiBold, fontSize: fontSize.base, color: colors.urgency.low },
  playbackRow: { flexDirection: 'row', gap: space[3] },
  playButton: { backgroundColor: colors.teal[600], borderRadius: radius.md, paddingVertical: space[3], paddingHorizontal: space[5] },
  playButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.white, fontSize: fontSize.base },
  discardButton: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingVertical: space[3], paddingHorizontal: space[5] },
  discardButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.textPrimary, fontSize: fontSize.base },
  errorBox: {
    backgroundColor: colors.urgency.highBg,
    borderWidth: 1,
    borderColor: colors.urgency.highBorder,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[2],
  },
  errorText: { fontFamily: fontFamily.ui, color: colors.urgency.high, fontSize: fontSize.sm },
  retryText: { fontFamily: fontFamily.uiSemiBold, color: colors.textLink, fontSize: fontSize.sm },
  primaryButton: { height: 48, backgroundColor: colors.teal[600], borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.white, fontSize: fontSize.base },
  buttonDisabled: { opacity: 0.5 },
  cancelButton: { alignItems: 'center', paddingVertical: space[2] },
  cancelButtonText: { fontFamily: fontFamily.uiSemiBold, color: colors.textSecondary, fontSize: fontSize.base },
});
}