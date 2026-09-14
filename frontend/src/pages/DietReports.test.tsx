import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietReports from './DietReports'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import type { DietWeeklyReport } from '../types/dietReport'

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return { ...actual, fetchDietReports: vi.fn(actual.fetchDietReports) }
})
const { fetchDietReports } = await import('../api/diet')
const mockedFetch = vi.mocked(fetchDietReports)

/**
 * "Raporty" in the diet module — §10, the list.
 *
 * WHAT IS PINNED IS MOSTLY WHAT IS NOT THERE, as on every screen in this
 * module: no fraction of seven, no percentage, nothing that counts food, no
 * card for the week in progress, and no promise about who else reads this.
 * Each of those is something a reasonable person adds thinking it an
 * improvement — the "6 z 7 dni" is even on the client's own artboard — so a
 * comment would not be enough.
 *
 * **THE "ACROSS MIDNIGHT" SUITE THAT USED TO SIT HERE IS GONE, DELIBERATELY.**
 * The list was derived in the browser from a live calendar day, so it gained
 * its row without a reload and the suite moved the clock under a mounted screen
 * to prove it. The report is the server's now, and with it the "has this week
 * ended" cutoff — read in `settings.TIME_ZONE`, which is the same clock that
 * decides which day an entry belongs to, and which is exactly what deriving on
 * the client got wrong for a reader west of Warsaw. A list open across midnight
 * gains its row on the next load, like the psychotherapy "Raporty" screen.
 * `backend/core/tests/test_diet_reports_api.WeekTests` owns the boundary now.
 *
 * The fixtures below are written as the *server* sends them — mapped into
 * camelCase by `api/diet.ts`, which is where the wire shape is tested. A week
 * starting on a **Wednesday**, because every assertion about this module's week
 * would pass by accident against a Monday.
 */

/** A week the server would send: only the four fields this screen reads carry
 *  anything, and the rest are the empty shapes that come with them. */
function reportFixture(
  overrides: Partial<DietWeeklyReport> & Pick<DietWeeklyReport, 'id' | 'weekStart'>,
): DietWeeklyReport {
  return {
    weekEnd: '2026-09-01',
    rangeLabel: '26 sierpnia – 1 września 2026',
    daysWithEntry: 3,
    days: [],
    mealGrid: { slots: [], rows: [] },
    ...overrides,
  }
}

/** Two closed weeks, newest first — the order the server answers in. */
const REPORTS: DietWeeklyReport[] = [
  reportFixture({
    id: 'week-2026-09-02',
    weekStart: '2026-09-02',
    weekEnd: '2026-09-08',
    rangeLabel: '2 – 8 września 2026',
    daysWithEntry: 5,
  }),
  reportFixture({
    id: 'week-2026-08-26',
    weekStart: '2026-08-26',
    weekEnd: '2026-09-01',
    rangeLabel: '26 sierpnia – 1 września 2026',
    daysWithEntry: 3,
  }),
]

beforeEach(() => {
  mockedFetch.mockReset()
  mockedFetch.mockResolvedValue([])
})

describe('DietReports', () => {
  it('wears the module own header and goes back to its home screen', async () => {
    renderWithProviders(<DietReports />)

    expect(await screen.findByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Raporty' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' }),
    ).toHaveAttribute('href', ROUTES.diet)
  })

  it('reads the list from the server rather than deriving one', async () => {
    renderWithProviders(<DietReports />)

    await screen.findByText(/Pierwszy raport pojawi się/)
    expect(mockedFetch).toHaveBeenCalledTimes(1)
    // No argument at all: the week boundary is the server's, not this screen's.
    expect(mockedFetch.mock.calls[0]).toEqual([])
  })

  it('says which weekday the week starts on, because that is the surprising rule', async () => {
    mockedFetch.mockResolvedValue(REPORTS)

    renderWithProviders(<DietReports />)

    await screen.findByText('2 – 8 września 2026')
    const intro = screen.getByText(/Raport powstaje co siedem dni/)

    expect(intro).toHaveTextContent('w dniu pierwszego wpisu')
    expect(intro).toHaveTextContent('nie w poniedziałek')
    // 2 September 2026 is a Wednesday, and every week starts on the same day.
    expect(intro).toHaveTextContent('Twój tydzień zaczyna się w środę')
  })

  it('names no weekday before there is a report to name one from', async () => {
    renderWithProviders(<DietReports />)

    const intro = await screen.findByText(/Raport powstaje co siedem dni/)

    expect(intro).toHaveTextContent('Tydzień liczy się od dnia Twojego pierwszego wpisu')
    expect(intro.textContent).not.toMatch(/zaczyna się w/)
  })

  it('lists the weeks newest first, each opening its own report', async () => {
    mockedFetch.mockResolvedValue(REPORTS)

    renderWithProviders(<DietReports />)

    await screen.findByText('2 – 8 września 2026')
    const links = screen.getAllByRole('link', { name: /dni z wpisem|dzień z wpisem/ })

    expect(links).toHaveLength(2)
    expect(links[0]).toHaveTextContent('2 – 8 września 2026')
    expect(links[0]).toHaveAttribute('href', '/diet/reports/week-2026-09-02')
    // Newest first: the second row covers an earlier week than the first.
    expect(REPORTS[1].weekStart < REPORTS[0].weekStart).toBe(true)
    expect(links[1]).toHaveTextContent('26 sierpnia – 1 września 2026')
  })

  it('counts the days with an entry as a plain number', async () => {
    mockedFetch.mockResolvedValue([REPORTS[0]])

    renderWithProviders(<DietReports />)

    expect(await screen.findByText('5 dni z wpisem')).toBeInTheDocument()
  })

  it('declines the count, so one day does not read as "1 dni"', async () => {
    mockedFetch.mockResolvedValue([reportFixture({
      id: 'week-2026-09-02', weekStart: '2026-09-02', daysWithEntry: 1,
    })])

    renderWithProviders(<DietReports />)

    expect(await screen.findByText('1 dzień z wpisem')).toBeInTheDocument()
  })

  it('offers nothing to press when there is no report yet', async () => {
    renderWithProviders(<DietReports />)

    expect(
      await screen.findByText(
        'Pierwszy raport pojawi się siedem dni po Twoim pierwszym wpisie.',
      ),
    ).toBeInTheDocument()
    // An empty list is a diary younger than a week, not a state to escape from.
    expect(screen.queryByRole('button', { name: /dodaj|utwórz|generuj/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /dodaj|utwórz|generuj/i })).toBeNull()
  })
})

/**
 * A LIST THAT FAILED TO LOAD IS NEVER DRAWN AS AN EMPTY DIARY.
 *
 * "Pierwszy raport pojawi się siedem dni po Twoim pierwszym wpisie" over a
 * diary that has several is the mistake `Journals.tsx` is careful about, and it
 * is worse here than on a list of meals: it tells a patient their reports do
 * not exist yet.
 *
 * The server's own sentence is preferred to the generic one, because every
 * refusal a patient can actually reach on this endpoint is a gate — an unlinked
 * minor (art. 8) or an account whose consents are not in force — and each
 * arrives with a message saying what to do about it.
 */
describe('when the list cannot be read', () => {
  it('says so, in the server own words, and never as an empty diary', async () => {
    mockedFetch.mockRejectedValue(
      new ApiError(403, 'Poczekaj, aż opiekun zaakceptuje Twoje konto.'),
    )

    renderWithProviders(<DietReports />)

    expect(
      await screen.findByText('Poczekaj, aż opiekun zaakceptuje Twoje konto.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Pierwszy raport pojawi się/)).toBeNull()
  })

  it('falls back to its own sentence when the failure carried none', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'))

    renderWithProviders(<DietReports />)

    expect(await screen.findByText('Nie udało się wczytać raportów.')).toBeInTheDocument()
  })

  it('offers a retry that asks again and shows what came back', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('offline'))
    mockedFetch.mockResolvedValue(REPORTS)

    renderWithProviders(<DietReports />)
    await screen.findByText('Nie udało się wczytać raportów.')

    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(await screen.findByText('2 – 8 września 2026')).toBeInTheDocument()
    expect(screen.queryByText('Nie udało się wczytać raportów.')).toBeNull()
  })

  it('says it is working while the first request is in flight', async () => {
    let release: (reports: DietWeeklyReport[]) => void = () => {}
    mockedFetch.mockReturnValue(
      new Promise<DietWeeklyReport[]>((resolve) => {
        release = resolve
      }),
    )

    renderWithProviders(<DietReports />)

    // Not "no reports yet", which would be a claim the screen cannot make yet.
    expect(screen.getByText('Wczytywanie raportów…')).toBeInTheDocument()
    expect(screen.queryByText(/Pierwszy raport pojawi się/)).toBeNull()

    release(REPORTS)
    await waitFor(() => expect(screen.queryByText('Wczytywanie raportów…')).toBeNull())
  })
})

describe('what this screen refuses to show', () => {
  beforeEach(() => {
    mockedFetch.mockResolvedValue(REPORTS)
  })

  async function renderLoaded() {
    renderWithProviders(<DietReports />)
    await screen.findByText('2 – 8 września 2026')
  }

  it('never puts a day count over seven', async () => {
    /** The artboard own row reads "6 z 7 dni". A fraction of seven is a
     *  regularity score, and this module does not score. */
    await renderLoaded()

    expect(document.body.textContent).not.toMatch(/\sz 7\b/)
    expect(document.body.textContent).not.toContain('%')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('counts no food and names no nutrient', async () => {
    await renderLoaded()

    const text = document.body.textContent ?? ''
    for (const banned of ['kcal', 'kalori', 'białk', 'tłuszcz', 'węglowodan', 'makro']) {
      expect(text.toLowerCase(), banned).not.toContain(banned)
    }
  })

  it('draws no card for the week in progress', async () => {
    /** Both mockup sets open the list with one, labelled "W TOKU" / "TRWA".
     *  A report describes a week that has ended — the server leaves the running
     *  week out and this screen has nothing to draw one from. */
    await renderLoaded()

    expect(screen.queryByText(/w toku/i)).toBeNull()
    expect(screen.queryByText(/trwa/i)).toBeNull()
    expect(screen.queryByText(/domknie się/i)).toBeNull()
  })

  it('offers no sharing and no export', async () => {
    /** Sharing is not the patient decision (the client rule, confirmed), and
     *  there is no PDF renderer for this module at all. */
    await renderLoaded()

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('Udostępnij')
    expect(text).not.toContain('Wyślij')
    expect(text).not.toContain('PDF')
  })

  it('promises no reader it cannot deliver', async () => {
    /** The psychotherapy list says the specialists treating you see these.
     *  There is no specialist endpoint for this module, and one patient cannot
     *  hold two specialists, so the same sentence here would be false. */
    await renderLoaded()

    expect(screen.queryByText(/specjalist/i)).toBeNull()
  })

  it('congratulates nobody and counts no streak', async () => {
    await renderLoaded()

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['brawo', 'udało się', 'gratul', 'z rzędu', 'seria', 'cel', 'norma']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('leaves no bare feminine ending', async () => {
    /** The mockup is written throughout in the feminine because it describes
     *  one user journey; the module uses an impersonal form, or both forms
     *  with "lub". See DietActivitySleep.test.tsx for the two lookaheads. */
    await renderLoaded()

    expect(document.body.textContent ?? '').not.toMatch(/[\p{L}]+łaś(?![\p{L}])(?!\s+lub)/u)
  })
})
