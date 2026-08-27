import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { PAGE_SIZE, usePagination } from './usePagination'

const ITEMS = Array.from({ length: 20 }, (_, index) => `pozycja ${index + 1}`)

/** Renders the hook's answer plus the URL, which is where the page lives. */
function Probe({ items = ITEMS, pageSize }: { items?: string[]; pageSize?: number }) {
  const pages = usePagination(items, pageSize)
  const { search } = useLocation()
  return (
    <div>
      <span data-testid="page">{pages.page}</span>
      <span data-testid="count">{pages.pageCount}</span>
      <span data-testid="range">{`${pages.from}-${pages.to}/${pages.total}`}</span>
      <span data-testid="items">{pages.items.join(',')}</span>
      <span data-testid="search">{search}</span>
      <button type="button" onClick={() => pages.goTo(pages.page + 1)}>dalej</button>
      <button type="button" onClick={() => pages.goTo(pages.page - 1)}>wstecz</button>
      <button type="button" onClick={() => pages.goTo(99)}>na koniec</button>
      <button type="button" onClick={pages.reset}>reset</button>
    </div>
  )
}

function renderHook(ui: React.ReactElement, route = '/lista') {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>)
}

const page = () => screen.getByTestId('page').textContent
const items = () => screen.getByTestId('items').textContent

describe('slicing', () => {
  it('hands out one page of the default size', () => {
    renderHook(<Probe />)

    expect(screen.getByTestId('items').textContent?.split(',')).toHaveLength(PAGE_SIZE)
    expect(items()).toContain('pozycja 1')
    expect(items()).not.toContain('pozycja 8')
  })

  it('counts the pages, remainder included', () => {
    renderHook(<Probe />)

    // 20 items, 7 to a page.
    expect(screen.getByTestId('count')).toHaveTextContent('3')
  })

  it('an empty list is one page, not zero', () => {
    // Zero would make the clamp divide the page number by nothing and would
    // render "Strona 1 z 0".
    renderHook(<Probe items={[]} />)

    expect(screen.getByTestId('count')).toHaveTextContent('1')
    expect(screen.getByTestId('range')).toHaveTextContent('0-0/0')
  })

  it('a list that exactly fills a page does not create an empty next one', () => {
    renderHook(<Probe items={ITEMS.slice(0, PAGE_SIZE)} />)

    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  it('reports the range it is showing', () => {
    renderHook(<Probe />, '/lista?page=3')

    expect(screen.getByTestId('range')).toHaveTextContent('15-20/20')
  })

  it('honours a page size of its own', () => {
    renderHook(<Probe pageSize={5} />)

    expect(screen.getByTestId('count')).toHaveTextContent('4')
  })
})

describe('the page in the URL', () => {
  it('is read from the query string', () => {
    renderHook(<Probe />, '/lista?page=2')

    expect(page()).toBe('2')
    expect(items()).toContain('pozycja 8')
  })

  it('is clamped to the last page rather than showing nothing', () => {
    renderHook(<Probe />, '/lista?page=99')

    expect(page()).toBe('3')
  })

  it('is clamped upwards too', () => {
    renderHook(<Probe />, '/lista?page=0')

    expect(page()).toBe('1')
  })

  it('falls back to the first page when it is not a number', () => {
    renderHook(<Probe />, '/lista?page=abc')

    expect(page()).toBe('1')
  })

  it('is written on a move', async () => {
    renderHook(<Probe />)

    await userEvent.click(screen.getByRole('button', { name: 'dalej' }))

    expect(screen.getByTestId('search')).toHaveTextContent('?page=2')
  })

  it('leaves the first page out of the URL', async () => {
    // '?page=1' and the bare address should not be two addresses for one screen.
    renderHook(<Probe />, '/lista?page=2')

    await userEvent.click(screen.getByRole('button', { name: 'wstecz' }))

    expect(screen.getByTestId('search')).toHaveTextContent('')
  })

  it('keeps whatever else the query string carried', async () => {
    renderHook(<Probe />, '/lista?filtr=trudne')

    await userEvent.click(screen.getByRole('button', { name: 'dalej' }))

    expect(screen.getByTestId('search').textContent).toContain('filtr=trudne')
    expect(screen.getByTestId('search').textContent).toContain('page=2')
  })

  it('a move past the end lands on the last page', async () => {
    renderHook(<Probe />)

    await userEvent.click(screen.getByRole('button', { name: 'na koniec' }))

    expect(page()).toBe('3')
  })
})

describe('reset', () => {
  it('drops the page parameter', async () => {
    renderHook(<Probe />, '/lista?page=3')

    await userEvent.click(screen.getByRole('button', { name: 'reset' }))

    expect(page()).toBe('1')
    expect(screen.getByTestId('search')).toHaveTextContent('')
  })

  it('keeps the rest of the query string', async () => {
    renderHook(<Probe />, '/lista?page=3&filtr=trudne')

    await userEvent.click(screen.getByRole('button', { name: 'reset' }))

    expect(screen.getByTestId('search').textContent).toContain('filtr=trudne')
  })
})

describe('scrolling', () => {
  it('goes back to the top on a move', async () => {
    // The rows change under a viewport that is probably scrolled down, and
    // RouteChange only watches the pathname — this is a query change.
    renderHook(<Probe />)

    await userEvent.click(screen.getByRole('button', { name: 'dalej' }))

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('does not scroll when a filter resets the page', async () => {
    // The reader is at the top already: they just pressed a filter chip there.
    renderHook(<Probe />, '/lista?page=3')
    vi.mocked(window.scrollTo).mockClear()

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'reset' }))
    })

    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
