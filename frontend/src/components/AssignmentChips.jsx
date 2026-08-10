import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

// Where a chip navigates to when clicked, based on what kind of record it
// represents. Care workers and managers are both rows in the `users` table
// (Stage 5 kept a single table -- see the assignment system doc), so a
// "user" chip's route depends on the linked record's own role.
function routeFor(kind, item) {
  if (kind === 'resident') return `/residents/${item.id}`;
  if (item.role === 'manager') return `/managers/${item.id}`;
  return `/team/${item.id}`;
}

function chipText(item) {
  return item.name || item.username || item.employee_id || `#${item.id}`;
}

// Stage 7: these lists (a manager's care workers, a manager's residents
// overseen, a resident's assigned care workers, a care worker's caseload)
// have no upper bound -- a large home could easily have dozens of people
// on one list. Below these thresholds this renders exactly as before (a
// plain wrapped row of chips). Past them, a filter box appears and the
// list gets a fixed height with its own scrollbar, so one big assignment
// list can never push the rest of the profile page down indefinitely.
const FILTER_THRESHOLD = 8;
const SCROLL_THRESHOLD = 12;

/**
 * Renders a resident's assigned_care_workers / a care worker's
 * assigned_residents / a manager's managed_care_workers as a row of
 * clickable chips that jump to that record's profile page. Falls back to
 * an inline empty message (matching the ChipListField pattern) when the
 * list is empty.
 */
export default function AssignmentChips({ items, kind, emptyLabel = 'None assigned' }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  const count = items?.length || 0;
  const noun = kind === 'resident' ? 'resident' : 'person';
  const nounPlural = kind === 'resident' ? 'residents' : 'people';

  const visible = useMemo(() => {
    if (!items) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => chipText(item).toLowerCase().includes(q));
  }, [items, filter]);

  if (!items || items.length === 0) {
    return (
      <div className="profile-field-value" style={{ minHeight: 'unset', padding: 'var(--space-3)' }}>
        <span style={{ color: 'var(--text-tertiary)' }}>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="assignment-chips">
      {count > 1 && (
        <div className="assignment-chips-count">
          {count} {count === 1 ? noun : nounPlural}
        </div>
      )}

      {count > FILTER_THRESHOLD && (
        <div className="assignment-chips-search">
          <Search size={13} />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter ${count} ${nounPlural}\u2026`}
            aria-label={`Filter this list of ${nounPlural}`}
          />
        </div>
      )}

      <div className={`tag-strip${count > SCROLL_THRESHOLD ? ' tag-strip-scroll' : ''}`}>
        {visible.length === 0 && (
          <span className="assignment-chips-no-match">No matches for &ldquo;{filter}&rdquo;.</span>
        )}
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            className="badge badge-info"
            style={{ cursor: 'pointer', border: 'none' }}
            onClick={() => navigate(routeFor(kind, item))}
          >
            {chipText(item)}
          </button>
        ))}
      </div>
    </div>
  );
}