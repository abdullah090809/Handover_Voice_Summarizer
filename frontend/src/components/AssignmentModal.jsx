import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from './Modal.jsx';
import { IconInput } from './Field.jsx';
import { ApiError } from '../lib/api.js';

/**
 * Generic assignment picker -- used for all three Stage 5 assignment
 * workflows: a resident's care-worker set, a care worker's resident
 * caseload, and a care worker's manager. `mode="multi"` renders checkboxes
 * and calls onSave with the full new id array (matches the backend's
 * "replace the entire set" PUT endpoints). `mode="single"` renders radio
 * buttons (plus a "No manager" option) and calls onSave with a single id
 * or null (matches the PATCH .../manager endpoint).
 */
export default function AssignmentModal({
  title,
  subtitle,
  mode = 'multi',
  options, // [{ id, label, sublabel }] | null while still loading
  initialSelectedIds = [],
  onClose,
  onSave,
  saveLabel = 'Save',
  emptyOptionsLabel = 'Nothing available to assign.',
  allowNone = true,
  noneLabel = 'No manager',
}) {
  const loadingOptions = options === null;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() =>
    mode === 'single' ? (initialSelectedIds[0] ?? null) : new Set(initialSelectedIds)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (loadingOptions) return [];
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q)
    );
  }, [options, query, loadingOptions]);

  function toggle(id) {
    if (mode === 'single') {
      setSelected((current) => (current === id ? current : id));
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = mode === 'single' ? selected : Array.from(selected);
      await onSave(payload);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save these assignments.');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || loadingOptions}>
            {saving ? <span className="spinner" /> : saveLabel}
          </button>
        </>
      }
    >
      {loadingOptions ? (
        <div className="skeleton-rows" aria-busy="true" aria-live="polite">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
          <div className="skeleton-line" style={{ width: '70%' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {options.length > 0 && (
            <IconInput
              icon={Search}
              type="text"
              placeholder="Search…"
              aria-label="Search assignable options"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}

          <div
            role={mode === 'single' ? 'radiogroup' : 'group'}
            aria-label={title}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 340, overflowY: 'auto' }}
          >
            {mode === 'single' && allowNone && (
              <label className="checkbox-row">
                <input
                  type="radio"
                  name="assignment-single"
                  aria-label={noneLabel}
                  checked={selected === null}
                  onChange={() => setSelected(null)}
                />
                <span style={{ color: 'var(--text-tertiary)' }}>{noneLabel}</span>
              </label>
            )}

            {filtered.length === 0 && (
              <div className="profile-field-value" style={{ minHeight: 'unset', padding: 'var(--space-3)' }} role="status">
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {options.length === 0 ? emptyOptionsLabel : 'No matches.'}
                </span>
              </div>
            )}

            {filtered.map((opt) => (
              <label key={opt.id} className="checkbox-row">
                <input
                  type={mode === 'single' ? 'radio' : 'checkbox'}
                  name={mode === 'single' ? 'assignment-single' : undefined}
                  aria-label={opt.sublabel ? `${opt.label}, ${opt.sublabel}` : opt.label}
                  checked={mode === 'single' ? selected === opt.id : selected.has(opt.id)}
                  onChange={() => toggle(opt.id)}
                />
                <span>
                  {opt.label}
                  {opt.sublabel && <span style={{ color: 'var(--text-tertiary)' }}> · {opt.sublabel}</span>}
                </span>
              </label>
            ))}
          </div>

          {error && <div className="form-error-banner" role="alert">{error}</div>}
        </div>
      )}
    </Modal>
  );
}
