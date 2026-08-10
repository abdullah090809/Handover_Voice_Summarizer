import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { Field, IconInput } from './Field.jsx';
import { X } from 'lucide-react';
import {
  UserRound,
  BadgeCheck,
  Cake,
  DoorOpen,
  Building2,
  CalendarDays,
  Church,
  Globe2,
  Phone,
  Utensils,
  MessageCircle,
  Ear,
  Accessibility,
  NotebookPen,
  Home,
} from 'lucide-react';
import { residentApi, ApiError } from '../lib/api.js';

const EMPTY = {
  name: '',
  preferred_name: '',
  date_of_birth: '',
  gender: '',
  resident_code: '',
  admission_date: '',
  room_number: '',
  ward_unit: '',
  care_home: '',
  medical_conditions: [],
  allergies: [],
  current_medications: [],
  disability: '',
  mobility_status: '',
  dietary_requirements: '',
  communication_requirements: '',
  sensory_loss: '',
  care_level: '',
  risk_level: '',
  behaviour_notes: '',
  daily_care_notes: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_phone: '',
  religion: '',
  ethnicity: '',
  preferred_language: '',
};

// Free-text fields that come back from the API as `null` need to become ''
// for controlled inputs; list fields default to [] rather than null.
function toFormState(resident) {
  if (!resident) return { ...EMPTY };
  const next = { ...EMPTY };
  for (const key of Object.keys(EMPTY)) {
    const value = resident[key];
    if (Array.isArray(EMPTY[key])) {
      next[key] = Array.isArray(value) ? value : [];
    } else {
      next[key] = value ?? '';
    }
  }
  return next;
}

// Converts '' back to null for optional text fields so we don't send empty
// strings where the backend expects null, and drops blanks from date fields.
function toPayload(form) {
  const payload = { ...form };
  for (const key of Object.keys(payload)) {
    if (Array.isArray(payload[key])) continue;
    if (payload[key] === '') payload[key] = null;
  }
  payload.name = form.name.trim();
  return payload;
}

// Simple chip/tag input for the medical list fields (conditions, allergies,
// medications) -- type a value and press Enter or "Add" to append it.
function TagInput({ id, icon: Icon, values, onChange, placeholder }) {
  const [draft, setDraft] = useState('');

  function commit() {
    const v = draft.trim();
    if (!v) return;
    onChange([...values, v]);
    setDraft('');
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  }

  function remove(i) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <IconInput
        icon={Icon}
        id={id}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
      {values.length > 0 && (
        <div className="tag-strip" style={{ marginTop: 'var(--space-2)' }}>
          {values.map((v, i) => (
            <span key={i} className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {v}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${v}`}
                style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResidentFormModal({ resident, onClose, onSaved }) {
  const [form, setForm] = useState(() => toFormState(resident));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(resident);

  function set(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Enter a name.');
    setSaving(true);
    setError('');
    try {
      const payload = toPayload(form);
      if (isEdit) {
        await residentApi.update(resident.id, payload);
      } else {
        await residentApi.create(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this resident.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={isEdit ? 'Edit resident' : 'Add resident'}
      subtitle={isEdit ? undefined : 'Only full name is required — the rest can be filled in any time.'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : isEdit ? 'Save changes' : 'Add resident'}
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div className="detail-section">
          <div className="detail-section-title">Basic information</div>
          <div className="form-grid-2">
            <Field label="Full name" htmlFor="resident-name">
              <IconInput icon={UserRound} id="resident-name" value={form.name} onChange={set('name')} autoFocus />
            </Field>
            <Field label="Preferred name" htmlFor="resident-preferred-name" optional>
              <IconInput icon={BadgeCheck} id="resident-preferred-name" value={form.preferred_name} onChange={set('preferred_name')} />
            </Field>
            <Field label="Date of birth" htmlFor="resident-dob" optional>
              <IconInput icon={Cake} id="resident-dob" type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
            </Field>
            <Field label="Gender" htmlFor="resident-gender" optional>
              <select id="resident-gender" className="select" value={form.gender} onChange={set('gender')}>
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non_binary">Non-binary</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Resident ID" htmlFor="resident-code" optional hint="Auto-generated if left blank">
              <IconInput icon={BadgeCheck} id="resident-code" value={form.resident_code} onChange={set('resident_code')} />
            </Field>
            <Field label="Admission date" htmlFor="resident-admission" optional>
              <IconInput icon={CalendarDays} id="resident-admission" type="date" value={form.admission_date} onChange={set('admission_date')} />
            </Field>
            <Field label="Room number" htmlFor="resident-room" optional>
              <IconInput icon={DoorOpen} id="resident-room" value={form.room_number} onChange={set('room_number')} />
            </Field>
            <Field label="Ward / unit" htmlFor="resident-ward" optional>
              <IconInput icon={Building2} id="resident-ward" value={form.ward_unit} onChange={set('ward_unit')} />
            </Field>
            <Field label="Care home" htmlFor="resident-care-home" optional hint="Defaults to your own care home if left blank">
              <IconInput icon={Home} id="resident-care-home" value={form.care_home} onChange={set('care_home')} />
            </Field>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Medical information</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Field label="Medical conditions" htmlFor="resident-conditions" optional hint="Press Enter to add">
              <TagInput
                id="resident-conditions"
                icon={NotebookPen}
                values={form.medical_conditions}
                onChange={(v) => setForm((f) => ({ ...f, medical_conditions: v }))}
                placeholder="e.g. Type 2 diabetes"
              />
            </Field>
            <Field label="Allergies" htmlFor="resident-allergies" optional hint="Press Enter to add">
              <TagInput
                id="resident-allergies"
                icon={NotebookPen}
                values={form.allergies}
                onChange={(v) => setForm((f) => ({ ...f, allergies: v }))}
                placeholder="e.g. Penicillin"
              />
            </Field>
            <Field label="Current medications" htmlFor="resident-medications" optional hint="Press Enter to add">
              <TagInput
                id="resident-medications"
                icon={NotebookPen}
                values={form.current_medications}
                onChange={(v) => setForm((f) => ({ ...f, current_medications: v }))}
                placeholder="e.g. Metformin 500mg"
              />
            </Field>
            <div className="form-grid-2">
              <Field label="Disability" htmlFor="resident-disability" optional>
                <IconInput icon={Accessibility} id="resident-disability" value={form.disability} onChange={set('disability')} />
              </Field>
              <Field label="Mobility status" htmlFor="resident-mobility" optional>
                <select id="resident-mobility" className="select" value={form.mobility_status} onChange={set('mobility_status')}>
                  <option value="">Not specified</option>
                  <option value="independent">Independent</option>
                  <option value="uses_walking_aid">Uses walking aid</option>
                  <option value="wheelchair_user">Wheelchair user</option>
                  <option value="bed_bound">Bed-bound</option>
                </select>
              </Field>
              <Field label="Dietary requirements" htmlFor="resident-diet" optional>
                <IconInput icon={Utensils} id="resident-diet" value={form.dietary_requirements} onChange={set('dietary_requirements')} />
              </Field>
              <Field label="Communication requirements" htmlFor="resident-comms" optional>
                <IconInput icon={MessageCircle} id="resident-comms" value={form.communication_requirements} onChange={set('communication_requirements')} />
              </Field>
              <Field label="Sensory loss" htmlFor="resident-sensory" optional>
                <IconInput icon={Ear} id="resident-sensory" value={form.sensory_loss} onChange={set('sensory_loss')} />
              </Field>
            </div>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Care information</div>
          <div className="form-grid-2">
            <Field label="Care level" htmlFor="resident-care-level" optional>
              <select id="resident-care-level" className="select" value={form.care_level} onChange={set('care_level')}>
                <option value="">Not specified</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="nursing">Nursing</option>
              </select>
            </Field>
            <Field label="Risk level" htmlFor="resident-risk-level" optional>
              <select id="resident-risk-level" className="select" value={form.risk_level} onChange={set('risk_level')}>
                <option value="">Not specified</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
          </div>
          <Field label="Behaviour notes" htmlFor="resident-behaviour" optional>
            <textarea id="resident-behaviour" className="textarea" rows={2} value={form.behaviour_notes} onChange={set('behaviour_notes')} />
          </Field>
          <Field label="Daily care notes" htmlFor="resident-daily-notes" optional>
            <textarea id="resident-daily-notes" className="textarea" rows={2} value={form.daily_care_notes} onChange={set('daily_care_notes')} />
          </Field>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Emergency contact</div>
          <div className="form-grid-2">
            <Field label="Contact name" htmlFor="resident-ec-name" optional>
              <IconInput icon={UserRound} id="resident-ec-name" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} />
            </Field>
            <Field label="Relationship" htmlFor="resident-ec-rel" optional>
              <IconInput icon={UserRound} id="resident-ec-rel" value={form.emergency_contact_relationship} onChange={set('emergency_contact_relationship')} />
            </Field>
            <Field label="Phone number" htmlFor="resident-ec-phone" optional>
              <IconInput icon={Phone} id="resident-ec-phone" type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} />
            </Field>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Personal information</div>
          <div className="form-grid-2">
            <Field label="Religion / beliefs" htmlFor="resident-religion" optional>
              <IconInput icon={Church} id="resident-religion" value={form.religion} onChange={set('religion')} />
            </Field>
            <Field label="Ethnicity" htmlFor="resident-ethnicity" optional>
              <IconInput icon={Globe2} id="resident-ethnicity" value={form.ethnicity} onChange={set('ethnicity')} />
            </Field>
            <Field label="Preferred language" htmlFor="resident-language" optional>
              <IconInput icon={Globe2} id="resident-language" value={form.preferred_language} onChange={set('preferred_language')} />
            </Field>
          </div>
        </div>

        {error && <div className="form-error-banner">{error}</div>}
      </form>
    </Modal>
  );
}