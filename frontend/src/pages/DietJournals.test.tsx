import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietJournals from './DietJournals'
import { ROUTES } from '../routes'
import type { DietJournalDay } from '../types/diet'

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return { ...actual, emptyDietHistory: vi.fn(() => [] as DietJournalDay[]) }
})
const { emptyDietHistory } = await import('../api/diet')
const mockedHistory = vi.mocked(emptyDietHistory)

/**
 * "Dzienniczki żywieniowe".
 *
 * **THE LAYOUT IS NOT FROM THE MOCKUPS** — §07 could not be read from the design
 * canvas and the screen was built on that basis, with the client's knowledge.
 * So these tests pin the rules the module *does* state, not the arrangement:
 * a day holds meals, a meal is labelled by kind and hour, nothing is required,
 * and nothing on the screen counts food. When §07 arrives the markup changes and
 * most of these should still hold — the ones that do not are the ones worth
 * arguing about.
 *
 * The data source is stubbed rather than used as-is, because the real one
 * returns an empty history until the module has a backend: without the stub the
 * row markup would never render and the tests below would pass vacuously.
 */

function meal(overrides: Partial<DietJournalDay['meals'][number]> = {}) {
  return {
    id: 'm1',
    kind: 'Przekąska',
    time: '16:20',
    description: 'Jogurt i garść orzechów, przy biurku.',
    ...overrides,
  }
}

function day(overrides: Partial<DietJournalDay> = {}): DietJournalDay {
  return { date: '2026-09-08', meals: [meal()], ...overrides }
}

beforeEach(() => {
  mockedHistory.mockReturnValue([])
})

describe('the screen itself', () => {
  it('names the module and the screen', () => {
    renderWithProviders(<DietJournals />)

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dzienniczki żywieniowe' }))
      .toBeInTheDocument()
  })

  it('leads back to the module, not to the psychotherapy home', () => {
    renderWithProviders(<DietJournals />)

    expect(screen.getByRole('link', { name: /Wróć do strony głównej/ }))
      .toHaveAttribute('href', ROUTES.diet)
  })

  it('says what the list is, and that it judges nothing', () => {
    /** "Dzienniczek żywieniowy, który nie liczy jedzenia" is the module's own
     *  description of itself; the intro says it in the second person. */
    renderWithProviders(<DietJournals />)

    expect(screen.getByText(/Nic tu nie jest liczone ani oceniane/)).toBeInTheDocument()
  })
})

describe('an empty history', () => {
  it('is an ordinary state, not a failure', () => {
    renderWithProviders(<DietJournals />)

    expect(screen.getByRole('heading', { name: 'Jeszcze nic tu nie ma' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers the way out of it, and it is the same one the home screen offers', () => {
    renderWithProviders(<DietJournals />)

    expect(screen.getByRole('link', { name: 'Dodaj posiłek' }))
      .toHaveAttribute('href', ROUTES.dietMeal)
  })

  it('draws no pagination over nothing', () => {
    renderWithProviders(<DietJournals />)

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })
})

describe('a day with meals', () => {
  it('is headed by its date, with the weekday and a lowercase month', () => {
    /** "wtorek, 8 września" — the mockups' own way of writing a date, and
     *  without the `text-transform: capitalize` that renders "8 Września" on
     *  four other screens. */
    mockedHistory.mockReturnValue([day()])

    renderWithProviders(<DietJournals />)

    expect(screen.getByRole('heading', { name: /wtorek, 8 września/ })).toBeInTheDocument()
  })

  it('counts its meals in Polish', () => {
    mockedHistory.mockReturnValue([
      day({ date: '2026-09-08', meals: [meal()] }),
      day({ date: '2026-09-07', meals: [meal({ id: 'a' }), meal({ id: 'b' })] }),
      day({
        date: '2026-09-06',
        meals: Array.from({ length: 5 }, (_, index) => meal({ id: `c${index}` })),
      }),
    ])

    renderWithProviders(<DietJournals />)

    expect(screen.getByText('1 posiłek')).toBeInTheDocument()
    expect(screen.getByText('2 posiłki')).toBeInTheDocument()
    expect(screen.getByText('5 posiłków')).toBeInTheDocument()
  })

  it('labels a meal by its kind and hour, the way the mockups do', () => {
    mockedHistory.mockReturnValue([day()])

    renderWithProviders(<DietJournals />)

    expect(screen.getByText('Przekąska · 16:20')).toBeInTheDocument()
    expect(screen.getByText('Jogurt i garść orzechów, przy biurku.')).toBeInTheDocument()
  })

  it('shows the meals inside the day rather than behind a link', () => {
    /** No detail screen is invented here: §07 is what decides whether one
     *  exists, so the day carries its own content and nothing on the row
     *  promises somewhere to go. */
    mockedHistory.mockReturnValue([day()])

    renderWithProviders(<DietJournals />)

    const card = screen.getByRole('article')

    expect(within(card).getAllByRole('listitem')).toHaveLength(1)
    expect(within(card).queryAllByRole('link')).toEqual([])
    expect(within(card).queryAllByRole('button')).toEqual([])
  })
})

describe('a meal that answered less', () => {
  it('renders with only its hour when the kind is missing', () => {
    /** §05: no field blocks a save, so every one of them can be absent. */
    mockedHistory.mockReturnValue([day({ meals: [meal({ kind: null })] })])

    renderWithProviders(<DietJournals />)

    expect(screen.getByText('16:20')).toBeInTheDocument()
  })

  it('renders with neither, without inventing a name for it', () => {
    /** Nothing reads "Nieznany posiłek": the app does not label an answer
     *  somebody chose not to give. */
    mockedHistory.mockReturnValue([day({ meals: [meal({ kind: null, time: null })] })])

    renderWithProviders(<DietJournals />)

    expect(screen.getByText('Jogurt i garść orzechów, przy biurku.')).toBeInTheDocument()
    expect(screen.queryByText(/nieznany|bez nazwy/i)).toBeNull()
  })

  it('says a meal was saved without a description rather than drawing a blank row', () => {
    /** "Niepełny wpis też jest wpisem" — but an empty row reads as something
     *  that failed to load. */
    mockedHistory.mockReturnValue([day({ meals: [meal({ description: '   ' })] })])

    renderWithProviders(<DietJournals />)

    expect(screen.getByText('Zapisany bez opisu.')).toBeInTheDocument()
  })
})

describe('paging', () => {
  const week = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      day({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, meals: [meal({ id: `m${index}` })] }),
    )

  it('is not drawn for a handful of days', () => {
    mockedHistory.mockReturnValue(week(7))

    renderWithProviders(<DietJournals />)

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('counts days rather than meals once there are enough of them', () => {
    /** Seven rows a page, like the other two list screens — and a row here is a
     *  day, so that is what the counter says. */
    mockedHistory.mockReturnValue(week(9))

    renderWithProviders(<DietJournals />)

    expect(screen.getByRole('status')).toHaveTextContent('Strona 1 z 2')
    expect(screen.getByRole('status')).toHaveTextContent('9 dni')
  })

  it('shows the next page when asked', async () => {
    mockedHistory.mockReturnValue(week(9))

    renderWithProviders(<DietJournals />)
    await userEvent.click(screen.getByRole('button', { name: /Następna/ }))

    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})

describe('what this screen refuses to show', () => {
  it('counts no calories and no macros', () => {
    /** The module does not count food. Not a gap to fill. */
    mockedHistory.mockReturnValue([day()])

    renderWithProviders(<DietJournals />)

    for (const forbidden of [/kcal/i, /kalori/i, /makro/i, /gram/i, /porcj/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('offers no search and no numeric input', () => {
    mockedHistory.mockReturnValue([day()])

    renderWithProviders(<DietJournals />)

    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('passes no judgement on a day', () => {
    /** No "dobry/zły dzień" badge: the psychotherapy archive is entitled to that
     *  (its mood scale is ordered and named), and nothing in this module has
     *  said a meal can be scored. */
    mockedHistory.mockReturnValue([day()])

    renderWithProviders(<DietJournals />)

    for (const forbidden of [/dobry dzień/i, /zły dzień/i, /udany/i, /niezdrow/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })
})
