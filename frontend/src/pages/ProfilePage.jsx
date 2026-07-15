import React, { useState } from 'react';
import { Mail, Shield, CalendarDays, Lock, LogOut } from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { userApi, ApiError } from '../lib/api.js';
import { useToast } from '../lib/ToastContext.jsx';
import { Avatar } from '../components/States.jsx';
import { RoleBadge } from '../components/Badge.jsx';
import { Field, IconInput } from '../components/Field.jsx';
import { formatDate } from '../lib/format.js';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const showToast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    setSaving(true);
    try {
      await userApi.changePassword(currentPassword, newPassword);
      showToast('Password updated.', 'success');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update your password.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>Your account details and security settings.</p>
        </div>
      </div>

      <div className="profile-hero">
        <Avatar text={user.email} size="lg" />
        <div className="profile-hero-info">
          <h2>{user.email}</h2>
          <p>Team member since {formatDate(user.created_at)}</p>
          <div className="tag-strip">
            <RoleBadge role={user.role} />
          </div>
        </div>
      </div>

      <div className="profile-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Account details</h3>
          </div>
          <div className="panel-body" style={{ padding: 'var(--space-2) var(--space-5) var(--space-4)' }}>
            <div className="info-row">
              <span className="info-row-label">
                <Mail /> Email
              </span>
              <span className="info-row-value">{user.email}</span>
            </div>
            <div className="info-row">
              <span className="info-row-label">
                <Shield /> Role
              </span>
              <span className="info-row-value">{user.role}</span>
            </div>
            <div className="info-row">
              <span className="info-row-label">
                <CalendarDays /> Member since
              </span>
              <span className="info-row-value">{formatDate(user.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Change password</h3>
          </div>
          <form className="panel-body" style={{ padding: 'var(--space-4) var(--space-5) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }} onSubmit={onSubmit}>
            <Field label="Current password" htmlFor="cur-pass">
              <IconInput icon={Lock} id="cur-pass" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="New password" htmlFor="new-pass" hint="Minimum 8 characters">
              <IconInput icon={Lock} id="new-pass" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            {error && <div className="form-error-banner">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : 'Update password'}
            </button>
          </form>
        </div>
      </div>

      <button className="btn btn-secondary" style={{ width: 'fit-content' }} onClick={logout}>
        <LogOut size={16} /> Sign out
      </button>
    </>
  );
}
