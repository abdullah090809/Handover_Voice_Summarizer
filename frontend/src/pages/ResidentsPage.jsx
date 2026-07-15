import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { residentApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { Avatar } from '../components/States.jsx';
import { ResidentStatusBadge } from '../components/Badge.jsx';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import ResidentDetailModal from '../components/ResidentDetailModal.jsx';
import ResidentFormModal from '../components/ResidentFormModal.jsx';
import HandoverDetailModal from '../components/HandoverDetailModal.jsx';

export default function ResidentsPage() {
  const { isManager } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const location = useLocation();

  const [residents, setResidents] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');
  const [openResident, setOpenResident] = useState(null);
  const [formResident, setFormResident] = useState(undefined); // undefined = closed, null = create, obj = edit
  const [openNote, setOpenNote] = useState(null);

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

  useEffect(() => {
    if (location.state?.openResidentId && residents) {
      const r = residents.find((x) => x.id === location.state.openResidentId);
      if (r) setOpenResident(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residents]);

  async function handleChangeStatus(resident, status) {
    try {
      await residentApi.updateStatus(resident.id, status);
      showToast(`${resident.name} marked as ${status}.`, 'success');
      setOpenResident(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update status.', 'error');
    }
  }

  async function handleDelete(resident) {
    const ok = await confirm({
      title: `Remove ${resident.name}?`,
      message: 'This permanently deletes the resident record. Their existing handover notes are kept for the record.',
      confirmLabel: 'Remove resident',
    });
    if (!ok) return;
    try {
      await residentApi.remove(resident.id);
      showToast('Resident removed.', 'success');
      setOpenResident(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not remove this resident.', 'error');
    }
  }

  const filtered = residents ? residents.filter((r) => (statusFilter ? r.status === statusFilter : true)) : [];

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
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
        <div className="card-grid">
          {filtered.map((r) => (
            <div key={r.id} className="card card-clickable entity-card" role="button" tabIndex={0} onClick={() => setOpenResident(r)}>
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
              </div>
            </div>
          ))}
        </div>
      )}

      {openResident && (
        <ResidentDetailModal
          resident={openResident}
          isManager={isManager}
          onClose={() => setOpenResident(null)}
          onChangeStatus={handleChangeStatus}
          onEdit={(r) => {
            setOpenResident(null);
            setFormResident(r);
          }}
          onDelete={handleDelete}
          onOpenNote={setOpenNote}
        />
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

      {openNote && <HandoverDetailModal note={openNote} residentName={openResident?.name} canDelete={false} onClose={() => setOpenNote(null)} />}
    </>
  );
}
