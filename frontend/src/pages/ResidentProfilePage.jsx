import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  CalendarDays,
  Cake,
  BadgeCheck,
  DoorOpen,
  Building2,
  Pill,
  ShieldAlert,
  Accessibility,
  Utensils,
  MessageCircle,
  Ear,
  HeartPulse,
  TriangleAlert,
  NotebookPen,
  ClipboardList,
  Phone,
  UserRound,
  Church,
  Globe2,
  FileAudio,
  Users,
  UserPlus,
  Home,
} from 'lucide-react';
import { residentApi, handoverApi, userApi, assignmentApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { Avatar, EmptyState, ErrorState } from '../components/States.jsx';
import { ResidentStatusBadge } from '../components/Badge.jsx';
import { formatDate, displayName, employmentStatusLabel } from '../lib/format.js';
import ResidentFormModal from '../components/ResidentFormModal.jsx';
import HandoverCard from '../components/HandoverCard.jsx';
import HandoverDetailModal from '../components/HandoverDetailModal.jsx';
import AssignmentChips from '../components/AssignmentChips.jsx';
import AssignmentModal from '../components/AssignmentModal.jsx';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'medical', label: 'Medical Information' },
  { key: 'care', label: 'Care Information' },
  { key: 'handovers', label: 'Handover History' },
];

// A field the resident record hasn't filled in yet — matches the empty-state
// pattern already used on ProfilePage, but read-only here (no inline "add").
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

function ChipListField({ icon: Icon, label, items, emptyLabel }) {
  return (
    <div className="profile-field profile-field-full">
      <span className="profile-field-label">
        <Icon size={13} /> {label}
      </span>
      {items && items.length > 0 ? (
        <div className="tag-strip">
          {items.map((item, i) => (
            <span key={i} className="badge badge-info">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div className="profile-field-value">
          <span style={{ color: 'var(--text-tertiary)' }}>{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function ResidentProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();

  const [resident, setResident] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);

  const [handovers, setHandovers] = useState(null);
  const [handoverError, setHandoverError] = useState(null);
  const [openNote, setOpenNote] = useState(null);

  const [assigning, setAssigning] = useState(false);
  const [careWorkerOptions, setCareWorkerOptions] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await residentApi.get(id);
      setResident(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this resident.');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadHandovers = useCallback(async () => {
    setHandoverError(null);
    try {
      const data = await handoverApi.list({ residentId: id, limit: 50 });
      setHandovers(data);
    } catch (err) {
      setHandoverError(err instanceof ApiError ? err.message : 'Could not load handover history.');
    }
  }, [id]);

  useEffect(() => {
    if (tab === 'handovers' && handovers === null) loadHandovers();
  }, [tab, handovers, loadHandovers]);

  async function handleDelete() {
    const ok = await confirm({
      title: `Remove ${resident.name}?`,
      message: 'This permanently deletes the resident record. Their existing handover notes are kept for the record.',
      confirmLabel: 'Remove resident',
    });
    if (!ok) return;
    try {
      await residentApi.remove(resident.id);
      showToast('Resident removed.', 'success');
      navigate('/residents');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not remove this resident.', 'error');
    }
  }

  async function openAssignCareWorkers() {
    setAssigning(true);
    if (careWorkerOptions === null) {
      try {
        const users = await userApi.list();
        const currentlyAssignedIds = new Set(resident.assigned_care_workers.map((u) => u.id));
        // Only offer active/on-leave care workers as *new* assignments --
        // someone who has left or is suspended shouldn't be newly assigned
        // a resident. Still show anyone already assigned here (regardless
        // of status) so a manager can see and untick them; label their
        // status so it's clear why they're there.
        setCareWorkerOptions(
          users.filter(
            (u) =>
              u.role === 'care_worker' &&
              (currentlyAssignedIds.has(u.id) || !['left', 'suspended'].includes(u.employment_status))
          )
        );
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Could not load care workers.', 'error');
        setAssigning(false);
      }
    }
  }

  async function handleSaveCareWorkers(careWorkerIds) {
    await assignmentApi.setResidentCareWorkers(resident.id, careWorkerIds);
    setAssigning(false);
    showToast('Care worker assignments updated.', 'success');
    load();
  }

  if (error) {
    return (
      <>
        <button className="btn btn-secondary" onClick={() => navigate('/residents')} style={{ marginBottom: 'var(--space-4)' }}>
          <ArrowLeft size={16} /> Back to residents
        </button>
        <ErrorState message={error} onRetry={load} />
      </>
    );
  }

  if (!resident) {
    return <div className="skeleton-rows"><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" /></div>;
  }

  const conditionsCount = resident.medical_conditions?.length || 0;
  const allergiesCount = resident.allergies?.length || 0;

  return (
    <>
      <button className="btn btn-secondary" onClick={() => navigate('/residents')} style={{ marginBottom: 'var(--space-4)' }}>
        <ArrowLeft size={16} /> Back to residents
      </button>

      <div className="panel profile-card">
        <div className="profile-hero">
          <div className="profile-hero-avatar-wrap">
            <Avatar text={resident.preferred_name || resident.name} size="xl" />
          </div>
          <div className="profile-hero-info">
            <h2>{resident.preferred_name || resident.name}</h2>
            <p>
              {resident.resident_code || `Resident #${resident.id}`}
              {resident.preferred_name ? ` \u00b7 ${resident.name}` : ''}
              {resident.age != null ? ` \u00b7 Age ${resident.age}` : ''}
            </p>
            <div className="tag-strip">
              <ResidentStatusBadge status={resident.status} />
              {resident.ward_unit && <span className="badge badge-info">{resident.ward_unit}</span>}
              {resident.room_number && <span className="badge badge-info">Room {resident.room_number}</span>}
              {allergiesCount > 0 && (
                <span className="badge badge-high">
                  <ShieldAlert size={12} style={{ marginRight: 4 }} />
                  {allergiesCount} {allergiesCount === 1 ? 'allergy' : 'allergies'}
                </span>
              )}
            </div>
          </div>
          {isManager && (
            <div style={{ marginLeft: 'auto', position: 'relative', zIndex: 1, display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" className="btn btn-primary btn-sm" aria-label="Edit resident" onClick={() => setEditing(true)}>
                <Pencil size={14} /> Edit
              </button>
              <button className="icon-btn" aria-label="Remove resident" onClick={handleDelete}>
                <Trash2 size={16} />
              </button>
            </div>
          )}
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
            <ReadField icon={UserRound} label="Full name" value={resident.name} />
            <ReadField icon={BadgeCheck} label="Preferred name" value={resident.preferred_name} />
            <ReadField icon={Cake} label="Date of birth" value={resident.date_of_birth ? formatDate(resident.date_of_birth) : null} />
            <ReadField icon={UserRound} label="Gender" value={resident.gender} />
            <ReadField icon={CalendarDays} label="Admission date" value={resident.admission_date ? formatDate(resident.admission_date) : null} />
            <ReadField icon={DoorOpen} label="Room number" value={resident.room_number} />
            <ReadField icon={Building2} label="Ward / unit" value={resident.ward_unit} />
            <ReadField icon={Home} label="Care home" value={resident.care_home} />
            <ReadField icon={Church} label="Religion / beliefs" value={resident.religion} />
            <ReadField icon={Globe2} label="Ethnicity" value={resident.ethnicity} />
            <ReadField icon={Globe2} label="Preferred language" value={resident.preferred_language} />
            <div className="profile-field profile-field-full">
              <span className="profile-field-label">
                <Phone size={13} /> Emergency contact
              </span>
              <div className="profile-field-value" style={{ minHeight: 'unset', padding: 'var(--space-3)' }}>
                {resident.emergency_contact_name ? (
                  <>
                    {resident.emergency_contact_name}
                    {resident.emergency_contact_relationship ? ` \u00b7 ${resident.emergency_contact_relationship}` : ''}
                    {resident.emergency_contact_phone ? ` \u00b7 ${resident.emergency_contact_phone}` : ''}
                  </>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)' }}>Not recorded</span>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === 'medical' && (
          <div className="profile-field-grid">
            <ChipListField icon={HeartPulse} label="Medical conditions" items={resident.medical_conditions} emptyLabel="None recorded" />
            <ChipListField icon={ShieldAlert} label="Allergies" items={resident.allergies} emptyLabel="No known allergies recorded" />
            <ChipListField icon={Pill} label="Current medications" items={resident.current_medications} emptyLabel="None recorded" />
            <ReadField icon={Accessibility} label="Disability" value={resident.disability} fullWidth />
            <ReadField icon={Accessibility} label="Mobility status" value={resident.mobility_status} />
            <ReadField icon={Utensils} label="Dietary requirements" value={resident.dietary_requirements} />
            <ReadField icon={MessageCircle} label="Communication requirements" value={resident.communication_requirements} />
            <ReadField icon={Ear} label="Sensory loss" value={resident.sensory_loss} />
          </div>
        )}

        {tab === 'care' && (
          <div className="profile-field-grid">
            <ReadField icon={ClipboardList} label="Care level" value={resident.care_level} />
            <ReadField icon={TriangleAlert} label="Risk level" value={resident.risk_level} />
            <div className="profile-field profile-field-full">
              <span className="profile-field-label">
                <Users size={13} /> Assigned care workers
              </span>
              <AssignmentChips items={resident.assigned_care_workers} kind="care_worker" emptyLabel="No care workers assigned" />
              {isManager && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ alignSelf: 'flex-start', marginTop: 'var(--space-1)' }}
                  onClick={openAssignCareWorkers}
                >
                  <UserPlus size={14} /> Manage care workers
                </button>
              )}
            </div>
            <ReadField icon={NotebookPen} label="Behaviour notes" value={resident.behaviour_notes} fullWidth />
            <ReadField icon={NotebookPen} label="Daily care notes" value={resident.daily_care_notes} fullWidth />
          </div>
        )}

        {tab === 'handovers' && (
          <div style={{ padding: 'var(--space-6)' }}>
            {handovers === null && !handoverError && <div className="skeleton-rows"><div className="skeleton-line" /><div className="skeleton-line" /></div>}
            {handoverError && <ErrorState message={handoverError} onRetry={loadHandovers} />}
            {handovers !== null && handovers.length === 0 && (
              <EmptyState icon={FileAudio} title="No handovers yet" message="Handover notes for this resident will appear here." />
            )}
            {handovers !== null && handovers.length > 0 && (
              <div className="card-grid">
                {handovers.map((note) => (
                  <HandoverCard key={note.id} note={note} residentName={resident.name} canDelete={false} onOpen={setOpenNote} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <ResidentFormModal
          resident={resident}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            showToast('Resident updated.', 'success');
            load();
          }}
        />
      )}

      {openNote && <HandoverDetailModal note={openNote} residentName={resident.name} canDelete={false} onClose={() => setOpenNote(null)} />}

      {assigning && (
        <AssignmentModal
          title="Manage care workers"
          subtitle={`Choose who is assigned to ${resident.preferred_name || resident.name}.`}
          mode="multi"
          options={
            careWorkerOptions === null
              ? null
              : careWorkerOptions.map((u) => ({
                id: u.id,
                label: displayName(u),
                sublabel:
                  u.employment_status && u.employment_status !== 'active'
                    ? [u.job_title, employmentStatusLabel(u.employment_status)].filter(Boolean).join(' · ')
                    : u.job_title,
              }))
          }
          initialSelectedIds={resident.assigned_care_workers.map((u) => u.id)}
          onClose={() => setAssigning(false)}
          onSave={handleSaveCareWorkers}
          saveLabel="Save assignments"
          emptyOptionsLabel="No care workers found. Add one from the Team page first."
        />
      )}
    </>
  );
}