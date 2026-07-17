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

export function displayName(user) {
  if (!user) return '';
  return user.name?.trim() || user.email;
}

export function firstName(user) {
  if (!user) return '';
  if (user.name?.trim()) return user.name.trim().split(/\s+/)[0];
  return user.email.split('@')[0];
}

export function initials(text) {
  if (!text) return '?';
  const isEmail = text.includes('@');
  const namePart = isEmail ? text.split('@')[0].replace(/[._-]+/g, ' ').trim() : text.trim();
  const parts = namePart.split(/\s+/).filter(Boolean);
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

/** Truncates text to n characters, appending an ellipsis if it was cut. */
export function truncate(text, n) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n).trim() + '…' : text;
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

/** Converts a Date (or ISO string) to a value usable in <input type="date">, in local time. */
export function toDateInputValue(value) {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "1h 24m" / "45m" style duration from a millisecond span. */
export function formatDurationHM(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** "06:02:25" live-clock style elapsed time from a millisecond span. */
export function formatElapsedClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Day-of-month number, e.g. "17". */
export function dayNumber(iso) {
  return String(new Date(iso).getDate());
}

/** Three-letter weekday abbreviation, e.g. "FRI". */
export function weekdayAbbrev(iso) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
}

/** "July 2026" style month + year label. */
export function monthYearLabel(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}