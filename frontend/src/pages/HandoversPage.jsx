import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, FileAudio } from 'lucide-react';
import { handoverApi, residentApi, shiftApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { useConfirm } from '../lib/ConfirmContext.jsx';
import { useLiveUpdates } from '../lib/WebSocketContext.jsx';
import HandoverCard from '../components/HandoverCard.jsx';
import HandoverDetailModal from '../components/HandoverDetailModal.jsx';
import NewHandoverModal from '../components/NewHandoverModal.jsx';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../lib/usePagination.js';

export default function HandoversPage() {
  const { isManager } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const { subscribe } = useLiveUpdates();
  const location = useLocation();

  const [notes, setNotes] = useState(null);
  const [error, setError] = useState(null);
  const [residents, setResidents] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [residentFilter, setResidentFilter] = useState('');
  const [openNote, setOpenNote] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [notesData, residentsData] = await Promise.all([
        handoverApi.list({ urgency: urgencyFilter || undefined, residentId: residentFilter || undefined }),
        residentApi.list(true),
      ]);
      setNotes(notesData);
      setResidents(residentsData);
      if (!isManager) {
        shiftApi.list().then(setShifts).catch(() => setShifts([]));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load handover notes.');
    }
  }, [urgencyFilter, residentFilter, isManager]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => subscribe((event) => {
    if (event.type === 'handover_updated') load();
  }), [subscribe, load]);

  useEffect(() => {
    if (location.state?.openHandoverId && notes) {
      const n = notes.find((x) => x.id === location.state.openHandoverId);
      if (n) setOpenNote(n);
      window.history.replaceState({}, document.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, notes]);

  const residentMap = useMemo(() => Object.fromEntries(residents.map((r) => [r.id, r.name])), [residents]);

  async function handleDelete(note) {
    const ok = await confirm({
      title: 'Delete this handover note?',
      message: `This permanently removes note #${note.id} for ${residentMap[note.resident_id] || 'this resident'}. This can't be undone.`,
      confirmLabel: 'Delete note',
    });
    if (!ok) return;
    try {
      await handoverApi.remove(note.id);
      showToast('Handover note deleted.', 'success');
      setOpenNote(null);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not delete this note.', 'error');
    }
  }

  const activeResidents = residents.filter((r) => r.status === 'active');
  const { pageItems, page, pageCount, total, setPage, resetToFirstPage } = usePagination(notes || [], { pageSize: 9 });

  function handleUrgencyFilterChange(value) {
    setUrgencyFilter(value);
    resetToFirstPage();
  }

  function handleResidentFilterChange(value) {
    setResidentFilter(value);
    resetToFirstPage();
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Handover Notes</h1>
          <p>Voice handovers, transcribed and structured automatically at shift end.</p>
        </div>
        {!isManager && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setShowNewModal(true)}>
              <Plus size={16} /> New handover
            </button>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <select className="select" value={urgencyFilter} onChange={(e) => handleUrgencyFilterChange(e.target.value)} aria-label="Filter by urgency">
          <option value="">All urgency levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <select className="select" value={residentFilter} onChange={(e) => handleResidentFilterChange(e.target.value)} aria-label="Filter by resident">
          <option value="">All residents</option>
          {residents.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {notes === null && !error && <SkeletonGrid />}
      {error && <ErrorState message={error} onRetry={load} />}
      {notes !== null && notes.length === 0 && (
        <EmptyState
          icon={FileAudio}
          title="No handover notes yet"
          message={
            isManager
              ? 'Handover notes submitted by your team will appear here.'
              : 'Record your first handover at the end of your shift and it will show up here.'
          }
          action={
            !isManager && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewModal(true)}>
                <Plus size={15} /> New handover
              </button>
            )
          }
        />
      )}
      {notes !== null && notes.length > 0 && (
        <>
          <div className="card-grid">
            {pageItems.map((note) => (
              <HandoverCard
                key={note.id}
                note={note}
                residentName={residentMap[note.resident_id]}
                canDelete={isManager}
                onOpen={setOpenNote}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={9} onPageChange={setPage} itemLabel="handover notes" />
        </>
      )}

      {!isManager && (
        <button type="button" className="mobile-fab" onClick={() => setShowNewModal(true)} aria-label="New handover">
          <Plus size={24} />
        </button>
      )}

      {openNote && (
        <HandoverDetailModal
          note={notes.find((n) => n.id === openNote.id) || openNote}
          residentName={residentMap[openNote.resident_id]}
          canDelete={isManager}
          onClose={() => setOpenNote(null)}
          onDelete={handleDelete}
        />
      )}

      {showNewModal && (
        <NewHandoverModal
          residents={activeResidents}
          shifts={shifts}
          onClose={() => setShowNewModal(false)}
          onSubmitted={() => {
            setShowNewModal(false);
            load();
          }}
        />
      )}
    </>
  );
}