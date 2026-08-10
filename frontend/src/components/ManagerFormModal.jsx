import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { Field, IconInput } from './Field.jsx';
import {
    BadgeCheck,
    Cake,
    MapPin,
    Briefcase,
    Building2,
    CalendarDays,
    UserRound,
    Phone,
    Home,
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
    employment_status: 'active',
    join_date: '',
    care_home: '',
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
 * Edits the extended Stage 4 "Manager profile" fields (basic info,
 * employment info, management info, emergency contact) for a manager.
 * Mirrors CareWorkerFormModal's structure, but swaps "Shift pattern" (not
 * applicable to managers) for "Care home assigned", and omits "Assigned
 * residents" / "Number of care workers managed" -- those stay derived from
 * the Stage 5 assignment system rather than editable here. Account
 * essentials (email, username, password, role) still live in UserFormModal.
 */
export default function ManagerFormModal({ user, onClose, onSaved }) {
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
            title="Edit manager profile"
            subtitle="Employment, management, and emergency contact details."
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
                    <div className="form-grid-2">
                        <Field label="Manager ID" htmlFor="mgr-employee-id" optional hint="Auto-generated if left blank">
                            <IconInput icon={BadgeCheck} id="mgr-employee-id" value={form.employee_id} onChange={set('employee_id')} autoFocus />
                        </Field>
                        <Field label="Date of birth" htmlFor="mgr-dob" optional>
                            <IconInput icon={Cake} id="mgr-dob" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
                        </Field>
                        <Field label="Gender" htmlFor="mgr-gender" optional>
                            <select id="mgr-gender" className="select" value={form.gender} onChange={set('gender')}>
                                <option value="">Not specified</option>
                                <option value="female">Female</option>
                                <option value="male">Male</option>
                                <option value="non_binary">Non-binary</option>
                                <option value="other">Other</option>
                            </select>
                        </Field>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <Field label="Home address" htmlFor="mgr-address" optional>
                                <IconInput icon={MapPin} id="mgr-address" value={form.home_address} onChange={set('home_address')} />
                            </Field>
                        </div>
                    </div>
                </div>

                <div className="detail-section">
                    <div className="detail-section-title">Employment information</div>
                    <div className="form-grid-2">
                        <Field label="Job title" htmlFor="mgr-job-title" optional hint="e.g. Care Home Manager">
                            <IconInput icon={Briefcase} id="mgr-job-title" value={form.job_title} onChange={set('job_title')} />
                        </Field>
                        <Field label="Employment type" htmlFor="mgr-employment-type" optional>
                            <select id="mgr-employment-type" className="select" value={form.employment_type} onChange={set('employment_type')}>
                                <option value="">Not specified</option>
                                <option value="full_time">Full-time</option>
                                <option value="part_time">Part-time</option>
                                <option value="bank">Bank</option>
                                <option value="agency">Agency</option>
                                <option value="volunteer">Volunteer</option>
                            </select>
                        </Field>
                        <Field label="Department" htmlFor="mgr-department" optional>
                            <IconInput icon={Building2} id="mgr-department" value={form.department} onChange={set('department')} />
                        </Field>
                        <Field label="Employment status" htmlFor="mgr-employment-status" optional>
                            <select id="mgr-employment-status" className="select" value={form.employment_status} onChange={set('employment_status')}>
                                <option value="active">Active</option>
                                <option value="on_leave">On leave</option>
                                <option value="suspended">Suspended</option>
                                <option value="left">Left</option>
                            </select>
                        </Field>
                        <Field label="Join date" htmlFor="mgr-join-date" optional>
                            <IconInput icon={CalendarDays} id="mgr-join-date" type="date" value={form.join_date} onChange={set('join_date')} />
                        </Field>
                    </div>
                </div>

                <div className="detail-section">
                    <div className="detail-section-title">Management information</div>
                    <div className="form-grid-2">
                        <div style={{ gridColumn: '1 / -1' }}>
                            <Field label="Care home assigned" htmlFor="mgr-care-home" optional hint="Which site this manager oversees">
                                <IconInput icon={Home} id="mgr-care-home" value={form.care_home} onChange={set('care_home')} />
                            </Field>
                        </div>
                    </div>
                </div>

                <div className="detail-section">
                    <div className="detail-section-title">Emergency contact</div>
                    <div className="form-grid-2">
                        <Field label="Contact name" htmlFor="mgr-ec-name" optional>
                            <IconInput icon={UserRound} id="mgr-ec-name" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} />
                        </Field>
                        <Field label="Relationship" htmlFor="mgr-ec-rel" optional>
                            <IconInput icon={UserRound} id="mgr-ec-rel" value={form.emergency_contact_relationship} onChange={set('emergency_contact_relationship')} />
                        </Field>
                        <Field label="Phone number" htmlFor="mgr-ec-phone" optional>
                            <IconInput icon={Phone} id="mgr-ec-phone" type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} />
                        </Field>
                    </div>
                </div>

                {error && <div className="form-error-banner">{error}</div>}
            </form>
        </Modal>
    );
}