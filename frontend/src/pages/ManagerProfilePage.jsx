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
    CalendarDays,
    ShieldCheck,
    Home,
    Users,
    UserCog,
} from 'lucide-react';
import { userApi, resolveFileUrl, ApiError } from '../lib/api.js';
import { useToast } from '../lib/ToastContext.jsx';
import { Avatar, ErrorState } from '../components/States.jsx';
import { RoleBadge } from '../components/Badge.jsx';
import { displayName, formatDate, roleLabel, employmentStatusLabel, employmentTypeLabel } from '../lib/format.js';
import ManagerFormModal from '../components/ManagerFormModal.jsx';
import AssignmentChips from '../components/AssignmentChips.jsx';

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'employment', label: 'Employment Information' },
    { key: 'management', label: 'Management Information' },
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

/**
 * Stage 4: dedicated Manager Profile page, mirroring CareWorkerProfilePage's
 * layout so all three staff/resident profile pages share one design
 * language. "Number of care workers managed" is a derived count over the
 * Stage 5 assignment relationships (Care Worker -> Manager is many-to-one
 * via `users.manager_id`), never stored. The team list itself is read-only
 * here -- assigning/removing a care worker's manager happens from that
 * care worker's own profile ("Change manager"), matching where the
 * underlying FK actually lives.
 */
export default function ManagerProfilePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const showToast = useToast();

    const [member, setMember] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('overview');
    const [editing, setEditing] = useState(false);

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await userApi.get(id);
            setMember(data);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load this manager.');
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

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
                            {member.care_home && <span className="badge badge-info">{member.care_home}</span>}
                            {member.employment_status && member.employment_status !== 'active' && (
                                <span className="badge badge-medium">{employmentStatusLabel(member.employment_status)}</span>
                            )}
                        </div>
                    </div>
                    <div style={{ marginLeft: 'auto', position: 'relative', zIndex: 1, display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button className="icon-btn" aria-label="Edit manager profile" onClick={() => setEditing(true)}>
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
                        <ReadField icon={Building2} label="Department" value={member.department} />
                        <ReadField icon={ShieldCheck} label="Employment status" value={employmentStatusLabel(member.employment_status)} />
                        <ReadField icon={CalendarDays} label="Join date" value={member.join_date ? formatDate(member.join_date) : null} />
                        <ReadField icon={CalendarDays} label="Years of service" value={member.years_of_service != null ? `${member.years_of_service} yr${member.years_of_service === 1 ? '' : 's'}` : null} />
                    </div>
                )}

                {tab === 'management' && (
                    <div className="profile-field-grid">
                        <ReadField icon={Home} label="Care home assigned" value={member.care_home} fullWidth />
                        <ReadField icon={UserCog} label="Number of care workers managed" value={String(member.care_workers_managed_count)} />
                        <div className="profile-field profile-field-full">
                            <span className="profile-field-label">
                                <Users size={13} /> Care workers managed
                            </span>
                            <AssignmentChips items={member.managed_care_workers} kind="care_worker" emptyLabel="No care workers assigned to this manager yet" />
                            <span className="field-hint">
                                To add or remove someone, open their profile from the Team page and use “Change manager.”
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {editing && (
                <ManagerFormModal
                    user={member}
                    onClose={() => setEditing(false)}
                    onSaved={() => {
                        setEditing(false);
                        showToast('Manager profile updated.', 'success');
                        load();
                    }}
                />
            )}
        </>
    );
}
