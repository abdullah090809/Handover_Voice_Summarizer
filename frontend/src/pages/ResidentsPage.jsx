import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { residentApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { Avatar } from '../components/States.jsx';
import { ResidentStatusBadge } from '../components/Badge.jsx';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import ResidentFormModal from '../components/ResidentFormModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../lib/usePagination.js';

export default function ResidentsPage() {
  const { isManager } = useAuth();
  const showToast = useToast();
  const navigate = useNavigate();

  const [residents, setResidents] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [formResident, setFormResident] = useState(undefined); // undefined = closed, null = create, obj = edit

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await residentApi.list(true);
      setResidents(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load residents.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = residents ? residents.filter((r) => (statusFilter ? r.status === statusFilter : true)) : [];
  const { pageItems, page, pageCount, total, setPage, resetToFirstPage } = usePagination(filtered, { pageSize: 9 });

  function handleStatusFilterChange(value) {
    setStatusFilter(value);
    resetToFirstPage();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Residents</h1>
          <p>{isManager ? 'Manage residents and review their care history.' : 'Active residents at your care home.'}</p>
        </div>
        {isManager && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setFormResident(null)}>
              <Plus size={16} /> Add resident
            </button>
          </div>
        )}
      </div>

      {isManager && (
        <div className="filter-bar">
          <select className="select" value={statusFilter} onChange={(e) => handleStatusFilterChange(e.target.value)}>
            <option value="active">Active</option>
            <option value="discharged">Discharged</option>
            <option value="deceased">Deceased</option>
            <option value="">All residents</option>
          </select>
        </div>
      )}

      {residents === null && !error && <SkeletonGrid />}
      {error && <ErrorState message={error} onRetry={load} />}
      {residents !== null && filtered.length === 0 && (
        <EmptyState icon={Users} title="No residents found" message="Residents matching this filter will appear here." />
      )}
      {residents !== null && filtered.length > 0 && (
        <>
          <div className="card-grid">
            {pageItems.map((r) => (
              <div key={r.id} className="card card-clickable entity-card" role="button" tabIndex={0} onClick={() => navigate(`/residents/${r.id}`)}>
                <div className="entity-card-top">
                  <div className="entity-card-heading">
                    <Avatar text={r.name} size="lg" />
                    <div>
                      <div className="entity-card-title">{r.name}</div>
                      <div className="entity-card-subtitle">Resident #{r.id}</div>
                    </div>
                  </div>
                </div>
                <div className="entity-card-body">
                  <ResidentStatusBadge status={r.status} />
                  <span className="badge badge-info">
                    <Users size={12} style={{ marginRight: 4 }} />
                    {r.assigned_care_workers?.length
                      ? `${r.assigned_care_workers.length} care worker${r.assigned_care_workers.length === 1 ? '' : 's'}`
                      : 'Unassigned'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={9} onPageChange={setPage} itemLabel="residents" />
        </>
      )}

      {formResident !== undefined && (
        <ResidentFormModal
          resident={formResident}
          onClose={() => setFormResident(undefined)}
          onSaved={() => {
            setFormResident(undefined);
            showToast(formResident ? 'Resident updated.' : 'Resident added.', 'success');
            load();
          }}
        />
      )}
    </>
  );
}

