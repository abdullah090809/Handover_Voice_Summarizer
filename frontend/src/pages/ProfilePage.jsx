import React, { useRef, useState } from 'react';
import {
  Pencil,
  Camera,
  BadgeCheck,
  Mail,
  Phone,
  AtSign,
  Shield,
  Briefcase,
  CalendarDays,
  UserRound,
  FileText,
  Plus,
  Cake,
  MapPin,
  Building2,
  Clock,
  Users,
  Home,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { Avatar } from '../components/States.jsx';
import { RoleBadge } from '../components/Badge.jsx';
import { displayName, formatDate, roleLabel, employmentStatusLabel, employmentTypeLabel } from '../lib/format.js';
import { userApi, resolveFileUrl, ApiError } from '../lib/api.js';
import EditProfileModal from '../components/EditProfileModal.jsx';
import ManagerFormModal from '../components/ManagerFormModal.jsx';
import AssignmentChips from '../components/AssignmentChips.jsx';

// A field the person hasn't filled in yet is rendered as an inline action,
// not a flat "Not set" — the empty state is a place to add the value, not
// just a note that it's missing.
function ReadField({ icon: Icon, label, value, emptyLabel, onAdd, fullWidth }) {
  return (
    <div className={`profile-field${fullWidth ? ' profile-field-full' : ''}`}>
      <span className="profile-field-label">
        <Icon size={13} /> {label}
      </span>
      {value ? (
        <div className="profile-field-value">{value}</div>
      ) : (
        <button type="button" className="profile-field-value profile-field-value-empty" onClick={onAdd}>
          <Plus size={12} /> Add {emptyLabel}
        </button>
      )}
    </div>
  );
}

// Employment/personal fields are manager-managed (see CareWorkerFormModal),
// so by default these render read-only with no "+ Add" affordance — there's
// nothing for a care worker to click into. When `onAdd` is passed (the
// manager's own employment panel, which *is* self-editable), an empty field
// becomes a clickable affordance just like ReadField above.
function StaticField({ icon: Icon, label, value, emptyLabel, onAdd, fullWidth }) {
  return (
    <div className={`profile-field${fullWidth ? ' profile-field-full' : ''}`}>
      <span className="profile-field-label">
        <Icon size={13} /> {label}
      </span>
      {value ? (
        <div className="profile-field-value">{value}</div>
      ) : onAdd ? (
        <button type="button" className="profile-field-value profile-field-value-empty" onClick={onAdd}>
          <Plus size={12} /> Add {emptyLabel || label.toLowerCase()}
        </button>
      ) : (
        <div className="profile-field-value">
          <span style={{ color: 'var(--text-tertiary)' }}>Not recorded</span>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const showToast = useToast();
  const [uploading, setUploading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showManagerEditModal, setShowManagerEditModal] = useState(false);
  const fileInputRef = useRef(null);

  if (!user) return null;

  async function onPickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await userApi.uploadProfilePicture(file);
      await refreshUser();
      showToast('Profile picture updated.', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not upload your photo.', 'error');
    } finally {
      setUploading(false);
    }
  }

  const openEdit = () => setShowEditModal(true);

  const completionFlags = [
    Boolean(user.profile_photo_url),
    Boolean(user.job_title),
    Boolean(user.phone_number),
    Boolean(user.bio),
  ];
  const completedFields = completionFlags.filter(Boolean).length;
  const totalFields = completionFlags.length;
  const completionPct = Math.round((completedFields / totalFields) * 100);
  const isIncomplete = completedFields < totalFields;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profile</h1>
          <p>Your account details and how your team sees you.</p>
        </div>
      </div>

      <div className="panel profile-card">
        <div className="profile-hero profile-hero-centered">
          <div className="profile-hero-avatar-wrap">
            <Avatar text={displayName(user)} size="xl" src={resolveFileUrl(user.profile_photo_url)} />
            <span className="profile-hero-verified" title="Verified account">
              <BadgeCheck size={16} />
            </span>
            <button
              type="button"
              className="avatar-upload-btn"
              aria-label="Change profile picture"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Camera size={13} />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={onPickPhoto}
            />
          </div>

          <div className="profile-hero-info">
            <h2>{displayName(user)}</h2>
            <p className="profile-hero-email">{user.email}</p>
            {user.job_title && <p className="profile-hero-jobtitle">{user.job_title}</p>}
            <div className="tag-strip" style={{ justifyContent: 'center' }}>
              <RoleBadge role={user.role} />
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-sm profile-hero-edit" onClick={openEdit}>
            <Pencil size={14} /> Edit
          </button>
        </div>

        {isIncomplete && (
          <div className="profile-progress-inline profile-progress-inline-card">
            <div className="profile-progress-steps" role="img" aria-label={`${completionPct}% of your profile is complete`}>
              {completionFlags.map((done, i) => (
                <span key={i} className={`profile-progress-step${done ? ' is-filled' : ''}`} />
              ))}
            </div>
            <span className="profile-progress-label">{completionPct}% profile complete</span>
          </div>
        )}

        <div className="profile-field-grid">
          <ReadField icon={UserRound} label="Full name" value={user.name} emptyLabel="your name" onAdd={openEdit} />
          <ReadField icon={AtSign} label="Username" value={`@${user.username}`} />
          <ReadField icon={Mail} label="Email" value={user.email} />
          <ReadField icon={Phone} label="Phone number" value={user.phone_number} emptyLabel="phone number" onAdd={openEdit} />
          <ReadField icon={Shield} label="Role" value={roleLabel(user.role)} />
          <ReadField icon={Briefcase} label="Job title" value={user.job_title} emptyLabel="job title" onAdd={openEdit} />
          <ReadField icon={CalendarDays} label="Member since" value={formatDate(user.created_at)} fullWidth />
        </div>

        <div className="profile-field profile-field-full profile-card-bio">
          <span className="profile-field-label">
            <FileText size={13} /> Bio
          </span>
          {user.bio ? (
            <p className="profile-field-bio-text">{user.bio}</p>
          ) : (
            <button type="button" className="profile-field-value profile-field-value-empty" onClick={openEdit}>
              <Plus size={12} /> Add a short bio so your team knows more about you
            </button>
          )}
        </div>
      </div>

      {user.role === 'care_worker' && (
        <div className="panel profile-card" style={{ marginTop: 'var(--space-6)' }}>
          <div className="panel-section-header">
            <div className="panel-section-header-icon">
              <Briefcase size={16} />
            </div>
            <div className="panel-section-header-text">
              <div className="panel-section-header-title">Employment information</div>
              <p className="panel-section-header-subtitle">Managed by your manager — ask them to update anything here.</p>
            </div>
          </div>
          <div className="profile-field-grid">
            <StaticField icon={BadgeCheck} label="Employee ID" value={user.employee_id} />
            <StaticField icon={Cake} label="Date of birth" value={user.date_of_birth ? formatDate(user.date_of_birth) : null} />
            <StaticField icon={UserRound} label="Gender" value={user.gender} />
            <StaticField icon={MapPin} label="Home address" value={user.home_address} fullWidth />
            <StaticField icon={Briefcase} label="Employment type" value={user.employment_type ? employmentTypeLabel(user.employment_type) : null} />
            <StaticField icon={Building2} label="Department / Ward" value={user.department} />
            <StaticField icon={Clock} label="Shift pattern" value={user.shift_pattern} />
            <StaticField icon={Shield} label="Employment status" value={user.employment_status ? employmentStatusLabel(user.employment_status) : null} />
            <StaticField icon={CalendarDays} label="Join date" value={user.join_date ? formatDate(user.join_date) : null} />
            <StaticField
              icon={CalendarDays}
              label="Years of service"
              value={user.years_of_service != null ? `${user.years_of_service} yr${user.years_of_service === 1 ? '' : 's'}` : null}
            />
            <div className="profile-field profile-field-full">
              <span className="profile-field-label">
                <Users size={13} /> Assigned residents
              </span>
              <AssignmentChips items={user.assigned_residents} kind="resident" emptyLabel="No residents assigned" />
            </div>
            <div className="profile-field profile-field-full">
              <span className="profile-field-label">
                <Phone size={13} /> Emergency contact
              </span>
              <div className="profile-field-value" style={{ minHeight: 'unset', padding: 'var(--space-3)' }}>
                {user.emergency_contact_name ? (
                  <>
                    {user.emergency_contact_name}
                    {user.emergency_contact_relationship ? ` \u00b7 ${user.emergency_contact_relationship}` : ''}
                    {user.emergency_contact_phone ? ` \u00b7 ${user.emergency_contact_phone}` : ''}
                  </>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)' }}>Not recorded</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {user.role === 'manager' && (
        <div className="panel profile-card" style={{ marginTop: 'var(--space-6)' }}>
          <div className="panel-section-header">
            <div className="panel-section-header-icon">
              <UserCog size={16} />
            </div>
            <div className="panel-section-header-text">
              <div className="panel-section-header-title">Employment &amp; management information</div>
              <p className="panel-section-header-subtitle">Your employment details and the care home you manage.</p>
            </div>
            <button type="button" className="icon-btn" aria-label="Edit management details" onClick={() => setShowManagerEditModal(true)}>
              <Pencil size={16} />
            </button>
          </div>
          <div className="profile-field-grid">
            <StaticField icon={BadgeCheck} label="Manager ID" value={user.employee_id} onAdd={() => setShowManagerEditModal(true)} />
            <StaticField
              icon={Cake}
              label="Date of birth"
              value={user.date_of_birth ? formatDate(user.date_of_birth) : null}
              onAdd={() => setShowManagerEditModal(true)}
            />
            <StaticField icon={UserRound} label="Gender" value={user.gender} onAdd={() => setShowManagerEditModal(true)} />
            <StaticField
              icon={MapPin}
              label="Home address"
              value={user.home_address}
              onAdd={() => setShowManagerEditModal(true)}
              fullWidth
            />
            <StaticField
              icon={Briefcase}
              label="Employment type"
              value={user.employment_type ? employmentTypeLabel(user.employment_type) : null}
              onAdd={() => setShowManagerEditModal(true)}
            />
            <StaticField icon={Building2} label="Department" value={user.department} onAdd={() => setShowManagerEditModal(true)} />
            <StaticField
              icon={Shield}
              label="Employment status"
              value={user.employment_status ? employmentStatusLabel(user.employment_status) : null}
              onAdd={() => setShowManagerEditModal(true)}
            />
            <StaticField
              icon={CalendarDays}
              label="Join date"
              value={user.join_date ? formatDate(user.join_date) : null}
              onAdd={() => setShowManagerEditModal(true)}
            />
            <StaticField
              icon={CalendarDays}
              label="Years of service"
              value={user.years_of_service != null ? `${user.years_of_service} yr${user.years_of_service === 1 ? '' : 's'}` : null}
            />
            <StaticField icon={Home} label="Care home assigned" value={user.care_home} onAdd={() => setShowManagerEditModal(true)} fullWidth />
            <div className="profile-field">
              <span className="profile-field-label">
                <UserCog size={13} /> Care workers managed
              </span>
              <AssignmentChips items={user.managed_care_workers} kind="care_worker" emptyLabel="No care workers assigned to you yet" />
            </div>
            <div className="profile-field">
              <span className="profile-field-label">
                <Users size={13} /> Residents overseen
              </span>
              <AssignmentChips items={user.residents_overseen} kind="resident" emptyLabel="No residents overseen yet" />
            </div>
            <div className="profile-field profile-field-full">
              <span className="profile-field-label">
                <Phone size={13} /> Emergency contact
              </span>
              {user.emergency_contact_name ? (
                <div className="profile-field-value" style={{ minHeight: 'unset', padding: 'var(--space-3)' }}>
                  {user.emergency_contact_name}
                  {user.emergency_contact_relationship ? ` \u00b7 ${user.emergency_contact_relationship}` : ''}
                  {user.emergency_contact_phone ? ` \u00b7 ${user.emergency_contact_phone}` : ''}
                </div>
              ) : (
                <button
                  type="button"
                  className="profile-field-value profile-field-value-empty"
                  onClick={() => setShowManagerEditModal(true)}
                >
                  <Plus size={12} /> Add an emergency contact
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showManagerEditModal && (
        <ManagerFormModal
          user={user}
          onClose={() => setShowManagerEditModal(false)}
          onSaved={async () => {
            setShowManagerEditModal(false);
            await refreshUser();
            showToast('Management details updated.', 'success');
          }}
        />
      )}

      {showEditModal && (
        <EditProfileModal
          user={user}
          onClose={() => setShowEditModal(false)}
          onSuccess={async () => {
            setShowEditModal(false);
            await refreshUser();
            showToast('Profile updated.', 'success');
          }}
        />
      )}
    </>
  );
}