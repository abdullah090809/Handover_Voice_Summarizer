import React, { useCallback, useEffect, useState } from 'react';
import { Plus, UserCog, MoreVertical, Ban, CheckCircle2, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { userApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { Avatar } from '../components/States.jsx';
import { RoleBadge } from '../components/Badge.jsx';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import UserFormModal from '../components/UserFormModal.jsx';
import { formatDate } from '../lib/format.js';

export default function TeamPage() {
  const { user: me } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();

  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [formUser, setFormUser] = useState(undefined);
  const [openMenuId, setOpenMenuId] = useState(null);

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
        showToast(`${u.email} reactivated.`, 'success');
      } else {
        await userApi.deactivate(u.id);
        showToast(`${u.email} deactivated.`, 'success');
      }
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update this account.', 'error');
    }
  }

  async function handleDelete(u) {
    const ok = await confirm({
      title: `Remove ${u.email}?`,
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
    const newPassword = window.prompt(`Set a new password for ${u.email} (min. 8 characters):`);
    if (!newPassword) return;
    if (newPassword.length < 8) return showToast('Password must be at least 8 characters.', 'error');
    try {
      await userApi.resetPassword(u.id, newPassword);
      showToast('Password reset.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not reset the password.', 'error');
    }
  }

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
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Team member</th>
                <th>Role</th>
                <th>Joined</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <Avatar text={u.email} size="sm" />
                      {u.email}
                      {u.id === me.id && <span className="badge badge-info">You</span>}
                    </div>
                  </td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{formatDate(u.created_at)}</td>
                  <td style={{ textAlign: 'right', position: 'relative' }}>
                    <button className="icon-btn" aria-label="Actions" onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}>
                      <MoreVertical size={16} />
                    </button>
                    {openMenuId === u.id && (
                      <ActionMenu
                        onClose={() => setOpenMenuId(null)}
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

function ActionMenu({ items, onClose }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={onClose} />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: '110%',
          background: 'var(--surface-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 61,
          minWidth: 180,
          overflow: 'hidden',
          textAlign: 'left',
        }}
      >
        {items.map((item, i) => (
          <button
            key={i}
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
      </div>
    </>
  );
}
