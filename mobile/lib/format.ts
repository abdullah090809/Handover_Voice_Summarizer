export function formatDateTime(iso?: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatDate(iso?: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(iso?: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatRelative(iso?: string | null): string {
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

export function firstName(user?: { name?: string | null; email?: string | null } | null): string {
    if (!user) return '';
    if (user.name?.trim()) return user.name.trim().split(/\s+/)[0];
    return (user.email || '').split('@')[0];
}

// Stage M6c -- ported 1:1 from the web app's format.js. displayName/initials
// back the Profile tab's avatar + hero name; roleLabel/employmentStatusLabel/
// employmentTypeLabel back the role-conditional field panels lower on the
// same screen.
export function displayName(user?: { name?: string | null; email?: string | null } | null): string {
    if (!user) return '';
    return user.name?.trim() || user.email || '';
}

export function initials(text?: string | null): string {
    if (!text) return '?';
    const isEmail = text.includes('@');
    const namePart = isEmail ? text.split('@')[0].replace(/[._-]+/g, ' ').trim() : text.trim();
    const parts = namePart.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return namePart.slice(0, 2).toUpperCase();
}

export function roleLabel(role?: string | null): string {
    const map: Record<string, string> = { manager: 'Manager', care_worker: 'Care Staff', deactivated: 'Deactivated' };
    return (role && map[role]) || role || '';
}

export function employmentStatusLabel(s?: string | null): string {
    const map: Record<string, string> = { active: 'Active', on_leave: 'On leave', suspended: 'Suspended', left: 'Left' };
    return (s && map[s]) || s || '';
}

export function employmentTypeLabel(s?: string | null): string {
    const map: Record<string, string> = { full_time: 'Full-time', part_time: 'Part-time', bank: 'Bank', agency: 'Agency', volunteer: 'Volunteer' };
    return (s && map[s]) || s || '';
}

/** Converts a Date (or ISO string) to "YYYY-MM-DD", in local time. */
export function toDateInputValue(value: Date | string): string {
    const d = value instanceof Date ? value : new Date(value);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "1h 24m" / "45m" style duration from a millisecond span. */
export function formatDurationHM(ms: number): string {
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
}

/** "06:02:25" live-clock style elapsed time from a millisecond span. */
export function formatElapsedClock(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const pad = (n: number) => String(n).padStart(2, '0');
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Day-of-month number, e.g. "17". */
export function dayNumber(iso: string): string {
    return String(new Date(iso).getDate());
}

/** Three-letter weekday abbreviation, e.g. "FRI". */
export function weekdayAbbrev(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
}

// Handovers don't have their own `resident_code`-style column -- the numeric
// primary key IS the record's identity, "HO-####" is purely a display
// convention layered on top of it. padStart(4, '0') pads to a *minimum* of
// 4 characters -- ids of 10000+ still show in full ("HO-10000"), never
// truncated back down to 4 digits. Ported 1:1 from the web app's format.js
// so both clients render the same code for the same id.
export function formatHandoverCode(id: number | string | null | undefined): string {
    if (id === null || id === undefined) return '—';
    return `HO-${String(id).padStart(4, '0')}`;
}

export function urgencyLabel(u?: string | null): string {
    const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
    return (u && map[u]) || u || 'Unknown';
}

export function handoverStatusLabel(s?: string | null): string {
    const map: Record<string, string> = { pending: 'Queued', processing: 'Transcribing', complete: 'Complete', failed: 'Failed' };
    return (s && map[s]) || s || 'Unknown';
}

// Stage M6b -- ported 1:1 from the web app's format.js so the Residents tab
// shows the same three status labels as the desktop/web-mobile views.
export function residentStatusLabel(s?: string | null): string {
    const map: Record<string, string> = { active: 'Active', discharged: 'Discharged', deceased: 'Deceased' };
    return (s && map[s]) || s || 'Unknown';
}

/** Truncates text to n characters, appending an ellipsis if it was cut. */
export function truncate(text?: string | null, n = 140): string {
    if (!text) return '';
    return text.length > n ? text.slice(0, n).trim() + '…' : text;
}