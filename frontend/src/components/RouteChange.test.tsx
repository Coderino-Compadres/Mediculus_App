import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom'
import RouteChange from './RouteChange'
import { APP_NAME, ROUTES } from '../routes'

/** Two screens and a link between them, which is all a navigation needs. */
function Harness({ start = ROUTES.reports }: { start?: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <RouteChange />
      <Link to={ROUTES.journals}>do dzienniczków</Link>
      <Routes>
        <Route path={ROUTES.reports} element={<p>raporty</p>} />
        <Route path={ROUTES.journals} element={<p>dzienniczki</p>} />
        <Route path={ROUTES.reportDetail} element={<p>jeden raport</p>} />
        <Route path="*" element={<p>nie ma</p>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  document.title = ''
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  return () => vi.restoreAllMocks()
})

describe('the document title', () => {
  it('names the screen and the app', () => {
    render(<Harness />)

    expect(document.title).toBe(`Raporty — ${APP_NAME}`)
  })

  it('follows a navigation', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('link', { name: 'do dzienniczków' }))

    expect(document.title).toBe(`Dzienniczki — ${APP_NAME}`)
  })

  it('matches a route that carries a parameter', () => {
    render(<Harness start="/reports/week-2026-08-03" />)

    expect(document.title).toBe(`Raport tygodniowy — ${APP_NAME}`)
  })

  it('falls back to the app name for an address that names no screen', () => {
    render(<Harness start="/zupelnie-nie-ekran" />)

    expect(document.title).toBe(APP_NAME)
  })
})

describe('scrolling', () => {
  it('goes back to the top on a navigation', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('link', { name: 'do dzienniczków' }))

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('does not scroll on the first render', () => {
    // The browser has just loaded the page and scrolled it itself.
    render(<Harness />)

    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})

describe('the announcement', () => {
  it('is empty until something changes', () => {
    const { container } = render(<Harness />)

    expect(container.querySelector('[aria-live]')).toHaveTextContent('')
  })

  it('names the screen a navigation landed on', async () => {
    const { container } = render(<Harness />)

    await userEvent.click(screen.getByRole('link', { name: 'do dzienniczków' }))

    expect(container.querySelector('[aria-live]')).toHaveTextContent('Dzienniczki')
  })

  it('is polite, so it waits rather than interrupting', () => {
    const { container } = render(<Harness />)

    expect(container.querySelector('[aria-live]')).toHaveAttribute('aria-live', 'polite')
  })
})
