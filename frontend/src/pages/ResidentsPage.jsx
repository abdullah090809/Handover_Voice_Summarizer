import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, Search, ShieldAlert } from 'lucide-react';
import { residentApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { Avatar, SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import { ResidentStatusBadge } from '../components/Badge.jsx';
import { IconInput } from '../components/Field.jsx';
import ResidentFormModal from '../components/ResidentFormModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../lib/usePagination.js';
import { formatDate } from '../lib/format.js';

export default function ResidentsPage() {
  const { isManager } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();

  const [residents, setResidents] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      // includeInactive=true so managers can still filter to discharged /
      // deceased records from this one list rather than losing them entirely.
      const data = await residentApi.list(true);
      setResidents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load residents.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!residents) return [];
    const q = search.trim().toLowerCase();
    return residents.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name?.toLowerCase().includes(q) ||
        r.preferred_name?.toLowerCase().includes(q) ||
        r.resident_code?.toLowerCase().includes(q) ||
        r.room_number?.toLowerCase().includes(q) ||
        r.ward_unit?.toLowerCase().includes(q)
      );
    });
  }, [residents, search, statusFilter]);

  const { pageItems, page, pageCount, total, setPage } = usePagination(filtered, { pageSize: 10 });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Residents</h1>
          <p>Resident records, care details, and handover history.</p>
        </div>
        {isManager && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
              <Plus size={16} /> Add resident
            </button>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <IconInput
          icon={Search}
          type="text"
          placeholder="Search by name, room, or ward…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search residents"
        />
        <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
          <option value="active">Active</option>
          <option value="discharged">Discharged</option>
          <option value="deceased">Deceased</option>
          <option value="all">All statuses</option>
        </select>
      </div>

      {residents === null && !error && <SkeletonGrid />}
      {error && <ErrorState message={error} onRetry={load} />}

      {residents !== null && !error && filtered.length === 0 && (
        <EmptyState
          icon={Users}
          title={residents.length === 0 ? 'No residents yet' : 'No residents match your filters'}
          message={
            residents.length === 0
              ? 'Add a resident to start recording their care details and handovers.'
              : 'Try a different search term or status filter.'
          }
          action={
            isManager &&
            residents.length === 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>
                <Plus size={15} /> Add resident
              </button>
            )
          }
        />
      )}

      {residents !== null && filtered.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Status</th>
                  <th>Room / Ward</th>
                  <th>Care level</th>
                  <th>Care workers</th>
                  <th>Admitted</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => (
                  <tr key={r.id} className="row-clickable" onClick={() => navigate(`/residents/${r.id}`)}>
                    <td data-label="Resident">
                      <div className="team-member-row">
                        <Avatar text={r.preferred_name || r.name} size="sm" />
                        <div className="team-member-info">
                          <div className="team-member-name" style={{ fontWeight: 600 }}>{r.preferred_name || r.name}</div>
                          <div className="team-member-email" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                            {r.resident_code || `Resident #${r.id}`}
                            {r.age != null ? ` \u00b7 Age ${r.age}` : ''}
                          </div>
                        </div>
                        {r.allergies?.length > 0 && (
                          <span className="badge badge-high" aria-label="Has recorded allergies">
                            <ShieldAlert size={12} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label="Status">
                      <ResidentStatusBadge status={r.status} />
                    </td>
                    <td data-label="Room / Ward" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {[r.room_number ? `Room ${r.room_number}` : null, r.ward_unit].filter(Boolean).join(' \u00b7 ') || '\u2014'}
                    </td>
                    <td data-label="Care level" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {r.care_level ? r.care_level[0].toUpperCase() + r.care_level.slice(1) : '\u2014'}
                    </td>
                    <td data-label="Care workers" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {r.assigned_care_worker_count ?? r.assigned_care_workers?.length ?? 0}
                    </td>
                    <td data-label="Admitted" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      {r.admission_date ? formatDate(r.admission_date) : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={10} onPageChange={setPage} itemLabel="residents" />
        </>
      )}

      {isManager && (
        <button type="button" className="mobile-fab" onClick={() => setFormOpen(true)} aria-label="Add resident">
          <Plus size={24} />
        </button>
      )}

      {formOpen && (
        <ResidentFormModal
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            showToast('Resident added.', 'success');
            load();
          }}
        />
      )}
    </>
  );
}