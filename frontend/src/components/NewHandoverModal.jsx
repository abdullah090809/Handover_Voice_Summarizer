import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, FileAudio, X } from 'lucide-react';
import Modal from './Modal.jsx';
import { Field } from './Field.jsx';
import { handoverApi, ApiError } from '../lib/api.js';
import { useToast } from '../lib/ToastContext.jsx';

const ACCEPTED_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/x-m4a', 'audio/webm', 'audio/ogg'];

export default function NewHandoverModal({ residents, shifts, onClose, onSubmitted }) {
  const showToast = useToast();
  const [tab, setTab] = useState('record');
  const [residentId, setResidentId] = useState(residents[0]?.id ?? '');
  const [shiftId, setShiftId] = useState(shifts[0]?.id ?? '');
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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
        <select id="ho-resident" className="select" value={residentId} onChange={(e) => setResidentId(Number(e.target.value))}>
          {residents.length === 0 && <option value="">No active residents</option>}
          {residents.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Shift" htmlFor="ho-shift" hint="Only shifts assigned to you appear here">
        <select id="ho-shift" className="select" value={shiftId} onChange={(e) => setShiftId(Number(e.target.value))}>
          {shifts.length === 0 && <option value="">No shifts found</option>}
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              Shift #{s.id} &middot; {new Date(s.start_time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              {!s.end_time ? ' (ongoing)' : ''}
            </option>
          ))}
        </select>
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
