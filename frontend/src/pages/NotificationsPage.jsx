import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, TriangleAlert } from 'lucide-react';
import { notificationApi, handoverApi, ApiError } from '../lib/api.js';
import { useToast } from '../lib/ToastContext.jsx';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';
import { EmptyState, ErrorState } from '../components/States.jsx';
import { UrgencyBadge } from '../components/Badge.jsx';
import HandoverDetailModal from '../components/HandoverDetailModal.jsx';
import { formatRelative } from '../lib/format.js';

export default function NotificationsPage() {
  const showToast = useToast();
  const { subscribe, refreshUnreadCount } = useLiveUpdates();

  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [openNote, setOpenNote] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await notificationApi.list(100);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load alerts.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => subscribe((event) => {
    if (event.type === 'notification') load();
  }), [subscribe, load]);

  async function markRead(n) {
    if (n.is_read) return;
    try {
      await notificationApi.markRead(n.id);
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      refreshUnreadCount();
    } catch (err) {
      /* silent */
    }
  }

  async function markAllRead() {
    try {
      await notificationApi.markAllRead();
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      refreshUnreadCount();
      showToast('All alerts marked as read.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update alerts.', 'error');
    }
  }

  async function openHandoverNote(n) {
    if (!n.handover_note_id) return;
    try {
      const note = await handoverApi.get(n.handover_note_id);
      setOpenNote(note);
    } catch (err) {
      showToast('That handover note is no longer available.', 'error');
    }
  }

  const unreadCount = items?.filter((n) => !n.is_read).length || 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>Urgent handovers and resident status changes across your care home.</p>
        </div>
        {unreadCount > 0 && (
          <div className="page-header-actions">
            <button className="btn btn-secondary" onClick={markAllRead}>
              <CheckCheck size={16} /> Mark all read
            </button>
          </div>
        )}
      </div>

      {items === null && !error && (
        <div className="card-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="skeleton-card" key={i}>
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-line" style={{ width: '85%' }} />
            </div>
          ))}
        </div>
      )}
      {error && <ErrorState message={error} onRetry={load} />}
      {items !== null && items.length === 0 && <EmptyState icon={Bell} title="No alerts" message="Urgent handovers and resident status changes will appear here." />}

      {items !== null && items.length > 0 && (
        <div className="panel">
          <div className="panel-body no-pad">
            {items.map((n) => (
              <div
                key={n.id}
                className="list-row"
                style={{
                  borderRadius: 0,
                  borderBottom: '1px solid var(--border-subtle)',
                  background: n.is_read ? 'transparent' : 'var(--teal-50)',
                  cursor: n.handover_note_id ? 'pointer' : 'default',
                }}
                onClick={() => {
                  markRead(n);
                  openHandoverNote(n);
                }}
              >
                <span className="list-row-icon" style={n.urgency_flag === 'urgent' || n.urgency_flag === 'high' ? { background: 'var(--urgency-high-bg)', color: 'var(--urgency-high)' } : undefined}>
                  <TriangleAlert />
                </span>
                <span className="list-row-body">
                  <span className="list-row-title" style={{ fontWeight: n.is_read ? 500 : 700 }}>
                    {n.message}
                  </span>
                  <span className="list-row-meta">{formatRelative(n.created_at)}</span>
                </span>
                <span className="list-row-side">
                  <UrgencyBadge urgency={n.urgency_flag} />
                  {!n.is_read && <span className="icon-btn-dot" style={{ position: 'static' }} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {openNote && <HandoverDetailModal note={openNote} canDelete={false} onClose={() => setOpenNote(null)} />}
    </>
  );
}
