import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Upload, FileAudio, X, Search, ChevronDown, VolumeX, Volume2, Play, Pause } from 'lucide-react';
import Modal from './Modal.jsx';
import { Field } from './Field.jsx';
import { handoverApi, ApiError } from '../lib/api.js';
import { useToast } from '../lib/ToastContext.jsx';

const ACCEPTED_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/ogg'];

// Picks the shift to preselect: the ongoing one (no end_time) if there is
// one, otherwise the most recently started shift.
function pickDefaultShiftId(shifts) {
  if (!shifts || shifts.length === 0) return '';
  const ongoing = shifts.find((s) => !s.end_time);
  if (ongoing) return ongoing.id;
  const mostRecent = [...shifts].sort(
    (a, b) => new Date(b.start_time) - new Date(a.start_time)
  )[0];
  return mostRecent?.id ?? '';
}

function formatShiftLabel(s) {
  const dateStr = new Date(s.start_time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Shift #${s.id} · ${dateStr}${!s.end_time ? ' (ongoing)' : ''}`;
}

export default function NewHandoverModal({ residents, shifts, onClose, onSubmitted }) {
  const showToast = useToast();
  const [tab, setTab] = useState('record');
  const [residentId, setResidentId] = useState(residents[0]?.id ?? '');
  const [shiftId, setShiftId] = useState(() => pickDefaultShiftId(shifts));
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Re-derive the default shift if the shifts prop changes after mount
  // (e.g. modal opened before shifts finished loading).
  useEffect(() => {
    setShiftId((current) => {
      if (current && shifts.some((s) => s.id === current)) return current;
      return pickDefaultShiftId(shifts);
    });
  }, [shifts]);

  // --- Recording state --------------------------------------------------
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  // --- Input volume (mic gain) -------------------------------------------
  // Same idea as Discord's "Input Volume" slider: boosts the mic signal
  // before it's recorded. With AGC off (see startRecording), raw mic input
  // is noticeably quieter than what browsers normally hand you, so the
  // default and range are higher than a typical "trim" control -- this is
  // the only thing bringing the recording up to a usable level now.
  const [gain, setGain] = useState(2.5);
  const gainNodeRef = useRef(null);

  // --- Live waveform + low-volume detection ------------------------------
  // The analyser taps the signal after the gain node (same boosted level
  // that actually gets recorded) purely to read levels for the visualizer
  // and to detect "the mic can technically hear something, but it's too
  // quiet to transcribe reliably" so we can prompt the person to speak up
  // in real time, rather than them finding out after transcription comes
  // back empty.
  const [lowVolume, setLowVolume] = useState(false);
  const canvasRef = useRef(null);
  const meterFillRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const rafIdRef = useRef(null);
  const recordingStartedAtRef = useRef(null);
  const quietSinceRef = useRef(null);
  const emaLevelRef = useRef(0);
  const canvasSizeRef = useRef({ width: 0, height: 0 });
  const colorsRef = useRef({ active: '#178a7e', warn: '#a6690f', idle: '#8ea0b3' });

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    colorsRef.current = {
      active: styles.getPropertyValue('--teal-500').trim() || '#178a7e',
      warn: styles.getPropertyValue('--urgency-medium').trim() || '#a6690f',
      idle: styles.getPropertyValue('--text-tertiary').trim() || '#8ea0b3',
    };
  }, []);

  // Three states, not two: "silent" (nobody's talking right now — a normal
  // pause, don't nag) is deliberately distinct from "low" (there IS a voice
  // signal, it's just too quiet for Whisper to transcribe reliably — this
  // is the one we actually want to warn about). SILENCE_FLOOR separates
  // background-noise-or-nothing from an actual voice; LOW_VOICE_CEILING
  // separates a weak voice from one that's loud enough to transcribe well.
  // Recalibrated for AGC-off, manually-gained signal (see startRecording) --
  // raw mic input without AGC sits noticeably lower than AGC's normalized
  // output, so the old thresholds (tuned against AGC's output) read as
  // "quiet" almost all the time. These are a reasonable starting estimate;
  // if they still don't feel right for the mics you actually test with,
  // they're the values to nudge.
  const SILENCE_FLOOR = 0.012;
  const LOW_VOICE_CEILING = 0.06;
  const SUSTAIN_MS = 2200;
  const GRACE_MS = 1200;
  const METER_DISPLAY_MAX = 0.15;

  function drawWaveform() {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyser || !canvas || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const rawLevel = sum / dataArray.length / 255; // 0..1

    // Smooth the level used for state classification so a single loud/quiet
    // frame doesn't flip the warning on and off — the visual bars below
    // still use rawLevel per-frame so the animation itself stays snappy.
    emaLevelRef.current += 0.15 * (rawLevel - emaLevelRef.current);
    const level = emaLevelRef.current;

    let state = 'silent';
    if (level >= LOW_VOICE_CEILING) state = 'good';
    else if (level >= SILENCE_FLOOR) state = 'low';

    // Mini level meter on the Input Volume card — same state/color logic
    // as the ring around the record button, so the two never disagree.
    if (meterFillRef.current) {
      const pct = Math.min(100, (level / METER_DISPLAY_MAX) * 100);
      meterFillRef.current.style.width = `${pct}%`;
      meterFillRef.current.style.background =
        state === 'good' ? colorsRef.current.active : state === 'low' ? colorsRef.current.warn : colorsRef.current.idle;
    }

    const now = performance.now();
    const elapsed = now - (recordingStartedAtRef.current ?? now);

    if (elapsed > GRACE_MS) {
      if (state === 'low') {
        if (quietSinceRef.current == null) quietSinceRef.current = now;
        if (now - quietSinceRef.current > SUSTAIN_MS) setLowVolume(true);
      } else {
        quietSinceRef.current = null;
        setLowVolume(false);
      }
    }

    // Draw in logical (CSS) pixels — canvasSizeRef holds the un-scaled size
    // set at start time, while the 2D context itself was scaled once for
    // devicePixelRatio. Using canvas.width/height (physical pixels) here
    // directly would double-apply that scale and clip the drawing on any
    // high-DPI screen.
    const { width, height } = canvasSizeRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);

    const barColor =
      state === 'good' ? colorsRef.current.active : state === 'low' ? colorsRef.current.warn : colorsRef.current.idle;
    ctx.fillStyle = barColor;
    ctx.globalAlpha = state === 'silent' ? 0.35 : 1;

    const centerX = width / 2;
    const centerY = height / 2;
    const innerRadius = 56; // just outside the 84px record button + its glow ring
    const maxBarLength = 24; // kept short so spikes stay inside .record-ring-track's boundary
    const barCount = 48;
    const step = Math.max(1, Math.floor(dataArray.length / barCount));

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] / 255;
      const barLength = 4 + value * maxBarLength;
      const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
      const x1 = centerX + Math.cos(angle) * innerRadius;
      const y1 = centerY + Math.sin(angle) * innerRadius;
      const x2 = centerX + Math.cos(angle) * (innerRadius + barLength);
      const y2 = centerY + Math.sin(angle) * (innerRadius + barLength);

      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = barColor;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    rafIdRef.current = requestAnimationFrame(drawWaveform);
  }

  function teardownAnalyser() {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    audioContextRef.current?.close().catch(() => { });
    audioContextRef.current = null;
    analyserRef.current = null;
    gainNodeRef.current = null;
    quietSinceRef.current = null;
    recordingStartedAtRef.current = null;
    emaLevelRef.current = 0;
    setLowVolume(false);
  }

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      teardownAnalyser();
    };
  }, []);

  // Canvas only exists in the DOM once `recording` is true, so size it and
  // kick off the draw loop here rather than inside startRecording (which
  // runs before React has re-rendered with the canvas mounted).
  useEffect(() => {
    if (recording && analyserRef.current && canvasRef.current) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvasRef.current.getBoundingClientRect();
      canvasSizeRef.current = { width: rect.width, height: rect.height };
      canvasRef.current.width = rect.width * dpr;
      canvasRef.current.height = rect.height * dpr;
      canvasRef.current.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      rafIdRef.current = requestAnimationFrame(drawWaveform);
    }
  }, [recording]);

  async function startRecording() {
    setError('');
    try {
      // AGC normalizes speech to close to its own target loudness before
      // our gain node ever sees the signal -- which is exactly why the
      // slider felt like it barely did anything. Turning it off hands full
      // control to the slider below; the low-volume thresholds above and
      // the limiter further down are calibrated for this raw signal.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Build the processing graph BEFORE creating the MediaRecorder, since
      // the recorder now captures from the processed destination stream
      // instead of the raw mic stream:
      //   source -> gainNode (the "input volume" slider) -> compressor
      //          (only steps in near clipping, so it doesn't erase the
      //          audible difference the slider is supposed to make)
      //          -> destination (what gets recorded)
      //   gainNode also feeds the analyser, so the waveform/low-volume
      //   detector reacts to the boosted signal, same as what gets recorded.
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = gain;
      const compressor = audioContext.createDynamicsCompressor();
      // This used to be a general compressor (-6dB threshold, 4:1 ratio),
      // which is exactly why the slider felt like it barely did anything --
      // AGC already brings speech up close to a normal level, so any extra
      // gain crossed -6dB almost immediately and got squashed back down
      // before it was audible. What's actually needed here is a peak
      // limiter: stay completely out of the way, only clamp right at the
      // edge of clipping. Now the gain increase is genuinely audible all
      // the way up, and only the last sliver near 0dB gets caught.
      compressor.threshold.setValueAtTime(-1, audioContext.currentTime);
      compressor.knee.setValueAtTime(0, audioContext.currentTime);
      compressor.ratio.setValueAtTime(20, audioContext.currentTime);
      compressor.attack.setValueAtTime(0.001, audioContext.currentTime);
      compressor.release.setValueAtTime(0.1, audioContext.currentTime);
      const destination = audioContext.createMediaStreamDestination();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      source.connect(gainNode);
      gainNode.connect(compressor);
      compressor.connect(destination);
      gainNode.connect(analyser);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);

      audioContextRef.current = audioContext;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      recordingStartedAtRef.current = performance.now();
      quietSinceRef.current = null;
    } catch (e) {
      setError('Microphone access was denied or is unavailable. Try uploading a file instead.');
    }
  }

  // Lets the slider adjust gain live while recording (same as dragging
  // Discord's Input Volume mid-call). setTargetAtTime ramps the change over
  // ~10ms instead of snapping instantly, which avoids an audible click.
  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(gain, audioContextRef.current.currentTime, 0.01);
    }
  }, [gain]);

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
    teardownAnalyser();
  }

  function onFileSelected(f) {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type) && f.type !== '') {
      setError('Please choose a .wav, .mp3, .m4a, .webm, or .ogg audio file.');
      return;
    }
    setError('');
    setFile(f);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    const audio = tab === 'record' ? recordedBlob : file;
    if (!residentId || !shiftId) return setError('Choose a resident and a shift.');
    if (!audio) return setError(tab === 'record' ? 'Record an audio note first.' : 'Choose an audio file first.');

    setSubmitting(true);
    try {
      const filename = tab === 'record' ? `handover-${Date.now()}.webm` : file.name;
      await handoverApi.submit(shiftId, residentId, audio, filename);
      showToast('Handover submitted — transcribing now.', 'success');
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the handover.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = residentId && shiftId && (tab === 'record' ? recordedBlob : file) && !submitting;

  return (
    <Modal
      open
      onClose={onClose}
      title="New handover note"
      subtitle="Record or upload audio — it's transcribed and summarized automatically."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={!canSubmit}>
            {submitting ? <span className="spinner" /> : 'Submit handover'}
          </button>
        </>
      }
    >
      <Field label="Resident" htmlFor="ho-resident">
        <ResidentCombobox
          residents={residents}
          value={residentId}
          onChange={setResidentId}
        />
      </Field>

      <Field label="Shift" htmlFor="ho-shift" hint="Only shifts assigned to you appear here">
        <ShiftDropdown
          shifts={shifts}
          value={shiftId}
          onChange={setShiftId}
        />
      </Field>

      <div className="field">
        <span className="field-label">Audio source</span>
        <div className="record-tabs">
          <button type="button" className={`record-tab-btn ${tab === 'record' ? 'active' : ''}`} onClick={() => setTab('record')}>
            <Mic size={15} /> Record
          </button>
          <button type="button" className={`record-tab-btn ${tab === 'upload' ? 'active' : ''}`} onClick={() => setTab('upload')}>
            <Upload size={15} /> Upload file
          </button>
        </div>
      </div>

      {tab === 'record' ? (
        <div className="record-panel">
          <div className="gain-control">
            <div className="gain-control-row">
              <Volume2 size={15} className="gain-control-icon" />
              <span className="gain-control-title">Input volume</span>
              <span className="gain-control-badge">{Math.round(gain * 100)}%</span>
            </div>
            <input
              id="mic-gain"
              type="range"
              min="0.5"
              max="6"
              step="0.1"
              value={gain}
              onChange={(e) => setGain(parseFloat(e.target.value))}
              className="gain-control-slider"
              aria-label="Microphone input volume"
            />
            <div className="gain-control-scale">
              <span>Quiet</span>
              <span>Loud</span>
            </div>
            {recording && (
              <div className="gain-control-meter" role="meter" aria-label="Live microphone level">
                <div className="gain-control-meter-fill" ref={meterFillRef} />
              </div>
            )}
          </div>

          <div className="record-panel-divider" />

          <div className="record-circle-wrap">
            <div className="record-ring-track" />
            {recording && <canvas ref={canvasRef} className="record-waveform-ring" />}
            <button
              type="button"
              className={`record-circle ${recording ? 'recording' : ''}`}
              onClick={recording ? stopRecording : startRecording}
              aria-label={recording ? 'Stop recording' : 'Start recording'}
            >
              {recording ? <Square size={26} /> : <Mic size={30} />}
            </button>
          </div>

          <div className="record-timer">{formatSeconds(seconds)}</div>
          <div className="record-status-text">
            {recording ? 'Recording… tap to stop' : recordedBlob ? 'Recording captured — ready to submit' : 'Tap to start recording'}
          </div>

          {recording && (
            <div className="record-status-slot">
              <div className={`volume-warning ${lowVolume ? 'visible' : ''}`} role="alert">
                <VolumeX size={16} />
                <span>Can't hear you clearly — try speaking louder or moving closer to the mic.</span>
              </div>
            </div>
          )}

          {recordedBlob && !recording && <RecordedAudioPlayer blob={recordedBlob} />}
        </div>
      ) : (
        <FileDropzone file={file} dragOver={dragOver} setDragOver={setDragOver} onFileSelected={onFileSelected} onClear={() => setFile(null)} />
      )}

      {error && <div className="form-error-banner">{error}</div>}
    </Modal>
  );
}

// Themed shift dropdown — no search (shifts list is short), just a custom
// popover list so it matches the dark UI instead of falling back to the
// browser's native <select> popup styling.
function ShiftDropdown({ shifts, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const wrapperRef = useRef(null);

  const selected = shifts.find((s) => s.id === value) ?? null;

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (open) {
      const idx = shifts.findIndex((s) => s.id === value);
      setHighlightIndex(idx >= 0 ? idx : 0);
    }
  }, [open, shifts, value]);

  function select(s) {
    onChange(s.id);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, shifts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = shifts[highlightIndex];
      if (pick) select(pick);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  if (shifts.length === 0) {
    return <div className="select-empty">No shifts found</div>;
  }

  return (
    <div className="combobox" ref={wrapperRef}>
      <button
        type="button"
        id="ho-shift"
        className="select combobox-closed-btn"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span>{selected ? formatShiftLabel(selected) : 'Select a shift'}</span>
        <ChevronDown size={15} className="combobox-caret" />
      </button>

      {open && (
        <ul className="combobox-list" role="listbox">
          {shifts.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={s.id === value}
              className={`combobox-option ${i === highlightIndex ? 'highlighted' : ''} ${s.id === value ? 'selected' : ''}`}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
            >
              <span>{formatShiftLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Searchable resident picker. Closed state renders as a plain button styled
// like the other .select fields; clicking it swaps in a focused search
// input with a filtered dropdown (matches by name or numeric ID).
function ResidentCombobox({ residents, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const selected = residents.find((r) => r.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter((r) => {
      const nameMatch = r.name?.toLowerCase().includes(q);
      const idMatch = String(r.id).includes(q);
      return nameMatch || idMatch;
    });
  }, [residents, query]);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query, open]);

  function openDropdown() {
    setOpen(true);
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function selectResident(r) {
    onChange(r.id);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[highlightIndex];
      if (pick) selectResident(pick);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  if (residents.length === 0) {
    return <div className="select-empty">No active residents</div>;
  }

  return (
    <div className="combobox" ref={wrapperRef}>
      {open ? (
        <div className="combobox-control open">
          <Search size={15} className="combobox-icon" />
          <input
            ref={inputRef}
            id="ho-resident"
            className="combobox-input"
            type="text"
            placeholder="Search by name or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
          />
        </div>
      ) : (
        <button type="button" id="ho-resident" className="select combobox-closed-btn" onClick={openDropdown}>
          <span>{selected ? selected.name : 'Select a resident'}</span>
          <ChevronDown size={15} className="combobox-caret" />
        </button>
      )}

      {open && (
        <ul className="combobox-list" role="listbox">
          {filtered.length === 0 && <li className="combobox-empty">No residents match “{query}”</li>}
          {filtered.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={r.id === value}
              className={`combobox-option ${i === highlightIndex ? 'highlighted' : ''} ${r.id === value ? 'selected' : ''}`}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectResident(r);
              }}
            >
              <span>{r.name}</span>
              <span className="combobox-option-id">#{r.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileDropzone({ file, dragOver, setDragOver, onFileSelected, onClear }) {
  const inputRef = useRef(null);

  if (file) {
    return (
      <div className="dropzone" style={{ cursor: 'default' }}>
        <FileAudio />
        <strong>{file.name}</strong>
        <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear}>
          <X size={14} /> Remove
        </button>
      </div>
    );
  }

  return (
    <div
      className={`dropzone ${dragOver ? 'dragover' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onFileSelected(e.dataTransfer.files?.[0]);
      }}
      role="button"
      tabIndex={0}
    >
      <Upload />
      <strong>Drag an audio file here, or click to browse</strong>
      <span>.wav, .mp3, .m4a, .webm, .ogg — up to 25MB</span>
      <input
        ref={inputRef}
        type="file"
        accept=".wav,.mp3,.m4a,.webm,.ogg,audio/*"
        style={{ display: 'none' }}
        onChange={(e) => onFileSelected(e.target.files?.[0])}
      />
    </div>
  );
}

// Custom playback bar for the captured recording — the native <audio
// controls> widget renders as an unstyleable browser-chrome element (light
// background, default font) that looks out of place against the app's dark
// theme, so this drives a hidden <audio> element instead and renders our
// own play/pause + progress track to match.
function RecordedAudioPlayer({ blob }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const url = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
  }, [url]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function seek(e) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = fraction * duration;
  }

  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <button type="button" className="audio-player-toggle" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <Pause size={15} /> : <Play size={15} style={{ marginLeft: 1 }} />}
      </button>
      <div className="audio-player-track" onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={currentTime}>
        <div className="audio-player-progress" style={{ width: `${progressPct}%` }} />
      </div>
      <span className="audio-player-time">
        {formatSeconds(Math.floor(currentTime))} / {formatSeconds(Math.floor(duration || 0))}
      </span>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        style={{ display: 'none' }}
      />
    </div>
  );
}

function formatSeconds(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}