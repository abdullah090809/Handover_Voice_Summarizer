import React from 'react';
import { useNavigate } from 'react-router-dom';

// Where a chip navigates to when clicked, based on what kind of record it
// represents. Care workers and managers are both rows in the `users` table
// (Stage 5 kept a single table -- see the assignment system doc), so a
// "user" chip's route depends on the linked record's own role.
function routeFor(kind, item) {
  if (kind === 'resident') return `/residents/${item.id}`;
  if (item.role === 'manager') return `/managers/${item.id}`;
  return `/team/${item.id}`;
}

/**
 * Renders a resident's assigned_care_workers / a care worker's
 * assigned_residents / a manager's managed_care_workers as a row of
 * clickable chips that jump to that record's profile page. Falls back to
 * an inline empty message (matching the ChipListField pattern) when the
 * list is empty.
 */
export default function AssignmentChips({ items, kind, emptyLabel = 'None assigned' }) {
  const navigate = useNavigate();

  if (!items || items.length === 0) {
    return (
      <div className="profile-field-value" style={{ minHeight: 'unset', padding: 'var(--space-3)' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="tag-strip">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="badge badge-info"
          style={{ cursor: 'pointer', border: 'none' }}
          onClick={() => navigate(routeFor(kind, item))}
        >
          {item.name || item.username || item.employee_id || `#${item.id}`}
        </button>
      ))}
    </div>
  );
}
