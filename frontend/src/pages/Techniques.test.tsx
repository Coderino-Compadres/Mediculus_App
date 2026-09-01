import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import Techniques from './Techniques'
import { TECHNIQUES } from '../data/techniques'
import { ROUTES } from '../routes'

/**
 * The catalogue list.
 *
 * Most of what is worth pinning here is what the screen must NOT show: the
 * mockup's durations and technique names, and any content in a tab the client
 * has not sent materials for. Those are decisions with reasons behind them (see
 * data/techniques.ts), and a test is what notices when one is quietly undone.
 */

describe('DBT tab', () => {
  it('opens on DBT and shows the four groups in time-horizon order', () => {
    renderWithProviders(<Techniques />, { route: ROUTES.techniques })

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)

    expect(headings).toEqual([
      expect.stringContaining('Kiedy jest naprawdę ciężko'),
      expect.stringContaining('Codzienna odporność'),
      expect.stringContaining('Relacje i rozmowy'),
      expect.stringContaining('Kiedy nie mogę tego zmienić'),
    ])
  })

  it('lists techniques from the client materials, not the ones only the mockup names', () => {
    renderWithProviders(<Techniques />, { route: ROUTES.techniques })

    expect(screen.getByText('TIPP')).toBeInTheDocument()
    expect(screen.getByText('DEAR MAN')).toBeInTheDocument()
    expect(screen.getByText('Umiejętności PLEASE')).toBeInTheDocument()

    // Named by the client earlier and drawn in the mockup, but no materials were
    // ever sent for them — see the TODO in data/techniques.ts.
    expect(screen.queryByText(/^STOP$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Powrót do równowagi/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Mindfulness/i)).not.toBeInTheDocument()
  })

  it('holds the 11 techniques from the materials — no row for a TIPP component', () => {
    renderWithProviders(<Techniques />, { route: ROUTES.techniques })

    expect(screen.getAllByRole('link')).toHaveLength(11)
    // Paced breathing and progressive muscle relaxation live in the relaxation
    // tab; inside DBT they are steps of TIPP, not techniques of their own.
    expect(screen.queryByText('Miarowe oddychanie')).not.toBeInTheDocument()
    expect(screen.queryByText('Progresywna relaksacja mięśni')).not.toBeInTheDocument()
  })

  it('shows no duration on any row, because the materials give none', () => {
    renderWithProviders(<Techniques />, { route: ROUTES.techniques })

    expect(screen.queryByText(/\bmin\b/)).not.toBeInTheDocument()
    expect(TECHNIQUES.every((technique) => technique.czasTrwaniaMin === undefined)).toBe(true)
  })
})

describe('CBT tab', () => {
  it('exists, is empty, and says why', async () => {
    renderWithProviders(<Techniques />, { route: ROUTES.techniques })

    await userEvent.click(screen.getByRole('button', { name: /CBT/ }))

    expect(screen.getByText(/Materiały w przygotowaniu/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('has nothing tagged into it — no technique was assigned to CBT by the client', () => {
    expect(TECHNIQUES.some((technique) => technique.szkola.includes('cbt'))).toBe(false)
  })
})

describe('relaxation tab', () => {
  it('holds the two techniques the client herself called relaxation ones, and says more are coming', async () => {
    renderWithProviders(<Techniques />, { route: ROUTES.techniques })

    await userEvent.click(screen.getByRole('button', { name: /Relaksacyjne/ }))

    expect(screen.getByText('Miarowe oddychanie')).toBeInTheDocument()
    expect(screen.getByText('Progresywna relaksacja mięśni')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByText('Kolejne materiały w przygotowaniu.')).toBeInTheDocument()
  })

  it('wears the relaxation badge, not a DBT one', () => {
    renderWithProviders(<Techniques />, { route: `${ROUTES.techniques}?szkola=relaksacyjne` })

    expect(screen.getAllByText('Relaks')).toHaveLength(2)
    expect(screen.queryByText('DBT', { selector: '.technique-badge' })).not.toBeInTheDocument()
  })
})

describe('the tab in the URL', () => {
  it('opens the tab the address names', () => {
    renderWithProviders(<Techniques />, { route: `${ROUTES.techniques}?szkola=cbt` })

    expect(screen.getByText(/Materiały w przygotowaniu/)).toBeInTheDocument()
  })

  it('falls back to DBT when the address names something else', () => {
    renderWithProviders(<Techniques />, { route: `${ROUTES.techniques}?szkola=cokolwiek` })

    expect(screen.getByText('TIPP')).toBeInTheDocument()
  })
})

describe('what the catalogue does not offer', () => {
  it('has nothing to save, rate or generate — it is a list to read', () => {
    renderWithProviders(<Techniques />, { route: ROUTES.techniques })

    for (const label of ['Pomogło', 'Trochę', 'Nie tym razem', 'Zapisz', 'Wygeneruj']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })
})
