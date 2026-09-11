import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import DietReportDetail from './DietReportDetail'
import { ROUTES } from '../routes'
import { buildDietReports, findDietReport } from '../utils/dietReport'
import { toIsoDate } from '../utils/days'
import type { DietReportSource, DietWeeklyReport } from '../types/dietReport'

let routeId = 'week-2026-08-26'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => ({ id: routeId }) }
})

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return { ...actual, loadDietReport: vi.fn(actual.loadDietReport) }
})
const { loadDietReport } = await import('../api/diet')
const mockedLoad = vi.mocked(loadDietReport)

/**
 * One weekly report in the diet module — §10, the detail.
 *
 * The fixture is a week starting on a **Wednesday**, deliberately: every
 * assertion about the order of the day chips and the day-by-day listing would
 * pass by accident against a Monday-to-Sunday week, which is the week the other
 * module counts and the one somebody will assume this screen counts too.
 *
 * As everywhere in this module, half of what is pinned is absence: no fraction
 * of seven, no total, no PDF, no sharing, no promise about who else reads it,
 * and nothing that counts food.
 */

const WEEK_START = '2026-08-26'
const TODAY = new Date(2026, 8, 2)

function fixtureSource(): DietReportSource {
  return {
    meals: [
      {
        date: '2026-08-26',
        meals: [
          { id: 'm-1', kind: 'Śniadanie', time: '07:30', description: 'Owsianka z jabłkiem.' },
          // After 22:00, and saved without a description — two states the
          // module allows and the screen has to render calmly.
          { id: 'm-2', kind: 'Przekąska', time: '23:40', description: '' },
        ],
      },
      {
        date: '2026-08-27',
        // Neither a kind nor an hour: §05's "żadne pole nie blokuje zapisu".
        meals: [{ id: 'm-3', kind: null, time: null, description: 'Coś na szybko.' }],
      },
    ],
    hydration: [{ date: '2026-08-26', waterMl: 500, glasses: 2 }],
    activity: [
      {
        date: '2026-08-26',
        // No step count beside a real activity — the "nie wpisano" branch.
        steps: null,
        entries: [
          {
            id: 'a-1',
            date: '2026-08-26',
            time: '18:10',
            kind: 'Spacer',
            kindOther: '',
            durationMinutes: 40,
            feelingAfter: 'better',
          },
        ],
      },
    ],
    sleep: [
      {
        date: '2026-08-26',
        fellAsleepAt: '23:10',
        wokeUpAt: '06:40',
        quality: 4,
        awakenings: 0,
        wakeFeeling: 'rested',
      },
    ],
  }
}

function fixture(): DietWeeklyReport {
  const [report] = buildDietReports(fixtureSource(), '2026-09-02')
  return report
}

/** The card a heading names, so an assertion cannot drift into another one. */
function card(name: string): HTMLElement {
  return screen.getByRole('region', { name })
}

/** One day inside "Zestawienie tygodnia". A `group` rather than a `region`:
 *  seven landmarks named after weekdays is not what a landmark list is for, so
 *  the days are groups and only the three cards are landmarks. */
function day(name: string): HTMLElement {
  return within(card('Zestawienie tygodnia')).getByRole('group', { name })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(TODAY)
  routeId = `week-${WEEK_START}`
  mockedLoad.mockReset()
  mockedLoad.mockReturnValue(fixture())
})

describe('DietReportDetail', () => {
  it('wears the module own header and goes back to the list of reports', () => {
    renderWithProviders(<DietReportDetail />)

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Raport tygodniowy' }),
    ).toBeInTheDocument()
    expect(screen.getByText('26 sierpnia – 1 września 2026')).toBeInTheDocument()
    // One screen back, which is the list — not the module home.
    expect(screen.getByRole('link', { name: 'Wróć do raportów' })).toHaveAttribute(
      'href',
      ROUTES.dietReports,
    )
  })

  it('closes with the note that a day without an entry is nothing to answer for', () => {
    renderWithProviders(<DietReportDetail />)

    const note = screen.getByText(/Raport zawiera tylko to/)

    expect(note).toHaveTextContent('zapisałaś lub zapisałeś')
    expect(note).toHaveTextContent('Dni bez wpisu nie są niczym złym')
  })
})

describe('Regularność wpisów', () => {
  it('starts the chips on the day the week starts, not on a Monday', () => {
    renderWithProviders(<DietReportDetail />)

    const chips = within(card('Regularność wpisów')).getAllByRole('listitem')

    expect(chips).toHaveLength(7)
    // 26 August 2026 is a Wednesday; the row runs Śr, Cz, Pt … to Wt.
    expect(chips[0]).toHaveTextContent('Śr')
    expect(chips[0]).toHaveTextContent('26.08')
    expect(chips[6]).toHaveTextContent('Wt')
    expect(chips[6]).toHaveTextContent('1.09')
  })

  it('says in words which days hold an entry, so colour is not the only channel', () => {
    renderWithProviders(<DietReportDetail />)

    const chips = within(card('Regularność wpisów')).getAllByRole('listitem')

    expect(chips[0]).toHaveTextContent('z wpisem')
    expect(chips[2]).toHaveTextContent('brak wpisu')
  })

  it('names each chip once, in full, rather than letting two spans run together', () => {
    /** The weekday and the date are `aria-hidden` and one sentence carries the
     *  whole chip, which is the pattern the table's row headers use. Read as
     *  they first stood, the two visible spans concatenated to "Śr26.08, z
     *  wpisem" — no separator, and nothing a screen reader can say sensibly. */
    renderWithProviders(<DietReportDetail />)

    const chips = within(card('Regularność wpisów')).getAllByRole('listitem')

    for (const span of chips[0].querySelectorAll('.diet-report-day-chip-weekday, .diet-report-day-chip-date')) {
      expect(span).toHaveAttribute('aria-hidden', 'true')
    }

    const spoken = chips[0].querySelector('.visually-hidden')

    expect(spoken).toHaveTextContent('środa, 26 sierpnia, z wpisem')
    // A day with nothing on it is named the same way, and just as plainly.
    expect(chips[2].querySelector('.visually-hidden')).toHaveTextContent(
      'piątek, 28 sierpnia, brak wpisu',
    )
  })

  it('puts no fraction of seven on the card', () => {
    /** The artboard says "6 z 7 dni" right here. */
    renderWithProviders(<DietReportDetail />)

    expect(card('Regularność wpisów').textContent).not.toMatch(/\sz 7\b/)
  })
})

describe('Pory posiłków', () => {
  it('heads the columns with the four parts of the day', () => {
    renderWithProviders(<DietReportDetail />)

    const headers = within(card('Pory posiłków'))
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)

    expect(headers).toEqual(['Dzień', 'Rano', 'Południe', 'Wieczór', 'Noc', 'Bez godziny'])
  })

  it('keeps a meal eaten after 22:00, which the mockup own bands would drop', () => {
    /** The ochre artboard bands the day 6-10, 10-14, 14-18, 18-22. A 23:40
     *  meal falls outside all four, and night eating is exactly what this
     *  report is read for. */
    renderWithProviders(<DietReportDetail />)

    const firstRow = within(card('Pory posiłków')).getAllByRole('row')[1]
    const cells = within(firstRow).getAllByRole('cell')

    // Rano holds the 07:30 breakfast, Noc the 23:40 snack, the rest are empty.
    expect(cells[0]).toHaveTextContent('Śniadanie')
    expect(cells[3]).toHaveTextContent('Przekąska')
    expect(cells[1].textContent).toBe('')
    expect(cells[2].textContent).toBe('')
  })

  it('gives a meal with no hour its own column instead of guessing one', () => {
    renderWithProviders(<DietReportDetail />)

    const secondRow = within(card('Pory posiłków')).getAllByRole('row')[2]
    const cells = within(secondRow).getAllByRole('cell')

    // Unnamed meal, so the dot names itself "posiłek" rather than by a kind.
    expect(cells[4]).toHaveTextContent('posiłek')
  })

  it('puts no number in any cell, and no total on any row or column', () => {
    renderWithProviders(<DietReportDetail />)

    const grid = card('Pory posiłków')
    for (const cell of within(grid).getAllByRole('cell')) {
      expect(cell.textContent ?? '').not.toMatch(/\d/)
    }
    // Seven days and no eighth row summing them.
    expect(within(grid).getAllByRole('row')).toHaveLength(8)
    expect(grid.textContent?.toLowerCase()).not.toContain('razem')
    expect(grid.textContent?.toLowerCase()).not.toContain('suma')
  })
})

describe('Zestawienie tygodnia', () => {
  it('lists the days in the week own order, each named in full', () => {
    renderWithProviders(<DietReportDetail />)

    const days = within(card('Zestawienie tygodnia')).getAllByRole('heading', { level: 3 })

    expect(days).toHaveLength(7)
    expect(days[0]).toHaveTextContent('środa, 26 sierpnia')
    expect(days[6]).toHaveTextContent('wtorek, 1 września')
  })

  it('renders a meal by its hour, its kind and what was typed', () => {
    renderWithProviders(<DietReportDetail />)

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText('07:30')).toBeInTheDocument()
    expect(within(wednesday).getByText('Śniadanie')).toBeInTheDocument()
    expect(within(wednesday).getByText('Owsianka z jabłkiem.')).toBeInTheDocument()
    // Saved without a description: said plainly, never left blank.
    expect(within(wednesday).getByText('bez opisu')).toBeInTheDocument()
  })

  it('says "bez godziny" rather than dropping a meal that has none', () => {
    renderWithProviders(<DietReportDetail />)

    const thursday = day('czwartek, 27 sierpnia')

    expect(within(thursday).getByText('bez godziny')).toBeInTheDocument()
    expect(within(thursday).getByText('Coś na szybko.')).toBeInTheDocument()
  })

  it('reports water the way the hydration screen counts it, and no further', () => {
    renderWithProviders(<DietReportDetail />)

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText(/2 szklanki/)).toBeInTheDocument()
    // No goal, no share of it, no comparison with another day.
    expect(wednesday.textContent).not.toContain('cel')
    expect(wednesday.textContent).not.toMatch(/\sz 6\b/)
  })

  it('describes the night, with the length computed once and reused', () => {
    renderWithProviders(<DietReportDetail />)

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText('23:10')).toBeInTheDocument()
    expect(within(wednesday).getByText('06:40')).toBeInTheDocument()
    // 23:10 → 06:40 crosses midnight: 7 h 30 min, not minus sixteen hours.
    expect(within(wednesday).getByText('7 h 30 min')).toBeInTheDocument()
    expect(within(wednesday).getByText('4 w skali 1-5')).toBeInTheDocument()
    expect(within(wednesday).getByText('Wyspanie')).toBeInTheDocument()
  })

  it('shows a night interrupted more than nought times', () => {
    const source = fixtureSource()
    source.sleep[0].awakenings = 2
    mockedLoad.mockReturnValue(buildDietReports(source, '2026-09-02')[0])

    renderWithProviders(<DietReportDetail />)

    const wednesday = day('środa, 26 sierpnia')
    const line = within(wednesday).getByText('Przebudzenia w nocy:').parentElement

    expect(line).toHaveTextContent('2')
  })

  it('draws no line at all when the night records nought awakenings', () => {
    /** NOT "0" AND NOT "nie wpisano", BECAUSE AT ZERO NEITHER IS KNOWN TO BE
     *  TRUE. `emptySleepNight` starts the field at 0 and the stepper's floor is
     *  0 with no empty state, so a night whose hours and quality were filled in
     *  while the stepper was never touched is indistinguishable from an
     *  unbroken night somebody recorded on purpose. "0 przebudzeń" would report
     *  an answer nobody gave and "nie wpisano" would deny one somebody may have
     *  given; leaving the line out says only what is true. The fixture's night
     *  is exactly that case — filled in, awakenings 0.
     *
     *  The rest of the night is still there, so this is the row being omitted
     *  rather than the section failing to render. */
    renderWithProviders(<DietReportDetail />)

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).queryByText('Przebudzenia w nocy:')).toBeNull()
    expect(wednesday.textContent).not.toContain('Przebudzenia w nocy')
    // And the line was not replaced by a zero hiding somewhere else.
    expect(within(wednesday).getByText('Zaśnięcie:')).toBeInTheDocument()
    expect(within(wednesday).getByText('4 w skali 1-5')).toBeInTheDocument()
  })

  it('writes a missing step count as "nie wpisano" rather than as nought', () => {
    renderWithProviders(<DietReportDetail />)

    const wednesday = day('środa, 26 sierpnia')
    const steps = within(wednesday).getByText('Kroki:').parentElement

    expect(steps).toHaveTextContent('nie wpisano')
    expect(steps).not.toHaveTextContent('0')
  })

  it('renders an activity with its length and how it felt afterwards', () => {
    renderWithProviders(<DietReportDetail />)

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText(/Spacer · 40 min/)).toBeInTheDocument()
    expect(within(wednesday).getByText(/samopoczucie po: lepsze/)).toBeInTheDocument()
  })

  it('says "brak wpisu" for a day nobody wrote on', () => {
    renderWithProviders(<DietReportDetail />)

    const friday = day('piątek, 28 sierpnia')

    expect(within(friday).getByText('brak wpisu')).toBeInTheDocument()
  })
})

describe('an id no week carries', () => {
  it('says so, and offers the way back', () => {
    routeId = 'week-2020-01-01'
    mockedLoad.mockReturnValue(null)

    renderWithProviders(<DietReportDetail />)

    expect(screen.getByText('Nie znaleziono takiego raportu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Wróć do raportów' })).toHaveAttribute(
      'href',
      ROUTES.dietReports,
    )
  })

  it('answers a nonsense address the same way, leaking nothing', () => {
    /** A typed-in id and a week nobody wrote in are indistinguishable, because
     *  neither tells the patient anything they can act on. */
    routeId = 'nie-ma-takiego'
    mockedLoad.mockReturnValue(null)

    renderWithProviders(<DietReportDetail />)

    expect(screen.getByText('Nie znaleziono takiego raportu.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})

/**
 * THE REPORT HAS TO BE DERIVED FROM THE DAY IT IS, NOT FROM THE DAY THE PAGE
 * OPENED.
 *
 * A week closes at midnight, and whether a week has a report at all depends on
 * that. So the day comes from `hooks/useCurrentDay.ts` rather than from a
 * `new Date()` frozen at mount — and the only way to tell those apart is to
 * move the clock under a mounted screen and ask what changed, which is why this
 * suite exists next to the list's. See utils/dayLock.ts for the defect this
 * module already shipped by comparing one frozen value with itself.
 *
 * The case is the one a patient actually reaches: the address of the week they
 * are in the last minutes of. Before midnight it is not a report and the screen
 * says so; a tick later it is one.
 */
describe('across midnight', () => {
  /** A Wednesday diary: weeks 26 Aug - 1 Sep, 2 - 8 Sep, 9 - 15 Sep. */
  const DIARY: DietReportSource = {
    meals: [
      { date: '2026-08-26', meals: [{ id: 'm-1', kind: 'Obiad', time: '13:00', description: 'Zupa.' }] },
      { date: '2026-09-05', meals: [{ id: 'm-2', kind: 'Obiad', time: '13:00', description: 'Ryż.' }] },
    ],
    hydration: [],
    activity: [],
    sleep: [],
  }

  const BEFORE_MIDNIGHT = new Date(2026, 8, 8, 23, 59, 30)
  const A_MINUTE = 60_000

  beforeEach(() => {
    vi.setSystemTime(BEFORE_MIDNIGHT)
    // The week ending on 8 September — the one still running at 23:59:30.
    routeId = 'week-2026-09-02'
    mockedLoad.mockImplementation((id, today = new Date()) =>
      findDietReport(buildDietReports(DIARY, toIsoDate(today)), id),
    )
  })

  it('turns "no such report" into the report once its week has ended', () => {
    renderWithProviders(<DietReportDetail />)

    // Still the week in progress, so there is no document to open yet — and it
    // is worded exactly like a week nobody wrote in.
    expect(screen.getByText('Nie znaleziono takiego raportu.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()

    act(() => {
      vi.advanceTimersByTime(A_MINUTE)
    })

    // Same mounted screen, nothing reloaded: the week closed and the report is
    // there, with its own range.
    expect(screen.queryByText('Nie znaleziono takiego raportu.')).toBeNull()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Raport tygodniowy' }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 – 8 września 2026')).toBeInTheDocument()
  })

  it('asks for the report again, with the new day', () => {
    renderWithProviders(<DietReportDetail />)

    expect(mockedLoad.mock.calls.map((call) => toIsoDate(call[1] as Date))).not.toContain(
      '2026-09-09',
    )

    act(() => {
      vi.advanceTimersByTime(A_MINUTE)
    })

    const days = mockedLoad.mock.calls.map((call) => toIsoDate(call[1] as Date))

    expect(days).toContain('2026-09-08')
    expect(days).toContain('2026-09-09')
    // The id it asks about never changes — only the day does.
    for (const call of mockedLoad.mock.calls) expect(call[0]).toBe('week-2026-09-02')
  })

  it('leaves a report that was already open exactly as it was', () => {
    /** The week 26 August - 1 September closed long ago, so crossing midnight
     *  must change nothing about it. A screen that redrew its contents at
     *  midnight would be worse than one that froze. */
    routeId = 'week-2026-08-26'

    renderWithProviders(<DietReportDetail />)

    expect(screen.getByText('26 sierpnia – 1 września 2026')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(A_MINUTE)
    })

    expect(screen.getByText('26 sierpnia – 1 września 2026')).toBeInTheDocument()
    expect(
      within(card('Zestawienie tygodnia')).getAllByRole('heading', { level: 3 }),
    ).toHaveLength(7)
  })
})

describe('what this screen refuses to show', () => {
  it('counts no food and names no nutrient', () => {
    renderWithProviders(<DietReportDetail />)

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['kcal', 'kalori', 'białk', 'tłuszcz', 'węglowodan', 'makro', 'gram']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('offers no PDF, no sharing and no send', () => {
    /** There is no PDF renderer for this module — the psychotherapy one is a
     *  server endpoint — and sharing is not the patient decision. */
    renderWithProviders(<DietReportDetail />)

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('PDF')
    expect(text).not.toContain('Udostępnij')
    expect(text).not.toContain('Wyślij')
  })

  it('promises no reader it cannot deliver', () => {
    renderWithProviders(<DietReportDetail />)

    expect(screen.queryByText(/specjalist/i)).toBeNull()
  })

  it('compares nothing with the week before or with a visit', () => {
    /** "Zmiany od ostatniej wizyty" is on the artboard and is deliberately
     *  absent: the one pair the mockup allows comparing does not exist, and
     *  the app does not know when a visit happened. */
    renderWithProviders(<DietReportDetail />)

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['ostatniej wizyty', 'poprzedni tydzień', 'w porównaniu', 'zmiany od']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('scores nothing and congratulates nobody', () => {
    renderWithProviders(<DietReportDetail />)

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['brawo', 'gratul', 'z rzędu', 'pominię', 'zaległ', 'norma', '%']) {
      expect(text, banned).not.toContain(banned)
    }
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('leaves no bare feminine ending', () => {
    renderWithProviders(<DietReportDetail />)

    expect(document.body.textContent ?? '').not.toMatch(/[\p{L}]+łaś(?![\p{L}])(?!\s+lub)/u)
  })
})
