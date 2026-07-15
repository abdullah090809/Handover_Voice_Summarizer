import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { Field, IconInput } from './Field.jsx';
import { User } from 'lucide-react';
import { residentApi, ApiError } from '../lib/api.js';

export default function ResidentFormModal({ resident, onClose, onSaved }) {
  const [name, setName] = useState(resident?.name || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(resident);

  async function onSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name.');
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await residentApi.update(resident.id, name.trim());
      } else {
        await residentApi.create(name.trim());
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
      title={isEdit ? 'Rename resident' : 'Add resident'}
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
      <form onSubmit={onSubmit}>
        <Field label="Full name" htmlFor="resident-name" error={error}>
          <IconInput icon={User} id="resident-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </form>
    </Modal>
  );
}
