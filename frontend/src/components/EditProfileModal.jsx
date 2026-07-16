import React, { useState } from 'react';
import { UserRound, AtSign, Phone, Briefcase, FileText } from 'lucide-react';
import Modal from './Modal.jsx';
import { Field, IconInput } from './Field.jsx';
import { userApi, ApiError } from '../lib/api.js';

export default function EditProfileModal({ user, onClose, onSuccess }) {
    const [name, setName] = useState(user?.name || '');
    const [username, setUsername] = useState(user?.username || '');
    const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '');
    const [jobTitle, setJobTitle] = useState(user?.job_title || '');
    const [bio, setBio] = useState(user?.bio || '');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
            setError('Username must be 3-30 characters, letters, numbers, "." or "_" only.');
            return;
        }
        setSaving(true);
        try {
            await userApi.updateMe({
                name: name.trim() || null,
                username: username.trim(),
                phone_number: phoneNumber.trim() || null,
                job_title: jobTitle.trim() || null,
                bio: bio.trim() || null,
            });
            onSuccess();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not update your profile.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title="Edit profile"
            subtitle="This is shown to your team on handovers and shifts."
            footer={
                <>
                    <button className="btn btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>
                        {saving ? <span className="spinner" /> : 'Save changes'}
                    </button>
                </>
            }
        >
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <Field label="Full name" htmlFor="edit-name" optional>
                    <IconInput icon={UserRound} id="edit-name" type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Username" htmlFor="edit-username" hint="3-30 characters: letters, numbers, . or _">
                    <IconInput icon={AtSign} id="edit-username" type="text" value={username} onChange={(e) => setUsername(e.target.value.trim())} />
                </Field>
                <Field label="Job title" htmlFor="edit-job-title" optional hint="e.g. Senior Care Worker, Registered Manager">
                    <IconInput icon={Briefcase} id="edit-job-title" type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
                </Field>
                <Field label="Phone number" htmlFor="edit-phone" optional>
                    <IconInput icon={Phone} id="edit-phone" type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                </Field>
                <Field label="Bio" htmlFor="edit-bio" optional hint="A short note about yourself, visible to your team">
                    <div className="input-icon-wrap">
                        <FileText className="field-icon" />
                        <textarea
                            id="edit-bio"
                            className="textarea"
                            rows={3}
                            maxLength={1000}
                            style={{ paddingLeft: 'calc(var(--space-3) * 2 + 17px)' }}
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                        />
                    </div>
                </Field>
                {error && <div className="form-error-banner">{error}</div>}
            </form>
        </Modal>
    );
}