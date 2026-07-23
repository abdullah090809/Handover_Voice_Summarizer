import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, FileAudio } from 'lucide-react';
import { residentApi, userApi, handoverApi, resolveFileUrl } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Avatar } from './States.jsx';
import { UrgencyBadge } from './Badge.jsx';
import { truncate } from '../lib/format.js';

const ID_PATTERN = /^\d+$/;

export default function GlobalSearch() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [residents, setResidents] = useState(null);
  const [members, setMembers] = useState(null);

  // Handovers are searched by ID only, via a direct single-record lookup
  // (handoverApi.get) rather than loading and filtering a list. This means
  // it works identically whether there are 20 handover notes or 20,000 —
  // there's no list size to outgrow.
  const [noteResult, setNoteResult] = useState(null);
  const [noteStatus, setNoteStatus] = useState('idle'); // idle | loading | found | not-found
  const noteRequestRef = useRef(0);

  const wrapRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Prevent the page behind the full-screen mobile overlay from scrolling
  // while it's open.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileOpen]);

  async function ensureLoaded() {
    if (residents === null) {
      residentApi.list(true).then(setResidents).catch(() => setResidents([]));
    }
    if (isManager && members === null) {
      userApi.list().then(setMembers).catch(() => setMembers([]));
    }
  }

  const q = query.trim().toLowerCase();
  const idQuery = query.trim();
  const isIdQuery = ID_PATTERN.test(idQuery);

  // Debounced ID lookup — waits 300ms after typing stops, and ignores any
  // response that isn't for the most recent query (in case an older, slower
  // request resolves after a newer one).
  useEffect(() => {
    if (!isIdQuery) {
      setNoteResult(null);
      setNoteStatus('idle');
      return undefined;
    }
    const requestId = ++noteRequestRef.current;
    setNoteStatus('loading');
    const timer = setTimeout(() => {
      handoverApi
        .get(idQuery)
        .then((note) => {
          if (noteRequestRef.current !== requestId) return; // stale response
          setNoteResult(note);
          setNoteStatus('found');
        })
        .catch(() => {
          if (noteRequestRef.current !== requestId) return;
          setNoteResult(null);
          setNoteStatus('not-found');
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [idQuery, isIdQuery]);

  function closeMobile() {
    setMobileOpen(false);
    setQuery('');
  }

  function goToResident(r) {
    setOpen(false);
    closeMobile();
    navigate('/residents', { state: { openResidentId: r.id }, viewTransition: true });
  }

  function goToTeam() {
    setOpen(false);
    closeMobile();
    navigate('/team', { viewTransition: true });
  }

  function goToHandover(n) {
    setOpen(false);
    closeMobile();
    navigate('/handovers', { state: { openHandoverId: n.id }, viewTransition: true });
  }

  const residentMap = React.useMemo(() => Object.fromEntries((residents || []).map((r) => [r.id, r.name])), [residents]);

  // Residents and team are matched by name/email — handovers are ID-only
  // (see the effect above), so they never appear in these two lists.
  const residentMatches = q && !isIdQuery && residents ? residents.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const memberMatches = q && !isIdQuery && members ? members.filter((m) => m.email.toLowerCase().includes(q)).slice(0, 5) : [];

  const hasResults = residentMatches.length > 0 || memberMatches.length > 0 || noteStatus === 'found';

  function ResultsList() {
    return (
      <>
        {q && !hasResults && noteStatus !== 'loading' && <div className="search-dropdown-empty">No matches for &ldquo;{query}&rdquo;</div>}

        {isIdQuery && noteStatus === 'loading' && <div className="search-dropdown-empty">Looking up handover #{idQuery}&hellip;</div>}

        {isIdQuery && noteStatus === 'found' && noteResult && (
          <>
            <div className="search-dropdown-label">Handover</div>
            <button type="button" className="list-row" onClick={() => goToHandover(noteResult)}>
              <span className="list-row-icon">
                <FileAudio size={15} />
              </span>
              <span className="list-row-body">
                <span className="list-row-title">
                  #{noteResult.id} &middot; {residentMap[noteResult.resident_id] || 'Resident'}
                </span>
                <span className="list-row-meta">{truncate(noteResult.summary_json?.summary, 70) || 'No summary available'}</span>
              </span>
              <span className="list-row-side">
                <UrgencyBadge urgency={noteResult.urgency_flag} />
              </span>
            </button>
          </>
        )}

        {residentMatches.length > 0 && (
          <>
            <div className="search-dropdown-label">Residents</div>
            {residentMatches.map((r) => (
              <button key={`r-${r.id}`} type="button" className="list-row" onClick={() => goToResident(r)}>
                <Avatar text={r.name} size="sm" />
                <span className="list-row-body">
                  <span className="list-row-title">{r.name}</span>
                  <span className="list-row-meta">Resident &middot; {r.status}</span>
                </span>
              </button>
            ))}
          </>
        )}

        {memberMatches.length > 0 && (
          <>
            <div className="search-dropdown-label">Team</div>
            {memberMatches.map((m) => (
              <button key={`m-${m.id}`} type="button" className="list-row" onClick={goToTeam}>
                <Avatar text={m.name || m.email} size="sm" src={resolveFileUrl(m.profile_photo_url)} />
                <span className="list-row-body">
                  <span className="list-row-title">{m.name || m.email}</span>
                  <span className="list-row-meta">Team member &middot; {m.role}</span>
                </span>
              </button>
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <>
      {/* Desktop / tablet: inline search box in the topbar (hidden on phones
          via .topbar-search's own responsive rules). */}
      <div className="topbar-search" ref={wrapRef}>
        <Search />
        <input
          type="text"
          placeholder="Search residents, team, handovers…"
          value={query}
          onFocus={() => {
            setOpen(true);
            ensureLoaded();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          aria-label="Search residents, team members, or a handover by ID"
        />
        {open && q && (
          <div className="search-dropdown">
            <ResultsList />
          </div>
        )}
      </div>

      {/* Phones: a dedicated icon that opens a full-screen search overlay —
          more reliable to tap into and type in than a squeezed inline field. */}
      <button
        type="button"
        className="icon-btn mobile-search-trigger"
        aria-label="Search"
        onClick={() => {
          setMobileOpen(true);
          ensureLoaded();
        }}
      >
        <Search size={19} />
      </button>

      {mobileOpen && (
        <div className="mobile-search-overlay" role="dialog" aria-modal="true" aria-label="Search">
          <div className="mobile-search-overlay-header">
            <button type="button" className="icon-btn" aria-label="Close search" onClick={closeMobile}>
              <ArrowLeft size={19} />
            </button>
            <div className="mobile-search-overlay-input-wrap">
              <Search size={16} />
              <input
                type="text"
                autoFocus
                placeholder="Search residents, team, handovers…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search residents, team members, or a handover by ID"
              />
            </div>
          </div>
          <div className="mobile-search-overlay-body">
            {!q && <p className="mobile-search-hint">Search residents and team by name, or a handover note by its # ID.</p>}
            {q && <ResultsList />}
          </div>
        </div>
      )}
    </>
  );
}