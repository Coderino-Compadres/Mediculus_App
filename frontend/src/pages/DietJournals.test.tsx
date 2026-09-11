import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietJournals from './DietJournals'
import { ROUTES } from '../routes'
import type { DietJournalDay } from '../types/diet'

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return {
    ...actual,
    fetchDietHistory: vi.fn(async () => [] as DietJournalDay[]),
  }
})
const { fetchDietHistory } = await import('../api/diet')
const mockedHistory = vi.mocked(fetchDietHistory)

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
 * `fetchDietHistory` is stubbed, which is what these tests mock now that the
 * screen reads `GET /api/diet/meals/` rather than a hardcoded empty history.
 * The failure branch is pinned too — a failed load must never be drawn as an
 * empty diary, which is the mistake `Journals.tsx` is careful about.
 */

/**
 * Render, then wait for the request to answer.
 *
 * Every assertion below is about the loaded screen, and the request is real
 * now, so this is where the "Wczytywanie…" line is waited out — once, here,
 * rather than in thirty tests.
 */
async function renderJournals() {
  renderWithProviders(<DietJournals />)
  await waitFor(() =>
    expect(screen.queryByText('Wczytywanie dzienniczków…')).toBeNull(),
  )
}

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
  mockedHistory.mockReset()
  mockedHistory.mockResolvedValue([])
})

describe('the screen itself', () => {
  it('names the module and the screen', async () => {
    await renderJournals()

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Dzienniczki żywieniowe' }))
      .toBeInTheDocument()
  })

  it('leads back to the module through an arrow in the header', () => {
    /**
     * An arrow *in the header* rather than a link below it — one app, one way of
     * going back, and what both mockup sets draw. Still an `<a>` though: the
     * shape is what the two modules share, the element follows what the control
     * does, and this screen has no unsaved-changes guard to run (the reason
     * pages/DiaryEntry.tsx uses a button).
     */
    renderWithProviders(<DietJournals />)

    const back = screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' })
    expect(back).toHaveAttribute('href', ROUTES.diet)
    expect(screen.getByRole('banner')).toContainElement(back)
  })

  it('says what the list is, and that it judges nothing', async () => {
    /** "Dzienniczek żywieniowy, który nie liczy jedzenia" is the module's own
     *  description of itself; the intro says it in the second person. */
    await renderJournals()

    expect(screen.getByText(/Nic tu nie jest liczone ani oceniane/)).toBeInTheDocument()
  })
})

describe('an empty history', () => {
  it('is an ordinary state, not a failure', async () => {
    await renderJournals()

    expect(screen.getByRole('heading', { name: 'Jeszcze nic tu nie ma' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers the way out of it, and it is the same one the home screen offers', async () => {
    await renderJournals()

    expect(screen.getByRole('link', { name: 'Dodaj posiłek' }))
      .toHaveAttribute('href', ROUTES.dietMeal)
  })

  it('draws no pagination over nothing', async () => {
    await renderJournals()

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })
})

describe('a day with meals', () => {
  it('is headed by its date, with the weekday and a lowercase month', async () => {
    /** "wtorek, 8 września" — the mockups' own way of writing a date, and
     *  without the `text-transform: capitalize` that renders "8 Września" on
     *  four other screens. */
    mockedHistory.mockResolvedValue([day()])

    await renderJournals()

    expect(screen.getByRole('heading', { name: /wtorek, 8 września/ })).toBeInTheDocument()
  })

  it('counts its meals in Polish', async () => {
    mockedHistory.mockResolvedValue([
      day({ date: '2026-09-08', meals: [meal()] }),
      day({ date: '2026-09-07', meals: [meal({ id: 'a' }), meal({ id: 'b' })] }),
      day({
        date: '2026-09-06',
        meals: Array.from({ length: 5 }, (_, index) => meal({ id: `c${index}` })),
      }),
    ])

    await renderJournals()

    expect(screen.getByText('1 posiłek')).toBeInTheDocument()
    expect(screen.getByText('2 posiłki')).toBeInTheDocument()
    expect(screen.getByText('5 posiłków')).toBeInTheDocument()
  })

  it('labels a meal by its kind and hour, the way the mockups do', async () => {
    mockedHistory.mockResolvedValue([day()])

    await renderJournals()

    expect(screen.getByText('Przekąska · 16:20')).toBeInTheDocument()
    expect(screen.getByText('Jogurt i garść orzechów, przy biurku.')).toBeInTheDocument()
  })

  it('keeps the meals on the card even though the day now opens', async () => {
    /** The detail screen exists, but the list is still useful without
     *  navigating — that was the reason the meals were inline before there
     *  was anywhere to go, and it did not stop being true. */
    mockedHistory.mockResolvedValue([day()])

    await renderJournals()

    const card = screen.getByRole('article')

    expect(within(card).getAllByRole('listitem')).toHaveLength(1)
    expect(within(card).queryAllByRole('button')).toEqual([])
  })

  it('opens the day from its heading', async () => {
    mockedHistory.mockResolvedValue([day({ date: '2026-09-08' })])

    await renderJournals()

    const link = screen.getByRole('link', { name: /otwórz dzienniczek dnia/i })

    expect(link).toHaveAttribute('href', '/diet/journals/2026-09-08')
  })

  it('names the day and its meal count in the link, not the descriptions', async () => {
    /** A link wrapping the whole card would make every word of every
     *  description part of its accessible name. What the reader is choosing
     *  between is the date and how much is in it. */
    mockedHistory.mockResolvedValue([
      day({ date: '2026-09-08', meals: [meal({ description: 'Zupa z torebki.' })] }),
    ])

    await renderJournals()

    const link = screen.getByRole('link', { name: /otwórz dzienniczek dnia/i })

    expect(link).toHaveAccessibleName(/wtorek, 8 września/i)
    expect(link).toHaveAccessibleName(/1 posiłek/)
    expect(link).not.toHaveAccessibleName(/Zupa z torebki/)
  })
})

describe('a meal that answered less', () => {
  it('renders with only its hour when the kind is missing', async () => {
    /** §05: no field blocks a save, so every one of them can be absent. */
    mockedHistory.mockResolvedValue([day({ meals: [meal({ kind: null })] })])

    await renderJournals()

    expect(screen.getByText('16:20')).toBeInTheDocument()
  })

  it('renders with neither, without inventing a name for it', async () => {
    /** Nothing reads "Nieznany posiłek": the app does not label an answer
     *  somebody chose not to give. */
    mockedHistory.mockResolvedValue([day({ meals: [meal({ kind: null, time: null })] })])

    await renderJournals()

    expect(screen.getByText('Jogurt i garść orzechów, przy biurku.')).toBeInTheDocument()
    expect(screen.queryByText(/nieznany|bez nazwy/i)).toBeNull()
  })

  it('says a meal was saved without a description rather than drawing a blank row', async () => {
    /** "Niepełny wpis też jest wpisem" — but an empty row reads as something
     *  that failed to load. */
    mockedHistory.mockResolvedValue([day({ meals: [meal({ description: '   ' })] })])

    await renderJournals()

    expect(screen.getByText('Zapisany bez opisu.')).toBeInTheDocument()
  })
})

describe('paging', () => {
  const week = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      day({ date: `2026-09-${String(index + 1).padStart(2, '0')}`, meals: [meal({ id: `m${index}` })] }),
    )

  it('is not drawn for a handful of days', async () => {
    mockedHistory.mockResolvedValue(week(7))

    await renderJournals()

    expect(screen.queryByRole('navigation', { name: 'Paginacja' })).toBeNull()
  })

  it('counts days rather than meals once there are enough of them', async () => {
    /** Seven rows a page, like the other two list screens — and a row here is a
     *  day, so that is what the counter says. */
    mockedHistory.mockResolvedValue(week(9))

    await renderJournals()

    expect(screen.getByRole('status')).toHaveTextContent('Strona 1 z 2')
    expect(screen.getByRole('status')).toHaveTextContent('9 dni')
  })

  it('shows the next page when asked', async () => {
    mockedHistory.mockResolvedValue(week(9))

    await renderJournals()
    await userEvent.click(screen.getByRole('button', { name: /Następna/ }))

    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})

describe('what this screen refuses to show', () => {
  it('counts no calories and no macros', async () => {
    /** The module does not count food. Not a gap to fill. */
    mockedHistory.mockResolvedValue([day()])

    await renderJournals()

    for (const forbidden of [/kcal/i, /kalori/i, /makro/i, /gram/i, /porcj/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('offers no search and no numeric input', async () => {
    mockedHistory.mockResolvedValue([day()])

    await renderJournals()

    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('passes no judgement on a day', async () => {
    /** No "dobry/zły dzień" badge: the psychotherapy archive is entitled to that
     *  (its mood scale is ordered and named), and nothing in this module has
     *  said a meal can be scored. */
    mockedHistory.mockResolvedValue([day()])

    await renderJournals()

    for (const forbidden of [/dobry dzień/i, /zły dzień/i, /udany/i, /niezdrow/i]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })
})
