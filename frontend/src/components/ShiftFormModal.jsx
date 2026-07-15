import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { Field } from './Field.jsx';
import { shiftApi, ApiError } from '../lib/api.js';
import { isoToLocalInput, localToIso } from '../lib/format.js';

export default function ShiftFormModal({ shift, onClose, onSaved }) {
  const [startTime, setStartTime] = useState(isoToLocalInput(shift?.start_time) || defaultNow());
  const [endTime, setEndTime] = useState(isoToLocalInput(shift?.end_time));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(shift);

  async function onSubmit(e) {
    e.preventDefault();
    if (!startTime) return setError('Choose a start time.');
    setSaving(true);
    setError('');
    try {
      const startIso = localToIso(startTime);
      const endIso = localToIso(endTime);
      if (isEdit) {
        await shiftApi.update(shift.id, startIso, endIso);
      } else {
        await shiftApi.create(startIso, endIso);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this shift.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit shift' : 'Log a shift'}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : isEdit ? 'Save changes' : 'Log shift'}
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Field label="Start time" htmlFor="shift-start">
          <input id="shift-start" type="datetime-local" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="End time" htmlFor="shift-end" optional hint="Leave blank while the shift is still ongoing">
          <input id="shift-end" type="datetime-local" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
        {error && <div className="form-error-banner">{error}</div>}
      </form>
    </Modal>
  );
}

function defaultNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
