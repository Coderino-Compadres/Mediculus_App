import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import Analysis from './Analysis'
import { ROUTES } from '../routes'
import { ApiError } from '../api/client'
import {
  ANALYSIS_WINDOW_DAYS,
  HEATMAP_MIN_DAYS,
  weekdayIndex,
} from '../utils/analysis'
import { fromIsoDate } from '../utils/days'
import type { JournalListEntry } from '../types/diaryEntry'

vi.mock('../api/diary', () => ({ fetchJournalEntries: vi.fn() }))
const { fetchJournalEntries } = await import('../api/diary')
const mockedFetch = vi.mocked(fetchJournalEntries)

vi.mock('../api/analysis', () => ({ fetchYearFrequency: vi.fn() }))
const { fetchYearFrequency } = await import('../api/analysis')
const mockedYear = vi.mocked(fetchYearFrequency)

/** What the server answers for a named year — months, not weeks, and the list
 *  of years the picker is built from. */
function yearAnswer(year: number, years: number[] = [year]) {
  return {
    year,
    yearsWithEntries: years,
    buckets: ['sty', 'lut', 'mar'].map((label, index) => ({
      label,
      days: 20 + index,
      length: 31,
      partial: false,
      rangeLabel: `1 – 31 ${label}`,
    })),
  }
}

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function entry(daysAgo: number, overrides: Partial<JournalListEntry> = {}): JournalListEntry {
  const date = isoDaysAgo(daysAgo)
  return {
    id: `id-${date}`,
    date,
    savedAt: `${date}T20:00:00`,
    mood: 'bad',
    emotions: [{ emotion: 'Lęk', intensity: 7 }],
    energyLevel: 3,
    tensionLevel: 6,
    situationReaction: {
      trigger: 'Praca',
      triggerOther: '',
      situation: '',
      emotionNote: '',
      thought: '',
      behavior: '',
    },
    notes: '',
    hasRiskyBehavior: false,
    riskyBehaviorNote: '',
    ...overrides,
  }
}

function consecutive(count: number, overrides: Partial<JournalListEntry> = {}) {
  return Array.from({ length: count }, (_, index) => entry(index, overrides))
}

/**
 * Three weeks in which one weekday is clearly the hard one.
 *
 * A uniform month no longer produces a confident sentence — see
 * MIN_DIFFICULTY_MARGIN — so a fixture that wants one has to contain a pattern.
 */
function patternedMonth(overrides: Partial<JournalListEntry> = {}): JournalListEntry[] {
  const hardWeekday = weekdayIndex(fromIsoDate(isoDaysAgo(0)))
  return Array.from({ length: 21 }, (_, offset) =>
    entry(offset, {
      mood: weekdayIndex(fromIsoDate(isoDaysAgo(offset))) === hardWeekday ? 'very_bad' : 'good',
      ...overrides,
    }),
  )
}

beforeEach(() => {
  mockedFetch.mockResolvedValue([])
  // `restoreMocks` restores spies, not the call history of a vi.fn() made in a
  // mock factory — and one test here asserts the year endpoint is *not* called.
  mockedYear.mockReset()
})

describe('Analysis — empty and failed states', () => {
  it('invites the patient to write instead of drawing empty charts', async () => {
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/Twoja analiza pojawi się/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dodaj wpis' })).toHaveAttribute(
      'href',
      ROUTES.diaryEntry,
    )
    // A column of zeroes would read as a broken screen rather than a new one.
    expect(screen.queryByText('Udział emocji')).not.toBeInTheDocument()
  })

  it('says a period is empty rather than pretending the diary is', async () => {
    mockedFetch.mockResolvedValue([entry(90)])
    renderWithProviders(<Analysis />)

    expect(await screen.findByText('Brak wpisów z tego okresu')).toBeInTheDocument()
    expect(screen.queryByText(/Twoja analiza pojawi się/)).not.toBeInTheDocument()
  })

  it('never lets a failed load look like an empty diary', async () => {
    mockedFetch.mockRejectedValue(new ApiError(500, null))
    renderWithProviders(<Analysis />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nie udało się wczytać/)
    expect(screen.queryByText(/Twoja analiza pojawi się/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeInTheDocument()
  })
})

describe('Analysis — the window caption', () => {
  it('states the real span rather than a flat 30 days', async () => {
    mockedFetch.mockResolvedValue([entry(22), entry(5), entry(0)])
    renderWithProviders(<Analysis />)

    expect(
      await screen.findByText('Wyliczone automatycznie z 3 wpisów z ostatnich 23 dni.'),
    ).toBeInTheDocument()
  })

  it('declines the entry count', async () => {
    mockedFetch.mockResolvedValue([entry(4), entry(0)])
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/z 2 wpisów z ostatnich 5 dni/)).toBeInTheDocument()
  })
})

describe('Analysis — the trend chart', () => {
  it('names the same period as the caption above it', async () => {
    /** The chart used to say "ostatnie 14 dni" under a caption saying 30, which
     *  is what made a bar reading "20 dni" in "Udział emocji" look like a bug.
     *  One window, stated the same way in both places. */
    mockedFetch.mockResolvedValue(consecutive(30))
    renderWithProviders(<Analysis />)

    expect(
      await screen.findByText(`Nastrój, ostatnie ${ANALYSIS_WINDOW_DAYS} dni`),
    ).toBeInTheDocument()
    expect(screen.getByText(/z ostatnich 30 dni/)).toBeInTheDocument()
    expect(screen.queryByText(/ostatnie 14 dni/)).toBeNull()
  })

  it('draws a point for every day of the window', async () => {
    mockedFetch.mockResolvedValue(consecutive(30))
    const { container } = renderWithProviders(<Analysis />)

    await screen.findByText(`Nastrój, ostatnie ${ANALYSIS_WINDOW_DAYS} dni`)

    expect(container.querySelectorAll('.analysis-line-dot'))
      .toHaveLength(ANALYSIS_WINDOW_DAYS)
  })

  it('thins the date labels so thirty of them do not overlap', async () => {
    /** The reason the cap existed. A 'dd.mm' tick is about 26 viewBox units and
     *  thirty of them would sit 10 apart, so only every Nth is printed — with
     *  today always among them, since the thinning counts back from the end. */
    mockedFetch.mockResolvedValue(consecutive(30))
    const { container } = renderWithProviders(<Analysis />)

    await screen.findByText(`Nastrój, ostatnie ${ANALYSIS_WINDOW_DAYS} dni`)
    const ticks = Array.from(container.querySelectorAll<SVGTextElement>('.analysis-line-tick'))
    const xs = ticks.map((tick) => Number(tick.getAttribute('x')))

    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.length).toBeLessThan(ANALYSIS_WINDOW_DAYS)
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index] - xs[index - 1]).toBeGreaterThanOrEqual(32)
    }
  })

  it('labels every day when there are few enough to fit', async () => {
    mockedFetch.mockResolvedValue(consecutive(6))
    const { container } = renderWithProviders(<Analysis />)

    await screen.findByText('Nastrój, ostatnie 6 dni')

    expect(container.querySelectorAll('.analysis-line-tick')).toHaveLength(6)
  })

  it('shows only as many days as the patient has', async () => {
    mockedFetch.mockResolvedValue(consecutive(6))
    renderWithProviders(<Analysis />)

    expect(await screen.findByText('Nastrój, ostatnie 6 dni')).toBeInTheDocument()
  })

  it('opens on mood, with one series drawn rather than two', async () => {
    mockedFetch.mockResolvedValue(consecutive(6))
    const { container } = renderWithProviders(<Analysis />)

    expect(await screen.findByLabelText('Pokaż na wykresie')).toHaveValue('mood')
    // Two units on one axis put the mood line above the stress line almost
    // always, which read as a relationship and was an artefact of the scaling.
    const legend = container.querySelectorAll('.analysis-legend-item')
    expect(legend).toHaveLength(1)
    expect(legend[0]).toHaveTextContent('Nastrój')
  })

  it('offers every level and every emotion, with stress listed once', async () => {
    mockedFetch.mockResolvedValue(consecutive(6))
    renderWithProviders(<Analysis />)

    const picker = await screen.findByLabelText('Pokaż na wykresie')
    const labels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(labels.slice(0, 4)).toEqual([
      'Nastrój',
      'Poziom stresu',
      'Poziom energii',
      'Poziom napięcia',
    ])
    // 'Stres' is one of the ten emotions, so it would otherwise be the same
    // series listed twice under two names.
    expect(labels).not.toContain('Stres')
    expect(labels).toContain('Lęk')
    expect(labels).toHaveLength(4 + 9)
  })

  it('redraws for the emotion the patient picks', async () => {
    mockedFetch.mockResolvedValue(consecutive(6, { emotions: [{ emotion: 'Lęk', intensity: 7 }] }))
    renderWithProviders(<Analysis />)

    const picker = await screen.findByLabelText('Pokaż na wykresie')
    fireEvent.change(picker, { target: { value: 'emotion:Lęk' } })

    expect(screen.getByText('Lęk, ostatnie 6 dni')).toBeInTheDocument()
    // Its own colour, from utils/emotions.ts — never a second palette.
    expect(screen.getAllByText(/lęk 7 \/ 10/)).toHaveLength(6)
  })

  it('states values on the shared 0-10 scale, including mood', async () => {
    mockedFetch.mockResolvedValue([entry(0, { mood: 'neutral' })])
    renderWithProviders(<Analysis />)

    // 'neutral' is 3 on the tiles' 1-5 and 6 on the axis the point sits on;
    // showing '3 / 5' next to a dot at 6 is what the normalization removes.
    expect(await screen.findByText(/nastrój 6 \/ 10/)).toBeInTheDocument()
    expect(screen.getByText('skala 0–10')).toBeInTheDocument()
    expect(screen.queryByText(/skala 1–5/)).not.toBeInTheDocument()
  })

  it('says so rather than drawing an empty plot when this series was never rated', async () => {
    mockedFetch.mockResolvedValue([entry(0, { mood: null, emotions: [] })])
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/nie ma oceny „nastrój”/)).toBeInTheDocument()
  })

  it('now draws entries that sit 16-29 days back, instead of calling the chart empty', async () => {
    /** THE CASE THE OLD CAP GOT WRONG. Three entries, none in the last fifteen
     *  days: the chart said "żaden wpis" directly between a caption counting
     *  three of them and a mood card averaging them. They are inside the window
     *  the chart draws now, so it draws them. */
    mockedFetch.mockResolvedValue([entry(29), entry(20), entry(16)])
    const { container } = renderWithProviders(<Analysis />)

    await screen.findByText(/z 3 wpisów z ostatnich 30 dni/)

    expect(container.querySelectorAll('.analysis-line-dot')).toHaveLength(3)
    expect(screen.queryByText(/nie ma oceny „nastrój”/)).toBeNull()
  })

  it('still words the empty state against the window when a series really is unrated', async () => {
    /** The sentence stays: the window can hold plenty of entries and none that
     *  rated the series the picker is on. */
    mockedFetch.mockResolvedValue(consecutive(30, { mood: null, emotions: [] }))
    renderWithProviders(<Analysis />)

    expect(
      await screen.findByText(
        `Żaden wpis z ostatnich ${ANALYSIS_WINDOW_DAYS} dni nie ma oceny „nastrój”.`,
      ),
    ).toBeInTheDocument()
  })

  it('keeps the picker reachable when the chosen series has nothing to draw', async () => {
    mockedFetch.mockResolvedValue(consecutive(6))
    renderWithProviders(<Analysis />)

    const picker = await screen.findByLabelText('Pokaż na wykresie')
    // Nothing in the fixture rates 'Wstyd'. A picker that vanished with the plot
    // would leave no way back to a series that does have days behind it.
    fireEvent.change(picker, { target: { value: 'emotion:Wstyd' } })

    expect(screen.getByText(/nie ma oceny „wstyd”/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Pokaż na wykresie'), { target: { value: 'mood' } })
    expect(screen.getByText('Nastrój, ostatnie 6 dni')).toBeInTheDocument()
  })
})

describe('Analysis — the heat map threshold', () => {
  it('stays hidden, calmly, until enough days name a part of the day', async () => {
    mockedFetch.mockResolvedValue(consecutive(HEATMAP_MIN_DAYS - 1, { timeOfDay: 'evening' }))
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/Wzorce tygodniowe pojawią się/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('does not unlock on entry count alone', async () => {
    // 20 entries, 3 parts of the day — a grid from three points is exactly what
    // the threshold exists to refuse.
    mockedFetch.mockResolvedValue([
      ...consecutive(3, { timeOfDay: 'evening' }),
      ...Array.from({ length: 17 }, (_, index) => entry(index + 3)),
    ])
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/Wzorce tygodniowe pojawią się/)).toBeInTheDocument()
  })

  it('draws the grid once there is enough behind it', async () => {
    mockedFetch.mockResolvedValue(consecutive(HEATMAP_MIN_DAYS, { timeOfDay: 'evening' }))
    renderWithProviders(<Analysis />)

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Poniedziałek' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Wieczór' })).toBeInTheDocument()
  })

  it('leaves the "trudna pora dnia" card as a dash while the grid is locked', async () => {
    mockedFetch.mockResolvedValue(consecutive(4, { timeOfDay: 'night' }))
    renderWithProviders(<Analysis />)

    const card = (await screen.findByText('Trudna pora dnia')).closest('div')
    expect(card).toHaveTextContent('—')
    expect(card).not.toHaveTextContent('Noc')
  })
})

describe('Analysis — the closing paragraph', () => {
  it('is careful about a short history', async () => {
    mockedFetch.mockResolvedValue(consecutive(3))
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/Za wcześnie na wyraźne wzorce/)).toBeInTheDocument()
  })

  it('states a pattern once there is enough history and a day stands out', async () => {
    mockedFetch.mockResolvedValue(patternedMonth())
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/Trudniej bywa Ci/)).toBeInTheDocument()
  })

  it('says there is no pattern rather than inventing one from a calm month', async () => {
    // Three weeks of entries, every day the same: a highest mean exists only by
    // tie-break, and naming it would tell the patient something untrue.
    mockedFetch.mockResolvedValue(consecutive(21, { mood: 'good' }))
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/nie widać wyraźnego wzorca/)).toBeInTheDocument()
    expect(screen.queryByText(/Trudniej bywa Ci/)).not.toBeInTheDocument()
  })

  it('never claims anything about technique effectiveness', async () => {
    // The feature does not exist — rating a technique after applying it is not
    // in the app — so a sentence about it would be an invented number.
    mockedFetch.mockResolvedValue(patternedMonth({ timeOfDay: 'evening' }))
    renderWithProviders(<Analysis />)

    await screen.findByText('CO Z TEGO WYNIKA')
    expect(screen.getByText(/Trudniej bywa Ci/)).toBeInTheDocument()
    expect(screen.queryByText(/technik/i)).not.toBeInTheDocument()
  })
})

describe('Analysis — the entry-frequency bars', () => {
  it('declines the day count in a bar that covers a single day', async () => {
    // An 8-day window splits into a full week plus one day, and the tooltip's
    // preposition governs the genitive: "1 z 1 dnia", not "1 z 1 dzień".
    mockedFetch.mockResolvedValue([entry(7), entry(0)])
    renderWithProviders(<Analysis />)

    expect(await screen.findByText(/1 z 1 dnia z wpisem/)).toBeInTheDocument()
    expect(screen.queryByText(/z 1 dzień/)).not.toBeInTheDocument()
  })
})

describe('Analysis — what this screen is not', () => {
  it('offers nothing that belongs to a report', async () => {
    mockedFetch.mockResolvedValue(patternedMonth({ timeOfDay: 'evening' }))
    renderWithProviders(<Analysis />)

    await screen.findByText('Udział emocji')
    // An analysis is a view, not a document: no export, no sending it to a
    // specialist, no archive of past analyses.
    expect(screen.queryByText(/Pobierz PDF/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Wyślij/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Historia analiz/i)).not.toBeInTheDocument()
  })

  it('keeps the analysis window itself out of the user\'s hands', async () => {
    // The mockup's Tydzień/Miesiąc/Kwartał switch stays gone: what "lately"
    // means for the mood average, the heat map and the emotion shares is a
    // clinical choice (ANALYSIS_WINDOW_DAYS), not a control. The frequency
    // section's own chips below are a different thing — they change how far
    // back one chart counts, not what the rest of the screen is reading.
    mockedFetch.mockResolvedValue(consecutive(20))
    renderWithProviders(<Analysis />)

    await screen.findByText('Częstotliwość wpisów')
    for (const label of ['Tydzień', 'Miesiąc', 'Kwartał']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('labels a stretch shorter than a week with its real length', async () => {
    // The last bar covers what is left of the window — two days on a full 30.
    // Its height is two sevenths, and on a phone there is no hover to discover
    // that the denominator is not seven.
    mockedFetch.mockResolvedValue(consecutive(ANALYSIS_WINDOW_DAYS))
    renderWithProviders(<Analysis />)

    expect(await screen.findByText('Tyg. 5 (2 dni)')).toBeInTheDocument()
    // A full week says nothing extra — the number would be noise on four bars
    // out of five.
    expect(screen.getByText('Tyg. 1')).toBeInTheDocument()
  })

  describe('the frequency section\'s own range', () => {
    const chip = (name: string) => screen.getByRole('button', { name })

    it('opens on 30 days, in weeks', async () => {
      mockedFetch.mockResolvedValue(consecutive(200))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      expect(chip('30 dni')).toHaveAttribute('aria-pressed', 'true')
      expect(chip('Rok')).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByText('Dni z wpisem w tygodniu')).toBeInTheDocument()
      expect(screen.getByText('Tyg. 1')).toBeInTheDocument()
    })

    it('never grows past thirteen bars, which is why it needs no pagination', async () => {
      // 200 weeks of daily entries. The bucket grows with the range instead of
      // the bar count growing with the history, so there is nothing to page.
      mockedFetch.mockResolvedValue(consecutive(1400))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      const section = screen.getByText('Częstotliwość wpisów').closest('section')!

      for (const [label, expected] of [['30 dni', 5], ['90 dni', 13]] as const) {
        fireEvent.click(within(section).getByRole('button', { name: label }))
        expect(within(section).getAllByTitle(/z wpisem$/)).toHaveLength(expected)
      }

      expect(within(section).queryByText(/Strona/)).not.toBeInTheDocument()
      expect(within(section).queryByRole('button', { name: /Następna|Poprzednia/ })).not.toBeInTheDocument()
    })

    it('fetches a named year instead of deriving it from the loaded entries', async () => {
      // The point of the endpoint: /api/diary/ stops at its 1000 newest rows, so
      // a year five years back is not in what the screen already holds. Nothing
      // is requested until the patient asks for a year.
      mockedFetch.mockResolvedValue(consecutive(20))
      mockedYear.mockResolvedValue(yearAnswer(new Date().getFullYear()))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      expect(mockedYear).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Rok' }))
      expect(mockedYear).toHaveBeenCalledWith(new Date().getFullYear())
      expect(await screen.findByText('Dni z wpisem w miesiącu')).toBeInTheDocument()
      expect(screen.getByText('sty')).toBeInTheDocument()
    })

    it('offers the years the server says have entries, newest first', async () => {
      mockedFetch.mockResolvedValue(consecutive(20))
      mockedYear.mockResolvedValue(yearAnswer(2031, [2026, 2028, 2031]))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      fireEvent.click(screen.getByRole('button', { name: 'Rok' }))

      const picker = await screen.findByRole('combobox', { name: 'Rok' })
      const offered = within(picker).getAllByRole('option').map((option) => option.textContent)
      // 2026 is reachable even though nothing that old is in the entry list.
      expect(offered).toContain('2026')
      expect(offered.slice(0, 3)).toEqual(['2031', '2028', '2026'])
    })

    it('asks the server again when another year is picked', async () => {
      mockedFetch.mockResolvedValue(consecutive(20))
      mockedYear.mockResolvedValue(yearAnswer(2031, [2026, 2031]))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      fireEvent.click(screen.getByRole('button', { name: 'Rok' }))
      const picker = await screen.findByRole('combobox', { name: 'Rok' })

      mockedYear.mockResolvedValue(yearAnswer(2026, [2026, 2031]))
      fireEvent.change(picker, { target: { value: '2026' } })
      expect(mockedYear).toHaveBeenLastCalledWith(2026)
    })

    it('says a failed year failed rather than drawing it as a year of silence', async () => {
      // The one confusion this section must never cause: "nothing came back"
      // read as "you wrote nothing".
      mockedFetch.mockResolvedValue(consecutive(20))
      mockedYear.mockRejectedValue(new Error('nope'))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      fireEvent.click(screen.getByRole('button', { name: 'Rok' }))

      expect(await screen.findByText(/Nie udało się wczytać częstotliwości/)).toBeInTheDocument()
      const section = screen.getByText('Częstotliwość wpisów').closest('section')!
      expect(within(section).queryByText(/nie ma jeszcze żadnego wpisu/)).not.toBeInTheDocument()
      expect(within(section).queryByTitle(/z wpisem$/)).not.toBeInTheDocument()
    })

    it('goes back to the rolling ranges without another request', async () => {
      mockedFetch.mockResolvedValue(consecutive(20))
      mockedYear.mockResolvedValue(yearAnswer(new Date().getFullYear()))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      fireEvent.click(screen.getByRole('button', { name: 'Rok' }))
      await screen.findByText('Dni z wpisem w miesiącu')

      mockedYear.mockClear()
      fireEvent.click(screen.getByRole('button', { name: '30 dni' }))
      expect(screen.getByText('Dni z wpisem w tygodniu')).toBeInTheDocument()
      expect(screen.getByText('Tyg. 1')).toBeInTheDocument()
      expect(mockedYear).not.toHaveBeenCalled()
    })

    it('does not move the rest of the screen with it', async () => {
      // Only this chart reads the chosen range. The caption above still speaks
      // for the fixed analysis window, and it must not start disagreeing.
      mockedFetch.mockResolvedValue(consecutive(200))
      mockedYear.mockResolvedValue(yearAnswer(new Date().getFullYear()))
      renderWithProviders(<Analysis />)

      await screen.findByText('Częstotliwość wpisów')
      const caption = screen.getByText(new RegExp(`ostatnich ${ANALYSIS_WINDOW_DAYS} dni`))
      fireEvent.click(screen.getByRole('button', { name: 'Rok' }))
      await screen.findByText('Dni z wpisem w miesiącu')
      expect(caption).toBeInTheDocument()
    })
  })

  it('has no bottom tab bar', async () => {
    mockedFetch.mockResolvedValue(consecutive(20))
    renderWithProviders(<Analysis />)

    await screen.findByText('Udział emocji')
    expect(screen.queryByRole('link', { name: 'Dziś' })).not.toBeInTheDocument()
  })
})
