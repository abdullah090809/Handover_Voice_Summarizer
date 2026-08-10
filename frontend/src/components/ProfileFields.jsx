import React from 'react';

// Read-only field renderers shared by the Resident, Care Worker, and Manager
// profile pages. Previously each page defined its own near-identical copy of
// these -- that let the empty-state wording ("Not recorded") and layout
// quietly drift apart between record types. Keeping one copy here means all
// three profile pages render fields identically by construction.

export function ReadField({ icon: Icon, label, value, fullWidth }) {
  return (
    <div className={`profile-field${fullWidth ? ' profile-field-full' : ''}`}>
      <span className="profile-field-label">
        <Icon size={13} /> {label}
      </span>
      <div className="profile-field-value">{value || <span style={{ color: 'var(--text-tertiary)' }}>Not recorded</span>}</div>
    </div>
  );
}

export function ChipListField({ icon: Icon, label, items, emptyLabel }) {
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
