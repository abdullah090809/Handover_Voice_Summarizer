import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, UserCog, MoreVertical, Ban, CheckCircle2, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { userApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { Avatar } from '../components/States.jsx';
import { RoleBadge } from '../components/Badge.jsx';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import UserFormModal from '../components/UserFormModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../lib/usePagination.js';
import { formatDate, displayName } from '../lib/format.js';

export default function TeamPage() {
  const { user: me } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [formUser, setFormUser] = useState(undefined);
  const [openMenu, setOpenMenu] = useState(null); // { userId, rect }

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await userApi.list();
      setUsers(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the team.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(u) {
    try {
      if (u.role === 'deactivated') {
        await userApi.activate(u.id);
        showToast(`${displayName(u)} reactivated.`, 'success');
      } else {
        await userApi.deactivate(u.id);
        showToast(`${displayName(u)} deactivated.`, 'success');
      }
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update this account.', 'error');
    }
  }

  async function handleDelete(u) {
    const ok = await confirm({
      title: `Remove ${displayName(u)}?`,
      message: 'This permanently deletes their account. Consider deactivating instead if they may return.',
      confirmLabel: 'Delete account',
    });
    if (!ok) return;
    try {
      await userApi.remove(u.id);
      showToast('Team member removed.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not remove this account.', 'error');
    }
  }

  async function handleResetPassword(u) {
    const newPassword = window.prompt(`Set a new password for ${displayName(u)} (min. 8 characters):`);
    if (!newPassword) return;
    if (newPassword.length < 8) return showToast('Password must be at least 8 characters.', 'error');
    try {
      await userApi.resetPassword(u.id, newPassword);
      showToast('Password reset.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not reset the password.', 'error');
    }
  }

  const { pageItems, page, pageCount, total, setPage } = usePagination(users || [], { pageSize: 10 });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p>Manage staff accounts, roles, and access.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setFormUser(null)}>
            <Plus size={16} /> Add team member
          </button>
        </div>
      </div>

      {users === null && !error && <SkeletonGrid />}
      {error && <ErrorState message={error} onRetry={load} />}
      {users !== null && users.length === 0 && <EmptyState icon={UserCog} title="No team members yet" message="Add staff accounts to get started." />}

      {users !== null && users.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Role</th>
                  <th>Assigned</th>
                  <th>Joined</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((u) => (
                  <tr key={u.id} className="row-clickable" onClick={() => navigate(u.role === 'manager' ? `/managers/${u.id}` : `/team/${u.id}`)}>
                    <td data-label="Team member">
                      <div className="team-member-row">
                        <Avatar text={displayName(u)} size="sm" />
                        <div className="team-member-info">
                          <div className="team-member-name" style={{ fontWeight: u.name ? 600 : 400 }}>{displayName(u)}</div>
                          {u.name && <div className="team-member-email" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{u.email}</div>}
                        </div>
                        {u.id === me.id && <span className="badge badge-info team-member-you">You</span>}
                      </div>
                    </td>
                    <td data-label="Role">
                      <RoleBadge role={u.role} />
                    </td>
                    <td data-label="Assigned" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {u.role === 'manager'
                        ? `${u.care_workers_managed_count} care worker${u.care_workers_managed_count === 1 ? '' : 's'}`
                        : u.role === 'care_worker'
                          ? `${u.residents_overseen_count} resident${u.residents_overseen_count === 1 ? '' : 's'}`
                          : '—'}
                    </td>
                    <td data-label="Joined" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{formatDate(u.created_at)}</td>
                    <td data-label="" style={{ textAlign: 'right' }}>
                      <button
                        className="icon-btn"
                        aria-label="Actions"
                        data-menu-trigger
                        onClick={(e) => {
                          e.stopPropagation();
                          if (openMenu?.userId === u.id) {
                            setOpenMenu(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setOpenMenu({ userId: u.id, rect });
                          }
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openMenu?.userId === u.id && (
                        <ActionMenu
                          anchorRect={openMenu.rect}
                          onClose={() => setOpenMenu(null)}
                          items={[
                            { label: 'Edit', icon: Pencil, onClick: () => setFormUser(u) },
                            { label: 'Reset password', icon: KeyRound, onClick: () => handleResetPassword(u) },
                            u.role === 'deactivated'
                              ? { label: 'Reactivate', icon: CheckCircle2, onClick: () => toggleActive(u), disabled: u.id === me.id }
                              : { label: 'Deactivate', icon: Ban, onClick: () => toggleActive(u), disabled: u.id === me.id },
                            { label: 'Delete', icon: Trash2, onClick: () => handleDelete(u), danger: true, disabled: u.id === me.id },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={10} onPageChange={setPage} itemLabel="team members" />
        </>
      )}

      {formUser !== undefined && (
        <UserFormModal
          user={formUser}
          onClose={() => setFormUser(undefined)}
          onSaved={() => {
            setFormUser(undefined);
            showToast(formUser ? 'Team member updated.' : 'Team member added.', 'success');
            load();
          }}
        />
      )}
    </>
  );
}

function ActionMenu({ items, anchorRect, onClose }) {
  const menuRef = useRef(null);
  // Below 640px the floating dropdown (a 190px box pinned near a 44px tap
  // target) reads as a cramped desktop leftover, not a mobile pattern --
  // it's easy to mis-tap the row next to your thumb, and it visually
  // collides with the "Team member" card content right above it. Below
  // that width we instead render a full-width bottom sheet, matching the
  // app's existing mobile-overlay convention (see .mobile-search-overlay).
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 640);

  useEffect(() => {
    function onDocClick(e) {
      if (e.target.closest && e.target.closest('[data-menu-trigger]')) return;
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    function onResize() {
      setIsMobile(window.innerWidth <= 640);
      onClose();
    }
    function onScroll() {
      onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Bottom sheet locks page scroll behind it while open, same as the
  // mobile search overlay.
  useEffect(() => {
    if (isMobile && anchorRect) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobile, anchorRect]);

  if (!anchorRect) return null;

  if (isMobile) {
    return createPortal(
      <div className="mobile-action-sheet-scrim" onClick={onClose}>
        <div ref={menuRef} className="mobile-action-sheet" role="menu" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-action-sheet-handle" />
          {items.map((item, i) => (
            <button
              key={i}
              role="menuitem"
              className={`mobile-action-sheet-item${item.danger ? ' danger' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onClick();
              }}
            >
              <item.icon size={18} /> {item.label}
            </button>
          ))}
          <button className="mobile-action-sheet-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const menuWidth = 190;
  // Keep the menu on-screen: align to the button's right edge, flip left if
  // it would overflow, and drop below the button (or above it, if there
  // isn't room underneath).
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const openUpward = spaceBelow < 220;

  const style = {
    position: 'fixed',
    left: Math.max(8, Math.min(anchorRect.right - menuWidth, window.innerWidth - menuWidth - 8)),
    top: openUpward ? undefined : anchorRect.bottom + 6,
    bottom: openUpward ? window.innerHeight - anchorRect.top + 6 : undefined,
    width: menuWidth,
    background: 'var(--surface-card)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 1100,
    overflow: 'hidden',
    textAlign: 'left',
  };

  return createPortal(
    <div ref={menuRef} style={style} role="menu" onClick={(e) => e.stopPropagation()}>
      {items.map((item, i) => (
        <button
          key={i}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onClick();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            width: '100%',
            padding: 'var(--space-3) var(--space-4)',
            background: 'none',
            border: 'none',
            cursor: item.disabled ? 'not-allowed' : 'pointer',
            opacity: item.disabled ? 0.45 : 1,
            fontSize: 'var(--text-sm)',
            color: item.danger ? 'var(--urgency-high)' : 'var(--text-primary)',
            textAlign: 'left',
          }}
        >
          <item.icon size={15} /> {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}