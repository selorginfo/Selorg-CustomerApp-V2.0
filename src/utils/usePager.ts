import { Dispatch, SetStateAction, useCallback, useRef, useState } from 'react';
import { showToast } from './toast';

/**
 * "Load more" paging for a list whose first page is loaded elsewhere.
 * Call `firstPageLoaded(count)` after (re)loading page 1; `loadMore` appends
 * the next page, skipping rows already shown.
 */
export function usePager<T extends { id: string }>(
  fetchPage: (page: number) => Promise<T[]>,
  pageSize: number,
  setItems: Dispatch<SetStateAction<T[]>>,
) {
  const page = useRef(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const busy = useRef(false);

  const firstPageLoaded = useCallback(
    (count: number) => {
      page.current = 1;
      setHasMore(count >= pageSize);
    },
    [pageSize],
  );

  const reset = useCallback(() => {
    page.current = 1;
    setHasMore(false);
  }, []);

  const loadMore = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const next = page.current + 1;
      const rows = await fetchPage(next);
      setItems(prev => {
        const seen = new Set(prev.map(r => r.id));
        return [...prev, ...rows.filter(r => !seen.has(r.id))];
      });
      page.current = next;
      setHasMore(rows.length >= pageSize);
    } catch {
      showToast('Could not load more. Please try again.', 'err');
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage, pageSize, setItems]);

  return { hasMore, loadingMore, loadMore, firstPageLoaded, reset };
}
