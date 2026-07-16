import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import Modal from './Modal.jsx';
import { Field, IconInput } from './Field.jsx';
import { userApi, ApiError } from '../lib/api.js';

export default function ChangePasswordModal({ onClose, onSuccess }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
        if (newPassword !== confirmPassword) return setError('New passwords do not match.');
        setSaving(true);
        try {
            await userApi.changePassword(currentPassword, newPassword);
            onSuccess();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not update your password.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title="Change password"
            subtitle="Use a password you don't use anywhere else."
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>
                        {saving ? <span className="spinner" /> : 'Update password'}
                    </button>
                </>
            }
        >
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Field label="Current password" htmlFor="cur-pass">
                    <IconInput icon={Lock} id="cur-pass" type="password" required autoFocus value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                </Field>
                <Field label="New password" htmlFor="new-pass" hint="Minimum 8 characters">
                    <IconInput icon={Lock} id="new-pass" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </Field>
                <Field label="Confirm new password" htmlFor="confirm-pass">
                    <IconInput icon={Lock} id="confirm-pass" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </Field>
                {error && <div className="form-error-banner">{error}</div>}
            </form>
        </Modal>
    );
}