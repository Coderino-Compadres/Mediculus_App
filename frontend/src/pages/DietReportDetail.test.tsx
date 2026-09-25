import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import DietReportDetail, { DietReportBody } from './DietReportDetail'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import { addDays, fromIsoDate, toIsoDate } from '../utils/days'
import type { DietMeal } from '../types/diet'
import type { DietReportDay, DietWeeklyReport } from '../types/dietReport'

let routeId = 'week-2026-08-26'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => ({ id: routeId }) }
})

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return { ...actual, fetchDietReport: vi.fn(actual.fetchDietReport) }
})
const { fetchDietReport } = await import('../api/diet')
const mockedFetch = vi.mocked(fetchDietReport)

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
 *
 * **THE FIXTURE IS NOW WRITTEN OUT RATHER THAN DERIVED**, and that is the shape
 * of the change here: the report used to be built in the browser from the four
 * diaries (`buildDietReports`), so a test could hand the builder a diary and let
 * it produce the document. It is `core/diet_reports.py` now, so what a test can
 * legitimately state is *what the server sends* — including which slot each
 * meal was put in. Where that slotting is correct is
 * `backend/core/tests/test_diet_reports_api.MealSlotTests`, which owns the
 * boundaries; this file owns the rendering.
 *
 * **THE "ACROSS MIDNIGHT" SUITE IS GONE WITH THE DERIVATION.** Whether a week
 * has a report is decided in `settings.TIME_ZONE` now, so a screen cannot turn
 * "no such report" into a report by sitting open — it does so on the next load,
 * like the psychotherapy detail. What replaced that suite is the pair of states
 * the move introduced: a 404, which is an absence and offers no retry, and a
 * failure, which does.
 */

const WEEK_START = '2026-08-26'

const BREAKFAST: DietMeal = {
  id: 'm-1', kind: 'Śniadanie', time: '07:30', description: 'Owsianka z jabłkiem.',
  emotions: [{ emotion: 'Spokój', intensity: 6 }],
}
// After 22:00, and saved without a description — two states the module allows
// and the screen has to render calmly. Its one emotion was picked and left
// unrated, the other state `MealEmotions` has to render calmly too.
const LATE_SNACK: DietMeal = {
  id: 'm-2', kind: 'Przekąska', time: '23:40', description: '',
  emotions: [{ emotion: 'Wstyd', intensity: null }],
}
// Neither a kind nor an hour: §05's "żadne pole nie blokuje zapisu".
const UNNAMED: DietMeal = {
  id: 'm-3', kind: null, time: null, description: 'Coś na szybko.', emotions: [],
}

/** The week's seven days, in its own order, starting on the Wednesday. */
function weekDays(): string[] {
  const first = fromIsoDate(WEEK_START)
  return Array.from({ length: 7 }, (_, offset) => toIsoDate(addDays(first, offset)))
}

/** A day nobody wrote on — five of the seven. */
function emptyDay(date: string): DietReportDay {
  return { date, meals: [], hydration: null, sleep: null, activity: null, empty: false }
}

function fixture(overrides: { awakenings?: number } = {}): DietWeeklyReport {
  const [wednesday, thursday, ...rest] = weekDays()

  const days: DietReportDay[] = [
    {
      ...emptyDay(wednesday),
      // Oldest first inside the day, which is how a report reads: breakfast
      // before the late snack. (The history screen orders the other way, being
      // a list somebody scrolls.)
      meals: [BREAKFAST, LATE_SNACK],
      hydration: { date: wednesday, liquidMl: 500, glasses: 2 },
      sleep: {
        date: wednesday,
        fellAsleepAt: '23:10',
        wokeUpAt: '06:40',
        quality: 4,
        awakenings: overrides.awakenings ?? 0,
        wakeFeeling: 'rested',
      },
      activity: {
        date: wednesday,
        // No step count beside a real activity — the "nie wpisano" branch.
        steps: null,
        entries: [{
          id: 'a-1',
          date: wednesday,
          time: '18:10',
          kind: 'Spacer',
          kindOther: '',
          durationMinutes: 40,
          feelingAfter: 'better',
        }],
      },
    },
    { ...emptyDay(thursday), meals: [UNNAMED] },
    ...rest.map((date) => ({ ...emptyDay(date), empty: true })),
  ]

  return {
    id: `week-${WEEK_START}`,
    weekStart: WEEK_START,
    weekEnd: '2026-09-01',
    rangeLabel: '26 sierpnia – 1 września 2026',
    daysWithEntry: 2,
    days,
    // What the server derives from the two chips on the meals above: 'Spokój'
    // rated 6 at one meal, 'Wstyd' picked at one and left unrated. Both counts
    // are on the rows because the second is what makes an average honest.
    emotions: {
      mealsWithEmotion: 2,
      rows: [
        { emotion: 'Spokój' as const, meals: 1, ratedMeals: 1, avgIntensity: 6 },
        { emotion: 'Wstyd' as const, meals: 1, ratedMeals: 0, avgIntensity: null },
      ],
    },
    mealGrid: {
      // The fifth column is there because the week holds a meal with no hour.
      slots: ['morning', 'noon', 'evening', 'night', 'unspecified'],
      rows: days.map((day) => ({
        date: day.date,
        cells: [
          { slot: 'morning' as const, meals: day.meals.filter((m) => m === BREAKFAST) },
          { slot: 'noon' as const, meals: [] },
          { slot: 'evening' as const, meals: [] },
          { slot: 'night' as const, meals: day.meals.filter((m) => m === LATE_SNACK) },
          { slot: 'unspecified' as const, meals: day.meals.filter((m) => m === UNNAMED) },
        ],
      })),
    },
  }
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

/**
 * Mount and wait for the document rather than the loading line.
 *
 * `page` opens "Zestawienie tygodnia" straight at a given day: that card shows
 * one day at a time now, and most of the assertions below are about a
 * particular day's rows. Passed through the address rather than by clicking
 * "Następna" six times, because the page lives in the query string precisely so
 * a day is addressable — and a test that clicked its way there would be testing
 * the control in every case instead of the day.
 */
async function renderReport({ page }: { page?: number } = {}) {
  renderWithProviders(<DietReportDetail />, {
    route: page === undefined ? '/' : `/?page=${page}`,
  })
  await screen.findByRole('heading', { level: 1, name: 'Raport tygodniowy' })
}

beforeEach(() => {
  routeId = `week-${WEEK_START}`
  mockedFetch.mockReset()
  mockedFetch.mockResolvedValue(fixture())
})

describe('DietReportDetail', () => {
  it('asks the server for the week named in the address', async () => {
    await renderReport()

    expect(mockedFetch).toHaveBeenCalledWith(`week-${WEEK_START}`)
  })

  it('wears the module own header and goes back to the list of reports', async () => {
    await renderReport()

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(
      within(screen.getByRole('banner')).getByText('26 sierpnia – 1 września 2026'),
    ).toBeInTheDocument()
    // One screen back, which is the list — not the module home.
    expect(screen.getByRole('link', { name: 'Wróć do raportów' })).toHaveAttribute(
      'href',
      ROUTES.dietReports,
    )
  })

  it('closes with the note that a day without an entry is nothing to answer for', async () => {
    await renderReport()

    const note = screen.getByText(/Raport zawiera tylko to/)

    expect(note).toHaveTextContent('zapisałaś lub zapisałeś')
    expect(note).toHaveTextContent('Dni bez wpisu nie są niczym złym')
  })

  it('stops addressing the reader as the author on the specialist copy', () => {
    // The same document, read by the person who did not write it
    // (pages/SpecialistPatientDietReport.tsx renders exactly this). The note is
    // the one sentence on the page written in the second person, so it is the
    // one sentence that has to change when the reader is not the subject.
    renderWithProviders(
      <DietReportBody report={fixture()} readerIsSubject={false} />,
    )

    const note = screen.getByText(/Raport zawiera tylko to/)

    expect(note).toHaveTextContent('co pacjent zapisał')
    expect(note).not.toHaveTextContent('zapisałaś lub zapisałeś')
    // The rest of the sentence is about the week, not about the reader, so it
    // is the same on both copies.
    expect(note).toHaveTextContent('Dni bez wpisu nie są niczym złym')
  })
})

describe('Regularność wpisów', () => {
  it('starts the chips on the day the week starts, not on a Monday', async () => {
    await renderReport()

    const chips = within(card('Regularność wpisów')).getAllByRole('listitem')

    expect(chips).toHaveLength(7)
    // 26 August 2026 is a Wednesday; the row runs Śr, Cz, Pt … to Wt.
    expect(chips[0]).toHaveTextContent('Śr')
    expect(chips[0]).toHaveTextContent('26.08')
    expect(chips[6]).toHaveTextContent('Wt')
    expect(chips[6]).toHaveTextContent('1.09')
  })

  it('says in words which days hold an entry, so colour is not the only channel', async () => {
    await renderReport()

    const chips = within(card('Regularność wpisów')).getAllByRole('listitem')

    expect(chips[0]).toHaveTextContent('z wpisem')
    expect(chips[2]).toHaveTextContent('brak wpisu')
  })

  it('names each chip once, in full, rather than letting two spans run together', async () => {
    /** The weekday and the date are `aria-hidden` and one sentence carries the
     *  whole chip, which is the pattern the table's row headers use. Read as
     *  they first stood, the two visible spans concatenated to "Śr26.08, z
     *  wpisem" — no separator, and nothing a screen reader can say sensibly. */
    await renderReport()

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

  it('puts no fraction of seven on the card', async () => {
    /** The artboard says "6 z 7 dni" right here. */
    await renderReport()

    expect(card('Regularność wpisów').textContent).not.toMatch(/\sz 7\b/)
  })
})

describe('Pory posiłków', () => {
  it('heads the columns with the four parts of the day', async () => {
    await renderReport()

    const headers = within(card('Pory posiłków'))
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent)

    expect(headers).toEqual(['Dzień', 'Rano', 'Południe', 'Wieczór', 'Noc', 'Bez godziny'])
  })

  it('keeps a meal eaten after 22:00, which the mockup own bands would drop', async () => {
    /** The ochre artboard bands the day 6-10, 10-14, 14-18, 18-22. A 23:40
     *  meal falls outside all four, and night eating is exactly what this
     *  report is read for — so the server's own buckets meet end to end and
     *  `night` wraps midnight. */
    await renderReport()

    const firstRow = within(card('Pory posiłków')).getAllByRole('row')[1]
    const cells = within(firstRow).getAllByRole('cell')

    // Rano holds the 07:30 breakfast, Noc the 23:40 snack, the rest are empty.
    expect(cells[0]).toHaveTextContent('Śniadanie')
    expect(cells[3]).toHaveTextContent('Przekąska')
    expect(cells[1].textContent).toBe('')
    expect(cells[2].textContent).toBe('')
  })

  it('gives a meal with no hour its own column instead of guessing one', async () => {
    await renderReport()

    const secondRow = within(card('Pory posiłków')).getAllByRole('row')[2]
    const cells = within(secondRow).getAllByRole('cell')

    // Unnamed meal, so the dot names itself "posiłek" rather than by a kind.
    expect(cells[4]).toHaveTextContent('posiłek')
  })

  it('puts no number in any cell, and no total on any row or column', async () => {
    await renderReport()

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

describe('Najczęstsze emocje przy jedzeniu', () => {
  /**
   * §05's section, and the one card on this screen that counts anything.
   *
   * What makes it allowable is *what the number is about*: an intensity is a
   * slider the patient moved herself, on the psychotherapy form's own picker.
   * The moment a figure here starts describing the food, the card has crossed
   * the line the whole module is built on — which is what the last two tests
   * in this block guard.
   */

  it('ranks the week chips, most often picked first', async () => {
    await renderReport()

    const section = card('Najczęstsze emocje przy jedzeniu')

    expect(within(section).getByText('Spokój')).toBeInTheDocument()
    expect(within(section).getByText('Wstyd')).toBeInTheDocument()
  })

  it('counts meals rather than days', async () => {
    /* An emotion hangs off a meal here, so two difficult meals on one Tuesday
       are two things that happened. The psychotherapy ranking counts days,
       which is exactly the unit somebody would "correct" this to. */
    await renderReport()

    const section = card('Najczęstsze emocje przy jedzeniu')

    expect(within(section).getAllByText(/1 posiłek/)).not.toHaveLength(0)
    expect(within(section).queryByText(/1 dzień/)).toBeNull()
  })

  it('says how many meals the ranking was drawn from', async () => {
    /* One meal may carry several chips, so the rows can add up to more than the
       meals behind them. A denominator, not a score. */
    await renderReport()

    expect(
      within(card('Najczęstsze emocje przy jedzeniu')).getByText(/Z 2 posiłków/),
    ).toBeInTheDocument()
  })

  it('prints an average for a rated chip and none for an unrated one', async () => {
    /* 'Spokój' was rated 6; 'Wstyd' was picked with the slider never moved.
       Printing "0 / 10" on the second would put a rating on the record that
       nobody gave. */
    await renderReport()

    const section = card('Najczęstsze emocje przy jedzeniu')

    expect(within(section).getByText(/6,0 \/ 10/)).toBeInTheDocument()
    expect(within(section).queryByText(/0,0 \/ 10/)).toBeNull()
  })

  it('draws the bar from the average intensity, not from the meal count', async () => {
    /* Both chips sit on one meal each, so a count-drawn bar would fill both
       rows. 'Spokój' averaged 6/10 and draws 60 percent; 'Wstyd' was never
       rated and draws nothing rather than a zero nobody gave. */
    await renderReport()

    const fills = card('Najczęstsze emocje przy jedzeniu').querySelectorAll<HTMLElement>('.report-ranking-fill')
    const widths = Array.from(fills, (fill) => fill.style.width)

    expect(widths).toContain('60%')
    expect(widths).toContain('0%')
    expect(widths).not.toContain('100%')
  })

  it('explains the row that has no average instead of leaving it looking broken', async () => {
    await renderReport()

    expect(
      within(card('Najczęstsze emocje przy jedzeniu')).getByText(
        /Natężenie nie zostało ocenione/,
      ),
    ).toBeInTheDocument()
  })

  it('says what the numbers are, and that they do not grade the food', async () => {
    await renderReport()

    const note = within(card('Najczęstsze emocje przy jedzeniu')).getByText(
      /nie ocenia jedzenia/,
    )

    expect(note).toHaveTextContent('oceniłaś lub oceniłeś')
  })

  it('is absent altogether for a week nobody picked a chip in', async () => {
    /* Not an empty ranking and not a "brak emocji": §05's rule is that no field
       blocks a save, so meals saved without an emotion are ordinary meals and
       the report simply has one card fewer. */
    mockedFetch.mockResolvedValue({
      ...fixture(),
      emotions: { mealsWithEmotion: 0, rows: [] },
    })

    await renderReport()

    expect(screen.queryByRole('region', { name: 'Najczęstsze emocje przy jedzeniu' })).toBeNull()
  })

  it('still lists every chip under the meal that felt it', async () => {
    /* The ranking is a second reading of the same rows, never a replacement:
       the day-by-day listing keeps its own chips. */
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText(/Spokój/)).toBeInTheDocument()
  })
})

describe('Zestawienie tygodnia', () => {
  /**
   * **THE FOUR DIARIES ARE GRID CELLS, AND THE MARKUP IS WHAT MAKES THAT
   * POSSIBLE.**
   *
   * Three of the four are tiny — "Nawodnienie" is one line, "Aktywność" two —
   * and stacked down a 640px card they used a third of the width and ran the
   * section to about 4000px of height: sparse and cramped at the same time.
   * They sit side by side now, which needs each term-description pair wrapped
   * in its own element: a bare `<dl>` makes `dt` and `dd` two separate grid
   * items, so the label would land in one column and its content in the next
   * and the pairing would break the moment a day held an odd number of
   * diaries.
   *
   * Pinned here because the wrappers look like markup somebody could delete as
   * redundant, and nothing about the rendered text would change if they did —
   * only the layout, silently, and only on a wide screen.
   */

  function groupsIn(name: string): HTMLElement[] {
    return Array.from(day(name).querySelectorAll('.diet-report-group'))
  }

  it('wraps each diary in its own element, so the columns can pair up', async () => {
    await renderReport()

    const groups = groupsIn('środa, 26 sierpnia')
    const labels = groups.map((group) => group.querySelector('dt')?.textContent)

    expect(labels).toEqual(['Posiłki', 'Nawodnienie', 'Sen', 'Aktywność'])
    // And each wrapper really does hold the pair, not just the term.
    for (const group of groups) {
      expect(group.querySelector('dd')).not.toBeNull()
    }
  })

  it('calls the hydration figure "Płyny", because it is not water alone', async () => {
    /**
     * The row said "Woda" while the number behind it counted water only, and
     * both halves changed together on 2026-09-17: the figure now includes tea
     * and coffee (`core/hydration.py`), so a row still labelled "Woda" would be
     * a specialist reading a volume of tea as a volume of water.
     */
    await renderReport()

    const hydration = groupsIn('środa, 26 sierpnia')[1]

    expect(hydration.querySelector('dt')?.textContent).toBe('Nawodnienie')
    expect(hydration).toHaveTextContent('Płyny')
    expect(hydration).not.toHaveTextContent('Woda')
    // The figure itself is the server's, drawn as it came: 500 ml is 2 glasses.
    expect(hydration).toHaveTextContent('2 szklanki')
  })

  it('lets the meals span the row and keeps the short diaries in columns', async () => {
    /* A meal carries a description somebody typed as a sentence or two, and a
       paragraph set in a 180px column is a paragraph nobody reads. The other
       three are label-and-value lines, which is exactly what a column is for. */
    await renderReport()

    const [meals, ...rest] = groupsIn('środa, 26 sierpnia')

    expect(meals).toHaveClass('diet-report-group-wide')
    for (const group of rest) {
      expect(group).not.toHaveClass('diet-report-group-wide')
    }
  })

  it('puts how somebody felt after an activity on its own line', async () => {
    /* Inline it was the longest line in the day, and the only one that had to
       wrap once the diaries became columns — breaking after the colon. The em
       dash went with it: a dash joins two halves of one line. */
    await renderReport()

    const aside = day('środa, 26 sierpnia').querySelector('.diet-report-fact-aside')

    expect(aside).toHaveTextContent('samopoczucie po: lepsze')
    expect(aside?.textContent).not.toContain('—')
  })

  /* The order is the week's own, starting on the Wednesday the patient began on
     — not a Monday. With one day to a page the order *is* the pages, so it is
     read off the first and the last of them — in two tests rather than one,
     because a second `renderReport` in the same test mounts a second screen and
     every `card(...)` then finds two. */

  it('opens on the day the week starts, which is not a Monday', async () => {
    await renderReport()

    expect(
      within(card('Zestawienie tygodnia')).getByRole('heading', { level: 3 }),
    ).toHaveTextContent('środa, 26 sierpnia')
  })

  it('ends on the seventh day of that week', async () => {
    await renderReport({ page: 7 })

    expect(
      within(card('Zestawienie tygodnia')).getByRole('heading', { level: 3 }),
    ).toHaveTextContent('wtorek, 1 września')
  })

  it('renders a meal by its hour, its kind and what was typed', async () => {
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText('07:30')).toBeInTheDocument()
    expect(within(wednesday).getByText('Śniadanie')).toBeInTheDocument()
    expect(within(wednesday).getByText('Owsianka z jabłkiem.')).toBeInTheDocument()
    // Saved without a description: said plainly, never left blank.
    expect(within(wednesday).getByText('bez opisu')).toBeInTheDocument()
  })

  it('says "bez godziny" rather than dropping a meal that has none', async () => {
    await renderReport({ page: 2 })

    const thursday = day('czwartek, 27 sierpnia')

    expect(within(thursday).getByText('bez godziny')).toBeInTheDocument()
    expect(within(thursday).getByText('Coś na szybko.')).toBeInTheDocument()
  })

  it('lists what was felt at a meal, rated, beside it', async () => {
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText('Spokój')).toBeInTheDocument()
    expect(within(wednesday).getByText('6/10')).toBeInTheDocument()
  })

  it('names a chip picked and left unrated, with no number invented for it', async () => {
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')
    const chip = within(wednesday).getByText('Wstyd')

    expect(chip).toBeInTheDocument()
    expect(chip.parentElement).not.toHaveTextContent('/10')
  })

  it('draws no emotion chip for a meal nobody picked one on', async () => {
    await renderReport({ page: 2 })

    const thursday = day('czwartek, 27 sierpnia')

    expect(within(thursday).queryByText(/Spokój|Wstyd/)).toBeNull()
  })

  it('reports water the way the hydration screen counts it, and no further', async () => {
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText(/2 szklanki/)).toBeInTheDocument()
    // No goal, no share of it, no comparison with another day.
    expect(wednesday.textContent).not.toContain('cel')
    expect(wednesday.textContent).not.toMatch(/\sz 6\b/)
  })

  it('describes the night, with the length computed once and reused', async () => {
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText('23:10')).toBeInTheDocument()
    expect(within(wednesday).getByText('06:40')).toBeInTheDocument()
    // 23:10 → 06:40 crosses midnight: 7 h 30 min, not minus sixteen hours. The
    // one value this module computes, and it is computed in the browser
    // (`sleepDurationMinutes`) rather than stored — see core/sleep.py.
    expect(within(wednesday).getByText('7 h 30 min')).toBeInTheDocument()
    expect(within(wednesday).getByText('4 w skali 1-5')).toBeInTheDocument()
    expect(within(wednesday).getByText('Wyspanie')).toBeInTheDocument()
  })

  it('shows a night interrupted more than nought times', async () => {
    mockedFetch.mockResolvedValue(fixture({ awakenings: 2 }))

    await renderReport()

    const wednesday = day('środa, 26 sierpnia')
    const line = within(wednesday).getByText('Przebudzenia w nocy:').parentElement

    expect(line).toHaveTextContent('2')
  })

  it('draws no line at all when the night records nought awakenings', async () => {
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
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).queryByText('Przebudzenia w nocy:')).toBeNull()
    expect(wednesday.textContent).not.toContain('Przebudzenia w nocy')
    // And the line was not replaced by a zero hiding somewhere else.
    expect(within(wednesday).getByText('Zaśnięcie:')).toBeInTheDocument()
    expect(within(wednesday).getByText('4 w skali 1-5')).toBeInTheDocument()
  })

  it('writes a missing step count as "nie wpisano" rather than as nought', async () => {
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')
    const steps = within(wednesday).getByText('Kroki:').parentElement

    expect(steps).toHaveTextContent('nie wpisano')
    expect(steps).not.toHaveTextContent('0')
  })

  it('renders an activity with its length and how it felt afterwards', async () => {
    await renderReport()

    const wednesday = day('środa, 26 sierpnia')

    expect(within(wednesday).getByText(/Spacer · 40 min/)).toBeInTheDocument()
    expect(within(wednesday).getByText(/samopoczucie po: lepsze/)).toBeInTheDocument()
  })

  it('says "brak wpisu" for a day nobody wrote on', async () => {
    // The third day of the fixture week, and it gets a page of its own like any
    // other: a quiet day is an ordinary day, not one to skip past.
    await renderReport({ page: 3 })

    const friday = day('piątek, 28 sierpnia')

    expect(within(friday).getByText('brak wpisu')).toBeInTheDocument()
  })
})

/**
 * ONE DAY TO A PAGE.
 *
 * Seven days of meals, chips and three more diaries ran this card to some
 * 3500px — a week nobody reads to the end. The page size is 1 rather than the
 * house seven because the *unit* differs: elsewhere a row is a line or two,
 * here a "row" is a whole day.
 *
 * **WHAT THIS SUITE IS REALLY GUARDING IS THAT THE WEEK SURVIVES IT.** Paging a
 * document is only acceptable because the two cards above are the week —
 * "Regularność wpisów" draws all seven chips and "Pory posiłków" all seven rows
 * — so what is paged is the detail. A change that paged those too would take
 * the week away, and the last test here is what says so.
 */
describe('Zestawienie tygodnia — paginacja', () => {
  it('shows one day at a time, and says where in the week it is', async () => {
    await renderReport()

    const section = card('Zestawienie tygodnia')

    expect(within(section).getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(within(section).getByRole('status')).toHaveTextContent('Strona 1 z 7')
  })

  it('leaves out the range, which at one day a page only restates the page', async () => {
    /* "Strona 3 z 7 (3–3 z 7 dni)" — a range whose two ends are the same number
       reads as a fault rather than as a count. */
    await renderReport({ page: 3 })

    const status = within(card('Zestawienie tygodnia')).getByRole('status')

    expect(status).toHaveTextContent('Strona 3 z 7')
    expect(status.textContent).not.toContain('–')
    expect(status.textContent).not.toContain('dni')
  })

  it('steps to the next day and back again', async () => {
    const user = userEvent.setup()
    await renderReport()
    const section = card('Zestawienie tygodnia')

    await user.click(within(section).getByRole('button', { name: /Następna/ }))
    expect(within(card('Zestawienie tygodnia')).getByRole('heading', { level: 3 }))
      .toHaveTextContent('czwartek, 27 sierpnia')

    await user.click(within(card('Zestawienie tygodnia')).getByRole('button', { name: /Poprzednia/ }))
    expect(within(card('Zestawienie tygodnia')).getByRole('heading', { level: 3 }))
      .toHaveTextContent('środa, 26 sierpnia')
  })

  it('cannot step back from the first day', async () => {
    await renderReport()
    const section = card('Zestawienie tygodnia')

    expect(within(section).getByRole('button', { name: /Poprzednia/ })).toBeDisabled()
    expect(within(section).getByRole('button', { name: /Następna/ })).toBeEnabled()
  })

  it('cannot step past the last day', async () => {
    await renderReport({ page: 7 })
    const section = card('Zestawienie tygodnia')

    expect(within(section).getByRole('button', { name: /Następna/ })).toBeDisabled()
    expect(within(section).getByRole('button', { name: /Poprzednia/ })).toBeEnabled()
  })

  it('takes the day from the address, so a day can be linked to', async () => {
    /* The page lives in the query string rather than in component state, which
       is what makes a report's Thursday a thing somebody can send. */
    await renderReport({ page: 5 })

    expect(
      within(card('Zestawienie tygodnia')).getByRole('heading', { level: 3 }),
    ).toHaveTextContent('niedziela, 30 sierpnia')
  })

  it('still shows the whole week above, chip by chip and row by row', async () => {
    /* **THE REASON PAGING THIS CARD IS ALLOWED AT ALL.** A report is read as a
       week; if the week only existed in this card, hiding six sevenths of it
       would be hiding the document. It does not — these two cards are the week,
       and they stay whole on every page. */
    await renderReport({ page: 4 })

    expect(within(card('Regularność wpisów')).getAllByRole('listitem')).toHaveLength(7)
    expect(
      within(card('Pory posiłków')).getAllByRole('row').slice(1),
    ).toHaveLength(7)
  })
})

/**
 * AN ID NO WEEK CARRIES IS AN ABSENCE, NOT A FAILURE — AND OFFERS NO RETRY.
 *
 * A week nobody wrote in and a typed-in address answer the same way (404), and
 * a second attempt answers the same, so a "Spróbuj ponownie" button there would
 * be a control that cannot work. Anything else — offline, a gate, a 500 — is a
 * failure and does offer one.
 */
describe('an id no week carries', () => {
  beforeEach(() => {
    mockedFetch.mockRejectedValue(new ApiError(404, 'Nie znaleziono raportu dla tego tygodnia.'))
  })

  it('says so, and offers the way back', async () => {
    routeId = 'week-2020-01-01'

    renderWithProviders(<DietReportDetail />)

    expect(await screen.findByText('Nie znaleziono takiego raportu.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Wróć do raportów' })).toHaveAttribute(
      'href',
      ROUTES.dietReports,
    )
  })

  it('answers a nonsense address the same way, leaking nothing', async () => {
    /** A typed-in id and a week nobody wrote in are indistinguishable, because
     *  neither tells the patient anything they can act on. */
    routeId = 'nie-ma-takiego'

    renderWithProviders(<DietReportDetail />)

    expect(await screen.findByText('Nie znaleziono takiego raportu.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('offers no retry, because a second attempt answers the same', async () => {
    routeId = 'week-2020-01-01'

    renderWithProviders(<DietReportDetail />)
    await screen.findByText('Nie znaleziono takiego raportu.')

    expect(screen.queryByRole('button', { name: 'Spróbuj ponownie' })).toBeNull()
  })
})

describe('when the report cannot be read', () => {
  it('says so in the server own words, and not as a missing report', async () => {
    /** Every refusal a patient can actually reach here is a gate — an unlinked
     *  minor, withdrawn consents — and each arrives with a message saying what
     *  to do about it. "Nie znaleziono" would send them looking for the wrong
     *  problem. */
    mockedFetch.mockRejectedValue(
      new ApiError(403, 'Poczekaj, aż opiekun zaakceptuje Twoje konto.'),
    )

    renderWithProviders(<DietReportDetail />)

    expect(
      await screen.findByText('Poczekaj, aż opiekun zaakceptuje Twoje konto.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Nie znaleziono takiego raportu.')).toBeNull()
  })

  it('falls back to its own sentence when the failure carried none', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'))

    renderWithProviders(<DietReportDetail />)

    expect(await screen.findByText('Nie udało się wczytać raportu.')).toBeInTheDocument()
  })

  it('offers a retry that asks again and shows the report', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('offline'))
    mockedFetch.mockResolvedValue(fixture())

    renderWithProviders(<DietReportDetail />)
    await screen.findByText('Nie udało się wczytać raportu.')

    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Raport tygodniowy' }),
    ).toBeInTheDocument()
  })

  it('says it is working while the first request is in flight', async () => {
    let release: (report: DietWeeklyReport) => void = () => {}
    mockedFetch.mockReturnValue(
      new Promise<DietWeeklyReport>((resolve) => {
        release = resolve
      }),
    )

    renderWithProviders(<DietReportDetail />)

    // Not "nie znaleziono", which would be a claim the screen cannot make yet.
    expect(screen.getByText('Wczytywanie raportu…')).toBeInTheDocument()
    expect(screen.queryByText('Nie znaleziono takiego raportu.')).toBeNull()

    release(fixture())
    await waitFor(() => expect(screen.queryByText('Wczytywanie raportu…')).toBeNull())
  })
})

describe('what this screen refuses to show', () => {
  it('counts no food and names no nutrient', async () => {
    await renderReport()

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['kcal', 'kalori', 'białk', 'tłuszcz', 'węglowodan', 'makro', 'gram']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('offers the PDF and nothing else — no sharing, no send', async () => {
    /** The renderer exists now (`fetchDietReportPdf`, the same server-side
     *  ReportLab path the psychotherapy report uses), so "Pobierz PDF" is a
     *  real action and no longer banned here. The other two still are: saving a
     *  file to your own device is not an act of sharing, and who else reads
     *  this report is not the patient's decision to make on this screen. */
    await renderReport()

    expect(screen.getByRole('button', { name: 'Pobierz PDF' })).toBeEnabled()

    const text = document.body.textContent ?? ''
    expect(text).not.toContain('Udostępnij')
    expect(text).not.toContain('Wyślij')
  })

  it('puts "Pobierz PDF" in the psychotherapy report’s own hero card', async () => {
    /** The two modules' downloads are one design: the lavender button this
     *  replaced sat on the lavender page and was barely visible. */
    await renderReport()

    const button = screen.getByRole('button', { name: 'Pobierz PDF' })
    expect(button).toHaveClass('report-hero-button')

    const hero = button.closest('.report-hero') as HTMLElement
    expect(hero).not.toBeNull()
    expect(within(hero).getByText('RAPORT TYGODNIOWY')).toBeInTheDocument()
    expect(within(hero).getByText('2 z 7 dni z wpisem')).toBeInTheDocument()
  })

  it('promises no reader it cannot deliver', async () => {
    await renderReport()

    expect(screen.queryByText(/specjalist/i)).toBeNull()
  })

  it('compares nothing with the week before or with a visit', async () => {
    /** "Zmiany od ostatniej wizyty" is on the artboard and is deliberately
     *  absent: the one pair the mockup allows comparing does not exist, and
     *  the app does not know when a visit happened. */
    await renderReport()

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['ostatniej wizyty', 'poprzedni tydzień', 'w porównaniu', 'zmiany od']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('scores nothing and congratulates nobody', async () => {
    await renderReport()

    const text = (document.body.textContent ?? '').toLowerCase()
    for (const banned of ['brawo', 'gratul', 'z rzędu', 'pominię', 'zaległ', 'norma', '%']) {
      expect(text, banned).not.toContain(banned)
    }
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('leaves no bare feminine ending', async () => {
    await renderReport()

    expect(document.body.textContent ?? '').not.toMatch(/[\p{L}]+łaś(?![\p{L}])(?!\s+lub)/u)
  })
})
