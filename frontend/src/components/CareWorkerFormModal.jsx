import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { Field, IconInput } from './Field.jsx';
import {
    BadgeCheck,
    Cake,
    MapPin,
    Briefcase,
    Building2,
    Clock,
    CalendarDays,
    UserRound,
    Phone,
} from 'lucide-react';
import { userApi, ApiError } from '../lib/api.js';

const EMPTY = {
    employee_id: '',
    date_of_birth: '',
    gender: '',
    home_address: '',
    job_title: '',
    employment_type: '',
    department: '',
    shift_pattern: '',
    employment_status: 'active',
    join_date: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
};

// Free-text fields that come back from the API as `null` need to become ''
// for controlled inputs.
function toFormState(user) {
    if (!user) return { ...EMPTY };
    const next = { ...EMPTY };
    for (const key of Object.keys(EMPTY)) {
        next[key] = user[key] ?? (key === 'employment_status' ? 'active' : '');
    }
    return next;
}

// Converts '' back to null for optional fields so we don't send empty
// strings where the backend expects null.
function toPayload(form) {
    const payload = { ...form };
    for (const key of Object.keys(payload)) {
        if (payload[key] === '') payload[key] = null;
    }
    return payload;
}

/**
 * Edits the extended Stage 3 "Care Worker profile" fields (employment info,
 * personal info, emergency contact) for a team member. Account essentials
 * (email, username, password, role) live in UserFormModal instead -- those
 * are a distinct concern from the HR-facing profile fields this modal
 * covers, same split of responsibilities as Resident's create-vs-edit flow.
 */
export default function CareWorkerFormModal({ user, onClose, onSaved }) {
    const [form, setForm] = useState(() => toFormState(user));
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    function set(key) {
        return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
    }

    async function onSubmit(e) {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            await userApi.update(user.id, toPayload(form));
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not save this profile.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            size="xl"
            title="Edit care worker profile"
            subtitle="Employment, personal, and emergency contact details."
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
            <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                <div className="detail-section">
                    <div className="detail-section-title">Basic information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
                        <Field label="Employee ID" htmlFor="cw-employee-id" optional hint="Auto-generated if left blank">
                            <IconInput icon={BadgeCheck} id="cw-employee-id" value={form.employee_id} onChange={set('employee_id')} autoFocus />
                        </Field>
                        <Field label="Date of birth" htmlFor="cw-dob" optional>
                            <IconInput icon={Cake} id="cw-dob" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
                        </Field>
                        <Field label="Gender" htmlFor="cw-gender" optional>
                            <select id="cw-gender" className="select" value={form.gender} onChange={set('gender')}>
                                <option value="">Not specified</option>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                                <option value="non_binary">Non-binary</option>
                                <option value="other">Other</option>
                            </select>
                        </Field>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <Field label="Home address" htmlFor="cw-address" optional>
                                <IconInput icon={MapPin} id="cw-address" value={form.home_address} onChange={set('home_address')} />
                            </Field>
                        </div>
                    </div>
                </div>

                <div className="detail-section">
                    <div className="detail-section-title">Employment information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
                        <Field label="Job title" htmlFor="cw-job-title" optional hint="e.g. Senior Care Worker">
                            <IconInput icon={Briefcase} id="cw-job-title" value={form.job_title} onChange={set('job_title')} />
                        </Field>
                        <Field label="Employment type" htmlFor="cw-employment-type" optional>
                            <select id="cw-employment-type" className="select" value={form.employment_type} onChange={set('employment_type')}>
                                <option value="">Not specified</option>
                                <option value="full_time">Full-time</option>
                                <option value="part_time">Part-time</option>
                                <option value="bank">Bank</option>
                                <option value="agency">Agency</option>
                                <option value="volunteer">Volunteer</option>
                            </select>
                        </Field>
                        <Field label="Department / Ward" htmlFor="cw-department" optional>
                            <IconInput icon={Building2} id="cw-department" value={form.department} onChange={set('department')} />
                        </Field>
                        <Field label="Shift pattern" htmlFor="cw-shift-pattern" optional hint="e.g. Days, Nights, Rotating">
                            <IconInput icon={Clock} id="cw-shift-pattern" value={form.shift_pattern} onChange={set('shift_pattern')} />
                        </Field>
                        <Field label="Employment status" htmlFor="cw-employment-status" optional>
                            <select id="cw-employment-status" className="select" value={form.employment_status} onChange={set('employment_status')}>
                                <option value="active">Active</option>
                                <option value="on_leave">On leave</option>
                                <option value="suspended">Suspended</option>
                                <option value="left">Left</option>
                            </select>
                        </Field>
                        <Field label="Join date" htmlFor="cw-join-date" optional>
                            <IconInput icon={CalendarDays} id="cw-join-date" type="date" value={form.join_date} onChange={set('join_date')} />
                        </Field>
                    </div>
                </div>

                <div className="detail-section">
                    <div className="detail-section-title">Emergency contact</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
                        <Field label="Contact name" htmlFor="cw-ec-name" optional>
                            <IconInput icon={UserRound} id="cw-ec-name" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} />
                        </Field>
                        <Field label="Relationship" htmlFor="cw-ec-rel" optional>
                            <IconInput icon={UserRound} id="cw-ec-rel" value={form.emergency_contact_relationship} onChange={set('emergency_contact_relationship')} />
                        </Field>
                        <Field label="Phone number" htmlFor="cw-ec-phone" optional>
                            <IconInput icon={Phone} id="cw-ec-phone" type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} />
                        </Field>
                    </div>
                </div>

                {error && <div className="form-error-banner">{error}</div>}
            </form>
        </Modal>
    );
}