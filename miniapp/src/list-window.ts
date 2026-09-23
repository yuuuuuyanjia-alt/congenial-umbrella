/**
 * Window a list without a page scroll listener.
 *
 * The first page is mounted. The next page is appended when a sentinel
 * intersects the viewport, or when the reader asks to load more. Off-screen
 * rows are not created. Callers pass the full array; only the slice is rendered.
 */
export const LIST_WINDOW_PAGE = 6;

let sentinelSeq = 0;

export function nextSentinelClass(): string {
  sentinelSeq += 1;
  return `window-sentinel-${sentinelSeq}`;
}

export function itemWindowId(item: any, index: number, keyField = 'id'): string {
  const value = item?.[keyField];
  if (value != null && value !== '') return String(value);
  return `#${index}`;
}

export function itemWindowIds(items: readonly any[] | null | undefined, keyField = 'id'): string[] {
  return (items || []).map((item, index) => itemWindowId(item, index, keyField));
}

export function sliceWindow<T>(items: readonly T[] | null | undefined, shown: number): T[] {
  const list = items || [];
  const count = Math.max(0, shown);
  return list.slice(0, Math.min(count, list.length));
}

/**
 * Keep the open window when the same rows are still the prefix (refresh,
 * append). Reset to one page when the list is replaced (filter, new query).
 */
export function nextWindowCount(
  prevIds: readonly string[],
  nextIds: readonly string[],
  shown: number,
  pageSize: number,
): number {
  const page = Math.max(1, pageSize);
  const keep = prevIds.slice(0, Math.max(0, shown));
  const prefixOk = keep.every((id, i) => nextIds[i] === id);
  if (!prefixOk) return Math.min(page, nextIds.length);
  return Math.min(Math.max(shown, page), nextIds.length);
}

export function revealWindow(shown: number, total: number, pageSize: number): number {
  const page = Math.max(1, pageSize);
  return Math.min(Math.max(0, total), Math.max(0, shown) + page);
}
