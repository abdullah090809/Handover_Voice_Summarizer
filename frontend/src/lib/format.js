export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function initials(text) {
  if (!text) return '?';
  const namePart = text.split('@')[0].replace(/[._-]+/g, ' ').trim();
  const parts = namePart.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return namePart.slice(0, 2).toUpperCase();
}

export function roleLabel(role) {
  const map = { manager: 'Manager', care_worker: 'Care Staff', deactivated: 'Deactivated' };
  return map[role] || role;
}

export function urgencyLabel(u) {
  const map = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
  return map[u] || u || 'Unknown';
}

export function residentStatusLabel(s) {
  const map = { active: 'Active', discharged: 'Discharged', deceased: 'Deceased' };
  return map[s] || s;
}

export function handoverStatusLabel(s) {
  const map = { pending: 'Queued', processing: 'Transcribing', complete: 'Complete', failed: 'Failed' };
  return map[s] || s;
}

/** Converts a datetime-local input value to an ISO string, or null. */
export function localToIso(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

/** Converts an ISO string to a value usable in <input type="datetime-local">. */
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
