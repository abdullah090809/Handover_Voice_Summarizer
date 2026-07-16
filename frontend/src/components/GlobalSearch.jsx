import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, UserRound } from 'lucide-react';
import { residentApi, userApi } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

export default function GlobalSearch() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [residents, setResidents] = useState(null);
  const [members, setMembers] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function ensureLoaded() {
    if (residents === null) {
      residentApi.list(true).then(setResidents).catch(() => setResidents([]));
    }
    if (isManager && members === null) {
      userApi.list().then(setMembers).catch(() => setMembers([]));
    }
  }

  const q = query.trim().toLowerCase();
  const residentMatches = q && residents ? residents.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 5) : [];
  const memberMatches = q && members ? members.filter((m) => m.email.toLowerCase().includes(q)).slice(0, 5) : [];
  const hasResults = residentMatches.length > 0 || memberMatches.length > 0;

  return (
    <div className="topbar-search" ref={wrapRef}>
      <Search />
      <input
        type="text"
        placeholder="Search residents, team..."
        value={query}
        onFocus={() => {
          setOpen(true);
          ensureLoaded();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        aria-label="Search residents and team members"
      />
      {open && q && (
        <div
          style={{
            position: 'absolute',
            top: '46px',
            left: 0,
            right: 0,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 50,
            overflow: 'hidden',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {!hasResults && (
            <div style={{ padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
              No matches for &ldquo;{query}&rdquo;
            </div>
          )}
          {residentMatches.map((r) => (
            <button
              key={`r-${r.id}`}
              className="list-row"
              style={{ width: '100%', borderRadius: 0 }}
              onClick={() => {
                setOpen(false);
                setQuery('');
                navigate('/residents', { state: { openResidentId: r.id } });
              }}
            >
              <span className="list-row-icon">
                <User />
              </span>
              <span className="list-row-body">
                <span className="list-row-title">{r.name}</span>
                <span className="list-row-meta">Resident &middot; {r.status}</span>
              </span>
            </button>
          ))}
          {memberMatches.map((m) => (
            <button
              key={`m-${m.id}`}
              className="list-row"
              style={{ width: '100%', borderRadius: 0 }}
              onClick={() => {
                setOpen(false);
                setQuery('');
                navigate('/team');
              }}
            >
              <span className="list-row-icon">
                <UserRound />
              </span>
              <span className="list-row-body">
                <span className="list-row-title">{m.email}</span>
                <span className="list-row-meta">Team member &middot; {m.role}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
