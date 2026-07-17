import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, Square, LogIn } from 'lucide-react';
import { shiftApi, userApi, ApiError } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import Pagination from '../components/Pagination.jsx';
import { usePagination } from '../lib/usePagination.js';
import { formatTime, formatDurationHM, formatElapsedClock, toDateInputValue, dayNumber, weekdayAbbrev } from '../lib/format.js';

function shiftDurationMs(shift, now) {
  const start = new Date(shift.start_time).getTime();
  const end = shift.end_time ? new Date(shift.end_time).getTime() : now;
  return Math.max(0, end - start);
}

function defaultRangeFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 13); // last 14 days, inclusive of today
  return toDateInputValue(d);
}

export default function ShiftsPage() {
  const { isManager } = useAuth();
  const showToast = useToast();

  const [shifts, setShifts] = useState(null);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [clockActionBusy, setClockActionBusy] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(defaultRangeFrom());
  const [rangeTo, setRangeTo] = useState(toDateInputValue(new Date()));
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async (workerId) => {
    setError(null);
    try {
      const data = await shiftApi.list(workerId || undefined);
      setShifts(data.slice().sort((a, b) => new Date(b.start_time) - new Date(a.start_time)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load shifts.');
    }
  }, []);

  useEffect(() => {
    if (isManager) {
      userApi
        .list()
        .then((data) => {
          const workers = data.filter((u) => u.role !== 'manager' && u.role !== 'deactivated');
          setMembers(workers);
          if (workers.length > 0) {
            setSelectedWorkerId(workers[0].id);
            load(workers[0].id);
          } else {
            setShifts([]);
          }
        })
        .catch(() => setShifts([]));
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  // The active (still clocked-in) shift, if any — there should only ever be
  // one for a given worker at a time.
  const activeShift = !isManager ? (shifts || []).find((s) => !s.end_time) || null : null;

  // While a session is running, tick every second so the live timer and the
  // "today" total in the stat row stay accurate without a refresh.
  useEffect(() => {
    if (!activeShift) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeShift]);

  const inRangeShifts = useMemo(() => {
    if (!shifts) return [];
    return shifts.filter((s) => {
      const day = toDateInputValue(new Date(s.start_time));
      if (rangeFrom && day < rangeFrom) return false;
      if (rangeTo && day > rangeTo) return false;
      return true;
    });
  }, [shifts, rangeFrom, rangeTo]);

  const stats = useMemo(() => {
    const byDay = new Map();
    for (const s of inRangeShifts) {
      const day = toDateInputValue(new Date(s.start_time));
      const ms = shiftDurationMs(s, now);
      const dow = new Date(s.start_time).getDay();
      const entry = byDay.get(day) || { ms: 0, dow };
      entry.ms += ms;
      byDay.set(day, entry);
    }
    let totalMs = 0;
    let overtimeMs = 0;
    let weekendDays = 0;
    const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
    for (const { ms, dow } of byDay.values()) {
      totalMs += ms;
      if (ms > EIGHT_HOURS_MS) overtimeMs += ms - EIGHT_HOURS_MS;
      if (dow === 0 || dow === 6) weekendDays += 1;
    }
    return { totalMs, overtimeMs, weekendDays };
  }, [inRangeShifts, now]);

  const { pageItems, page, pageCount, total, setPage, resetToFirstPage } = usePagination(inRangeShifts, { pageSize: 10 });

  function onWorkerChange(id) {
    setSelectedWorkerId(id);
    setShifts(null);
    resetToFirstPage();
    load(id);
  }

  function onRangeChange(next) {
    resetToFirstPage();
    next();
  }

  async function handleClockIn() {
    setClockActionBusy(true);
    try {
      await shiftApi.create(new Date().toISOString(), null);
      showToast('Clocked in.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not clock in.', 'error');
    } finally {
      setClockActionBusy(false);
    }
  }

  async function handleClockOut() {
    if (!activeShift) return;
    setClockActionBusy(true);
    try {
      await shiftApi.update(activeShift.id, activeShift.start_time, new Date().toISOString());
      showToast('Clocked out.', 'success');
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not clock out.', 'error');
    } finally {
      setClockActionBusy(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Shifts</h1>
          <p>{isManager ? "Review your team's logged hours." : 'Clock in and out, and review your logged hours.'}</p>
        </div>
      </div>

      {!isManager && shifts !== null && (
        <div className={`shift-tracker-card${activeShift ? ' is-active' : ''}`}>
          <div className="shift-tracker-info">
            <span className={`badge ${activeShift ? 'badge-active' : 'badge-neutral'} shift-tracker-badge`}>
              <span className="shift-tracker-dot" />
              {activeShift ? 'Currently active' : 'Not clocked in'}
            </span>
            <h2>{activeShift ? 'Session in progress' : 'Ready to clock in'}</h2>
            <p>
              {activeShift
                ? "You're currently clocked in. Don't forget to clock out at the end of your shift."
                : 'Start a session when your shift begins — you can clock out any time.'}
            </p>
          </div>
          <div className="shift-tracker-timer-block">
            {activeShift && (
              <>
                <div className="shift-tracker-timer">{formatElapsedClock(shiftDurationMs(activeShift, now))}</div>
                <div className="shift-tracker-started">
                  <Clock size={13} /> Started at {formatTime(activeShift.start_time)}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            className={`btn ${activeShift ? 'btn-danger-solid' : 'btn-primary'} shift-tracker-btn`}
            onClick={activeShift ? handleClockOut : handleClockIn}
            disabled={clockActionBusy}
          >
            {clockActionBusy ? <span className="spinner" /> : activeShift ? <Square size={16} /> : <LogIn size={16} />}
            {activeShift ? 'Clock out' : 'Clock in'}
          </button>
        </div>
      )}

      {shifts !== null && (
        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-card-icon">
                <Clock size={18} />
              </span>
              <span className="badge badge-neutral">Total hours</span>
            </div>
            <strong>{formatDurationHM(stats.totalMs)}</strong>
            <span className="stat-label">In selected range</span>
          </div>
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-card-icon tone-medium">
                <Clock size={18} />
              </span>
              <span className="badge badge-medium">Overtime</span>
            </div>
            <strong>{formatDurationHM(stats.overtimeMs)}</strong>
            <span className="stat-label">Hours past 8/day</span>
          </div>
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-card-icon tone-info">
                <Clock size={18} />
              </span>
              <span className="badge badge-info">Weekend days</span>
            </div>
            <strong>{stats.weekendDays}</strong>
            <span className="stat-label">Sat/Sun worked</span>
          </div>
        </div>
      )}

      <div className="filter-bar">
        {isManager && members.length > 0 && (
          <select className="select" value={selectedWorkerId} onChange={(e) => onWorkerChange(Number(e.target.value))}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email}
              </option>
            ))}
          </select>
        )}
        <label className="shift-range-field">
          <span>From</span>
          <input
            type="date"
            className="input"
            value={rangeFrom}
            max={rangeTo || undefined}
            onChange={(e) => onRangeChange(() => setRangeFrom(e.target.value))}
          />
        </label>
        <label className="shift-range-field">
          <span>To</span>
          <input
            type="date"
            className="input"
            value={rangeTo}
            min={rangeFrom || undefined}
            onChange={(e) => onRangeChange(() => setRangeTo(e.target.value))}
          />
        </label>
      </div>

      {shifts === null && !error && <SkeletonGrid />}
      {error && <ErrorState message={error} onRetry={() => load(isManager ? selectedWorkerId : undefined)} />}
      {shifts !== null && shifts.length > 0 && inRangeShifts.length === 0 && (
        <EmptyState icon={Clock} title="No shifts in this range" message="Try widening the date range above." />
      )}
      {shifts !== null && shifts.length === 0 && (
        <EmptyState
          icon={Clock}
          title="No shifts found"
          message={isManager ? 'This team member has no logged shifts yet.' : 'Clock in above to log your first shift.'}
        />
      )}

      {inRangeShifts.length > 0 && (
        <>
          <div className="session-list">
            {pageItems.map((s) => {
              const durationMs = shiftDurationMs(s, now);
              const isOngoing = !s.end_time;
              return (
                <div className={`session-row${isOngoing ? ' is-active' : ''}`} key={s.id}>
                  <div className="session-day">
                    <span className="session-day-number">{dayNumber(s.start_time)}</span>
                    <span className="session-day-weekday">{weekdayAbbrev(s.start_time)}</span>
                  </div>
                  <div className="session-times">
                    <span className="session-time session-time-in">
                      <LogIn size={13} /> {formatTime(s.start_time)}
                    </span>
                    <span className="session-time session-time-out">
                      <Square size={11} /> {s.end_time ? formatTime(s.end_time) : '--:--'}
                    </span>
                  </div>
                  <div className="session-duration-block">
                    <span className="session-duration-label">Duration</span>
                    <span className={`session-duration${isOngoing ? ' is-live' : ''}`}>{formatDurationHM(durationMs)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={10} onPageChange={setPage} itemLabel="sessions" />
        </>
      )}
    </>
  );
}