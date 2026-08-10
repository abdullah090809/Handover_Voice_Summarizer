import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    Pencil,
    Mail,
    Phone,
    AtSign,
    Cake,
    UserRound,
    MapPin,
    BadgeCheck,
    Briefcase,
    Building2,
    Clock,
    CalendarDays,
    ShieldCheck,
    Users,
    UserPlus,
} from 'lucide-react';
import { userApi, residentApi, assignmentApi, resolveFileUrl, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { Avatar, ErrorState } from '../components/States.jsx';
import { RoleBadge } from '../components/Badge.jsx';
import { displayName, formatDate, roleLabel, employmentStatusLabel, employmentTypeLabel, residentStatusLabel } from '../lib/format.js';
import CareWorkerFormModal from '../components/CareWorkerFormModal.jsx';
import AssignmentChips from '../components/AssignmentChips.jsx';
import AssignmentModal from '../components/AssignmentModal.jsx';

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'employment', label: 'Employment Information' },
    { key: 'assignments', label: 'Work Assignment' },
];

function ReadField({ icon: Icon, label, value, fullWidth }) {
    return (
        <div className={`profile-field${fullWidth ? ' profile-field-full' : ''}`}>
            <span className="profile-field-label">
                <Icon size={13} /> {label}
            </span>
            <div className="profile-field-value">{value || <span style={{ color: 'var(--text-tertiary)' }}>Not recorded</span>}</div>
        </div>
    );
}

export default function CareWorkerProfilePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const showToast = useToast();
    const { isManager } = useAuth();

    const [member, setMember] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('overview');
    const [editing, setEditing] = useState(false);

    const [assigningResidents, setAssigningResidents] = useState(false);
    const [residentOptions, setResidentOptions] = useState(null);
    const [assigningManager, setAssigningManager] = useState(false);
    const [managerOptions, setManagerOptions] = useState(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await userApi.get(id);
            setMember(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load this team member.');
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const hasLeft = member?.employment_status === 'left';

    async function openAssignResidents() {
        // Defense in depth: the button below is hidden once a worker has
        // left, but guard the handler too in case this is ever reached
        // another way. The backend is the real enforcement point (see
        // _ensure_assignable_care_worker in app/routers/assignments.py).
        if (hasLeft) return;
        setAssigningResidents(true);
        if (residentOptions === null) {
            try {
                // Fetch *all* residents (including discharged/deceased), not just
                // active ones -- otherwise a resident who's currently on this
                // worker's caseload but has since been discharged would vanish
                // from the picker entirely, leaving no way to untick them.
                const residents = await residentApi.list(true);
                const currentlyAssignedIds = new Set(member.assigned_residents.map((r) => r.id));
                setResidentOptions(
                    residents.filter((r) => r.status === 'active' || currentlyAssignedIds.has(r.id))
                );
            } catch (err) {
                showToast(err instanceof ApiError ? err.message : 'Could not load residents.', 'error');
                setAssigningResidents(false);
            }
        }
    }

    async function handleSaveResidents(residentIds) {
        await assignmentApi.setCareWorkerResidents(member.id, residentIds);
        setAssigningResidents(false);
        showToast('Resident caseload updated.', 'success');
        load();
    }

    async function openAssignManager() {
        setAssigningManager(true);
        if (managerOptions === null) {
            try {
                const users = await userApi.list();
                const currentManagerId = member.manager?.id;
                // Only offer active/on-leave managers as *new* assignments --
                // someone who has left or is suspended shouldn't take on new
                // reports. Still show the current manager even if their status
                // has since changed, so they can be reassigned away from.
                setManagerOptions(
                    users.filter(
                        (u) =>
                            u.role === 'manager' &&
                            (u.id === currentManagerId || !['left', 'suspended'].includes(u.employment_status))
                    )
                );
            } catch (err) {
                showToast(err instanceof ApiError ? err.message : 'Could not load managers.', 'error');
                setAssigningManager(false);
            }
        }
    }

    async function handleSaveManager(managerId) {
        await assignmentApi.setCareWorkerManager(member.id, managerId);
        setAssigningManager(false);
        showToast('Manager assignment updated.', 'success');
        load();
    }

    if (error) {
        return (
            <>
                <button className="btn btn-secondary" onClick={() => navigate('/team')} style={{ marginBottom: 'var(--space-4)' }}>
                    <ArrowLeft size={16} /> Back to team
                </button>
                <ErrorState message={error} onRetry={load} />
            </>
        );
    }

    if (!member) {
        return <div className="skeleton-rows"><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" /></div>;
    }

    return (
        <>
            <button className="btn btn-secondary" onClick={() => navigate('/team')} style={{ marginBottom: 'var(--space-4)' }}>
                <ArrowLeft size={16} /> Back to team
            </button>

            <div className="panel profile-card">
                <div className="profile-hero">
                    <div className="profile-hero-avatar-wrap">
                        <Avatar text={displayName(member)} size="xl" src={resolveFileUrl(member.profile_photo_url)} />
                    </div>
                    <div className="profile-hero-info">
                        <h2>{displayName(member)}</h2>
                        <p>
                            {member.employee_id || `Staff #${member.id}`}
                            {member.job_title ? ` \u00b7 ${member.job_title}` : ''}
                            {member.age != null ? ` \u00b7 Age ${member.age}` : ''}
                        </p>
                        <div className="tag-strip">
                            <RoleBadge role={member.role} />
                            {member.department && <span className="badge badge-info">{member.department}</span>}
                            {member.employment_status && member.employment_status !== 'active' && (
                                <span className="badge badge-medium">{employmentStatusLabel(member.employment_status)}</span>
                            )}
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto', position: 'relative', zIndex: 1, display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button className="icon-btn" aria-label="Edit care worker profile" onClick={() => setEditing(true)}>
                            <Pencil size={16} />
                        </button>
                    </div>
                </div>

                <div className="record-tabs" style={{ margin: 'var(--space-5) var(--space-6) 0', overflowX: 'auto' }}>
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            className={`record-tab-btn${tab === t.key ? ' active' : ''}`}
                            onClick={() => setTab(t.key)}
                            style={{ flex: 'none', padding: '0 var(--space-4)' }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {tab === 'overview' && (
                    <div className="profile-field-grid">
                        <ReadField icon={UserRound} label="Full name" value={member.name} />
                        <ReadField icon={AtSign} label="Username" value={`@${member.username}`} />
                        <ReadField icon={Mail} label="Email" value={member.email} />
                        <ReadField icon={Phone} label="Phone number" value={member.phone_number} />
                        <ReadField icon={Cake} label="Date of birth" value={member.date_of_birth ? formatDate(member.date_of_birth) : null} />
                        <ReadField icon={UserRound} label="Gender" value={member.gender} />
                        <ReadField icon={ShieldCheck} label="Role" value={roleLabel(member.role)} />
                        <ReadField icon={MapPin} label="Home address" value={member.home_address} fullWidth />
                        <div className="profile-field profile-field-full">
                            <span className="profile-field-label">
                                <Phone size={13} /> Emergency contact
                            </span>
                            <div className="profile-field-value" style={{ minHeight: 'unset', padding: 'var(--space-3)' }}>
                                {member.emergency_contact_name ? (
                                    <>
                                        {member.emergency_contact_name}
                                        {member.emergency_contact_relationship ? ` \u00b7 ${member.emergency_contact_relationship}` : ''}
                                        {member.emergency_contact_phone ? ` \u00b7 ${member.emergency_contact_phone}` : ''}
                                    </>
                                ) : (
                                    <span style={{ color: 'var(--text-tertiary)' }}>Not recorded</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {tab === 'employment' && (
                    <div className="profile-field-grid">
                        <ReadField icon={BadgeCheck} label="Employee ID" value={member.employee_id} />
                        <ReadField icon={Briefcase} label="Job title" value={member.job_title} />
                        <ReadField icon={Briefcase} label="Employment type" value={member.employment_type ? employmentTypeLabel(member.employment_type) : null} />
                        <ReadField icon={Building2} label="Department / Ward" value={member.department} />
                        <ReadField icon={Clock} label="Shift pattern" value={member.shift_pattern} />
                        <ReadField icon={ShieldCheck} label="Employment status" value={employmentStatusLabel(member.employment_status)} />
                        <ReadField icon={CalendarDays} label="Join date" value={member.join_date ? formatDate(member.join_date) : null} />
                        <ReadField icon={CalendarDays} label="Years of service" value={member.years_of_service != null ? `${member.years_of_service} yr${member.years_of_service === 1 ? '' : 's'}` : null} />
                    </div>
                )}

                {tab === 'assignments' && (
                    <div className="profile-field-grid">
                        <div className="profile-field profile-field-full">
                            <span className="profile-field-label">
                                <Users size={13} /> Assigned residents
                            </span>
                            <AssignmentChips items={member.assigned_residents} kind="resident" emptyLabel="No residents assigned" />
                            {isManager && (
                                hasLeft ? (
                                    <p
                                        style={{
                                            color: 'var(--text-tertiary)',
                                            fontSize: 'var(--text-sm)',
                                            marginTop: 'var(--space-1)',
                                        }}
                                    >
                                        {displayName(member)} has left and can no longer be assigned residents.
                                    </p>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{ alignSelf: 'flex-start', marginTop: 'var(--space-1)' }}
                                        onClick={openAssignResidents}
                                    >
                                        <UserPlus size={14} /> Manage caseload
                                    </button>
                                )
                            )}
                        </div>
                        <div className="profile-field profile-field-full">
                            <span className="profile-field-label">
                                <UserRound size={13} /> Assigned manager
                            </span>
                            <AssignmentChips items={member.manager ? [member.manager] : []} kind="care_worker" emptyLabel="No manager assigned" />
                            {isManager && (
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    style={{ alignSelf: 'flex-start', marginTop: 'var(--space-1)' }}
                                    onClick={openAssignManager}
                                >
                                    <UserPlus size={14} /> Change manager
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {editing && (
                <CareWorkerFormModal
                    user={member}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        showToast('Care worker profile updated.', 'success');
                        load();
                    }}
                />
            )}

            {assigningResidents && (
                <AssignmentModal
                    title="Manage caseload"
                    subtitle={`Choose which residents ${displayName(member)} is assigned to.`}
                    mode="multi"
                    options={
                        residentOptions === null
                            ? null
                            : residentOptions.map((r) => ({
                                id: r.id,
                                label: r.preferred_name || r.name,
                                sublabel:
                                    r.status !== 'active'
                                        ? [r.resident_code, residentStatusLabel(r.status)].filter(Boolean).join(' · ')
                                        : r.resident_code,
                            }))
                    }
                    initialSelectedIds={member.assigned_residents.map((r) => r.id)}
                    onClose={() => setAssigningResidents(false)}
                    onSave={handleSaveResidents}
                    saveLabel="Save caseload"
                    emptyOptionsLabel="No active residents found."
                />
            )}

            {assigningManager && (
                <AssignmentModal
                    title="Change manager"
                    subtitle={`Choose who ${displayName(member)} reports to.`}
                    mode="single"
                    options={
                        managerOptions === null
                            ? null
                            : managerOptions.map((u) => ({
                                id: u.id,
                                label: displayName(u),
                                sublabel:
                                    u.employment_status && u.employment_status !== 'active'
                                        ? [u.job_title, employmentStatusLabel(u.employment_status)].filter(Boolean).join(' · ')
                                        : u.job_title,
                            }))
                    }
                    initialSelectedIds={member.manager ? [member.manager.id] : []}
                    onClose={() => setAssigningManager(false)}
                    onSave={handleSaveManager}
                    saveLabel="Save manager"
                    emptyOptionsLabel="No managers found."
                    noneLabel="No manager"
                />
            )}
        </>
    );
}