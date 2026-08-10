import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, FileAudio, UserRound, UserCog } from 'lucide-react';
import { residentApi, userApi, handoverApi, resolveFileUrl } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Avatar } from './States.jsx';
import { UrgencyBadge } from './Badge.jsx';
import { truncate, formatHandoverCode } from '../lib/format.js';

// A bare number (no prefix) is kept as a legacy shortcut for "look up a
// handover by its raw numeric id" -- this is the behavior the app already
// had, left in place for anyone used to typing just the number.
const ID_PATTERN = /^\d+$/;

// Prefixed identifiers (R-0001, EMP-0005, MGR-0001, HO-0001) all number off
// the same auto-generated scheme as the record's own database id (see
// resident_code / employee_id generation in the backend), just zero-padded
// and prefixed by entity type. The prefix is what tells us *which* entity
// to look up -- matching on the trailing digits alone would let "R-0001"
// resolve to whatever row happens to have id 1 regardless of type, which
// is exactly the bug this fixes. Hyphen is optional and matching is
// case-insensitive, so "r1", "R-0001", and "r-0001" all resolve the same
// way.
const PREFIXED_ID_PATTERN = /^(R|EMP|MGR|HO)-?0*(\d+)$/i;

// Each entry: how to fetch the single record for that prefix, given the
// bare numeric id, plus how to confirm the record we got back is actually
// of that type. The fetch alone isn't enough to guarantee this -- e.g.
// GET /users/{id} will happily return a care worker even when the query
// asked for a manager's id -- so `matches` re-checks the returned record's
// own role/type before it's ever shown as a result. A mismatch is treated
// exactly like "not found", never silently shown as the wrong entity.
const ID_LOOKUPS = {
  R: {
    label: 'Resident',
    icon: UserRound,
    fetch: (id) => residentApi.get(id),
    matches: () => true,
    title: (record) => record.name,
    subtitle: (record) => `Resident \u00b7 ${record.status}`,
    goTo: (record) => `/residents/${record.id}`,
  },
  EMP: {
    label: 'Careworker',
    icon: UserRound,
    fetch: (id) => userApi.get(id),
    matches: (record) => record.role === 'care_worker',
    title: (record) => record.name || record.username,
    subtitle: (record) => `Careworker \u00b7 ${record.employee_id || `#${record.id}`}`,
    goTo: (record) => `/team/${record.id}`,
  },
  MGR: {
    label: 'Manager',
    icon: UserCog,
    fetch: (id) => userApi.get(id),
    matches: (record) => record.role === 'manager',
    title: (record) => record.name || record.username,
    subtitle: (record) => `Manager \u00b7 ${record.employee_id || `#${record.id}`}`,
    goTo: (record) => `/managers/${record.id}`,
  },
  HO: {
    label: 'Handover',
    icon: FileAudio,
    fetch: (id) => handoverApi.get(id),
    matches: () => true,
    title: (record, residentMap) => `${formatHandoverCode(record.id)} \u00b7 ${residentMap[record.resident_id] || 'Resident'}`,
    subtitle: (record) => truncate(record.summary_json?.summary, 70) || 'No summary available',
    goTo: null, // handled specially -- opens the handover modal, not a route
  },
};

export default function GlobalSearch() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [residents, setResidents] = useState(null);
  const [members, setMembers] = useState(null);

  // Identifier queries (R-0001, EMP-0005, MGR-0001, HO-0001, or a bare
  // number) are resolved via a direct single-record lookup against the
  // correct backend endpoint for that entity type, rather than loading and
  // filtering a list. This means it works identically whether there are 20
  // records or 20,000 -- there's no list size to outgrow -- and it lets
  // the backend (not a client-side guess) be the source of truth for
  // whether the record exists and is visible to the current user (e.g. a
  // care worker searching a resident id they aren't assigned to gets a
  // real "not found" from the backend, not just a hidden row).
  const [idResult, setIdResult] = useState(null); // { prefix, record } | null
  const [idStatus, setIdStatus] = useState('idle'); // idle | loading | found | not-found
  const idRequestRef = useRef(0);

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
  const prefixedMatch = idQuery.match(PREFIXED_ID_PATTERN);
  const isBareNumber = ID_PATTERN.test(idQuery);
  const isIdQuery = Boolean(prefixedMatch) || isBareNumber;

  // A prefixed query resolves to that exact entity type. A bare number
  // keeps the legacy "handover by raw id" behavior.
  const activePrefix = prefixedMatch ? prefixedMatch[1].toUpperCase() : isBareNumber ? 'HO' : null;
  const activeId = prefixedMatch ? prefixedMatch[2] : isBareNumber ? idQuery : null;

  // Debounced ID lookup -- waits 300ms after typing stops, and ignores any
  // response that isn't for the most recent query (in case an older,
  // slower request resolves after a newer one).
  useEffect(() => {
    if (!activePrefix || !activeId) {
      setIdResult(null);
      setIdStatus('idle');
      return undefined;
    }
    const lookup = ID_LOOKUPS[activePrefix];
    const requestId = ++idRequestRef.current;
    setIdStatus('loading');
    const timer = setTimeout(() => {
      lookup
        .fetch(activeId)
        .then((record) => {
          if (idRequestRef.current !== requestId) return; // stale response
          if (!record || !lookup.matches(record)) {
            // Right-shaped id, wrong entity type (or backend denied
            // access) -- treated identically to "doesn't exist", never
            // shown as if it were a match.
            setIdResult(null);
            setIdStatus('not-found');
            return;
          }
          setIdResult({ prefix: activePrefix, record });
          setIdStatus('found');
        })
        .catch(() => {
          if (idRequestRef.current !== requestId) return;
          setIdResult(null);
          setIdStatus('not-found');
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [activePrefix, activeId]);

  function closeMobile() {
    setMobileOpen(false);
    setQuery('');
  }

  function goToResident(r) {
    setOpen(false);
    closeMobile();
    navigate(`/residents/${r.id}`);
  }

  function goToTeam() {
    setOpen(false);
    closeMobile();
    navigate('/team', {});
  }

  function goToHandover(n) {
    setOpen(false);
    closeMobile();
    navigate('/handovers', { state: { openHandoverId: n.id } });
  }

  function goToIdResult() {
    if (!idResult) return;
    const lookup = ID_LOOKUPS[idResult.prefix];
    if (idResult.prefix === 'HO') {
      goToHandover(idResult.record);
      return;
    }
    setOpen(false);
    closeMobile();
    navigate(lookup.goTo(idResult.record));
  }

  const residentMap = React.useMemo(() => Object.fromEntries((residents || []).map((r) => [r.id, r.name])), [residents]);

  // Residents and team are matched by name/email for a free-text query --
  // an identifier-shaped query (prefixed or a bare number) always goes
  // through the exact single-record lookup above instead, so it never
  // falls back to fuzzy substring matching.
  const residentMatches = q && !isIdQuery && residents ? residents.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const memberMatches = q && !isIdQuery && members ? members.filter((m) => m.email.toLowerCase().includes(q)).slice(0, 5) : [];

  const hasResults = residentMatches.length > 0 || memberMatches.length > 0 || idStatus === 'found';

  function ResultsList() {
    const lookup = idResult ? ID_LOOKUPS[idResult.prefix] : null;
    const Icon = lookup?.icon || FileAudio;

    return (
      <>
        {q && !hasResults && idStatus !== 'loading' && <div className="search-dropdown-empty">No matches for &ldquo;{query}&rdquo;</div>}

        {isIdQuery && idStatus === 'loading' && (
          <div className="search-dropdown-empty">Looking up {ID_LOOKUPS[activePrefix]?.label.toLowerCase()}&hellip;</div>
        )}

        {isIdQuery && idStatus === 'found' && idResult && lookup && (
          <>
            <div className="search-dropdown-label">{lookup.label}</div>
            <button type="button" className="list-row" onClick={goToIdResult}>
              <span className="list-row-icon">
                <Icon size={15} />
              </span>
              <span className="list-row-body">
                <span className="list-row-title">{lookup.title(idResult.record, residentMap)}</span>
                <span className="list-row-meta">{lookup.subtitle(idResult.record, residentMap)}</span>
              </span>
              {idResult.prefix === 'HO' && (
                <span className="list-row-side">
                  <UrgencyBadge urgency={idResult.record.urgency_flag} />
                </span>
              )}
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
            {!q && <p className="mobile-search-hint">Search residents and team by name, or an identifier like R-0001, EMP-0005, MGR-0001, or HO-0001.</p>}
            {q && <ResultsList />}
          </div>
        </div>
      )}
    </>
  );
}