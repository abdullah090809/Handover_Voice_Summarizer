import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, LogIn, Plus, Pencil, Trash2, Activity, TriangleAlert } from 'lucide-react';
import { auditApi, ApiError } from '../lib/api.js';
import { SkeletonGrid, EmptyState, ErrorState } from '../components/States.jsx';
import Pagination from '../components/Pagination.jsx';
import { formatDateTime } from '../lib/format.js';
import { describeAuditEntry } from '../lib/auditDescriptions.js';

const PAGE_SIZE = 20;
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// One icon per category so a row's nature reads instantly without having to
// parse text — a failed request always wins and shows as a warning,
// regardless of what it was trying to do.
const CATEGORY_ICON = { auth: LogIn, create: Plus, update: Pencil, delete: Trash2, other: Activity };

function AuditActionCell({ entry }) {
    const { text, category, failed } = describeAuditEntry(entry);
    const Icon = failed ? TriangleAlert : CATEGORY_ICON[category] || Activity;
    const iconClass = failed ? 'cat-failed' : `cat-${category}`;

    return (
        <div className="audit-action-row">
            <span className={`audit-cat-icon ${iconClass}`}>
                <Icon size={14} />
            </span>
            <div className="audit-action-text-wrap">
                <span className={`audit-action-text${failed ? ' audit-action-text--failed' : ''}`}>{text}</span>
                <span className="audit-action-meta">
                    <span className={`audit-method method-${(entry.method || '').toLowerCase()}`}>{entry.method}</span>
                    <span className="audit-path">{entry.path}</span>
                </span>
            </div>
        </div>
    );
}

function AuditStatusCell({ statusCode }) {
    if (statusCode == null) return <span className="audit-status audit-status-ok">—</span>;
    if (statusCode >= 400) {
        return <span className="audit-status audit-status-fail">{statusCode}</span>;
    }
    return <span className="audit-status audit-status-ok">{statusCode}</span>;
}

export default function AuditPage() {
    const [entries, setEntries] = useState(null);
    const [total, setTotal] = useState(0);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [methodFilter, setMethodFilter] = useState('');
    const [pathFilter, setPathFilter] = useState('');
    const [pathInput, setPathInput] = useState('');

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await auditApi.list({
                skip: (page - 1) * PAGE_SIZE,
                limit: PAGE_SIZE,
                method: methodFilter || undefined,
                path: pathFilter || undefined,
            });
            setEntries(data.results);
            setTotal(data.total);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not load the audit log.');
        }
    }, [page, methodFilter, pathFilter]);

    useEffect(() => {
        load();
    }, [load]);

    // Debounce free-text path search so we don't fire a request per keystroke.
    useEffect(() => {
        const handle = setTimeout(() => {
            setPathFilter(pathInput.trim());
            setPage(1);
        }, 400);
        return () => clearTimeout(handle);
    }, [pathInput]);

    function handleMethodFilterChange(value) {
        setMethodFilter(value);
        setPage(1);
    }

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <>
            <div className="page-header">
                <div>
                    <h1>Audit Log</h1>
                    <p>Who did what, when — plain-English record of activity across your care home for security and compliance review.</p>
                </div>
            </div>

            <div className="filter-bar">
                <select className="select" value={methodFilter} onChange={(e) => handleMethodFilterChange(e.target.value)} aria-label="Filter by method">
                    <option value="">All methods</option>
                    {METHOD_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                            {m}
                        </option>
                    ))}
                </select>
                <input
                    type="text"
                    className="input"
                    style={{ maxWidth: 280 }}
                    placeholder="Search by path…"
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    aria-label="Search by path"
                />
            </div>

            {entries === null && !error && <SkeletonGrid count={4} />}
            {error && <ErrorState message={error} onRetry={load} />}
            {entries !== null && entries.length === 0 && (
                <EmptyState
                    icon={ShieldCheck}
                    title="No activity found"
                    message={methodFilter || pathFilter ? 'No audit entries match your filters.' : 'Activity across your care home will appear here.'}
                />
            )}

            {entries !== null && entries.length > 0 && (
                <>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Status</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry) => (
                                    <tr key={entry.id}>
                                        <td data-label="Time" className="audit-time">
                                            {formatDateTime(entry.created_at)}
                                        </td>
                                        <td data-label="User">
                                            {entry.username || (entry.user_id ? `User #${entry.user_id}` : <span className="audit-anonymous">Anonymous</span>)}
                                        </td>
                                        <td data-label="Action">
                                            <AuditActionCell entry={entry} />
                                        </td>
                                        <td data-label="Status" className="audit-status-cell">
                                            <AuditStatusCell statusCode={entry.status_code} />
                                        </td>
                                        <td data-label="Duration" className="audit-duration">
                                            {entry.duration_ms != null ? `${entry.duration_ms}ms` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="entries" />
                </>
            )}
        </>
    );
}