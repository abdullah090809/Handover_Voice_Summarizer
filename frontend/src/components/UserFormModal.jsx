import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { Field, IconInput } from './Field.jsx';
import { Mail, Lock, UserRound } from 'lucide-react';
import { userApi, ApiError } from '../lib/api.js';

export default function UserFormModal({ user, onClose, onSaved }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [role, setRole] = useState(user?.role || 'care_worker');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(user);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email) return setError('Enter an email address.');
    if (!isEdit && (!password || password.length < 8)) return setError('Password must be at least 8 characters.');
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        const payload = { email, role, name: name.trim() || null };
        if (password) payload.password = password;
        await userApi.update(user.id, payload);
      } else {
        await userApi.create({ email, password, role, name: name.trim() || null });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this team member.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit team member' : 'Add team member'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : isEdit ? 'Save changes' : 'Add member'}
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Full name" htmlFor="user-name" optional>
          <IconInput icon={UserRound} id="user-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email address" htmlFor="user-email">
          <IconInput icon={Mail} id="user-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role" htmlFor="user-role">
          <select id="user-role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="care_worker">Care Staff</option>
            <option value="manager">Manager</option>
          </select>
        </Field>
        <Field label={isEdit ? 'New password' : 'Password'} htmlFor="user-password" optional={isEdit} hint="Minimum 8 characters">
          <IconInput icon={Lock} id="user-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <div className="form-error-banner">{error}</div>}
      </form>
    </Modal>
  );
}