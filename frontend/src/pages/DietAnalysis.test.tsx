import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitForElementToBeRemoved } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import DietAnalysis from './DietAnalysis'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import {
  DIET_HEATMAP_MIN_DAYS,
  DIET_HEATMAP_MIN_WEEKDAY_DAYS,
  mealDensityColor,
} from '../utils/dietAnalysis'
import { fromIsoDate } from '../utils/days'
import type { DietJournalDay } from '../types/diet'

vi.mock('../api/diet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/diet')>()
  return { ...actual, fetchDietHistory: vi.fn(actual.fetchDietHistory) }
})
const { fetchDietHistory } = await import('../api/diet')
const mockedFetch = vi.mocked(fetchDietHistory)

/**
 * "Analiza" in the diet module — §11.
 *
 * MUCH OF WHAT IS PINNED HERE IS WHAT THE SCREEN REFUSES TO SAY, as on every
 * screen in this module: no conclusion drawn from the charts, no summary card
 * naming a "hard" day, no fraction of seven, no percentage, nothing that counts
 * food. Each of those is something a reasonable person adds thinking it an
 * improvement — three of them are on the psychotherapy "Analiza" already, which
 * is exactly why a comment there would not be enough.
 *
 * The fixtures are days as `fetchDietHistory` hands them over. The hours are the
 * only field any test reads.
 */

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function day(date: string, times: (string | null)[]): DietJournalDay {
  return {
    date,
    meals: times.map((time, index) => ({
      id: `${date}-${index}`,
      kind: null,
      time,
      description: 'kanapka',
    })),
  }
}

function consecutive(count: number, times: (string | null)[]): DietJournalDay[] {
  return Array.from({ length: count }, (_, offset) => day(isoDaysAgo(offset), times))
}

/** Three weeks of breakfasts with every Sunday missing — enough to unlock the
 *  grid, and the one fixture that puts an unobserved weekday next to a measured
 *  zero. */
function threeWeeksWithoutSundays(times: (string | null)[] = ['08:00']): DietJournalDay[] {
  return Array.from({ length: 21 }, (_, offset) => isoDaysAgo(offset))
    .filter((iso) => fromIsoDate(iso).getDay() !== 0)
    .map((iso) => day(iso, times))
}

/** Three weeks with every day but Saturday, plus exactly one Saturday — the one
 *  fixture that puts a weekday observed too few times next to weekdays observed
 *  enough. */
function threeWeeksWithOneSaturday(): DietJournalDay[] {
  const days = Array.from({ length: 21 }, (_, offset) => isoDaysAgo(offset))
  return [
    ...days.filter((iso) => fromIsoDate(iso).getDay() !== 6).map((iso) => day(iso, ['08:00'])),
    ...days.filter((iso) => fromIsoDate(iso).getDay() === 6).slice(0, 1)
      .map((iso) => day(iso, ['08:00'])),
  ]
}

/**
 * Everything a reader can actually read: the rendered text plus the `title` and
 * `aria-label` attributes.
 *
 * Not `innerHTML`, which would drag the class names in — `.analysis-heat-cell`
 * contains "cel", and the sweep below refuses that word.
 */
function readableText(): string {
  const attributes = Array.from(document.querySelectorAll('[title], [aria-label]')).flatMap(
    (element) => [element.getAttribute('title'), element.getAttribute('aria-label')],
  )
  return [document.body.textContent ?? '', ...attributes.filter((value) => value !== null)].join(' ')
}

beforeEach(() => {
  mockedFetch.mockResolvedValue([])
})

describe('DietAnalysis — the three states', () => {
  it('invites a new account to write instead of drawing empty charts', async () => {
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(await screen.findByText('Jeszcze nic tu nie ma')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dodaj posiłek' })).toHaveAttribute(
      'href', ROUTES.dietMeal,
    )
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says a period is empty rather than pretending the diary is', async () => {
    // Meals, but all of them older than the window. "Nothing lately" and
    // "nothing ever" are different things to say.
    mockedFetch.mockResolvedValue([day(isoDaysAgo(60), ['08:00'])])
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(await screen.findByText('Brak wpisów z tego okresu')).toBeInTheDocument()
    expect(screen.queryByText('Jeszcze nic tu nie ma')).toBeNull()
  })

  it('never lets a failed load look like an empty screen', async () => {
    /** The mistake `Journals.tsx` and `DietReports.tsx` are both careful about:
     *  "Jeszcze nic tu nie ma" shown to somebody with a month of meals behind
     *  them. The server's own sentence is preferred to ours — every refusal a
     *  patient can reach here is a gate and says what to do about it. */
    mockedFetch.mockRejectedValue(
      new ApiError(403, 'Twój opiekun musi najpierw zaakceptować powiązanie.'),
    )
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(
      await screen.findByText('Twój opiekun musi najpierw zaakceptować powiązanie.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
    expect(screen.queryByText('Jeszcze nic tu nie ma')).toBeNull()
    expect(screen.queryByText('Brak wpisów z tego okresu')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('DietAnalysis — the window caption', () => {
  it('states the real span rather than a flat 30 days', async () => {
    // Six days in, "ostatnie 30 dni" would name a period that does not exist.
    mockedFetch.mockResolvedValue(consecutive(6, ['08:00']))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(await screen.findByText(/z ostatnich 6 dni/)).toBeInTheDocument()
    expect(screen.queryByText(/ostatnich 30 dni/)).toBeNull()
  })

  it('counts meals in the genitive the preposition asks for', async () => {
    mockedFetch.mockResolvedValue(consecutive(6, ['08:00', '13:00']))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(await screen.findByText(/z 12 posiłków z ostatnich 6 dni/)).toBeInTheDocument()
    expect(screen.queryByText(/z 12 posiłki/)).toBeNull()
  })
})

describe('DietAnalysis — which part of the day a meal landed in', () => {
  /** The boundaries themselves are `utils/dietAnalysis.test.ts`' subject. What
   *  is checked here is that the screen draws what they decided. */
  it('reads a late supper and an early-hours meal into the same night', async () => {
    mockedFetch.mockResolvedValue([
      ...Array.from({ length: 7 }, (_, offset) => day(isoDaysAgo(offset), ['23:40'])),
      ...Array.from({ length: 7 }, (_, offset) => day(isoDaysAgo(offset + 7), ['04:50'])),
    ])
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByText('Pory posiłków')

    expect(screen.getByText(/^Noc: 14 dni z posiłkiem o tej porze$/)).toBeInTheDocument()
    expect(screen.getByText(/^Rano: 0 dni z posiłkiem o tej porze$/)).toBeInTheDocument()
  })

  it('opens each part of the day on its own boundary', async () => {
    mockedFetch.mockResolvedValue([
      day(isoDaysAgo(0), ['05:00']),
      day(isoDaysAgo(1), ['11:00']),
      day(isoDaysAgo(2), ['17:00']),
    ])
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByText('Pory posiłków')

    expect(screen.getByText(/^Rano: 1 dzień z posiłkiem o tej porze$/)).toBeInTheDocument()
    expect(screen.getByText(/^Południe: 1 dzień z posiłkiem o tej porze$/)).toBeInTheDocument()
    expect(screen.getByText(/^Wieczór: 1 dzień z posiłkiem o tej porze$/)).toBeInTheDocument()
  })

  it('leaves an hourless meal off both charts and says so in a sentence', async () => {
    /** §05's "żadne pole nie blokuje zapisu" makes an hourless meal an ordinary
     *  entry, so it is neither dropped silently nor guessed into a slot — and a
     *  patient whose bars look thin is owed the reason. */
    mockedFetch.mockResolvedValue([
      ...consecutive(3, ['08:00']),
      day(isoDaysAgo(4), [null, null]),
    ])
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(
      await screen.findByText(/2 posiłki z tego okresu zapisano bez godziny/),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Rano: 3 dni z posiłkiem o tej porze$/)).toBeInTheDocument()
  })

  it('says nothing about the sentence when every meal carries an hour', async () => {
    mockedFetch.mockResolvedValue(consecutive(3, ['08:00']))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByText('Pory posiłków')

    expect(screen.queryByText(/zapisano bez godziny/)).toBeNull()
  })

  it('draws no bars at all when nothing in the window can be placed', async () => {
    // Four zeroes would claim a measurement that was never possible.
    mockedFetch.mockResolvedValue(consecutive(5, [null]))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(
      await screen.findByText(/Żaden posiłek z tego okresu nie ma zapisanej godziny/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/z posiłkiem o tej porze/)).toBeNull()
  })
})

describe('DietAnalysis — the bars count days, not meals', () => {
  it('reads three breakfasts on one day as one morning', async () => {
    mockedFetch.mockResolvedValue(consecutive(4, ['06:30', '08:00', '09:15']))
    const { container } = renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByText('Pory posiłków')

    // The number printed above the bar, and the sentence read out beside it.
    const values = Array.from(container.querySelectorAll('.analysis-bar-value')).map(
      (node) => node.textContent,
    )

    expect(values).toEqual(['4', '0', '0', '0'])
    expect(screen.getByText(/^Rano: 4 dni z posiłkiem o tej porze$/)).toBeInTheDocument()
    // Twelve meals, four days — the caption is the one figure that counts meals.
    expect(screen.getByText(/z 12 posiłków/)).toBeInTheDocument()
  })

  it('scales the bars against the days it could place, not against each other', async () => {
    /**
     * **THE CEILING IS `timedDays`, NOT THE TALLEST BAR**, and only a height can
     * show it: the numbers printed above the bars are identical either way, so a
     * test that asserts the values passes just as happily with the ceiling wrong.
     * Ten breakfasts and ten suppers on ten *other* days is twenty placeable
     * days, and each bar is half of them. Scaled against each other they would
     * both be full columns — ten days out of twenty drawn as "every day".
     */
    mockedFetch.mockResolvedValue([
      ...Array.from({ length: 10 }, (_, offset) => day(isoDaysAgo(offset), ['08:00'])),
      ...Array.from({ length: 10 }, (_, offset) => day(isoDaysAgo(offset + 10), ['19:00'])),
    ])
    const { container } = renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByText('Pory posiłków')

    const values = Array.from(container.querySelectorAll('.analysis-bar-value')).map(
      (node) => node.textContent,
    )
    const heights = Array.from(container.querySelectorAll<HTMLElement>('.analysis-bar-fill')).map(
      (node) => node.style.height,
    )

    // The numbers are the same whichever ceiling is used — which is the point.
    expect(values).toEqual(['10', '0', '10', '0'])
    expect(heights).toEqual(['50%', '0%', '50%', '0%'])
    expect(heights).not.toContain('100%')
  })

  it('says in its subtitle what a bar counts, because a bar of zero cannot', async () => {
    mockedFetch.mockResolvedValue(consecutive(4, ['08:00']))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(
      await screen.findByText('Liczba dni okresu, w których pojawił się posiłek o danej porze'),
    ).toBeInTheDocument()
  })
})

describe('DietAnalysis — the grid and its threshold', () => {
  it('stays hidden, calmly, until enough days carry a meal with an hour', async () => {
    mockedFetch.mockResolvedValue(consecutive(DIET_HEATMAP_MIN_DAYS - 1, ['08:00']))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    const locked = await screen.findByText(
      `Mapa pojawi się, gdy zbierze się co najmniej ${DIET_HEATMAP_MIN_DAYS} dni z posiłkiem zapisanym z godziną.`,
    )

    expect(locked).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    // §11: "ekran mówi jednym zdaniem, czego brakuje — bez paska postępu".
    expect(locked.textContent).not.toContain('%')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('does not unlock on the plain day count', async () => {
    mockedFetch.mockResolvedValue([
      ...consecutive(3, ['08:00']),
      ...Array.from({ length: 20 }, (_, index) => day(isoDaysAgo(index + 3), [null])),
    ])
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(await screen.findByText(/Mapa pojawi się/)).toBeInTheDocument()
  })

  it('draws the grid once there is enough behind it', async () => {
    mockedFetch.mockResolvedValue(consecutive(DIET_HEATMAP_MIN_DAYS, ['08:00']))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    expect(await screen.findByRole('table')).toBeInTheDocument()
    // The axes are real row and column headers, so a screen reader announces
    // "Wieczór, poniedziałek" instead of reading 28 unlabelled boxes.
    expect(screen.getByRole('columnheader', { name: 'Poniedziałek' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Wieczór' })).toBeInTheDocument()
  })

  it('tells a square with no data from a square holding a zero', async () => {
    /**
     * THE DISTINCTION THE GRID RESTS ON, drawn two different ways: an unobserved
     * weekday is an outline and reads "brak wpisu", a weekday that is in the
     * record but held no meal at that hour is a filled square reading "0 dni".
     * Letting them render alike would turn "nie wiemy nic o Twoich niedzielach"
     * into "w niedziele nic nie jesz".
     */
    mockedFetch.mockResolvedValue(threeWeeksWithoutSundays())
    const { container } = renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByRole('table')

    // Sunday's four squares, and only those.
    expect(container.querySelectorAll('.analysis-heat-cell-empty')).toHaveLength(4)
    expect(screen.getAllByText('brak wpisu')).toHaveLength(4)

    // The other six weekdays hold breakfasts and nothing else: eighteen measured
    // zeroes, every one of them a filled square rather than an outline.
    const zeroes = screen.getAllByText(/^0 dni z posiłkiem;/)
    expect(zeroes).toHaveLength(18)

    expect(zeroes[0].previousElementSibling).not.toHaveClass('analysis-heat-cell-empty')
    expect(zeroes[0].previousElementSibling).not.toHaveClass('analysis-heat-cell-sparse')
    expect(zeroes[0].previousElementSibling).toHaveAttribute('style')
  })

  it('says how many days of that weekday the square was counted out of', async () => {
    /**
     * **THE DENOMINATOR IS NOT A FRACTION AND MUST NOT BE DELETED AS ONE.** A
     * thirty-day window holds five of two weekdays and four of the other five,
     * so "3 dni z posiłkiem" cannot be compared with the column beside it unless
     * the reader is also told how many of that weekday there were. §15 bans a
     * fraction offered as a verdict ("6 z 7 dni"); this is two plain counts in
     * two clauses, which is the opposite. See `describeCell`.
     */
    mockedFetch.mockResolvedValue(threeWeeksWithoutSundays())
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByRole('table')

    expect(
      screen.getAllByText('3 dni z posiłkiem; ten dzień tygodnia wypadł w tym okresie 3 razy'),
    ).toHaveLength(6)

    // Never as a ratio, in either notation, anywhere on the screen.
    const text = readableText()
    expect(text).not.toMatch(/\d\s*\/\s*\d/)
    expect(text).not.toContain('3 z 3')
    expect(text).not.toContain('%')
  })

  it('gives a patient who eats the same every weekday one shade across the row', async () => {
    /**
     * **THE DEFECT THIS SCREEN WAS BUILT WRONG FOR ONCE, PINNED ON THE RENDER.**
     *
     * Thirty days do not divide by seven: two weekdays fall five times inside a
     * full window and five fall four times. Shaded against the fullest square on
     * the grid, a patient eating at identical hours every single day came out
     * with two columns at full depth and five a fifth lighter — and because the
     * window rolls, which two moved forward by one every day. The colour has to
     * come off the square's own weekday, and the only way to see that it does is
     * to read the colours off the DOM: the counts behind them differ (four and
     * five) exactly as they should.
     *
     * Asserted here rather than in `utils/dietAnalysis.test.ts` on purpose. The
     * unit test can only re-implement the division, and a re-implementation
     * agrees with anything — including a denominator quietly changed back.
     */
    // Forty days of history, so the window sits at its ceiling of thirty.
    mockedFetch.mockResolvedValue(consecutive(40, ['08:00', '13:00', '19:00', '23:00']))
    const { container } = renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByRole('table')

    for (const row of container.querySelectorAll('tbody tr')) {
      const shades = Array.from(row.querySelectorAll<HTMLElement>('.analysis-heat-cell')).map(
        (cell) => cell.style.backgroundColor,
      )
      expect(shades).toHaveLength(7)
      // Every weekday is full, so every square is the ramp's deep end — and the
      // deep end specifically, because a uniformly *wrong* shade would also be
      // uniform.
      expect(new Set(shades)).toEqual(new Set([mealDensityColor(1)]))
    }

    // The counts underneath are not uniform, which is what makes the check bite:
    // if they were, any denominator would pass.
    const readings = screen.getAllByText(/z posiłkiem; ten dzień tygodnia wypadł/)
    const counts = new Set(readings.map((node) => node.textContent?.split(' ')[0]))
    expect(counts).toEqual(new Set(['4', '5']))
  })

  it('draws a weekday eaten on four of five paler than one eaten on four of four', async () => {
    /** The same defect running the other way: the raw count made these two draw
     *  the same colour, erasing a difference the patient actually has. */
    const history: DietJournalDay[] = []
    for (let offset = 0; offset < 30; offset += 1) {
      const iso = isoDaysAgo(offset)
      const weekday = (fromIsoDate(iso).getDay() + 6) % 7
      // Breakfast every day except the oldest Monday, which holds only a supper
      // — so that Monday is still an observed day and still counts towards five.
      history.push(day(iso, weekday === 0 && offset >= 28 ? ['19:00'] : ['08:00']))
    }
    mockedFetch.mockResolvedValue(history)
    const { container } = renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByRole('table')

    const morning = Array.from(
      container.querySelectorAll<HTMLElement>('tbody tr:first-child .analysis-heat-cell'),
    )
    const [monday, tuesday] = morning

    expect(monday.title).toContain('4 dni z posiłkiem; ten dzień tygodnia wypadł w tym okresie 5 razy')
    expect(tuesday.title).toContain('4 dni z posiłkiem; ten dzień tygodnia wypadł w tym okresie 4 razy')
    expect(monday.style.backgroundColor).not.toBe(tuesday.style.backgroundColor)
    expect(tuesday.style.backgroundColor).toBe(mealDensityColor(1))
  })

  it('withholds the colour from a weekday that has come round too few times', async () => {
    /** One observed Saturday would otherwise colour the whole Saturday column at
     *  full depth off a single day of evidence — the mistake
     *  DIET_HEATMAP_MIN_DAYS guards the map against, one level down. Neither
     *  "brak wpisu" nor a zero: a third state, drawn and read out as its own. */
    mockedFetch.mockResolvedValue(threeWeeksWithOneSaturday())
    const { container } = renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByRole('table')

    // Saturday's four squares, and only those.
    const sparse = container.querySelectorAll('.analysis-heat-cell-sparse')
    expect(sparse).toHaveLength(4)
    for (const square of sparse) {
      // No colour at all — not the ramp's pale end, not anything.
      expect(square).not.toHaveAttribute('style')
    }

    expect(
      screen.getAllByText('za mało dni, żeby pokazać kolor; ten dzień tygodnia wypadł w tym okresie 1 raz'),
    ).toHaveLength(4)

    // And it is distinguishable from both of the other two states in the DOM,
    // not only in the sentence.
    expect(container.querySelectorAll('.analysis-heat-cell-empty')).toHaveLength(0)
    expect(screen.queryByText('brak wpisu')).toBeNull()
  })

  it('explains the hatched squares in the paragraph under the map', async () => {
    mockedFetch.mockResolvedValue(threeWeeksWithOneSaturday())
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByRole('table')

    expect(
      screen.getByText(
        new RegExp(`w ukośne paski .*mniej niż\\s*${DIET_HEATMAP_MIN_WEEKDAY_DAYS} razy`),
      ),
    ).toBeInTheDocument()
  })

  it('names the grid for assistive tech without printing a caption on screen', async () => {
    mockedFetch.mockResolvedValue(consecutive(DIET_HEATMAP_MIN_DAYS, ['08:00']))
    const { container } = renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })

    await screen.findByRole('table')
    const caption = container.querySelector('caption')

    expect(caption).toHaveTextContent('Liczba dni z posiłkiem według dnia tygodnia i pory dnia.')
    expect(caption).toHaveClass('visually-hidden')
  })
})

describe('DietAnalysis — what this screen is not', () => {
  const fullScreen = async () => {
    mockedFetch.mockResolvedValue(threeWeeksWithoutSundays(['08:00', '19:30']))
    renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })
    await screen.findByRole('table')
  }

  it('draws no conclusion from its own charts', async () => {
    /** §11: "wykres pokazuje, kiedy coś się działo, i nie dopisuje, co to
     *  znaczy". §10: "bez ocen, bez wniosków". The psychotherapy "Analiza" ends
     *  on a sentence about your hard Tuesdays; this one ends on the charts. */
    await fullScreen()

    expect(screen.queryByText(/CO Z TEGO WYNIKA/i)).toBeNull()
    expect(screen.queryByText(/Trudniej bywa/i)).toBeNull()
    expect(screen.queryByText(/wzorzec/i)).toBeNull()
  })

  it('names no hardest day and no hard part of the day', async () => {
    /** Both rest on a 0-10 difficulty averaged from the mood tiles, the stress
     *  chip and two sliders. This module asks none of those, and a "trudny dzień
     *  żywieniowy" invented to fill the gap would be a verdict on food. */
    await fullScreen()

    expect(screen.queryByText(/Najtrudniejszy/i)).toBeNull()
    expect(screen.queryByText(/Trudna pora/i)).toBeNull()
    expect(screen.queryByText(/trudność/i)).toBeNull()
  })

  it('offers nothing that belongs to a report', async () => {
    await fullScreen()

    expect(screen.queryByText(/Pobierz PDF/i)).toBeNull()
    expect(screen.queryByText(/Wyślij/i)).toBeNull()
    expect(screen.queryByText(/Historia analiz/i)).toBeNull()
  })

  it('offers no range switch — the window is not a control', async () => {
    await fullScreen()

    for (const label of ['Tydzień', 'Miesiąc', 'Kwartał', '30 dni', '90 dni', 'Rok']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })

  /**
   * §15's own vocabulary rules, plus the arithmetic `core/diet_reports.py` is
   * built without: no fraction of seven, no percentage, no target and no
   * measuring of food. Every one of these is something somebody adds thinking it
   * an improvement — "6 z 7 dni" is on the client's own artboard.
   */
  const BANNED = [
    'kcal', 'kalori', 'białk', 'tłuszcz', 'węglowodan', 'gram', 'porcj',
    '%', ' z 7', 'cel', 'norma', 'podjadan', 'sprzyja',
    'za dużo', 'limit', 'niezdrow', 'zdrowy wybór',
  ]

  function sweep(text: string) {
    for (const banned of BANNED) {
      expect(text.toLowerCase(), banned).not.toContain(banned)
    }
    // Never a bare feminine form, and never the slashed "zapisałeś/zapisałaś"
    // the psychotherapy note uses.
    for (const [match] of text.matchAll(/\S*łaś/g)) {
      expect(text, match).toContain(`${match} lub`)
    }
  }

  it('counts nothing that this module does not count', async () => {
    await fullScreen()
    const text = readableText()

    // The sweep is only worth anything if it is looking at everything. This
    // string exists *only* as an aria-label — the link's own text is an arrow —
    // so it fails the moment `readableText` stops reading attributes and the
    // list below starts passing vacuously.
    expect(text).toContain('Wróć do strony głównej modułu dietetycznego')
    expect(text).toContain('z posiłkiem o tej porze')

    sweep(text)
  })

  it('addresses both genders wherever it addresses one', async () => {
    await fullScreen()
    const text = readableText()

    sweep(text)
    expect(text).toContain('zapisałaś lub zapisałeś')
  })

  /**
   * **THE SWEEP IS WORTH WHAT IT COVERS, AND ONE STATE IS NOT COVERAGE.**
   *
   * It used to run against the unlocked grid alone, and the two empty states and
   * the failed load were never rendered while it ran — so a "cel", a percentage
   * or a bare feminine form could be written into "Jeszcze nic tu nie ma" or
   * "Brak wpisów z tego okresu" and every test here would stay green. Verified
   * by putting one there: both survived the whole file.
   *
   * A screen this module ships is swept in every state a patient can land on,
   * not in the one that happens to draw the most.
   */
  const STATES: [string, () => void][] = [
    ['never wrote anything', () => mockedFetch.mockResolvedValue([])],
    [
      'meals, but all of them older than the window',
      () => mockedFetch.mockResolvedValue([day(isoDaysAgo(60), ['08:00'])]),
    ],
    [
      'the load failed on a gate',
      () => mockedFetch.mockRejectedValue(
        new ApiError(403, 'Twój opiekun musi najpierw zaakceptować powiązanie.'),
      ),
    ],
    [
      'the load failed with nothing to say',
      () => mockedFetch.mockRejectedValue(new Error('network down')),
    ],
    [
      'the grid is still locked',
      () => mockedFetch.mockResolvedValue(consecutive(DIET_HEATMAP_MIN_DAYS - 1, ['08:00'])),
    ],
    [
      'no meal in the window carries an hour',
      () => mockedFetch.mockResolvedValue(consecutive(5, [null])),
    ],
    [
      'some meals carry no hour, so the aside is showing',
      () => mockedFetch.mockResolvedValue(threeWeeksWithoutSundays(['08:00', null])),
    ],
    [
      'a weekday has come round too few times to shade',
      () => mockedFetch.mockResolvedValue(threeWeeksWithOneSaturday()),
    ],
    [
      'one day of history, so every count is singular',
      () => mockedFetch.mockResolvedValue(consecutive(1, ['08:00'])),
    ],
  ]

  for (const [state, setup] of STATES) {
    it(`says nothing this module refuses to say — ${state}`, async () => {
      setup()
      renderWithProviders(<DietAnalysis />, { route: ROUTES.dietAnalysis })
      await waitForElementToBeRemoved(() => screen.queryByText('Wczytywanie Twojej analizy…'))

      const text = readableText()
      // Guards the guard: an assertion over an empty string passes vacuously.
      expect(text).toContain('Wróć do strony głównej modułu dietetycznego')
      sweep(text)
    })
  }

  it('has no bottom tab bar and keeps the module\'s own way back', async () => {
    // §03: no bottom navigation anywhere in this module; the arrow in the header
    // is the way back, and it is a link so it keeps cmd-click.
    await fullScreen()

    expect(
      screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' }),
    ).toHaveAttribute('href', ROUTES.diet)
    expect(document.querySelector('nav[class*="tab"]')).toBeNull()
  })

  it('says which module it belongs to', async () => {
    await fullScreen()

    expect(screen.getByText('DIETETYKA I PSYCHODIETETYKA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Analiza' })).toBeInTheDocument()
  })
})
