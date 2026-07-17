import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Users,
  TriangleAlert,
  ListChecks,
  Bell,
  Clock3,
  UserCog,
  FileAudio,
  ChevronRight,
  CalendarClock,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { handoverApi, residentApi, shiftApi, notificationApi, ApiError } from '../lib/api.js';
import { UrgencyBadge } from '../components/Badge.jsx';
import { EmptyState } from '../components/States.jsx';
import { formatRelative, formatDateTime, firstName } from '../lib/format.js';
import NewHandoverModal from '../components/NewHandoverModal.jsx';
import HandoverDetailModal from '../components/HandoverDetailModal.jsx';

export default function DashboardPage() {
  const { user, isManager } = useAuth();
  const navigate = useNavigate();

  const [handovers, setHandovers] = useState(null);
  const [residents, setResidents] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [openNote, setOpenNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [handoverData, residentData] = await Promise.all([handoverApi.list({ limit: 30 }), residentApi.list(false)]);
        if (cancelled) return;
        setHandovers(handoverData);
        setResidents(residentData);
        shiftApi.list().then((s) => !cancelled && setShifts(s)).catch(() => { });
        if (isManager) {
          notificationApi.list(50).then((n) => !cancelled && setNotifications(n)).catch(() => { });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load your dashboard.');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  const residentMap = useMemo(() => Object.fromEntries(residents.map((r) => [r.id, r.name])), [residents]);

  const recentHandovers = handovers?.slice(0, 6) || [];
  const urgentHandovers = (handovers || []).filter((n) => n.urgency_flag === 'high' || n.urgency_flag === 'urgent').slice(0, 5);
  const followUps = (handovers || [])
    .filter((n) => n.status === 'complete' && n.summary_json?.follow_up_actions?.length)
    .flatMap((n) => n.summary_json.follow_up_actions.map((action) => ({ action, note: n })))
    .slice(0, 6);

  const currentShift = shifts.find((s) => {
    const now = Date.now();
    const start = new Date(s.start_time).getTime();
    const end = s.end_time ? new Date(s.end_time).getTime() : null;
    return start <= now && (!end || end > now);
  });
  const nextShift = shifts
    .filter((s) => new Date(s.start_time).getTime() > Date.now())
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

  const unreadAlerts = notifications.filter((n) => !n.is_read).length;
  const activeResidents = residents.filter((r) => r.status === 'active');

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Welcome back{user ? `, ${firstName(user)}` : ''}</h1>
          <p>{isManager ? "Here's what's happening across your care home today." : "Here's your shift overview."}</p>
        </div>
      </div>

      <div className="stat-row">
        {isManager ? (
          <>
            <StatCard icon={Users} label="Active residents" value={activeResidents.length} tone="default" />
            <StatCard icon={TriangleAlert} label="Urgent handovers (recent)" value={urgentHandovers.length} tone="high" />
            <StatCard icon={Bell} label="Unread alerts" value={unreadAlerts} tone="medium" />
            <StatCard icon={FileAudio} label="Handovers on record" value={handovers?.length ?? '—'} tone="info" />
          </>
        ) : (
          <>
            <StatCard
              icon={Clock3}
              label="Current shift"
              value={currentShift ? 'On shift' : 'Off shift'}
              tone={currentShift ? 'default' : 'info'}
            />
            <StatCard icon={Users} label="Active residents" value={activeResidents.length} tone="default" />
            <StatCard icon={FileAudio} label="Your recent handovers" value={handovers?.length ?? '—'} tone="info" />
            <StatCard icon={ListChecks} label="Open follow-ups" value={followUps.length} tone="medium" />
          </>
        )}
      </div>

      <div className="dash-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="panel">
            <div className="panel-header">
              <h3>Recent handovers</h3>
              <button className="panel-link" onClick={() => navigate('/handovers', { viewTransition: true })}>
                View all
              </button>
            </div>
            <div className="panel-body">
              {handovers === null && !error && <SkeletonRows />}
              {error && <p style={{ padding: 'var(--space-4)', color: 'var(--urgency-high)', fontSize: 'var(--text-sm)' }}>{error}</p>}
              {handovers !== null && recentHandovers.length === 0 && (
                <EmptyState icon={FileAudio} title="No handovers yet" message="Recent handover notes will show up here." />
              )}
              {recentHandovers.map((n) => (
                <div className="list-row" key={n.id} onClick={() => setOpenNote(n)} role="button" tabIndex={0}>
                  <span className="list-row-icon">
                    <FileAudio />
                  </span>
                  <span className="list-row-body">
                    <span className="list-row-title">{residentMap[n.resident_id] || `Resident #${n.resident_id}`}</span>
                    <span className="list-row-meta">{formatRelative(n.created_at)}</span>
                  </span>
                  <span className="list-row-side">
                    {n.status === 'complete' ? <UrgencyBadge urgency={n.urgency_flag} /> : <span className="badge badge-info">{n.status}</span>}
                    <ChevronRight size={15} color="var(--text-tertiary)" />
                  </span>
                </div>
              ))}
            </div>
          </div>

          {isManager && (
            <div className="panel">
              <div className="panel-header">
                <h3>Residents needing attention</h3>
                <button className="panel-link" onClick={() => navigate('/residents', { viewTransition: true })}>
                  View residents
                </button>
              </div>
              <div className="panel-body">
                {urgentHandovers.length === 0 && (
                  <EmptyState icon={TriangleAlert} title="Nothing urgent" message="High and urgent handovers will surface here." />
                )}
                {urgentHandovers.map((n) => (
                  <div className="list-row" key={n.id} onClick={() => setOpenNote(n)} role="button" tabIndex={0}>
                    <span className="list-row-icon" style={{ background: 'var(--urgency-high-bg)', color: 'var(--urgency-high)' }}>
                      <TriangleAlert />
                    </span>
                    <span className="list-row-body">
                      <span className="list-row-title">{residentMap[n.resident_id] || `Resident #${n.resident_id}`}</span>
                      <span className="list-row-meta">{truncate(n.summary_json?.summary, 80)}</span>
                    </span>
                    <span className="list-row-side">
                      <UrgencyBadge urgency={n.urgency_flag} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isManager && (
            <div className="panel">
              <div className="panel-header">
                <h3>Outstanding follow-ups</h3>
              </div>
              <div className="panel-body">
                {followUps.length === 0 && <EmptyState icon={ListChecks} title="All caught up" message="Follow-up actions from your handovers will appear here." />}
                {followUps.map((f, i) => (
                  <div className="list-row" key={i} onClick={() => setOpenNote(f.note)} role="button" tabIndex={0}>
                    <span className="list-row-icon">
                      <ListChecks />
                    </span>
                    <span className="list-row-body">
                      <span className="list-row-title">{f.action}</span>
                      <span className="list-row-meta">
                        {residentMap[f.note.resident_id] || `Resident #${f.note.resident_id}`} &middot; {formatRelative(f.note.created_at)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="panel">
            <div className="panel-header">
              <h3>Quick actions</h3>
            </div>
            <div className="panel-body" style={{ padding: 'var(--space-4)' }}>
              <div className="quick-actions">
                {!isManager && (
                  <button className="quick-action-btn" onClick={() => setShowNewModal(true)}>
                    <Plus />
                    <span className="quick-action-text">
                      <strong>New handover</strong>
                      <span>Record or upload audio</span>
                    </span>
                  </button>
                )}
                {isManager && (
                  <button className="quick-action-btn" onClick={() => navigate('/residents', { viewTransition: true })}>
                    <Users />
                    <span className="quick-action-text">
                      <strong>Add resident</strong>
                      <span>Register a new resident</span>
                    </span>
                  </button>
                )}
                {isManager && (
                  <button className="quick-action-btn" onClick={() => navigate('/team', { viewTransition: true })}>
                    <UserCog />
                    <span className="quick-action-text">
                      <strong>Manage team</strong>
                      <span>Add or update staff</span>
                    </span>
                  </button>
                )}
                {!isManager && (
                  <button className="quick-action-btn" onClick={() => navigate('/shifts', { viewTransition: true })}>
                    <Clock3 />
                    <span className="quick-action-text">
                      <strong>Log a shift</strong>
                      <span>Record your working hours</span>
                    </span>
                  </button>
                )}
                <button className="quick-action-btn" onClick={() => navigate('/residents', { viewTransition: true })}>
                  <Users />
                  <span className="quick-action-text">
                    <strong>View residents</strong>
                    <span>{activeResidents.length} active</span>
                  </span>
                </button>
                {isManager && (
                  <button className="quick-action-btn" onClick={() => navigate('/notifications', { viewTransition: true })}>
                    <Bell />
                    <span className="quick-action-text">
                      <strong>Review alerts</strong>
                      <span>{unreadAlerts} unread</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {!isManager && (
            <div className="panel">
              <div className="panel-header">
                <h3>Your shift</h3>
              </div>
              <div className="panel-body" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                {currentShift ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <span className="badge badge-active" style={{ width: 'fit-content' }}>
                      Ongoing
                    </span>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      Started {formatDateTime(currentShift.start_time)}
                    </div>
                  </div>
                ) : nextShift ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <span
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}
                    >
                      <CalendarClock size={15} /> Next shift {formatDateTime(nextShift.start_time)}
                    </span>
                  </div>
                ) : (
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>No upcoming shifts logged.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <NewHandoverModal
          residents={activeResidents}
          shifts={shifts}
          onClose={() => setShowNewModal(false)}
          onSubmitted={() => {
            setShowNewModal(false);
            handoverApi.list({ limit: 30 }).then(setHandovers);
          }}
        />
      )}
      {openNote && <HandoverDetailModal note={openNote} residentName={residentMap[openNote.resident_id]} canDelete={false} onClose={() => setOpenNote(null)} />}
    </>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <div className={`stat-card-icon ${tone !== 'default' ? `tone-${tone}` : ''}`}>
          <Icon />
        </div>
      </div>
      <strong>{value}</strong>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-2)' }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{ height: 44, width: '100%' }} />
      ))}
    </div>
  );
}

function truncate(text, n) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n).trim() + '…' : text;
}