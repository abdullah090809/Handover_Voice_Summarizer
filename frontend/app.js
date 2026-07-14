// Configuration & State
// Change API_BASE_URL/WS_BASE_URL if deploying to a different host
const API_BASE_URL = (typeof API_CONFIG !== 'undefined' && API_CONFIG.apiBase) ? API_CONFIG.apiBase : 'http://127.0.0.1:8000';
const WS_BASE_URL = (typeof API_CONFIG !== 'undefined' && API_CONFIG.wsBase) ? API_CONFIG.wsBase : 'ws://127.0.0.1:8000';
let currentToken = localStorage.getItem('access_token');
let currentUser = null; // Will store user profile

// DOM Sections
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');

// Auth Forms
const authForms = {
    'login': document.getElementById('login-form'),
    'register': document.getElementById('register-form'),
    'verify': document.getElementById('verify-form'),
    'forgot': document.getElementById('forgot-form'),
    'reset': document.getElementById('reset-form')
};

// Navigation
const navLinks = document.querySelectorAll('.nav-links li');
const views = document.querySelectorAll('.view');
const viewTitle = document.getElementById('current-view-title');
const topbarActions = document.getElementById('topbar-actions');

// Generic CRUD Modal
const crudModal = document.getElementById('crud-modal');
const closeCrud = document.getElementById('close-crud');
const crudForm = document.getElementById('crud-form');
const crudFormBody = document.getElementById('crud-form-body');
const crudModalTitle = document.getElementById('crud-modal-title');
const crudError = document.getElementById('crud-error');
let currentCrudAction = null; // stores function to call on submit

// Handover Modal
const handoverModal = document.getElementById('handover-modal');
const closeHandover = document.getElementById('close-handover');
const handoverForm = document.getElementById('handover-form');
const handoverError = document.getElementById('handover-error');
const handoverResident = document.getElementById('handover-resident');
const handoverShift = document.getElementById('handover-shift');
const submitHandover = document.getElementById('submit-handover');
const audioFileInput = document.getElementById('audio-file');
const dropZone = document.getElementById('drop-zone');
const selectedFilename = document.getElementById('selected-filename');

// Recording State
let mediaRecorder;
let audioChunks = [];
let recordingBlob = null;
let recordingTimerInterval;
let recordingSeconds = 0;
const recordBtn = document.getElementById('record-btn');
const recordTimer = document.getElementById('record-timer');
const recordStatus = document.getElementById('record-status');
const recordPreview = document.getElementById('record-preview');
const clearRecordBtn = document.getElementById('clear-record-btn');

// Details Modal
const detailsModal = document.getElementById('details-modal');
const closeDetails = document.getElementById('close-details');
const detailsBody = document.getElementById('details-body');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (currentToken) {
        initDashboard();
    }
});

// --- UI: Toast Notifications ---
// --- UI: Toast Notifications ---
// Signature: showToast(message, type='info', duration=4000, actions=[])
// actions: [{label, cls, action}]  -- if provided, toast stays until dismissed
function showToast(message, type = 'info', duration = 4000, actions = []) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const icon = iconMap[type] || 'fa-circle-info';

    let actionsHtml = '';
    if (actions.length) {
        actionsHtml = `<div class="toast-actions">${actions.map((a, i) => `<button class="${a.cls || ''}" data-action-idx="${i}">${a.label}</button>`).join('')}</div>`;
    }

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-content">
            <span class="toast-message">${escapeHtml(message)}</span>
            ${actionsHtml}
        </div>
    `;

    // Bind action buttons
    actions.forEach((a, i) => {
        toast.querySelector(`[data-action-idx="${i}"]`).addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
            a.action && a.action();
        });
    });

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    if (!actions.length && duration > 0) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// --- WebSocket ---
let ws = null;
function initWebSocket() {
    if (ws) return;
    ws = new WebSocket(`${WS_BASE_URL}/ws/handovers`);
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'handover_updated') {
                showToast(`Handover note #${data.id} is now ${data.status}!`, data.status === 'complete' ? 'success' : 'error');
                if (document.getElementById('handovers-view').classList.contains('active')) {
                    fetchHandovers();
                }
            } else if (data.type === 'notification') {
                // Show a toast alert for managers
                if (currentUser && currentUser.role === 'manager') {
                    const urgencyLabel = data.urgency_flag === 'urgent' ? '🚨 URGENT' : '⚠️ High Priority';
                    showToast(`${urgencyLabel}: ${data.message}`, 'warning', 7000, [
                        { label: 'View Alerts', cls: 'btn-primary', action: () => loadView('notifications-view', 'Notifications') }
                    ]);
                    // Refresh notifications badge
                    updateNotificationsBadge();
                    // If already on notifications view, refresh it
                    if (document.getElementById('notifications-view') && !document.getElementById('notifications-view').classList.contains('hidden')) {
                        fetchNotifications();
                    }
                }
            }
        } catch (e) {
            console.error('WebSocket parse error', e);
        }
    };
    ws.onclose = () => {
        ws = null;
        setTimeout(initWebSocket, 5000);
    };
}


function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') {
        try {
            str = JSON.stringify(str);
        } catch (_) {
            str = String(str);
        }
    }
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// --- Utility: Fetch with Retry Logic ---
async function fetchAPI(endpoint, options = {}, retries = 3, delay = 1000) {
    if (!options.headers) options.headers = {};
    if (currentToken) {
        options.headers['Authorization'] = `Bearer ${currentToken}`;
    }

    // Auto set content-type for JSON if body is object and not FormData
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData) && !(options.body instanceof URLSearchParams)) {
        options.body = JSON.stringify(options.body);
        options.headers['Content-Type'] = 'application/json';
    }

    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            if (response.status === 401) {
                handleLogout();
                throw new Error("Session expired. Please log in.");
            }

            // Retry on transient server errors (500, 502, 503, 504)
            if (response.status >= 500 && i < retries) {
                console.warn(`Transient server error ${response.status}. Retrying (${i + 1}/${retries})...`);
                await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
                continue;
            }

            return response;
        } catch (error) {
            if (i === retries) {
                console.error("API Error after maximum retries:", error);
                throw error;
            }
            console.warn(`Network error. Retrying (${i + 1}/${retries})...`, error);
            await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
        }
    }
}

// --- Auth UI Management ---
function showAuthForm(formKey) {
    Object.values(authForms).forEach(f => f.classList.add('hidden'));
    authForms[formKey].classList.remove('hidden');

    // Clear forms and errors
    document.querySelectorAll('.error-text, .success-text').forEach(el => el.textContent = '');
    document.querySelectorAll('form').forEach(f => f.reset());
}

// Auth Link Listeners
document.getElementById('link-to-register').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('register'); });
document.getElementById('link-to-forgot').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('forgot'); });
document.getElementById('link-to-login-from-reg').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
document.getElementById('link-to-verify').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('verify'); });
document.getElementById('link-to-login-from-verify').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
document.getElementById('link-to-reset').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('reset'); });
document.getElementById('link-to-login-from-forgot').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });
document.getElementById('link-to-login-from-reset').addEventListener('click', (e) => { e.preventDefault(); showAuthForm('login'); });

// --- Auth API Actions ---
async function handleAuthAction(e, endpoint, getPayload, btnId, errId, successId, onSuccess) {
    e.preventDefault();
    const btn = document.getElementById(btnId);
    const errEl = document.getElementById(errId);
    const sucEl = successId ? document.getElementById(successId) : null;

    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
    btn.disabled = true;
    errEl.textContent = '';
    if (sucEl) sucEl.textContent = '';

    try {
        const payload = getPayload();
        const opts = { method: 'POST' };

        if (payload instanceof URLSearchParams) {
            opts.body = payload;
            opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        } else {
            opts.body = payload;
        }

        const res = await fetchAPI(endpoint, opts);
        const data = await res.json();

        if (res.ok) {
            if (onSuccess) onSuccess(data);
        } else {
            const msg = data.detail || data.error || 'An error occurred';
            errEl.textContent = msg;
            showToast(msg, 'error');
        }
    } catch (err) {
        errEl.textContent = 'Network Error';
        showToast('Network Error', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Login
document.getElementById('login-form').addEventListener('submit', (e) => {
    handleAuthAction(e, '/login', () => {
        const params = new URLSearchParams();
        params.append('username', document.getElementById('login-email').value);
        params.append('password', document.getElementById('login-password').value);
        return params;
    }, 'login-btn', 'login-error', null, (data) => {
        currentToken = data.access_token;
        localStorage.setItem('access_token', currentToken);
        initDashboard();
    });
});

// Register
document.getElementById('register-form').addEventListener('submit', (e) => {
    handleAuthAction(e, '/register', () => ({
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value
    }), 'reg-btn', 'reg-error', 'reg-success', (data) => {
        document.getElementById('verify-email').value = document.getElementById('reg-email').value;
        showAuthForm('verify');
        document.getElementById('verify-success').textContent = "Registration successful! Please check your email for the OTP.";
    });
});

// Verify
document.getElementById('verify-form').addEventListener('submit', (e) => {
    handleAuthAction(e, '/verify', () => ({
        email: document.getElementById('verify-email').value,
        otp_code: document.getElementById('verify-otp').value
    }), 'verify-btn', 'verify-error', 'verify-success', (data) => {
        showAuthForm('login');
        document.getElementById('login-email').value = data.email;
        document.getElementById('login-error').textContent = '';
        document.getElementById('login-error').style.color = 'var(--success-color)';
        document.getElementById('login-error').textContent = 'Verification successful! You can now log in.';
    });
});

// Resend OTP
document.getElementById('resend-otp-btn').addEventListener('click', async () => {
    const email = document.getElementById('verify-email').value;
    if (!email) {
        document.getElementById('verify-error').textContent = "Please enter your email first.";
        return;
    }
    const btn = document.getElementById('resend-otp-btn');
    btn.disabled = true;
    try {
        const res = await fetchAPI('/resend-otp', { method: 'POST', body: { email } });
        if (res.ok) document.getElementById('verify-success').textContent = "OTP Resent!";
        else document.getElementById('verify-error').textContent = "Failed to resend OTP.";
    } catch (e) { }
    setTimeout(() => btn.disabled = false, 2000);
});

// Forgot Password
document.getElementById('forgot-form').addEventListener('submit', (e) => {
    handleAuthAction(e, '/forgot-password', () => ({
        email: document.getElementById('forgot-email').value
    }), 'forgot-btn', 'forgot-error', 'forgot-success', (data) => {
        document.getElementById('reset-email').value = document.getElementById('forgot-email').value;
        showAuthForm('reset');
        document.getElementById('reset-success').textContent = "Reset code sent to your email.";
    });
});

// Reset Password
document.getElementById('reset-form').addEventListener('submit', (e) => {
    handleAuthAction(e, '/reset-password', () => ({
        email: document.getElementById('reset-email').value,
        otp_code: document.getElementById('reset-otp').value,
        new_password: document.getElementById('reset-password').value
    }), 'reset-btn', 'reset-error', 'reset-success', (data) => {
        showAuthForm('login');
        document.getElementById('login-error').style.color = 'var(--success-color)';
        document.getElementById('login-error').textContent = 'Password reset successful! Please log in.';
    });
});


function handleLogout() {
    currentToken = null;
    currentUser = null;
    localStorage.removeItem('access_token');
    dashboardSection.classList.add('hidden');
    authSection.classList.remove('hidden');
    showAuthForm('login');
}
document.getElementById('logout-btn').addEventListener('click', handleLogout);

// --- Dashboard & Navigation ---
async function initDashboard() {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    // Fetch user profile
    try {
        const res = await fetchAPI('/users/me');
        if (res.ok) {
            currentUser = await res.json();

            // Hero banner
            const email = currentUser.email || '';
            const initials = email.split('@')[0].slice(0, 2).toUpperCase();
            document.getElementById('profile-avatar-initials').textContent = initials;
            document.getElementById('profile-hero-email').textContent = email;

            // Member since
            if (currentUser.created_at) {
                const joined = new Date(currentUser.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
                document.getElementById('profile-joined').textContent = joined;
            }

            // Info rows
            document.getElementById('profile-id').textContent = currentUser.id;
            document.getElementById('profile-email').textContent = email;

            const isManager = currentUser.role === 'manager';

            document.getElementById('profile-role').textContent = currentUser.role || '—';
            document.getElementById('profile-hero-badge').textContent = currentUser.role ? (currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)) : 'Staff';

            if (isManager) {
                document.getElementById('profile-hero-badge').className = 'badge processing';
            }

            // Role-based nav visibility: Managers see Team + Notifications, workers see neither
            const notifTab = document.getElementById('nav-notifications-tab');
            const usersTab = document.getElementById('nav-users-tab');
            const handoversTab = document.getElementById('nav-handovers-tab');
            const shiftsTab = document.getElementById('nav-shifts-tab');
            if (isManager) {
                if (notifTab) notifTab.style.display = '';
                if (usersTab) usersTab.style.display = '';
                // Managers don't deal with handovers or shifts
                if (handoversTab) handoversTab.style.display = 'none';
                if (shiftsTab) shiftsTab.style.display = 'none';
                // Load unread count on login
                updateNotificationsBadge();
            } else {
                if (notifTab) notifTab.style.display = 'none';
                if (usersTab) usersTab.style.display = 'none';
            }
        }
    } catch (e) {
        console.error("Failed to fetch user profile", e);
    }

    // Load default view — managers go to Residents, workers go to Handovers
    if (currentUser && currentUser.role === 'manager') {
        loadView('residents-view', 'Residents');
        // Set active nav item
        navLinks.forEach(l => l.classList.remove('active'));
        const residentsNav = document.querySelector('[data-target="residents-view"]');
        if (residentsNav) residentsNav.classList.add('active');
    } else {
        loadView('handovers-view', 'Handovers');
    }
    initWebSocket();
}

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const target = link.getAttribute('data-target');
        loadView(target, link.textContent.trim());
    });
});

function loadView(viewId, title) {
    views.forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    viewTitle.textContent = title;

    // Reset topbar actions
    topbarActions.innerHTML = '';

    const gridId = viewId.replace('-view', '-grid');
    const loaderId = viewId.replace('-view', '-loader');

    if (viewId === 'profile-view') return; // no grid

    const grid = document.getElementById(gridId);
    const loader = document.getElementById(loaderId);

    // Skeleton loader
    grid.innerHTML = Array(6).fill(`
        <div class="glass-container p-6 skeleton-card">
            <div class="skeleton skeleton-title"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text"></div>
        </div>
    `).join('');
    loader.classList.add('hidden'); // We use skeleton now instead of spinner

    if (viewId === 'handovers-view') {
        // Managers cannot submit handovers — hide the button for them
        if (!currentUser || currentUser.role !== 'manager') {
            topbarActions.innerHTML = `<button class="btn-primary" onclick="openHandoverModal()"><i class="fa-solid fa-plus"></i> New Handover</button>`;
        }
        fetchHandovers();
    } else if (viewId === 'residents-view') {
        const isManager = currentUser && currentUser.role === 'manager';
        if (isManager) {
            topbarActions.innerHTML = `<button class="btn-primary" onclick="openCrudModal('resident')"><i class="fa-solid fa-plus"></i> Add Resident</button>`;
        }
        fetchResidents();
    } else if (viewId === 'shifts-view') {
        topbarActions.innerHTML = `<button class="btn-primary" onclick="openCrudModal('shift')"><i class="fa-solid fa-plus"></i> Add Shift</button>`;
        fetchShifts();
    } else if (viewId === 'users-view') {
        const isManager = currentUser && currentUser.role === 'manager';
        if (isManager) {
            topbarActions.innerHTML = `<button class="btn-primary" onclick="openCrudModal('user')"><i class="fa-solid fa-plus"></i> Add Team Member</button>`;
        }
        fetchUsers();
    } else if (viewId === 'notifications-view') {
        fetchNotifications();
    }
}

document.getElementById('filter-urgency').addEventListener('change', fetchHandovers);

// --- Fetch Data ---
async function fetchHandovers() {
    const urgency = document.getElementById('filter-urgency').value;
    const url = `/handover/?limit=50${urgency ? `&urgency_flag=${urgency}` : ''}`;
    try {
        const res = await fetchAPI(url);
        const data = await res.json();
        renderGrid('handovers-grid', data, renderHandoverCard, 'handovers-loader');
    } catch (e) { document.getElementById('handovers-loader').classList.add('hidden'); }
}

async function fetchResidents() {
    try {
        const res = await fetchAPI('/residents/');
        const data = await res.json();
        renderGrid('residents-grid', data, renderResidentCard, 'residents-loader');
    } catch (e) { document.getElementById('residents-loader').classList.add('hidden'); }
}

async function fetchShifts() {
    try {
        const res = await fetchAPI('/shifts/');
        const data = await res.json();
        renderGrid('shifts-grid', data, renderShiftCard, 'shifts-loader');
    } catch (e) { document.getElementById('shifts-loader').classList.add('hidden'); }
}

async function fetchNotifications() {
    try {
        const res = await fetchAPI('/notifications/?limit=50');
        if (!res.ok) throw new Error('Failed to load notifications');
        const data = await res.json();
        renderGrid('notifications-grid', data, renderNotificationCard, 'notifications-loader', 'No notifications yet.');
        updateNotificationsBadge();
    } catch (e) {
        const grid = document.getElementById('notifications-grid');
        if (grid) grid.innerHTML = '<p class="error-text">Failed to load notifications.</p>';
    }
}

async function updateNotificationsBadge() {
    try {
        const res = await fetchAPI('/notifications/?limit=200');
        if (!res.ok) return;
        const data = await res.json();
        const unread = data.filter(n => !n.is_read).length;
        const badge = document.getElementById('notifications-badge');
        if (badge) {
            badge.textContent = unread;
            badge.style.display = unread > 0 ? 'inline-block' : 'none';
        }
    } catch (e) { /* ignore */ }
}

async function fetchUsers() {
    try {
        const res = await fetchAPI('/users/');
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        renderGrid('users-grid', data, renderUserCard, 'users-loader', 'No team members found.');
    } catch (e) {
        document.getElementById('users-loader').classList.add('hidden');
        document.getElementById('users-grid').innerHTML = '<p class="error-text">Failed to load team members.</p>';
    }
}

function renderGrid(gridId, data, renderCardFn, loaderId, emptyMessage = 'No items found.') {
    const grid = document.getElementById(gridId);
    if (document.getElementById(loaderId)) document.getElementById(loaderId).classList.add('hidden');

    if (!data || data.length === 0) {
        grid.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>${emptyMessage}</p></div>`;
        return;
    }
    grid.innerHTML = '';
    data.forEach(item => {
        grid.appendChild(renderCardFn(item));
    });
}

function renderHandoverCard(note) {
    const card = document.createElement('div');
    card.className = 'card';

    const isManager = currentUser && currentUser.role === 'manager';
    const deleteBtnHtml = isManager
        ? `<div class="card-actions">
               <button class="icon-btn action-icon" onclick="event.stopPropagation(); deleteHandoverNote(${note.id})">
                   <i class="fa-solid fa-trash"></i>
               </button>
           </div>`
        : '';

    card.innerHTML = `
        <div class="card-header">
            <div>
                <div class="card-title">Note #${note.id}</div>
                <div class="card-subtitle">${new Date(note.created_at).toLocaleString()}</div>
            </div>
            <span class="badge ${note.urgency_flag || note.status}">${note.urgency_flag || note.status}</span>
        </div>
        <p>Resident ID: ${note.resident_id}</p>
        <p>Shift ID: ${note.shift_id}</p>
        ${deleteBtnHtml}
    `;
    card.addEventListener('click', () => showHandoverDetails(note));
    return card;
}

function renderResidentCard(resident) {
    const card = document.createElement('div');
    card.className = 'card clickable-card';
    const escapedName = escapeHtml(resident.name);
    const status = resident.status || 'active';
    const statusClass = status === 'active' ? 'badge-status-active' : status === 'discharged' ? 'badge-status-discharged' : 'badge-status-deceased';
    const isManager = currentUser && currentUser.role === 'manager';
    card.innerHTML = `
        <div class="card-header">
            <div>
                <div class="card-title">${escapedName}</div>
                <div class="card-subtitle">Resident #${resident.id}</div>
            </div>
            <span class="badge ${statusClass}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
        </div>
        <div class="card-actions">
            ${isManager ? `
            <button class="icon-btn action-icon" title="Edit" onclick="event.stopPropagation(); openCrudModal('resident', ${resident.id}, '${escapedName.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn action-icon" title="Change Status" onclick="event.stopPropagation(); openStatusModal(${resident.id}, '${status}')"><i class="fa-solid fa-toggle-on"></i></button>
            ` : ''}
            <button class="icon-btn action-icon" title="View Details" onclick="event.stopPropagation(); openResidentDetail(${resident.id}, '${escapedName.replace(/'/g, "\\'")}')"><i class="fa-solid fa-eye"></i></button>
        </div>
    `;
    card.addEventListener('click', () => openResidentDetail(resident.id, resident.name));
    return card;
}

function renderShiftCard(shift) {
    const card = document.createElement('div');
    card.className = 'card';

    const isoStart = shift.start_time.split('.')[0];
    const isoEnd = shift.end_time ? shift.end_time.split('.')[0] : '';

    card.innerHTML = `
        <div class="card-header">
            <div class="card-title">Shift #${shift.id}</div>
        </div>
        <p>Start: ${new Date(shift.start_time).toLocaleString()}</p>
        <p>End: ${shift.end_time ? new Date(shift.end_time).toLocaleString() : 'Ongoing'}</p>
        <div class="card-actions">
            <button class="icon-btn action-icon" onclick="openCrudModal('shift', ${shift.id}, '${isoStart}', '${isoEnd}')"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn action-icon" onclick="deleteItem('/shifts/${shift.id}', 'shifts-view')"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    return card;
}

function renderNotificationCard(notif) {
    const card = document.createElement('div');
    card.className = `card notification-card${notif.is_read ? ' notif-read' : ' notif-unread'}`;
    const urgencyClass = notif.urgency_flag === 'urgent' ? 'urgent' : 'high';
    const timeStr = new Date(notif.created_at).toLocaleString();
    card.innerHTML = `
        <div class="card-header">
            <div style="display:flex;align-items:center;gap:0.75rem;">
                <div class="notif-icon ${urgencyClass}"><i class="fa-solid fa-bell"></i></div>
                <div>
                    <div class="card-title">${escapeHtml(notif.message)}</div>
                    <div class="card-subtitle">${timeStr}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.5rem;">
                <span class="badge ${urgencyClass}">${notif.urgency_flag}</span>
                ${!notif.is_read ? `<span class="notif-dot"></span>` : ''}
            </div>
        </div>
        <div class="card-actions" style="margin-top:0.75rem;">
            ${notif.resident_id ? `<button class="btn-secondary btn-sm" onclick="event.stopPropagation(); openResidentDetail(${notif.resident_id}, 'Resident')"><i class="fa-solid fa-user"></i> View Resident</button>` : ''}
            ${!notif.is_read ? `<button class="btn-secondary btn-sm" onclick="event.stopPropagation(); markNotificationRead(${notif.id}, this.closest('.card'))"><i class="fa-solid fa-check"></i> Mark Read</button>` : `<span style="color:var(--text-muted);font-size:0.8rem;"><i class="fa-solid fa-circle-check"></i> Read</span>`}
        </div>
    `;
    return card;
}

async function markNotificationRead(id, cardEl) {
    try {
        const res = await fetchAPI(`/notifications/${id}/read`, { method: 'PATCH' });
        if (res.ok) {
            if (cardEl) {
                cardEl.classList.remove('notif-unread');
                cardEl.classList.add('notif-read');
                // Remove the dot and mark read button, add read label
                const dot = cardEl.querySelector('.notif-dot');
                if (dot) dot.remove();
                const markBtn = cardEl.querySelector('button[onclick*="markNotificationRead"]');
                if (markBtn) markBtn.outerHTML = `<span style="color:var(--text-muted);font-size:0.8rem;"><i class="fa-solid fa-circle-check"></i> Read</span>`;
            }
            updateNotificationsBadge();
        }
    } catch (e) { showToast('Failed to mark as read.', 'error'); }
}

function renderUserCard(user) {
    const card = document.createElement('div');
    card.className = 'card user-card';
    const escapedEmail = escapeHtml(user.email || '');
    const hasDistinctName = user.full_name && user.full_name.trim() && user.full_name !== user.email;
    const escapedName = hasDistinctName ? escapeHtml(user.full_name) : escapedEmail;
    const role = user.role || 'care_worker';
    const roleClass = role === 'manager' ? 'processing' : role === 'deactivated' ? 'high' : 'pending';
    const initial = (user.full_name || user.email || '#').charAt(0).toUpperCase();
    const isManager = currentUser && currentUser.role === 'manager';
    const isSelf = currentUser && currentUser.id === user.id;

    card.innerHTML = `
        <div class="user-card-top">
            <div class="user-avatar-small">${initial}</div>
            <div class="user-card-info">
                <div class="card-title user-email-truncate" title="${escapedName}">${escapedName}</div>
                ${hasDistinctName ? `<div class="card-subtitle user-email-truncate" title="${escapedEmail}">${escapedEmail}</div>` : ''}
                <div style="margin-top:0.4rem; display:flex; align-items:center; gap:0.6rem;">
                    <span class="badge ${roleClass}">${role.replace('_', ' ')}</span>
                    <span style="color:var(--text-muted); font-size:0.75rem;">ID: ${user.id}</span>
                </div>
            </div>
        </div>
        ${isManager && !isSelf ? `
        <div class="user-card-actions">
            <button class="icon-btn action-icon" title="Edit" onclick="openCrudModal('user', ${user.id}, '${escapedEmail.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${role}')"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn action-icon" title="Reset Password" onclick="resetUserPassword(${user.id})"><i class="fa-solid fa-key"></i></button>
${role === 'deactivated'
                ? `<button class="icon-btn action-icon" title="Activate" style="color:var(--success-color);" onclick="activateUser(${user.id})"><i class="fa-solid fa-user-check"></i></button>`
                : `<button class="icon-btn action-icon" title="Deactivate" onclick="deactivateUser(${user.id})"><i class="fa-solid fa-user-slash"></i></button>`
            }            <button class="icon-btn action-icon" title="Delete" style="color:var(--danger-color);" onclick="deleteUser(${user.id})"><i class="fa-solid fa-trash"></i></button>
        </div>` : ''}
    `;
    return card;
}
window.activateUser = async function (userId) {
    try {
        const res = await fetchAPI(`/users/${userId}/activate`, { method: 'PATCH' });
        if (res.ok) { showToast('User activated.', 'success'); fetchUsers(); }
        else {
            const d = await res.json().catch(() => ({}));
            showToast('Error: ' + (d.detail || 'Activation failed.'), 'error');
        }
    } catch (e) { showToast('Network error.', 'error'); }
};
// Confirm-delete with inline toast (replaces native confirm/alert)
function confirmDelete(url, viewToReload) {
    showToast('Delete this item?', 'warning', 0, [
        {
            label: 'Yes, delete', cls: 'btn-danger', action: async () => {
                try {
                    const res = await fetchAPI(url, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Deleted successfully.', 'success');
                        loadView(viewToReload, viewTitle.textContent);
                    } else {
                        const d = await res.json().catch(() => ({}));
                        showToast('Error: ' + (d.detail || 'Delete failed.'), 'error');
                    }
                } catch (e) { showToast('Network error.', 'error'); }
            }
        },
        { label: 'Cancel', cls: 'btn-secondary', action: () => { } }
    ]);
}

async function deleteItem(url, viewToReload) {
    confirmDelete(url, viewToReload);
}

// --- Generic CRUD Modal ---
window.openCrudModal = function (type, id = null, arg1 = '', arg2 = '') {
    crudModal.classList.remove('hidden');
    crudError.textContent = '';

    if (type === 'resident') {
        crudModalTitle.textContent = id ? "Edit Resident" : "Add Resident";
        crudFormBody.innerHTML = `
            <div class="input-group">
                <label>Name</label>
                <input type="text" id="crud-res-name" class="no-icon" value="${arg1}" required>
            </div>
        `;
        currentCrudAction = async () => {
            const payload = { name: document.getElementById('crud-res-name').value };
            const url = id ? `/residents/${id}` : `/residents/`;
            const method = id ? 'PUT' : 'POST';
            return { url, method, payload, reload: 'residents-view' };
        };
    }
    else if (type === 'shift') {
        crudModalTitle.textContent = id ? "Edit Shift" : "Add Shift";
        crudFormBody.innerHTML = `
            <div class="input-group">
                <label>Start Time</label>
                <input type="datetime-local" id="crud-sh-start" value="${arg1}" required>
            </div>
            <div class="input-group">
                <label>End Time (Optional)</label>
                <input type="datetime-local" id="crud-sh-end" value="${arg2}">
            </div>
        `;
        currentCrudAction = async () => {
            const endVal = document.getElementById('crud-sh-end').value;
            const payload = {
                start_time: new Date(document.getElementById('crud-sh-start').value).toISOString(),
                end_time: endVal ? new Date(endVal).toISOString() : null
            };
            const url = id ? `/shifts/${id}` : `/shifts/`;
            const method = id ? 'PUT' : 'POST';
            return { url, method, payload, reload: 'shifts-view' };
        };
    }
    else if (type === 'user') {
        // arg1 = email, arg2 = role (when editing)
        crudModalTitle.textContent = id ? "Edit Team Member" : "Add Team Member";
        crudFormBody.innerHTML = `
            <div class="input-group">
                <label>Email</label>
                <input type="email" id="crud-usr-email" class="no-icon" value="${arg1}" ${id ? 'readonly' : 'required'}>
            </div>
            ${!id ? `
            <div class="input-group">
                <label>Temporary Password</label>
                <input type="password" id="crud-usr-password" class="no-icon" required>
            </div>` : ''}
            <div class="input-group">
                <label>Role</label>
                <select id="crud-usr-role" class="no-icon">
                    <option value="care_worker" ${arg2 === 'care_worker' || !arg2 ? 'selected' : ''}>Care Worker</option>
                    <option value="manager" ${arg2 === 'manager' ? 'selected' : ''}>Manager</option>
                </select>
            </div>
        `;
        currentCrudAction = async () => {
            if (id) {
                // Edit: only role can change
                const payload = { role: document.getElementById('crud-usr-role').value };
                return { url: `/users/${id}`, method: 'PUT', payload, reload: 'users-view' };
            } else {
                // Create new staff member
                const payload = {
                    email: document.getElementById('crud-usr-email').value,
                    password: document.getElementById('crud-usr-password').value,
                    role: document.getElementById('crud-usr-role').value
                };
                return { url: `/users/`, method: 'POST', payload, reload: 'users-view' };
            }
        };
    }
};

// User management actions (manager-only)
window.deleteUser = function (userId) {
    showToast('Permanently delete this team member?', 'warning', 0, [
        {
            label: 'Yes, delete', cls: 'btn-danger', action: async () => {
                try {
                    const res = await fetchAPI(`/users/${userId}`, { method: 'DELETE' });
                    if (res.ok) { showToast('User deleted.', 'success'); fetchUsers(); }
                    else {
                        const d = await res.json().catch(() => ({}));
                        showToast('Error: ' + (d.detail || 'Delete failed.'), 'error');
                    }
                } catch (e) { showToast('Network error.', 'error'); }
            }
        },
        { label: 'Cancel', cls: 'btn-secondary', action: () => { } }
    ]);
};

window.deactivateUser = async function (userId) {
    try {
        const res = await fetchAPI(`/users/${userId}/deactivate`, { method: 'PATCH' });
        if (res.ok) { showToast('User deactivated.', 'success'); fetchUsers(); }
        else {
            const d = await res.json().catch(() => ({}));
            showToast('Error: ' + (d.detail || 'Deactivation failed.'), 'error');
        }
    } catch (e) { showToast('Network error.', 'error'); }
};

window.resetUserPassword = function (userId) {
    // Prompt for a new password via a small inline toast
    showToast('Enter new temporary password for this user, then click Reset.', 'info', 0, [
        {
            label: 'Open Reset Form', cls: 'btn-primary', action: () => {
                crudModal.classList.remove('hidden');
                crudModalTitle.textContent = 'Reset Staff Password';
                crudError.textContent = '';
                crudFormBody.innerHTML = `
                <div class="input-group">
                    <label>New Temporary Password</label>
                    <input type="password" id="crud-reset-pw" class="no-icon" required minlength="8">
                </div>
            `;
                currentCrudAction = async () => {
                    const payload = { new_password: document.getElementById('crud-reset-pw').value };
                    return { url: `/users/${userId}/reset-password`, method: 'PATCH', payload, reload: 'users-view' };
                };
            }
        },
        { label: 'Cancel', cls: 'btn-secondary', action: () => { } }
    ]);
};

closeCrud.addEventListener('click', () => crudModal.classList.add('hidden'));

crudForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentCrudAction) return;

    const btn = document.getElementById('crud-submit-btn');
    btn.disabled = true;
    crudError.textContent = '';

    try {
        const { url, method, payload, reload } = await currentCrudAction();
        const res = await fetchAPI(url, { method, body: payload });
        if (res.ok) {
            crudModal.classList.add('hidden');
            loadView(reload, viewTitle.textContent);
        } else {
            const data = await res.json();
            crudError.textContent = data.detail || "Operation failed";
        }
    } catch (err) {
        crudError.textContent = "Network Error";
    } finally {
        btn.disabled = false;
    }
});


// --- Handover Modals (Recording / Upload) ---
window.openHandoverModal = async function () {
    handoverModal.classList.remove('hidden');
    handoverError.textContent = '';
    selectedFilename.textContent = '';
    audioFileInput.value = '';
    clearRecording();

    try {
        const [rRes, sRes] = await Promise.all([fetchAPI('/residents/'), fetchAPI('/shifts/')]);
        const residents = await rRes.json();
        const shifts = await sRes.json();

        handoverResident.innerHTML = '<option value="">-- Choose Resident --</option>';
        residents.forEach(r => handoverResident.innerHTML += `<option value="${r.id}">${r.name}</option>`);

        handoverShift.innerHTML = '<option value="">-- Choose Shift --</option>';
        shifts.forEach(s => handoverShift.innerHTML += `<option value="${s.id}">Shift #${s.id} on ${new Date(s.start_time).toLocaleDateString()}</option>`);
    } catch (e) { console.error("Failed loading selects", e); }
};

closeHandover.addEventListener('click', () => {
    handoverModal.classList.add('hidden');
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
    }
});

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.handover-tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.add('hidden'));

        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-tab')).classList.remove('hidden');
    });
});

// Drag/Drop Upload
dropZone.addEventListener('click', () => audioFileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        audioFileInput.files = e.dataTransfer.files;
        selectedFilename.textContent = `Selected: ${audioFileInput.files[0].name}`;
    }
});
audioFileInput.addEventListener('change', () => {
    if (audioFileInput.files.length > 0) selectedFilename.textContent = `Selected: ${audioFileInput.files[0].name}`;
});

// Recording Logic
recordBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        // Stop recording
        mediaRecorder.stop();
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        recordStatus.textContent = "Recording stopped. Click Submit when ready.";
        clearInterval(recordingTimerInterval);
    } else {
        // Start recording
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                recordingBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(recordingBlob);
                recordPreview.src = audioUrl;
                recordPreview.classList.remove('hidden');
                clearRecordBtn.classList.remove('hidden');

                // Stop all tracks to release mic
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
            recordStatus.textContent = "Recording...";

            // Timer
            recordingSeconds = 0;
            recordTimer.textContent = "00:00";
            recordingTimerInterval = setInterval(() => {
                recordingSeconds++;
                const m = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
                const s = String(recordingSeconds % 60).padStart(2, '0');
                recordTimer.textContent = `${m}:${s}`;
            }, 1000);

            recordPreview.classList.add('hidden');
            clearRecordBtn.classList.add('hidden');

        } catch (err) {
            alert("Could not access microphone: " + err.message);
        }
    }
});

function clearRecording() {
    recordingBlob = null;
    audioChunks = [];
    recordPreview.classList.add('hidden');
    clearRecordBtn.classList.add('hidden');
    recordPreview.src = '';
    recordTimer.textContent = "00:00";
    recordStatus.textContent = "Click to Start";
    recordBtn.classList.remove('recording');
    recordBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    clearInterval(recordingTimerInterval);
}

clearRecordBtn.addEventListener('click', clearRecording);

// Handover Submit
handoverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    handoverError.textContent = '';

    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
    let audioFileToUpload = null;
    let filename = "recording.webm";

    if (activeTab === 'upload-tab') {
        if (!audioFileInput.files.length) return handoverError.textContent = "Please select an audio file.";
        audioFileToUpload = audioFileInput.files[0];
        filename = audioFileToUpload.name;
    } else {
        if (!recordingBlob) return handoverError.textContent = "Please record audio first.";
        audioFileToUpload = recordingBlob;
    }

    submitHandover.disabled = true;
    submitHandover.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading...`;

    const formData = new FormData();
    formData.append('shift_id', handoverShift.value);
    formData.append('resident_id', handoverResident.value);
    formData.append('audio', audioFileToUpload, filename);

    try {
        const res = await fetchAPI('/handover/transcribe', { method: 'POST', body: formData });
        if (res.ok) {
            handoverModal.classList.add('hidden');
            loadView('handovers-view', 'Handovers');
        } else {
            const data = await res.json();
            handoverError.textContent = data.detail || "Upload failed";
        }
    } catch (err) { handoverError.textContent = "Network Error"; }
    finally {
        submitHandover.disabled = false;
        submitHandover.innerHTML = `<i class="fa-solid fa-upload"></i> Submit Handover`;
    }
});

// --- Details Modal ---
function showHandoverDetails(note) {
    let summaryHtml = '<p class="text-muted">No summary available yet.</p>';
    if (note.summary_json) {
        summaryHtml = `<pre class="json-tree">${escapeHtml(JSON.stringify(note.summary_json, null, 2))}</pre>`;
    }

    detailsBody.innerHTML = `
        <div class="card-header">
            <div>
                <h4>Handover #${note.id}</h4>
                <p>${new Date(note.created_at).toLocaleString()}</p>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
                <button class="btn-secondary btn-sm" onclick="exportHandoverCSV(${note.id})" title="Export CSV" style="padding:0.4rem 0.8rem; font-size:0.8rem;"><i class="fa-solid fa-file-csv"></i> CSV</button>
                <button class="btn-secondary btn-sm" onclick="exportHandoverJSON(${note.id})" title="Export JSON" style="padding:0.4rem 0.8rem; font-size:0.8rem;"><i class="fa-solid fa-file-code"></i> JSON</button>
                <span class="badge ${escapeHtml(note.urgency_flag || note.status)}">${escapeHtml(note.urgency_flag || note.status)}</span>
            </div>
        </div>
        
        <div class="details-section">
            <h4>Raw Transcript</h4>
            <p>${note.raw_transcript ? escapeHtml(note.raw_transcript) : '<em>Transcription pending or failed.</em>'}</p>
        </div>

        <div class="details-section">
            <h4>Structured Summary</h4>
            ${summaryHtml}
        </div>
        
        ${note.error_message ? `<div class="details-section"><h4 class="error-text">Error</h4><p class="error-text">${escapeHtml(note.error_message)}</p></div>` : ''}
    `;

    detailsModal.classList.remove('hidden');
}

closeDetails.addEventListener('click', () => detailsModal.classList.add('hidden'));

// --- Profile Page Logic ---

// Collapsible toggle helper
function setupCollapsible(btnId, bodyId, iconId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
        const body = document.getElementById(bodyId);
        const icon = document.getElementById(iconId);
        const isOpen = !body.classList.contains('hidden');
        body.classList.toggle('hidden', isOpen);
        if (icon) icon.classList.toggle('open', !isOpen);
    });
}
setupCollapsible('toggle-change-password', 'change-password-body', 'cp-chevron');

// Change Password with confirm-password validation
document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('cp-btn');
    const err = document.getElementById('cp-error');
    const suc = document.getElementById('cp-success');
    err.textContent = ''; suc.textContent = '';

    const newPw = document.getElementById('cp-new').value;
    const confirmPw = document.getElementById('cp-confirm').value;
    if (newPw !== confirmPw) {
        err.textContent = 'New passwords do not match.';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
    try {
        const payload = {
            current_password: document.getElementById('cp-current').value,
            new_password: newPw
        };
        const res = await fetchAPI('/users/me/change-password', { method: 'PATCH', body: payload });
        if (res.ok) {
            suc.textContent = 'Password updated successfully!';
            document.getElementById('change-password-form').reset();
        } else {
            const data = await res.json();
            err.textContent = data.detail || 'Update failed';
        }
    } catch (ex) { err.textContent = 'Network error'; }
    finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-key"></i> Update Password';
    }
});

// Mark all notifications read
const markAllBtn = document.getElementById('mark-all-notifications-read-btn');
if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
        try {
            const res = await fetchAPI('/notifications/read-all', { method: 'POST' });
            if (res.ok) {
                showToast('All notifications marked as read.', 'success');
                fetchNotifications();
            }
        } catch (e) { showToast('Failed to mark all as read.', 'error'); }
    });
}

async function deleteHandoverNote(id) {
    showToast('Delete this handover note?', 'warning', 0, [
        {
            label: 'Yes, delete', cls: 'btn-danger', action: async () => {
                try {
                    const res = await fetchAPI(`/handover/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('Handover note deleted', 'success');
                        fetchHandovers(); // refresh grid in place, respects current urgency filter
                    } else {
                        let msg = 'Error deleting note';
                        try {
                            const data = await res.json();
                            msg = data.detail || msg;
                        } catch (_) { /* 204/empty body on some error paths */ }
                        showToast(msg, 'error');
                    }
                } catch (e) {
                    showToast('Network error', 'error');
                }
            }
        },
        { label: 'Cancel', cls: 'btn-secondary', action: () => { } }
    ]);
}

// --- Resident Detail View (Phase 5) ---
let currentDetailResidentId = null;
let currentDetailResidentName = '';

async function openResidentDetail(residentId, residentName) {
    const modal = document.getElementById('resident-detail-modal');
    const infoSection = document.getElementById('resident-info-section');
    const listEl = document.getElementById('resident-handovers-list');

    if (!modal) return;

    currentDetailResidentId = residentId;
    currentDetailResidentName = residentName;

    infoSection.innerHTML = `<p>Loading...</p>`;
    listEl.innerHTML = `<p>Loading handover history...</p>`;
    modal.classList.remove('hidden');

    // Fetch resident detail
    try {
        const res = await fetchAPI(`/residents/${residentId}`);
        if (res.ok) {
            const r = await res.json();
            const status = r.status || 'active';
            const statusClass = status === 'active' ? 'badge-status-active' : status === 'discharged' ? 'badge-status-discharged' : 'badge-status-deceased';
            infoSection.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                    <h3 style="color:white;">${escapeHtml(r.name)}</h3>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <button class="btn-secondary btn-sm" onclick="exportResidentHistoryCSV(${r.id}, '${escapeHtml(r.name).replace(/'/g, "\\'")}')" style="padding:0.4rem 0.8rem; font-size:0.8rem;"><i class="fa-solid fa-file-csv"></i> Export History CSV</button>
                        <span class="${statusClass}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </div>
                </div>
                <p><strong>Resident ID:</strong> ${r.id}</p>
                ${r.discharged_at ? `<p><strong>Discharged:</strong> ${new Date(r.discharged_at).toLocaleDateString()}</p>` : ''}
            `;
        } else {
            infoSection.innerHTML = `<p class="error-text">Could not load resident info.</p>`;
        }
    } catch (e) {
        infoSection.innerHTML = `<p class="error-text">Network error.</p>`;
    }

    // Fetch handovers for this resident
    try {
        const res = await fetchAPI(`/handover/?resident_id=${residentId}&limit=20`);
        if (res.ok) {
            const notes = await res.json();
            if (!notes.length) {
                listEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No handover notes yet for this resident.</p></div>`;
            } else {
                listEl.innerHTML = '';
                notes.forEach(note => {
                    const urgencyClass = note.urgency_flag === 'high' ? 'badge high' : note.urgency_flag === 'medium' ? 'badge medium' : 'badge low';
                    const item = document.createElement('div');
                    item.className = 'handover-history-item';
                    item.innerHTML = `
                        <div class="hi-meta">
                            <span style="color:var(--text-muted);font-size:0.85rem;">${new Date(note.created_at).toLocaleString()}</span>
                            <span class="${urgencyClass}">${note.urgency_flag || note.status || 'N/A'}</span>
                        </div>
                        <p style="color:var(--text-color);font-size:0.9rem;">${note.summary ? escapeHtml(note.summary).substring(0, 200) + (note.summary.length > 200 ? '…' : '') : '<em>Summary not available</em>'}</p>
                    `;
                    item.addEventListener('click', () => {
                        document.getElementById('resident-detail-modal').classList.add('hidden');
                        showHandoverDetails(note);
                    });
                    listEl.appendChild(item);
                });
            }
        } else {
            listEl.innerHTML = `<p class="error-text">Could not load handover history.</p>`;
        }
    } catch (e) {
        listEl.innerHTML = `<p class="error-text">Network error.</p>`;
    }
}

document.getElementById('close-resident-detail').addEventListener('click', () => {
    document.getElementById('resident-detail-modal').classList.add('hidden');
});
document.getElementById('resident-detail-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// --- Resident Status Modal (manager-only, Phase 1 endpoint) ---
function openStatusModal(residentId, currentStatus) {
    const options = ['active', 'discharged', 'deceased'].filter(s => s !== currentStatus);
    showToast(`Change status to:`, 'info', 0,
        options.map(s => ({
            label: s.charAt(0).toUpperCase() + s.slice(1),
            cls: s === 'deceased' ? 'btn-danger' : 'btn-secondary',
            action: async () => {
                try {
                    const res = await fetchAPI(`/residents/${residentId}/status`, {
                        method: 'PATCH',
                        body: { status: s }
                    });
                    if (res.ok) {
                        showToast(`Status updated to ${s}.`, 'success');
                        fetchResidents();
                    } else {
                        const d = await res.json().catch(() => ({}));
                        showToast('Error: ' + (d.detail || 'Update failed.'), 'error');
                    }
                } catch (e) { showToast('Network error.', 'error'); }
            }
        })).concat([{ label: 'Cancel', cls: 'btn-secondary', action: () => { } }])
    );
}

// --- Data Export Helpers ---
window.exportHandoverJSON = async function (id) {
    try {
        const res = await fetchAPI(`/handover/${id}`);
        if (!res.ok) throw new Error("Failed to fetch handover note");
        const note = await res.json();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(note, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `handover_note_${id}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast("JSON exported successfully.", "success");
    } catch (e) {
        showToast("Failed to export JSON.", "error");
    }
};

window.exportHandoverCSV = async function (id) {
    try {
        const res = await fetchAPI(`/handover/${id}`);
        if (!res.ok) throw new Error("Failed to fetch handover note");
        const note = await res.json();

        const headers = ["ID", "Shift ID", "Resident ID", "Urgency", "Status", "Raw Transcript", "Created At"];
        const row = [
            note.id,
            note.shift_id,
            note.resident_id,
            note.urgency_flag || "N/A",
            note.status,
            `"${(note.raw_transcript || "").replace(/"/g, '""')}"`,
            note.created_at
        ];

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), row.join(",")].join("\n");
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", encodeURI(csvContent));
        downloadAnchor.setAttribute("download", `handover_note_${id}.csv`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast("CSV exported successfully.", "success");
    } catch (e) {
        showToast("Failed to export CSV.", "error");
    }
};

window.exportResidentHistoryCSV = async function (residentId, residentName) {
    try {
        const res = await fetchAPI(`/handover/?resident_id=${residentId}&limit=100`);
        if (!res.ok) throw new Error("Failed to fetch history");
        const notes = await res.json();

        const headers = ["ID", "Created At", "Urgency", "Status", "Summary", "Raw Transcript"];
        const rows = notes.map(note => [
            note.id,
            note.created_at,
            note.urgency_flag || "N/A",
            note.status,
            `"${(note.summary || "").replace(/"/g, '""')}"`,
            `"${(note.raw_transcript || "").replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", encodeURI(csvContent));
        downloadAnchor.setAttribute("download", `resident_${residentId}_history.csv`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast("History CSV exported successfully.", "success");
    } catch (e) {
        showToast("Failed to export history CSV.", "error");
    }
};