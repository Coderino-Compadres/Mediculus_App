import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Rows per page on the two list screens, as the client asked for. */
export const PAGE_SIZE = 7

/** The query parameter carrying the page, and the value that is left out of it. */
export const PAGE_PARAM = 'page'
const FIRST_PAGE = 1

export interface Pagination<T> {
  /** The rows to render — just this page's slice. */
  items: T[]
  page: number
  pageCount: number
  /** 1-based index of the first row on this page, for "8-14 z 31". */
  from: number
  to: number
  total: number
  goTo: (page: number) => void
  /** Back to the first page — what a screen calls when its filter changes. */
  reset: () => void
}

/**
 * Splits an already-loaded list into pages, with the page in the URL.
 *
 * Client-side on purpose: both lists arrive whole (`/api/diary/` and
 * `/api/reports/` answer with everything), and "Dzienniczki" filters what it
 * already has. Paginating on the server while filtering here would hand out
 * pages of the wrong list. So this is a readability feature, not a payload one —
 * the moment `MAX_HISTORY_ENTRIES` is a real ceiling rather than a backstop,
 * both halves have to move to the backend together.
 *
 * The page lives in the query string rather than in component state so that
 * opening a row from page three and pressing back returns to page three. It is
 * clamped rather than trusted: `?page=99` on a three-page list shows page three,
 * and `?page=abc` shows the first.
 */
export function usePagination<T>(items: T[], pageSize: number = PAGE_SIZE): Pagination<T> {
  const [params, setParams] = useSearchParams()

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const requested = Number.parseInt(params.get(PAGE_PARAM) ?? '', 10)
  const page = Number.isNaN(requested)
    ? FIRST_PAGE
    : Math.min(Math.max(requested, FIRST_PAGE), pageCount)

  const goTo = useCallback(
    (next: number) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          // The first page is the bare URL: a link to "?page=1" and a link to
          // the screen itself should not be two different addresses.
          if (next <= FIRST_PAGE) updated.delete(PAGE_PARAM)
          else updated.set(PAGE_PARAM, String(next))
          return updated
        },
        // A push, not a replace: back is how people leave page two.
        { replace: false },
      )
      // The rows changed under a viewport that is probably scrolled down.
      // RouteChange only watches the pathname, and this is a query change.
      window.scrollTo(0, 0)
    },
    [setParams],
  )

  const reset = useCallback(() => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.delete(PAGE_PARAM)
        return updated
      },
      // Replace: narrowing a filter is not a step to go back to.
      { replace: true },
    )
  }, [setParams])

  const start = (page - 1) * pageSize
  const paged = useMemo(
    () => items.slice(start, start + pageSize),
    [items, start, pageSize],
  )

  return {
    items: paged,
    page,
    pageCount,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
    total: items.length,
    goTo,
    reset,
  }
}
