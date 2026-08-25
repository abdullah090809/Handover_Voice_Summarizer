// Stage M6f -- ported 1:1 from the web app's src/lib/auditDescriptions.js.
// Translates a raw audit log entry (HTTP method + path) into a plain-English
// description a non-technical manager can understand at a glance, plus a
// coarse category used for badge/icon coloring on the Audit Log screen. The
// raw method/path is still shown alongside it (see audit.tsx) for anyone who
// wants the technical detail -- this is additive, not a replacement of the
// underlying record.
//
// Kept as its own lib file (not inlined in audit.tsx) for the same reason
// format.ts is its own file: this rule table has no UI in it and is easiest
// to keep in sync with the web original as a standalone port.
//
// Each rule is [regex matching the path, method it applies to, description
// builder]. Regexes capture numeric IDs from the path so they can be
// embedded in the sentence (e.g. "handover #49").

export type AuditCategory = 'auth' | 'create' | 'update' | 'delete' | 'other';

export type AuditDescription = {
    text: string;
    category: AuditCategory;
    categoryLabel: string;
    failed: boolean;
};

type Rule = [RegExp, string, (m: RegExpMatchArray) => { text: string; category: AuditCategory }];

const RULES: Rule[] = [
    // Auth
    [/^\/register$/, 'POST', () => ({ text: 'Created an account', category: 'auth' })],
    [/^\/login$/, 'POST', () => ({ text: 'Logged in', category: 'auth' })],
    [/^\/verify$/, 'POST', () => ({ text: 'Verified their account', category: 'auth' })],
    [/^\/resend-otp$/, 'POST', () => ({ text: 'Requested a new verification code', category: 'auth' })],
    [/^\/forgot-password$/, 'POST', () => ({ text: 'Requested a password reset', category: 'auth' })],
    [/^\/reset-password$/, 'POST', () => ({ text: 'Reset their password', category: 'auth' })],

    // Handovers
    [/^\/handover\/transcribe$/, 'POST', () => ({ text: 'Recorded a new handover', category: 'create' })],
    [/^\/handover\/(\d+)\/follow-ups$/, 'PATCH', (m) => ({ text: `Updated a follow-up on handover #${m[1]}`, category: 'update' })],
    [/^\/handover\/(\d+)$/, 'DELETE', (m) => ({ text: `Deleted handover #${m[1]}`, category: 'delete' })],

    // Notifications
    [/^\/notifications\/(\d+)\/read$/, 'PATCH', (m) => ({ text: `Marked notification #${m[1]} as read`, category: 'update' })],
    [/^\/notifications\/read-all$/, 'POST', () => ({ text: 'Marked all notifications as read', category: 'update' })],

    // Residents
    [/^\/residents\/?$/, 'POST', () => ({ text: 'Added a new resident', category: 'create' })],
    [/^\/residents\/(\d+)$/, 'PUT', (m) => ({ text: `Updated resident #${m[1]}'s details`, category: 'update' })],
    [/^\/residents\/(\d+)\/status$/, 'PATCH', (m) => ({ text: `Changed resident #${m[1]}'s status`, category: 'update' })],
    [/^\/residents\/(\d+)$/, 'DELETE', (m) => ({ text: `Removed resident #${m[1]}`, category: 'delete' })],

    // Shifts
    [/^\/shifts\/?$/, 'POST', () => ({ text: 'Logged a new shift', category: 'create' })],
    [/^\/shifts\/(\d+)$/, 'PUT', (m) => ({ text: `Updated shift #${m[1]}`, category: 'update' })],
    [/^\/shifts\/(\d+)$/, 'DELETE', (m) => ({ text: `Deleted shift #${m[1]}`, category: 'delete' })],

    // Own profile
    [/^\/users\/me$/, 'PATCH', () => ({ text: 'Updated their profile', category: 'update' })],
    [/^\/users\/me\/profile-picture$/, 'POST', () => ({ text: 'Changed their profile picture', category: 'update' })],
    [/^\/users\/me\/profile-picture$/, 'DELETE', () => ({ text: 'Removed their profile picture', category: 'delete' })],
    [/^\/users\/me\/change-password$/, 'PATCH', () => ({ text: 'Changed their password', category: 'update' })],

    // Team management (manager actions on other users)
    [/^\/users\/?$/, 'POST', () => ({ text: 'Added a new team member', category: 'create' })],
    [/^\/users\/(\d+)\/deactivate$/, 'PATCH', (m) => ({ text: `Deactivated team member #${m[1]}`, category: 'delete' })],
    [/^\/users\/(\d+)\/activate$/, 'PATCH', (m) => ({ text: `Reactivated team member #${m[1]}`, category: 'create' })],
    [/^\/users\/(\d+)\/reset-password$/, 'PATCH', (m) => ({ text: `Reset team member #${m[1]}'s password`, category: 'update' })],
    [/^\/users\/(\d+)$/, 'PATCH', (m) => ({ text: `Updated team member #${m[1]}`, category: 'update' })],
    [/^\/users\/(\d+)$/, 'PUT', (m) => ({ text: `Updated team member #${m[1]}`, category: 'update' })],
    [/^\/users\/(\d+)$/, 'DELETE', (m) => ({ text: `Removed team member #${m[1]}`, category: 'delete' })],
];

const CATEGORY_LABELS: Record<AuditCategory, string> = {
    auth: 'Account',
    create: 'Created',
    update: 'Updated',
    delete: 'Removed',
    other: 'Activity',
};

export function describeAuditEntry(entry: { method?: string | null; path?: string | null; status_code?: number | null }): AuditDescription {
    const path = entry.path || '';
    const method = (entry.method || '').toUpperCase();
    const failed = entry.status_code != null && entry.status_code >= 400;

    for (const [pattern, ruleMethod, build] of RULES) {
        if (ruleMethod !== method) continue;
        const match = path.match(pattern);
        if (match) {
            const { text, category } = build(match);
            return {
                text: failed ? `Tried to: ${text.charAt(0).toLowerCase()}${text.slice(1)}` : text,
                category,
                categoryLabel: CATEGORY_LABELS[category],
                failed,
            };
        }
    }

    // Fallback for anything not explicitly mapped above (new routes, etc.) --
    // still readable, just less specific than the curated rules.
    const verbByMethod: Record<string, string> = { POST: 'Created something at', PATCH: 'Updated something at', PUT: 'Updated something at', DELETE: 'Deleted something at', GET: 'Viewed' };
    const verb = verbByMethod[method] || 'Did something at';
    return {
        text: `${failed ? 'Tried to: ' : ''}${verb} ${path}`,
        category: 'other',
        categoryLabel: CATEGORY_LABELS.other,
        failed,
    };
}
