import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pagination from './Pagination'

/**
 * The control on both list screens. `hooks/usePagination.test.tsx` covers the
 * arithmetic and the page-in-the-URL; this is about what the control does with
 * those numbers, and the two properties that are decisions rather than layout:
 * it disappears when there is nothing to page through, and it says where you are
 * in words instead of drawing fifty numbered buttons a phone cannot fit.
 */

function renderPagination(props: Partial<React.ComponentProps<typeof Pagination>> = {}) {
  const onChange = vi.fn()
  render(
    <Pagination
      page={2}
      pageCount={5}
      from={8}
      to={14}
      total={31}
      unit="wpisów"
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange }
}

describe('when everything fits on one page', () => {
  it('renders nothing at all', () => {
    /** A control that can only be pressed to no effect is worse than no
     *  control — and it would put "Strona 1 z 1" under every short list. */
    renderPagination({ pageCount: 1, from: 1, to: 3, total: 3 })

    expect(screen.queryByRole('navigation')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders nothing for an empty list either', () => {
    renderPagination({ pageCount: 1, from: 0, to: 0, total: 0 })

    expect(screen.queryByRole('navigation')).toBeNull()
  })
})

describe('where you are', () => {
  it('is said in words, with the range and what is being counted', () => {
    renderPagination()

    const status = screen.getByRole('status')

    expect(status).toHaveTextContent('Strona 2 z 5')
    expect(status).toHaveTextContent('8–14 z 31 wpisów')
  })

  it('counts the unit it was given, so reports are not called entries', () => {
    /** The two screens share the control, and "31 wpisów" over a list of
     *  reports is the kind of wrong label nobody notices in review. */
    renderPagination({ unit: 'raportów' })

    expect(screen.getByRole('status')).toHaveTextContent('raportów')
  })

  it('is announced politely — the rows have already changed', () => {
    /** `role="status"` rather than an alert: this describes what happened
     *  instead of interrupting whatever the reader was doing. */
    renderPagination()

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('is inside a landmark a screen reader can find by name', () => {
    expect(renderPagination() && screen.getByRole('navigation', { name: 'Paginacja' }))
      .toBeInTheDocument()
  })
})

describe('stepping', () => {
  it('asks for the next and the previous page by number', async () => {
    const { onChange } = renderPagination()

    await userEvent.click(screen.getByRole('button', { name: /Następna/ }))
    expect(onChange).toHaveBeenLastCalledWith(3)

    await userEvent.click(screen.getByRole('button', { name: /Poprzednia/ }))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it('cannot step back from the first page', async () => {
    const { onChange } = renderPagination({ page: 1, from: 1, to: 7 })

    const back = screen.getByRole('button', { name: /Poprzednia/ })

    expect(back).toBeDisabled()
    await userEvent.click(back)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cannot step past the last page', async () => {
    const { onChange } = renderPagination({ page: 5, from: 29, to: 31 })

    const forward = screen.getByRole('button', { name: /Następna/ })

    expect(forward).toBeDisabled()
    await userEvent.click(forward)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves both steps live in the middle of the list', () => {
    renderPagination({ page: 3 })

    expect(screen.getByRole('button', { name: /Poprzednia/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Następna/ })).toBeEnabled()
  })

  it('offers two buttons and no numbered ones', () => {
    /** Fifty-odd pages of reports is a row of buttons nobody can use on a
     *  phone, which is why the count is spelled out instead. */
    renderPagination({ pageCount: 50, page: 7, from: 43, to: 49, total: 348 })

    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '8' })).toBeNull()
  })
})
