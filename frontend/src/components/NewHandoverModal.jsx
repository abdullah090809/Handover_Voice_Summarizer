import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Square, Upload, FileAudio, X, Search, ChevronDown } from 'lucide-react';
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

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
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
    } catch (e) {
      setError('Microphone access was denied or is unavailable. Try uploading a file instead.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    clearInterval(timerRef.current);
    setRecording(false);
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
          <button
            type="button"
            className={`record-circle ${recording ? 'recording' : ''}`}
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            {recording ? <Square size={26} /> : <Mic size={30} />}
          </button>
          <div className="record-timer">{formatSeconds(seconds)}</div>
          <div className="record-status-text">
            {recording ? 'Recording… tap to stop' : recordedBlob ? 'Recording captured — ready to submit' : 'Tap to start recording'}
          </div>
          {recordedBlob && !recording && (
            <audio controls src={URL.createObjectURL(recordedBlob)} style={{ width: '100%' }} />
          )}
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

function formatSeconds(total) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}