import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Clock, Pencil, Trash2 } from 'lucide-react';
import { shiftApi, userApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import ShiftFormModal from '../components/ShiftFormModal.jsx';
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../lib/usePagination.js';
import { formatDateTime } from '../lib/format.js';

function getShiftStatus(shift) {
  const now = Date.now();
  const start = new Date(shift.start_time).getTime();
  const end = shift.end_time ? new Date(shift.end_time).getTime() : null;
  if (start > now) return 'upcoming';
  if (end && end <= now) return 'completed';
  return 'ongoing';
}

const STATUS_BADGE = {
  upcoming: { cls: 'badge-info', label: 'Upcoming' },
  ongoing: { cls: 'badge-active', label: 'Ongoing' },
  completed: { cls: 'badge-neutral', label: 'Completed' },
};

export default function ShiftsPage() {
  const { isManager } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();

  const [shifts, setShifts] = useState(null);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [formShift, setFormShift] = useState(undefined);

  const load = useCallback(
    async (workerId) => {
      setError(null);
      try {
        const data = await shiftApi.list(workerId || undefined);
        setShifts(data.slice().sort((a, b) => new Date(b.start_time) - new Date(a.start_time)));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load shifts.');
      }
    },
    []
  );

  useEffect(() => {
    if (isManager) {
      userApi.list().then((data) => {
        const workers = data.filter((u) => u.role !== 'manager' && u.role !== 'deactivated');
        setMembers(workers);
        if (workers.length > 0) {
          setSelectedWorkerId(workers[0].id);
          load(workers[0].id);
        } else {
          setShifts([]);
        }
      }).catch(() => setShifts([]));
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  const { pageItems, page, pageCount, total, setPage, resetToFirstPage } = usePagination(shifts || [], { pageSize: 9 });

  function onWorkerChange(id) {
    setSelectedWorkerId(id);
    setShifts(null);
    resetToFirstPage();
    load(id);
  }

  async function handleDelete(shift) {
    const ok = await confirm({
      title: 'Delete this shift?',
      message: `This removes shift #${shift.id} from your schedule.`,
      confirmLabel: 'Delete shift',
    });
    if (!ok) return;
    try {
      await shiftApi.remove(shift.id);
      showToast('Shift deleted.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not delete this shift.', 'error');
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Shifts</h1>
          <p>{isManager ? "Review your team's logged shifts." : 'Log and manage your own shifts.'}</p>
        </div>
        {!isManager && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setFormShift(null)}>
              <Plus size={16} /> Log shift
            </button>
          </div>
        )}
      </div>

      {isManager && members.length > 0 && (
        <div className="filter-bar">
          <select className="select" value={selectedWorkerId} onChange={(e) => onWorkerChange(Number(e.target.value))}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {shifts === null && !error && <SkeletonGrid />}
      {error && <ErrorState message={error} onRetry={() => load(isManager ? selectedWorkerId : undefined)} />}
      {shifts !== null && shifts.length === 0 && (
        <EmptyState icon={Clock} title="No shifts found" message={isManager ? 'This team member has no logged shifts yet.' : 'Log your first shift to get started.'} />
      )}
      {shifts !== null && shifts.length > 0 && (
        <>
          <div className="card-grid">
            {pageItems.map((s) => {
              const st = getShiftStatus(s);
              return (
                <div className="card entity-card" key={s.id}>
                  <div className="entity-card-top">
                    <div>
                      <div className="entity-card-title">Shift #{s.id}</div>
                      <div className="entity-card-subtitle">{formatDateTime(s.start_time)}</div>
                    </div>
                    <span className={`badge ${STATUS_BADGE[st].cls}`}>{STATUS_BADGE[st].label}</span>
                  </div>
                  <div className="entity-card-body">
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>Ends: </strong>
                      {s.end_time ? formatDateTime(s.end_time) : 'Not yet clocked out'}
                    </div>
                  </div>
                  {!isManager && (
                    <div className="entity-card-footer">
                      <button className="icon-btn" aria-label="Edit shift" onClick={() => setFormShift(s)}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn" aria-label="Delete shift" onClick={() => handleDelete(s)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={9} onPageChange={setPage} itemLabel="shifts" />
        </>
      )}

      {formShift !== undefined && (
        <ShiftFormModal
          shift={formShift}
          onClose={() => setFormShift(undefined)}
          onSaved={() => {
            setFormShift(undefined);
            showToast(formShift ? 'Shift updated.' : 'Shift logged.', 'success');
            load();
          }}
        />
      )}
    </>
  );
}
