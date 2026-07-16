import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export const PAGE_SIZE_OPTIONS = [10, 20, 50];

/**
 * Client-side pagination over an already-loaded (and already filtered/sorted)
 * array. Keeps `page` (and, if changed from the default, `size`) in the URL
 * query string so back/forward navigation, refreshes, and shared links land
 * on the same page — without disturbing any other state the page keeps in
 * local component state (filters, search, sort, etc).
 *
 * Usage:
 *   const { pageItems, page, pageCount, total, setPage } = usePagination(filteredResidents, { pageSize: 9 });
 */
export function usePagination(items, { pageSize: defaultPageSize = 10 } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawPage = parseInt(searchParams.get('page'), 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawSize = parseInt(searchParams.get('size'), 10);
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : defaultPageSize;

  const total = items ? items.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);

  const updateParams = useCallback(
    (nextPage, nextSize) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (nextPage <= 1) next.delete('page');
          else next.set('page', String(nextPage));

          if (nextSize === defaultPageSize) next.delete('size');
          else next.set('size', String(nextSize));

          return next;
        },
        { replace: true, preventScrollReset: true }
      );
    },
    [setSearchParams, defaultPageSize]
  );

  // If the current page falls out of range (filters changed, an item was
  // deleted, etc), snap back to the nearest valid page instead of showing
  // an empty page.
  useEffect(() => {
    if (page !== safePage) updateParams(safePage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage]);

  const setPage = useCallback((next) => updateParams(next, pageSize), [updateParams, pageSize]);
  const setPageSize = useCallback((size) => updateParams(1, size), [updateParams]);
  const resetToFirstPage = useCallback(() => updateParams(1, pageSize), [updateParams, pageSize]);

  const pageItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    pageSize,
    pageCount,
    total,
    pageItems,
    setPage,
    setPageSize,
    resetToFirstPage,
  };
}
