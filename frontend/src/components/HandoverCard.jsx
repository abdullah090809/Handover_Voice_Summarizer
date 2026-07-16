import React from 'react';
import { Trash2, Clock3, Loader2, TriangleAlert } from 'lucide-react';
import { UrgencyBadge, HandoverStatusBadge } from './Badge.jsx';
import { formatRelative } from '../lib/format.js';

export default function HandoverCard({ note, residentName, canDelete, onOpen, onDelete }) {
  const urgency = note.urgency_flag || 'low';
  const isPending = note.status === 'pending' || note.status === 'processing';
  const isFailed = note.status === 'failed';

  return (
    <div
      className={`card card-clickable card-urgency urgency-${urgency} entity-card`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(note)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(note)}
    >
      <div className="entity-card-top">
        <div className="entity-card-heading">
          <div>
            <div className="entity-card-title">{residentName || `Resident #${note.resident_id}`}</div>
            <div className="entity-card-subtitle">Note #{note.id} &middot; Shift #{note.shift_id}</div>
          </div>
        </div>
        {isPending ? <HandoverStatusBadge status={note.status} /> : isFailed ? <HandoverStatusBadge status="failed" /> : <UrgencyBadge urgency={urgency} />}
      </div>

      <div className="entity-card-body">
        {note.status === 'complete' && note.summary_json?.summary ? (
          <p style={{ fontFamily: 'var(--font-reading)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {truncate(note.summary_json.summary, 140)}
          </p>
        ) : isPending ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-tertiary)' }}>
            <Loader2 size={14} className="spin-icon" /> Transcribing audio…
          </span>
        ) : isFailed ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--urgency-high)' }}>
            <TriangleAlert size={14} /> {note.error_message || 'Processing failed'}
          </span>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>No summary available.</span>
        )}
      </div>

      <div className="entity-card-footer">
        <span className="meta-chip">
          <Clock3 /> {formatRelative(note.created_at)}
        </span>
        {canDelete && (
          <button
            className="icon-btn"
            aria-label="Delete handover note"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note);
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function truncate(text, n) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n).trim() + '…' : text;
}
