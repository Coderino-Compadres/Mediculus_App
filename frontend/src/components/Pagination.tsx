import './pagination.css'

interface PaginationProps {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  onChange: (page: number) => void
  /** What is being counted, for the screen reader: 'wpisów', 'raportów'. */
  unit: string
}

/**
 * Previous / where you are / next.
 *
 * Numbered buttons were the other option and do not survive the data: a diary
 * kept for a year is fifty-odd pages of reports, which is a row of buttons
 * nobody can use on a phone. The count is spelled out instead, so "where am I"
 * is answered without arithmetic.
 *
 * Renders nothing when everything fits on one page — a control that can only be
 * pressed to no effect is worse than no control.
 */
function Pagination({ page, pageCount, from, to, total, onChange, unit }: PaginationProps) {
  if (pageCount <= 1) return null

  /**
   * With one row on every page the range says nothing the page number has not
   * already said — "Strona 3 z 7 (3–3 z 7 dni)" — and a range whose two ends
   * are the same number reads as a fault rather than as a count.
   *
   * DERIVED RATHER THAN A PROP, because the condition *is* the definition and
   * so cannot be set wrongly: `from === to` says this page holds one row, and
   * `total === pageCount` says every page does. No other page size satisfies
   * both — the last page of a 2-per-page list of three has `from === to` and
   * `total` 3 against a `pageCount` of 2 — so there is no call site that has to
   * remember anything.
   */
  const oneRowPerPage = from === to && total === pageCount

  return (
    <nav className="pagination" aria-label="Paginacja">
      <button
        type="button"
        className="pagination-step"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        ← Poprzednia
      </button>

      {/* Polite: the rows below have already changed, and this describes them
          rather than interrupting whatever the reader was doing. */}
      <p className="pagination-status" role="status">
        Strona {page} z {pageCount}
        {!oneRowPerPage && (
          <span className="pagination-range">
            {' '}
            ({from}–{to} z {total} {unit})
          </span>
        )}
      </p>

      <button
        type="button"
        className="pagination-step"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
      >
        Następna →
      </button>
    </nav>
  )
}

export default Pagination
