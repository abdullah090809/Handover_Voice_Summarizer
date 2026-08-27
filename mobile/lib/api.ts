import * as SecureStore from 'expo-secure-store';

// -----------------------------------------------------------------------
// Base URL
// -----------------------------------------------------------------------
// The backend base URL used to be a module-level constant baked in at
// build time from EXPO_PUBLIC_API_URL (see eas.json's per-profile "env"
// blocks) -- which meant every time your PC's LAN IP changed (new WiFi,
// router DHCP reassigning it, etc.) the APK had to be rebuilt from
// scratch to pick up the new address. That's now a runtime-editable
// value instead: it's read from SecureStore on launch, can be changed
// from the app itself (see app/server-settings.tsx, reachable from both
// the login screen and the More tab), and every request below reads the
// *current* value rather than one frozen at build time. No rebuild
// needed when your IP changes -- just update it in-app.
//
// EXPO_PUBLIC_API_URL / the hardcoded LAN_IP below are now only the
// *default* -- what a fresh install falls back to before anyone has ever
// opened the settings screen and saved something else.
const LAN_IP = '192.168.1.157'; // <-- fallback default only; change via in-app Server settings instead of rebuilding
const DEV_DEFAULT_BASE = `http://${LAN_IP}:5173`;

const configuredBase = process.env.EXPO_PUBLIC_API_URL;
if (!configuredBase && !__DEV__) {
    // A production/preview build with no EXPO_PUBLIC_API_URL set would
    // otherwise silently ship pointed at the dev LAN IP -- fail loudly at
    // startup instead of failing mysteriously on every single request.
    console.error(
        'EXPO_PUBLIC_API_URL is not set and no server URL has been configured in-app. ' +
        'Open Server settings in the app to set the backend URL.'
    );
}

/** The build-time default -- used until the person saves a different URL in-app, and as the "Reset to default" target. */
function getDefaultBase(): string {
    return (configuredBase || DEV_DEFAULT_BASE).replace(/\/$/, '');
}

const SERVER_URL_KEY = 'server_base_url';

// In-memory current base. Starts as the default and is overwritten by
// initApiBase() (called once, early, from the root layout) if a saved
// override is found in SecureStore. Kept as a plain module variable
// (not React state) since api.ts's request()/resolveFileUrl() are called
// from many places that aren't React components.
let currentBase = getDefaultBase();
let initialized = false;

/** Call once at app startup, before any screen can issue a request, to load a saved server URL override if one exists. */
export async function initApiBase(): Promise<void> {
    try {
        const saved = await SecureStore.getItemAsync(SERVER_URL_KEY);
        if (saved) currentBase = saved.replace(/\/$/, '');
    } catch {
        // No saved override, or SecureStore unavailable -- fall back to the build-time default already in currentBase.
    } finally {
        initialized = true;
    }
}

/** The server URL currently in effect (e.g. "http://192.168.1.157:5173"), no trailing slash. */
export function getServerUrl(): string {
    return currentBase;
}

/** The build-time default, for display (e.g. placeholder text) and for "Reset to default". */
export function getDefaultServerUrl(): string {
    return getDefaultBase();
}

/** True once initApiBase() has finished loading any saved override -- lets the root layout gate rendering until it's safe to issue requests. */
export function isApiBaseInitialized(): boolean {
    return initialized;
}

/**
 * Persist a new server base URL (e.g. "http://192.168.1.42:5173") and
 * make it effective immediately -- no rebuild or app restart required,
 * since every request reads apiBase()/currentBase fresh.
 */
export async function setServerUrl(url: string): Promise<void> {
    const trimmed = url.trim().replace(/\/$/, '');
    if (!/^https?:\/\/.+/i.test(trimmed)) {
        throw new Error('Enter a full URL starting with http:// or https://');
    }
    await SecureStore.setItemAsync(SERVER_URL_KEY, trimmed);
    currentBase = trimmed;
}

/** Clear the saved override and revert to the build-time default. */
export async function resetServerUrl(): Promise<void> {
    await SecureStore.deleteItemAsync(SERVER_URL_KEY);
    currentBase = getDefaultBase();
}

/**
 * Ping the bare server root (not /api -- see app/main.py's `@app.get("/")`
 * status_check, which is intentionally unauthenticated) to confirm a URL
 * is actually reachable before saving it.
 */
export async function testServerUrl(url: string): Promise<boolean> {
    const trimmed = url.trim().replace(/\/$/, '');
    if (!/^https?:\/\/.+/i.test(trimmed)) return false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${trimmed}/`, { signal: controller.signal, cache: 'no-store' });
        return res.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

function apiBase(): string {
    return `${currentBase}/api`;
}

function wsBase(): string {
    return currentBase.replace(/^http/, 'ws');
}

/** @deprecated kept only as a snapshot for any external debug logging -- prefer getServerUrl()/apiBase() internally, since this doesn't update after a runtime change. */
export const API_BASE_URL = apiBase();
export const WS_BASE_URL = wsBase();

// -----------------------------------------------------------------------
// Token storage (SecureStore replaces localStorage/sessionStorage)
// -----------------------------------------------------------------------
const TOKEN_KEY = 'access_token';

export async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function resolveFileUrl(path?: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${apiBase()}${path}`;
}

export class ApiError extends Error {
    status: number;
    detail: unknown;
    constructor(message: string, status: number, detail: unknown) {
        super(message);
        this.status = status;
        this.detail = detail;
    }
}

let onUnauthorized: () => void = () => { };
export function setUnauthorizedHandler(fn: () => void) {
    onUnauthorized = fn;
}

async function request(
    endpoint: string,
    options: RequestInit = {},
    retries = 3,
    delay = 800
): Promise<Response> {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let body = options.body as any;
    // NOTE: React Native's fetch does NOT reliably serialize URLSearchParams
    // as a body -- it can silently send an empty/malformed body even though
    // browser fetch handles URLSearchParams fine. Callers that need
    // application/x-www-form-urlencoded (e.g. login) must pass a pre-built
    // string directly, not a URLSearchParams instance. This is why login()
    // below builds the encoded string manually instead of using
    // `new URLSearchParams()` like the web app's api.js does.
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
        body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        let response: Response;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s per attempt
        try {
            response = await fetch(`${apiBase()}${endpoint}`, {
                ...options,
                headers,
                body,
                cache: 'no-store',
                signal: controller.signal,
            } as RequestInit);
        } catch (networkErr) {
            const isTimeout = networkErr instanceof Error && networkErr.name === 'AbortError';
            if (attempt === retries) {
                throw new ApiError(
                    isTimeout ? 'Request timed out. Check your connection / server.' : 'Network error. Please check your connection.',
                    0,
                    null
                );
            }
            await sleep(delay * 2 ** attempt);
            continue;
        } finally {
            clearTimeout(timeoutId);
        }

        if (response.status === 401 && endpoint !== '/login') {
            onUnauthorized();
            throw new ApiError('Session expired. Please sign in again.', 401, null);
        }

        if (response.status >= 500 && attempt < retries) {
            await sleep(delay * 2 ** attempt);
            continue;
        }

        return response;
    }

    throw new ApiError('Request failed after retries.', 0, null);
}

function sleep(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
}

async function parse(responsePromise: Promise<Response>): Promise<any> {
    const res = await responsePromise;
    const contentType = res.headers.get('content-type') || '';
    const hasJson = contentType.includes('application/json');
    const data = hasJson ? await res.json().catch(() => null) : null;

    if (!res.ok) {
        let message = (data && (data.detail || data.error)) || `Request failed (${res.status})`;
        if (data && Array.isArray(data.details) && data.details.length) {
            const first = data.details[0];
            const field = Array.isArray(first.loc) ? first.loc.slice(1).join('.') : first.loc;
            message = `${message}${field ? ` (${field})` : ''}: ${first.msg}`;
        }
        throw new ApiError(message, res.status, data);
    }
    return data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
    login: (email: string, password: string, turnstileToken: string) => {
        // Built manually (NOT via `new URLSearchParams()`) -- see the note in
        // request() above. This is a plain string, so request()'s
        // object-detection branch leaves it untouched and passes it straight
        // to fetch as-is.
        const body =
            `username=${encodeURIComponent(email)}` +
            `&password=${encodeURIComponent(password)}` +
            `&turnstile_token=${encodeURIComponent(turnstileToken)}`;
        return parse(request('/login', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }));
    },
    register: (email: string, username: string, password: string, name?: string) =>
        parse(request('/register', { method: 'POST', body: { email, username, password, name: name || null } as any })),
    verify: (email: string, otpCode: string) => parse(request('/verify', { method: 'POST', body: { email, otp_code: otpCode } as any })),
    resendOtp: (email: string) => parse(request('/resend-otp', { method: 'POST', body: { email } as any })),
    forgotPassword: (email: string) => parse(request('/forgot-password', { method: 'POST', body: { email } as any })),
    resetPassword: (email: string, otpCode: string, newPassword: string) =>
        parse(request('/reset-password', { method: 'POST', body: { email, otp_code: otpCode, new_password: newPassword } as any })),
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const userApi = {
    me: () => parse(request('/users/me')),
    /** payload can include any of: name, username, phone_number, job_title, bio */
    updateMe: (payload: Record<string, unknown>) => parse(request('/users/me', { method: 'PATCH', body: payload as any })),
    changePassword: (currentPassword: string, newPassword: string) =>
        parse(request('/users/me/change-password', { method: 'PATCH', body: { current_password: currentPassword, new_password: newPassword } as any })),
    // Stage M6c -- same { uri, name, type } file-descriptor shape as
    // handoverApi.submit's audio upload (see the note there): RN's
    // fetch/FormData can't take a web Blob/File the way the browser can, it
    // needs this descriptor instead. `type` is passed through from whatever
    // expo-image-picker reports for the picked asset rather than hardcoded,
    // since (unlike the handover recording, which is always the app's own
    // .m4a output) a photo could genuinely be jpeg, png, or webp -- matching
    // the same three types the web app's file input accepts.
    uploadProfilePicture: (file: { uri: string; name: string; type: string }) => {
        const formData = new FormData();
        formData.append('file', file as any);
        return parse(request('/users/me/profile-picture', { method: 'POST', body: formData }));
    },
    removeProfilePicture: () => parse(request('/users/me/profile-picture', { method: 'DELETE' })),
    list: () => parse(request('/users/')),
    get: (id: number | string) => parse(request(`/users/${id}`)),
    // Stage M7 -- manager-only mutation surface, ported from the web app's
    // userApi (api.js). Lets a manager add/remove/edit team members
    // (managers and care workers alike) from the mobile app, matching the
    // Team page's "Add team member" button + row action menu on desktop.
    /** payload: { name?, username, email, role, password } */
    create: (payload: Record<string, unknown>) => parse(request('/users/', { method: 'POST', body: payload as any })),
    /** payload can include any subset of the account fields (name, username,
     * email, role, password) or the extended profile fields (employee_id,
     * date_of_birth, gender, home_address, job_title, employment_type,
     * department, shift_pattern, employment_status, join_date, care_home,
     * emergency_contact_*) -- the backend's UserUpdateByManager schema
     * accepts all of them on the same PUT. */
    update: (id: number | string, payload: Record<string, unknown>) => parse(request(`/users/${id}`, { method: 'PUT', body: payload as any })),
    remove: (id: number | string) => parse(request(`/users/${id}`, { method: 'DELETE' })),
    deactivate: (id: number | string) => parse(request(`/users/${id}/deactivate`, { method: 'PATCH' })),
    activate: (id: number | string) => parse(request(`/users/${id}/activate`, { method: 'PATCH' })),
    resetPassword: (id: number | string, newPassword: string) =>
        parse(request(`/users/${id}/reset-password`, { method: 'PATCH', body: { new_password: newPassword } as any })),
};

// ---------------------------------------------------------------------------
// Residents
// ---------------------------------------------------------------------------
export const residentApi = {
    list: (includeInactive = false) => parse(request(`/residents/?include_inactive=${includeInactive}`)),
    get: (id: number | string) => parse(request(`/residents/${id}`)),
    // Manager-only mutation surface, ported from the web app's residentApi
    // (api.js) -- same three calls, matching the Residents page's "Add
    // resident" FAB + Edit/Remove actions on desktop. `payload` is the full
    // resident field set (see ResidentCreate/ResidentUpdate schemas) --
    // only `name` is actually required, everything else can be filled in
    // later from the profile screen.
    create: (payload: Record<string, unknown>) => parse(request('/residents/', { method: 'POST', body: payload as any })),
    update: (id: number | string, payload: Record<string, unknown>) => parse(request(`/residents/${id}`, { method: 'PUT', body: payload as any })),
    remove: (id: number | string) => parse(request(`/residents/${id}`, { method: 'DELETE' })),
};

// ---------------------------------------------------------------------------
// Assignments (manager only)
// ---------------------------------------------------------------------------
// Ported from the web app's assignmentApi (api.js). Powers the three Stage 5
// assignment workflows -- a resident's care-worker set, a care worker's
// resident caseload, and a care worker's manager -- via the same
// "replace-the-whole-set" PUT endpoints web uses, so AssignmentModal (native)
// can call these directly with a full id array/single id.
export const assignmentApi = {
    /** Replaces a resident's entire assigned care-worker set in one call. */
    setResidentCareWorkers: (residentId: number | string, careWorkerIds: (number | string)[]) =>
        parse(request(`/assignments/residents/${residentId}/care-workers`, { method: 'PUT', body: { care_worker_ids: careWorkerIds } as any })),
    /** Replaces a care worker's entire caseload in one call. */
    setCareWorkerResidents: (careWorkerId: number | string, residentIds: (number | string)[]) =>
        parse(request(`/assignments/care-workers/${careWorkerId}/residents`, { method: 'PUT', body: { resident_ids: residentIds } as any })),
    /** Pass managerId = null to remove the care worker's manager. */
    setCareWorkerManager: (careWorkerId: number | string, managerId: number | string | null) =>
        parse(request(`/assignments/care-workers/${careWorkerId}/manager`, { method: 'PATCH', body: { manager_id: managerId } as any })),
};

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
function localTimezone(): string | null {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
        return null; // server falls back to settings.app_timezone
    }
}

export const shiftApi = {
    list: (workerId?: number | string) => parse(request(`/shifts/${workerId ? `?worker_id=${workerId}` : ''}`)),
    get: (id: number | string) => parse(request(`/shifts/${id}`)),
    create: (startTime: string, endTime?: string | null) =>
        parse(request('/shifts/', { method: 'POST', body: { start_time: startTime, end_time: endTime || null, timezone: localTimezone() } as any })),
    update: (id: number | string, startTime: string, endTime?: string | null) =>
        parse(request(`/shifts/${id}`, { method: 'PUT', body: { start_time: startTime, end_time: endTime || null, timezone: localTimezone() } as any })),
    remove: (id: number | string) => parse(request(`/shifts/${id}`, { method: 'DELETE' })),
};

// ---------------------------------------------------------------------------
// Handover notes
// ---------------------------------------------------------------------------
export const handoverApi = {
    list: (opts: { residentId?: number | string; urgency?: string; dateFrom?: string; dateTo?: string; skip?: number; limit?: number } = {}) => {
        const { residentId, urgency, dateFrom, dateTo, skip = 0, limit = 50 } = opts;
        const qs = new URLSearchParams();
        qs.set('skip', String(skip));
        qs.set('limit', String(limit));
        if (residentId) qs.set('resident_id', String(residentId));
        if (urgency) qs.set('urgency_flag', urgency);
        if (dateFrom) qs.set('date_from', dateFrom);
        if (dateTo) qs.set('date_to', dateTo);
        return parse(request(`/handover/?${qs.toString()}`));
    },
    get: (id: number | string) => parse(request(`/handover/${id}`)),
    remove: (id: number | string) => parse(request(`/handover/${id}`, { method: 'DELETE' })),
    setFollowUpResolved: (id: number | string, action: string, resolved: boolean) =>
        parse(request(`/handover/${id}/follow-ups`, { method: 'PATCH', body: { action, resolved } as any })),
    // React Native's fetch/FormData doesn't accept a web Blob the way
    // api.js's browser version does -- it needs a { uri, name, type } file
    // descriptor instead (the standard RN multipart-upload shape). `type`
    // is deliberately hardcoded by the caller rather than inferred, since
    // Android can report a recorded .m4a's mime as "audio/mp4", which the
    // backend's ALLOWED_AUDIO_CONTENT_TYPES does NOT include (only
    // "audio/m4a" / "audio/x-m4a" are) -- an inferred type would fail with
    // a 415 even though the file itself is fine.
    submit: (
        shiftId: number | string,
        residentId: number | string,
        audioFile: { uri: string; name: string; type: string }
    ) => {
        const formData = new FormData();
        formData.append('shift_id', String(shiftId));
        formData.append('resident_id', String(residentId));
        formData.append('audio', audioFile as any);
        return parse(request('/handover/transcribe', { method: 'POST', body: formData }));
    },
};

// ---------------------------------------------------------------------------
// Notifications (manager only)
// ---------------------------------------------------------------------------
export const notificationApi = {
    list: (limit = 50) => parse(request(`/notifications/?limit=${limit}`)),
    markRead: (id: number | string) => parse(request(`/notifications/${id}/read`, { method: 'PATCH' })),
    markAllRead: () => parse(request('/notifications/read-all', { method: 'POST' })),
    registerDevice: (pushToken: string, platform: string, deviceId?: string) =>
        parse(
            request('/notifications/push/register-device', {
                method: 'POST',
                body: { push_token: pushToken, platform, device_id: deviceId || null } as any,
            })
        ),
    unregisterDevice: (pushToken: string) =>
        parse(
            request('/notifications/push/unregister-device', {
                method: 'POST',
                body: { push_token: pushToken } as any,
            })
        ),
};

// ---------------------------------------------------------------------------
// Audit log (manager only)
// ---------------------------------------------------------------------------
// Stage M6f -- ported from the web app's auditApi in api.js. userId and
// statusCode are accepted here for parity with the backend's query params
// (see app/routers/audit.py) even though the mobile screen only exposes
// method + path filters in its UI, same as web's own AuditPage.jsx -- the
// backend supports more filters than either client's UI surfaces.
export const auditApi = {
    list: (opts: { skip?: number; limit?: number; method?: string; userId?: number | string; path?: string; statusCode?: number; dateFrom?: string; dateTo?: string } = {}) => {
        const { skip = 0, limit = 20, method, userId, path, statusCode, dateFrom, dateTo } = opts;
        const qs = new URLSearchParams();
        qs.set('skip', String(skip));
        qs.set('limit', String(limit));
        if (method) qs.set('method', method);
        if (userId) qs.set('user_id', String(userId));
        if (path) qs.set('path', path);
        if (statusCode) qs.set('status_code', String(statusCode));
        if (dateFrom) qs.set('date_from', dateFrom);
        if (dateTo) qs.set('date_to', dateTo);
        return parse(request(`/audit/?${qs.toString()}`));
    },
    get: (id: number | string) => parse(request(`/audit/${id}`)),
};