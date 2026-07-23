// ============================================================================
// API CLIENT
// Thin wrapper around fetch. Every endpoint here maps 1:1 to a route that
// already exists in the FastAPI backend (see app/routers/*.py) — nothing
// here is speculative.
// ============================================================================

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
export const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://127.0.0.1:8000';

const TOKEN_KEY = 'access_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
/** remember=true persists the session across browser restarts (localStorage); remember=false clears when the browser/tab closes (sessionStorage). */
export function setToken(token, remember = true) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Resolves a possibly-relative file path (e.g. profile_photo_url) returned by the API into a full URL. */
export function resolveFileUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

let onUnauthorized = () => { };
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/**
 * Core request function. Retries on network failure / transient 5xx errors
 * with exponential backoff, mirrors the original app's resilience behavior.
 */
async function request(endpoint, options = {}, retries = 3, delay = 800) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers, body, cache: 'no-store' });
    } catch (networkErr) {
      if (attempt === retries) throw new ApiError('Network error. Please check your connection.', 0, null);
      await sleep(delay * 2 ** attempt);
      continue;
    }

    if (response.status === 401) {
      onUnauthorized();
      throw new ApiError('Session expired. Please sign in again.', 401, null);
    }

    if (response.status >= 500 && attempt < retries) {
      await sleep(delay * 2 ** attempt);
      continue;
    }

    return response;
  }
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/** Parses a fetch Response, throwing ApiError with backend `detail` on failure. */
async function parse(responsePromise) {
  const res = await responsePromise;
  const contentType = res.headers.get('content-type') || '';
  const hasJson = contentType.includes('application/json');
  const data = hasJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (data && (data.detail || data.error)) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
  login: (email, password, turnstileToken) => {
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);
    params.append('turnstile_token', turnstileToken);
    return parse(request('/login', { method: 'POST', body: params, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }));
  },
  register: (email, username, password, name) =>
    parse(request('/register', { method: 'POST', body: { email, username, password, name: name || null } })),
  verify: (email, otpCode) => parse(request('/verify', { method: 'POST', body: { email, otp_code: otpCode } })),
  resendOtp: (email) => parse(request('/resend-otp', { method: 'POST', body: { email } })),
  forgotPassword: (email) => parse(request('/forgot-password', { method: 'POST', body: { email } })),
  resetPassword: (email, otpCode, newPassword) =>
    parse(request('/reset-password', { method: 'POST', body: { email, otp_code: otpCode, new_password: newPassword } })),
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export const userApi = {
  me: () => parse(request('/users/me')),
  /** payload can include any of: name, username, phone_number, job_title, bio, profile_photo_url */
  updateMe: (payload) => parse(request('/users/me', { method: 'PATCH', body: payload })),
  changePassword: (currentPassword, newPassword) =>
    parse(request('/users/me/change-password', { method: 'PATCH', body: { current_password: currentPassword, new_password: newPassword } })),
  uploadProfilePicture: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return parse(request('/users/me/profile-picture', { method: 'POST', body: formData }));
  },
  removeProfilePicture: () => parse(request('/users/me/profile-picture', { method: 'DELETE' })),
  list: () => parse(request('/users/')),
  create: (payload) => parse(request('/users/', { method: 'POST', body: payload })),
  update: (id, payload) => parse(request(`/users/${id}`, { method: 'PUT', body: payload })),
  remove: (id) => parse(request(`/users/${id}`, { method: 'DELETE' })),
  deactivate: (id) => parse(request(`/users/${id}/deactivate`, { method: 'PATCH' })),
  activate: (id) => parse(request(`/users/${id}/activate`, { method: 'PATCH' })),
  resetPassword: (id, newPassword) => parse(request(`/users/${id}/reset-password`, { method: 'PATCH', body: { new_password: newPassword } })),
};

// ---------------------------------------------------------------------------
// Residents
// ---------------------------------------------------------------------------
export const residentApi = {
  list: (includeInactive = false) => parse(request(`/residents/?include_inactive=${includeInactive}`)),
  get: (id) => parse(request(`/residents/${id}`)),
  create: (name) => parse(request('/residents/', { method: 'POST', body: { name } })),
  update: (id, name) => parse(request(`/residents/${id}`, { method: 'PUT', body: { name } })),
  updateStatus: (id, status) => parse(request(`/residents/${id}/status`, { method: 'PATCH', body: { status } })),
  remove: (id) => parse(request(`/residents/${id}`, { method: 'DELETE' })),
};

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
export const shiftApi = {
  list: (workerId) => parse(request(`/shifts/${workerId ? `?worker_id=${workerId}` : ''}`)),
  get: (id) => parse(request(`/shifts/${id}`)),
  create: (startTime, endTime) => parse(request('/shifts/', { method: 'POST', body: { start_time: startTime, end_time: endTime || null } })),
  update: (id, startTime, endTime) => parse(request(`/shifts/${id}`, { method: 'PUT', body: { start_time: startTime, end_time: endTime || null } })),
  remove: (id) => parse(request(`/shifts/${id}`, { method: 'DELETE' })),
};

// ---------------------------------------------------------------------------
// Handover notes
// ---------------------------------------------------------------------------
export const handoverApi = {
  list: ({ residentId, urgency, dateFrom, dateTo, limit = 50 } = {}) => {
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    if (residentId) qs.set('resident_id', residentId);
    if (urgency) qs.set('urgency_flag', urgency);
    if (dateFrom) qs.set('date_from', dateFrom);
    if (dateTo) qs.set('date_to', dateTo);
    return parse(request(`/handover/?${qs.toString()}`));
  },
  get: (id) => parse(request(`/handover/${id}`)),
  remove: (id) => parse(request(`/handover/${id}`, { method: 'DELETE' })),
  submit: (shiftId, residentId, audioBlob, filename) => {
    const formData = new FormData();
    formData.append('shift_id', shiftId);
    formData.append('resident_id', residentId);
    formData.append('audio', audioBlob, filename);
    return parse(request('/handover/transcribe', { method: 'POST', body: formData }));
  },
};

// ---------------------------------------------------------------------------
// Notifications (manager only)
// ---------------------------------------------------------------------------
export const notificationApi = {
  list: (limit = 50) => parse(request(`/notifications/?limit=${limit}`)),
  markRead: (id) => parse(request(`/notifications/${id}/read`, { method: 'PATCH' })),
  markAllRead: () => parse(request('/notifications/read-all', { method: 'POST' })),
};

export { ApiError };