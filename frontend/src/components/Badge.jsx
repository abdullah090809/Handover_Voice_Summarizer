import React from 'react';
import { urgencyLabel, residentStatusLabel, roleLabel, handoverStatusLabel } from '../lib/format.js';

export function UrgencyBadge({ urgency }) {
  const cls = urgency === 'high' || urgency === 'urgent' ? 'badge-high' : urgency === 'medium' ? 'badge-medium' : 'badge-low';
  return (
    <span className={`badge ${cls}`}>
      <span className="badge-dot" />
      {urgencyLabel(urgency)}
    </span>
  );
}

export function ResidentStatusBadge({ status }) {
  const cls = status === 'active' ? 'badge-active' : status === 'discharged' ? 'badge-discharged' : 'badge-deceased';
  return <span className={`badge ${cls}`}>{residentStatusLabel(status)}</span>;
}

export function RoleBadge({ role }) {
  const cls = role === 'manager' ? 'badge-manager' : role === 'deactivated' ? 'badge-deactivated' : 'badge-worker';
  return <span className={`badge ${cls}`}>{roleLabel(role)}</span>;
}

export function HandoverStatusBadge({ status }) {
  const cls = status === 'complete' ? 'badge-active' : status === 'failed' ? 'badge-high' : 'badge-info';
  return <span className={`badge ${cls}`}>{handoverStatusLabel(status)}</span>;
}
