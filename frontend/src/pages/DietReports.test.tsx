import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import DietReports from './DietReports'
import { ROUTES } from '../routes'
import { buildDietReports } from '../utils/dietReport'
import { sampleDietReportSource } from '../api/dietReportSamples'
import { toIsoDate } from '../utils/days'
import type { DietReportSource } from '../types/dietReport'

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return { ...actual, loadDietReports: vi.fn(actual.loadDietReports) }
})
const { loadDietReports } = await import('../api/diet')
const mockedLoad = vi.mocked(loadDietReports)

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
 * The loader is stubbed rather than used as-is: it answers with an empty diary
 * until the module has an endpoint, so without the stub every test about a
 * filled list would pass vacuously.
 */

/** A Thursday well past the sample diary first entry, so several weeks have
 *  closed and one is still running. */
const TODAY = new Date(2026, 8, 17)

function sampleReports(today: Date = TODAY) {
  return buildDietReports(sampleDietReportSource(today), toIsoDate(today))
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(TODAY)
  mockedLoad.mockReset()
  mockedLoad.mockReturnValue([])
})

describe('DietReports', () => {
  it('wears the module own header and goes back to its home screen', () => {
    renderWithProviders(<DietReports />)

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Raporty' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' }),
    ).toHaveAttribute('href', ROUTES.diet)
  })

  it('says which weekday the week starts on, because that is the surprising rule', () => {
    mockedLoad.mockReturnValue(sampleReports())

    renderWithProviders(<DietReports />)

    const intro = screen.getByText(/Raport powstaje co siedem dni/)

    expect(intro).toHaveTextContent('w dniu pierwszego wpisu')
    expect(intro).toHaveTextContent('nie w poniedziałek')
    // Not a guess: the sentence names the day the sample diary actually began.
    expect(intro.textContent).toMatch(/Twój tydzień zaczyna się w[e]? \p{L}+/u)
  })

  it('lists the weeks newest first, each opening its own report', () => {
    const reports = sampleReports()
    mockedLoad.mockReturnValue(reports)

    renderWithProviders(<DietReports />)

    const links = screen.getAllByRole('link', { name: /dni z wpisem|dzień z wpisem/ })

    expect(links.length).toBeGreaterThan(1)
    expect(links[0]).toHaveTextContent(reports[0].rangeLabel)
    expect(links[0]).toHaveAttribute('href', `/diet/reports/${reports[0].id}`)
    // Newest first: the second row covers an earlier week than the first.
    expect(reports[1].weekStart < reports[0].weekStart).toBe(true)
    expect(links[1]).toHaveTextContent(reports[1].rangeLabel)
  })

  it('counts the days with an entry as a plain number', () => {
    mockedLoad.mockReturnValue([
      { ...sampleReports()[0], daysWithEntry: 5, rangeLabel: '2 – 8 września 2026' },
    ])

    renderWithProviders(<DietReports />)

    expect(screen.getByText('5 dni z wpisem')).toBeInTheDocument()
  })

  it('offers nothing to press when there is no report yet', () => {
    renderWithProviders(<DietReports />)

    expect(
      screen.getByText('Pierwszy raport pojawi się siedem dni po Twoim pierwszym wpisie.'),
    ).toBeInTheDocument()
    // An empty list is a diary younger than a week, not a state to escape from.
    expect(screen.queryByRole('button', { name: /dodaj|utwórz|generuj/i })).toBeNull()
    expect(screen.queryByRole('link', { name: /dodaj|utwórz|generuj/i })).toBeNull()
  })

  it('asks the loader for the day it is, not for some other day', () => {
    renderWithProviders(<DietReports />)

    expect(mockedLoad).toHaveBeenCalled()
    expect(toIsoDate(mockedLoad.mock.calls[0][0] as Date)).toBe(toIsoDate(TODAY))
  })
})

/**
 * THE LIST HAS TO GAIN ITS ROW WHILE THE PAGE IS OPEN.
 *
 * A diet week closes at midnight and this screen is one somebody leaves open;
 * the day therefore comes from `hooks/useCurrentDay.ts`, which re-reads the
 * clock on a minute's interval, rather than from a `new Date()` frozen at
 * mount. Asserting the *value* of the first call cannot tell the two apart — a
 * frozen clock passes that just as well — so this suite moves the clock instead
 * and asks what changed on screen.
 *
 * It is the trap `utils/dayLock.ts` records, one level up: this module already
 * shipped a day comparison whose two sides came from one frozen value, read
 * `x === x`, had tests over it and enforced nothing.
 */
describe('across midnight', () => {
  /** A Wednesday diary, so the weeks run Wednesday to Tuesday: 26 Aug - 1 Sep,
   *  2 - 8 Sep, 9 - 15 Sep. Both of the first two hold a meal. */
  const DIARY: DietReportSource = {
    meals: [
      { date: '2026-08-26', meals: [{ id: 'm-1', kind: 'Obiad', time: '13:00', description: 'Zupa.' }] },
      { date: '2026-09-05', meals: [{ id: 'm-2', kind: 'Obiad', time: '13:00', description: 'Ryż.' }] },
    ],
    hydration: [],
    activity: [],
    sleep: [],
  }

  /** Half a minute before the second week closes. `useCurrentDay` re-checks
   *  every minute, so one tick carries the page over the boundary. */
  const BEFORE_MIDNIGHT = new Date(2026, 8, 8, 23, 59, 30)
  const A_MINUTE = 60_000

  beforeEach(() => {
    vi.setSystemTime(BEFORE_MIDNIGHT)
    // The diary is fixed; only the day it is asked about moves.
    mockedLoad.mockImplementation((today = new Date()) =>
      buildDietReports(DIARY, toIsoDate(today)),
    )
  })

  function rangeLabels(): string[] {
    return screen
      .queryAllByRole('link', { name: /dni z wpisem|dzień z wpisem/ })
      .map((link) => link.querySelector('.diet-reports-range')?.textContent ?? '')
  }

  it('gains the row for the week that just closed, without a reload', () => {
    renderWithProviders(<DietReports />)

    // 23:59:30 on 8 September: the week 2-8 September is still running, so the
    // list holds only the one behind it.
    expect(rangeLabels()).toEqual(['26 sierpnia – 1 września 2026'])

    act(() => {
      vi.advanceTimersByTime(A_MINUTE)
    })

    // 00:00:30 on 9 September, same mounted component, nothing re-rendered by
    // hand: the week that ended is now a report, and it is at the top.
    expect(rangeLabels()).toEqual([
      '2 – 8 września 2026',
      '26 sierpnia – 1 września 2026',
    ])
  })

  it('asks the loader again, with the new day', () => {
    renderWithProviders(<DietReports />)

    const before = mockedLoad.mock.calls.map((call) => toIsoDate(call[0] as Date))

    expect(before).toContain('2026-09-08')
    expect(before).not.toContain('2026-09-09')

    act(() => {
      vi.advanceTimersByTime(A_MINUTE)
    })

    expect(mockedLoad.mock.calls.map((call) => toIsoDate(call[0] as Date))).toContain('2026-09-09')
  })

  it('says the new week is open by naming the weekday it starts on', () => {
    /** The intro sentence is derived from the newest report, so it has to
     *  survive the recomputation rather than being fixed at mount. Every week
     *  here starts on a Wednesday. */
    renderWithProviders(<DietReports />)

    act(() => {
      vi.advanceTimersByTime(A_MINUTE)
    })

    expect(screen.getByText(/Raport powstaje co siedem dni/)).toHaveTextContent(
      'Twój tydzień zaczyna się w środę',
    )
  })

  it('leaves a minute short of midnight alone', () => {
    /** The boundary is midnight and not "some time that evening": a tick that
     *  does not cross it must change nothing. */
    vi.setSystemTime(new Date(2026, 8, 8, 22, 0, 0))

    renderWithProviders(<DietReports />)

    expect(rangeLabels()).toEqual(['26 sierpnia – 1 września 2026'])

    act(() => {
      vi.advanceTimersByTime(A_MINUTE)
    })

    expect(rangeLabels()).toEqual(['26 sierpnia – 1 września 2026'])
  })
})

describe('what this screen refuses to show', () => {
  beforeEach(() => {
    mockedLoad.mockReturnValue(sampleReports())
  })

  it('never puts a day count over seven', () => {
    /** The artboard own row reads "6 z 7 dni". A fraction of seven is a
     *  regularity score, and this module does not score. */
    renderWithProviders(<DietReports />)

    expect(document.body.textContent).not.toMatch(/\sz 7\b/)
    expect(document.body.textContent).not.toContain('%')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('counts no food and names no nutrient', () => {
    renderWithProviders(<DietReports />)

    const text = document.body.textContent ?? ''
    for (const banned of ['kcal', 'kalori', 'białk', 'tłuszcz', 'węglowodan', 'makro']) {
      expect(text.toLowerCase(), banned).not.toContain(banned)
    }
  })

  it('draws no card for the week in progress', () => {
    /** Both mockup sets open the list with one, labelled "W TOKU" / "TRWA".
     *  A report describes a week that has ended — see completedDietWeeks. */
    renderWithProviders(<DietReports />)

    expect(screen.queryByText(/w toku/i)).toBeNull()
    expect(screen.queryByText(/trwa/i)).toBeNull()
    expect(screen.queryByText(/domknie się/i)).toBeNull()
  })

  it('offers no sharing and no export', () => {
    /** Sharing is not the patient decision (the client rule, confirmed), and
     *  there is no PDF renderer for this module at all. */
    renderWithProviders(<DietReports />)

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('Udostępnij')
    expect(text).not.toContain('Wyślij')
    expect(text).not.toContain('PDF')
  })

  it('promises no reader it cannot deliver', () => {
    /** The psychotherapy list says the specialists treating you see these.
     *  There is no specialist endpoint for this module, and one patient cannot
     *  hold two specialists, so the same sentence here would be false. */
    renderWithProviders(<DietReports />)

    expect(screen.queryByText(/specjalist/i)).toBeNull()
  })

  it('congratulates nobody and counts no streak', () => {
    renderWithProviders(<DietReports />)

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['brawo', 'udało się', 'gratul', 'z rzędu', 'seria', 'cel', 'norma']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('leaves no bare feminine ending', () => {
    /** The mockup is written throughout in the feminine because it describes
     *  one user journey; the module uses an impersonal form, or both forms
     *  with "lub". See DietActivitySleep.test.tsx for the two lookaheads. */
    renderWithProviders(<DietReports />)

    expect(document.body.textContent ?? '').not.toMatch(/[\p{L}]+łaś(?![\p{L}])(?!\s+lub)/u)
  })
})
