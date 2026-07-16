import React, { useState } from 'react';
import { Trash2, Download, ChevronDown, Pill, TriangleAlert, ListChecks, Smile, Clock3, FileText } from 'lucide-react';
import Modal from './Modal.jsx';
import { UrgencyBadge, HandoverStatusBadge } from './Badge.jsx';
import { formatDateTime } from '../lib/format.js';

export default function HandoverDetailModal({ note, residentName, canDelete, onClose, onDelete }) {
  const [showTranscript, setShowTranscript] = useState(false);
  if (!note) return null;
  const s = note.summary_json || {};

  function exportJson() {
    const blob = new Blob([JSON.stringify(note, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `handover-${note.id}.json`);
  }

  function exportText() {
    const lines = [
      `Handover Note #${note.id}`,
      `Resident: ${residentName || note.resident_id}`,
      `Created: ${formatDateTime(note.created_at)}`,
      `Urgency: ${note.urgency_flag || 'n/a'}`,
      '',
      'Summary:',
      s.summary || '—',
      '',
      'Key events:',
      ...(s.key_events || []).map((e) => `- ${e}`),
      '',
      'Medications given:',
      ...(s.medications_given || []).map((e) => `- ${e}`),
      '',
      'Incidents:',
      ...(s.incidents || []).map((e) => `- ${e}`),
      '',
      'Follow-up actions:',
      ...(s.follow_up_actions || []).map((e) => `- ${e}`),
      '',
      'Mood notes:',
      s.mood_notes || '—',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    downloadBlob(blob, `handover-${note.id}.txt`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={residentName || `Resident #${note.resident_id}`}
      subtitle={`Handover #${note.id} · Shift #${note.shift_id} · ${formatDateTime(note.created_at)}`}
      footer={
        <>
          {canDelete && (
            <button className="btn btn-danger" onClick={() => onDelete(note)} style={{ marginRight: 'auto' }}>
              <Trash2 size={15} /> Delete note
            </button>
          )}
          <div className="export-btn-row">
            <button className="btn btn-secondary btn-sm" onClick={exportText}>
              <Download size={14} /> .txt
            </button>
            <button className="btn btn-secondary btn-sm" onClick={exportJson}>
              <Download size={14} /> .json
            </button>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="handover-meta-row">
        {note.status === 'complete' ? <UrgencyBadge urgency={note.urgency_flag} /> : <HandoverStatusBadge status={note.status} />}
      </div>

      {note.status !== 'complete' && (
        <div className={note.status === 'failed' ? 'form-error-banner' : 'form-success-banner'}>
          {note.status === 'failed' ? <TriangleAlert /> : <Clock3 />}
          <span>
            {note.status === 'failed'
              ? note.error_message || 'This recording could not be processed.'
              : 'This note is still being transcribed and summarized. It will update automatically.'}
          </span>
        </div>
      )}

      {note.status === 'complete' && (
        <>
          <div className="handover-read-section">
            <h4>Summary</h4>
            <p className="handover-read-summary">{s.summary || 'No summary text was generated.'}</p>
          </div>

          {s.key_events?.length > 0 && (
            <div className="handover-read-section">
              <h4>Key events</h4>
              <div className="handover-read-list">
                {s.key_events.map((item, i) => (
                  <div className="handover-read-item" key={i}>
                    <span className="bullet-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.medications_given?.length > 0 && (
            <div className="handover-read-section">
              <h4>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pill size={12} /> Medications given
                </span>
              </h4>
              <div className="handover-read-list">
                {s.medications_given.map((item, i) => (
                  <div className="handover-read-item medication" key={i}>
                    <span className="bullet-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.incidents?.length > 0 && (
            <div className="handover-read-section">
              <h4>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--urgency-high)' }}>
                  <TriangleAlert size={12} /> Incidents
                </span>
              </h4>
              <div className="handover-read-list">
                {s.incidents.map((item, i) => (
                  <div className="handover-read-item incident" key={i}>
                    <span className="bullet-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.follow_up_actions?.length > 0 && (
            <div className="handover-read-section">
              <h4>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ListChecks size={12} /> Follow-up actions
                </span>
              </h4>
              <div className="handover-read-list">
                {s.follow_up_actions.map((item, i) => (
                  <div className="handover-read-item action" key={i}>
                    <span className="bullet-dot" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.mood_notes && (
            <div className="handover-read-section">
              <h4>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Smile size={12} /> Mood &amp; wellbeing
                </span>
              </h4>
              <p className="handover-read-summary">{s.mood_notes}</p>
            </div>
          )}

          {note.raw_transcript && (
            <div className="handover-read-section">
              <button
                className="collapsible-trigger"
                style={{ padding: 0 }}
                onClick={() => setShowTranscript((v) => !v)}
                aria-expanded={showTranscript}
              >
                <span className="collapsible-trigger-title">
                  <FileText size={14} /> Raw transcript
                </span>
                <ChevronDown className={`collapsible-chevron ${showTranscript ? 'open' : ''}`} />
              </button>
              {showTranscript && <div className="handover-transcript-block">{note.raw_transcript}</div>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
