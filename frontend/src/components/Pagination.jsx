import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '../lib/usePagination.js';

/**
 * Mobile-first pagination bar.
 * - On phones: just Prev / "Page X of Y" / Next — large tap targets, no
 *   numbered page list to squeeze in.
 * - On tablet/desktop: adds a compact numbered page list with ellipses.
 */
export default function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'items',
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}) {
  if (!total) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pageNumbers = getPageNumbers(page, pageCount);

  return (
    <nav className="pagination" aria-label="Pagination">
      <div className="pagination-summary">
        <strong>{start}–{end}</strong>&nbsp;of&nbsp;<strong>{total}</strong> {itemLabel}
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={17} />
          <span className="pagination-btn-label">Prev</span>
        </button>

        {pageCount > 1 && (
          <div className="pagination-pages" role="group" aria-label="Choose page">
            {pageNumbers.map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="pagination-ellipsis" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`pagination-page${p === page ? ' active' : ''}`}
                  aria-current={p === page ? 'page' : undefined}
                  aria-label={`Page ${p}`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              )
            )}
          </div>
        )}

        <span className="pagination-mobile-indicator" aria-hidden="true">
          {page} / {pageCount}
        </span>

        <button
          type="button"
          className="pagination-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <span className="pagination-btn-label">Next</span>
          <ChevronRight size={17} />
        </button>
      </div>

      {onPageSizeChange && (
        <label className="pagination-size">
          <span>Per page</span>
          <select className="select" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} aria-label="Items per page">
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
    </nav>
  );
}

function getPageNumbers(page, pageCount) {
  const delta = 1;
  const middle = [];
  for (let i = Math.max(2, page - delta); i <= Math.min(pageCount - 1, page + delta); i++) {
    middle.push(i);
  }

  const pages = [1];
  if (middle[0] > 2) pages.push('…');
  pages.push(...middle);
  if (middle[middle.length - 1] < pageCount - 1) pages.push('…');
  if (pageCount > 1) pages.push(pageCount);

  return pages;
}
