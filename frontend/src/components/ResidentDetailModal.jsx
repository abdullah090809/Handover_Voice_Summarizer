import React, { useEffect, useState } from 'react';
import { Trash2, Clock3, TriangleAlert, CheckCircle2, FileAudio } from 'lucide-react';
import Modal from './Modal.jsx';
import { ResidentStatusBadge } from './Badge.jsx';
import { handoverApi, ApiError } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { EmptyState } from './States.jsx';

export default function ResidentDetailModal({ resident, isManager, onClose, onChangeStatus, onEdit, onDelete, onOpenNote }) {
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    handoverApi
      .list({ residentId: resident.id, limit: 30 })
      .then((data) => !cancelled && setNotes(data))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load history.'));
    return () => {
      cancelled = true;
    };
  }, [resident.id]);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={resident.name}
      subtitle={`Resident #${resident.id}`}
      footer={
        isManager && (
          <>
            <button className="btn btn-danger" onClick={() => onDelete(resident)} style={{ marginRight: 'auto' }}>
              <Trash2 size={15} /> Remove resident
            </button>
            <button className="btn btn-secondary" onClick={() => onEdit(resident)}>
              Rename
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </>
        )
      }
    >
      <div className="handover-meta-row" style={{ alignItems: 'center' }}>
        <ResidentStatusBadge status={resident.status} />
        {isManager && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
            {resident.status !== 'active' && (
              <button className="btn btn-secondary btn-sm" onClick={() => onChangeStatus(resident, 'active')}>
                Mark active
              </button>
            )}
            {resident.status !== 'discharged' && (
              <button className="btn btn-secondary btn-sm" onClick={() => onChangeStatus(resident, 'discharged')}>
                Mark discharged
              </button>
            )}
            {resident.status !== 'deceased' && (
              <button className="btn btn-danger btn-sm" onClick={() => onChangeStatus(resident, 'deceased')}>
                Mark deceased
              </button>
            )}
          </div>
        )}
      </div>

      <div className="detail-section">
        <div className="detail-section-title">Handover history</div>
        {notes === null && !error && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-6)' }}>
            <span className="spinner spinner-dark" style={{ width: 22, height: 22, borderWidth: 3 }} />
          </div>
        )}
        {error && <p style={{ color: 'var(--urgency-high)', fontSize: 'var(--text-sm)' }}>{error}</p>}
        {notes && notes.length === 0 && <EmptyState icon={FileAudio} title="No handovers yet" message="Handover notes for this resident will appear here." />}
        {notes && notes.length > 0 && (
          <div className="timeline">
            {notes.map((n) => (
              <div className="timeline-item" key={n.id}>
                <div className={`timeline-dot ${n.status === 'complete' ? `urgency-${n.urgency_flag || 'low'}` : ''}`}>
                  {n.status === 'complete' ? <CheckCircle2 size={14} /> : n.status === 'failed' ? <TriangleAlert size={14} /> : <Clock3 size={14} />}
                </div>
                <div className="timeline-content" onClick={() => onOpenNote(n)} role="button" tabIndex={0}>
                  <div className="timeline-content-top">
                    <span className="timeline-time">{formatDateTime(n.created_at)}</span>
                  </div>
                  <p className="timeline-excerpt">
                    {n.status === 'complete' ? n.summary_json?.summary || 'No summary text.' : n.status === 'failed' ? n.error_message || 'Processing failed.' : 'Transcribing…'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
