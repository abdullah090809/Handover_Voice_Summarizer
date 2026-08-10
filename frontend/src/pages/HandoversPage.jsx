import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
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
import { formatHandoverCode } from '../lib/format.js';

// Handover notes are paginated server-side (see /handover GET: skip/limit +
// a `total` count). Previously this page fetched a single page of up to 50
// notes and treated that array's `.length` as if it were the grand total —
// so "notes on record" silently under/over-reported the real count and
// looked like it moved by odd amounts whenever the visible page changed.
// Now the page number itself drives `skip`, and `total` always comes
// straight from the API response.
const PAGE_SIZE = 9;

export default function HandoversPage() {
  const { isManager } = useAuth();
  const showToast = useToast();
  const confirm = useConfirm();
  const { subscribe } = useLiveUpdates();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawPage = parseInt(searchParams.get('page'), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const [notes, setNotes] = useState(null); // current page of results only
  const [total, setTotal] = useState(0); // true record count from the API
  const [error, setError] = useState(null);
  const [residents, setResidents] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [residentFilter, setResidentFilter] = useState('');
  const [openNote, setOpenNote] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setPage = useCallback(
    (next) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next <= 1) params.delete('page');
          else params.set('page', String(next));
          return params;
        },
        { replace: true, preventScrollReset: true }
      );
    },
    [setSearchParams]
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [notesData, residentsData] = await Promise.all([
        handoverApi.list({
          urgency: urgencyFilter || undefined,
          residentId: residentFilter || undefined,
          skip: (page - 1) * PAGE_SIZE,
          limit: PAGE_SIZE,
        }),
        residentApi.list(true),
      ]);
      setNotes(notesData.results);
      setTotal(typeof notesData.total === 'number' ? notesData.total : notesData.results.length);
      setResidents(residentsData);
      if (!isManager) {
        shiftApi.list().then(setShifts).catch(() => setShifts([]));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load handover notes.');
    }
  }, [urgencyFilter, residentFilter, page, isManager]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => subscribe((event) => {
    if (event.type === 'handover_updated') load();
  }), [subscribe, load]);

  // If the current page falls out of range (filters changed, a note was
  // deleted, etc), snap back to the last valid page instead of showing an
  // empty page or a stale-looking count.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount, setPage]);

  useEffect(() => {
    const targetId = location.state?.openHandoverId;
    if (!targetId || notes === null) return;
    const found = notes.find((x) => x.id === targetId);
    if (found) {
      setOpenNote(found);
    } else {
      // The requested note isn't on the currently loaded page (server-side
      // pagination only ever holds PAGE_SIZE notes in memory) — fetch it
      // directly instead of silently failing to open it.
      handoverApi.get(targetId).then(setOpenNote).catch(() => {
        showToast('That handover note could not be found.', 'error');
      });
    }
    window.history.replaceState({}, document.title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, notes]);

  const residentMap = useMemo(() => Object.fromEntries(residents.map((r) => [r.id, r.name])), [residents]);
  const residentCodeMap = useMemo(() => Object.fromEntries(residents.map((r) => [r.id, r.resident_code])), [residents]);

  async function handleDelete(note) {
    const ok = await confirm({
      title: 'Delete this handover note?',
      message: `This permanently removes ${formatHandoverCode(note.id)} for ${residentMap[note.resident_id] || 'this resident'}. This can't be undone.`,
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

  function handleUrgencyFilterChange(value) {
    setUrgencyFilter(value);
    setPage(1);
  }

  function handleResidentFilterChange(value) {
    setResidentFilter(value);
    setPage(1);
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
              {r.name}{r.resident_code ? ` (${r.resident_code})` : ''}
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
            {notes.map((note) => (
              <HandoverCard
                key={note.id}
                note={note}
                residentName={residentMap[note.resident_id]}
                residentCode={residentCodeMap[note.resident_id]}
                canDelete={isManager}
                onOpen={setOpenNote}
                onDelete={handleDelete}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="handover notes" />
        </>
      )}

      {!isManager && (
        <button type="button" className="mobile-fab" onClick={() => setShowNewModal(true)} aria-label="New handover">
          <Plus size={24} />
        </button>
      )}

      {openNote && (
        <HandoverDetailModal
          note={notes?.find((n) => n.id === openNote.id) || openNote}
          residentName={residentMap[openNote.resident_id]}
          residentCode={residentCodeMap[openNote.resident_id]}
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