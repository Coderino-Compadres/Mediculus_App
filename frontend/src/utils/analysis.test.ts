import { describe, expect, it } from 'vitest'
import {
  ANALYSIS_WINDOW_DAYS,
  HEATMAP_MIN_DAYS,
  WEEKDAYS,
  buildAnalysis,
  buildFrequency,
  difficultyScore,
  daysGenitive,
  entriesGenitive,
  weekdayIndex,
} from './analysis'
import { addDays, fromIsoDate, toIsoDate } from './days'
import type { JournalListEntry } from '../types/diaryEntry'
import type { FrequencyPeriodId } from '../types/analysis'

/** A fixed Friday, so a weekday assertion does not depend on when the suite runs. */
const TODAY = new Date(2026, 7, 28)

function isoDaysAgo(days: number): string {
  return toIsoDate(addDays(TODAY, -days))
}

function entry(daysAgo: number, overrides: Partial<JournalListEntry> = {}): JournalListEntry {
  const date = overrides.date ?? isoDaysAgo(daysAgo)
  return {
    id: `id-${date}`,
    date,
    savedAt: `${date}T20:00:00`,
    mood: null,
    emotions: [],
    energyLevel: null,
    tensionLevel: null,
    situationReaction: {
      trigger: null,
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

/** `count` consecutive days ending today, every one of them written. */
function consecutive(count: number, overrides: Partial<JournalListEntry> = {}): JournalListEntry[] {
  return Array.from({ length: count }, (_, index) => entry(index, overrides))
}

/** The weekday TODAY falls on — the one the fixtures below make the hard one. */
const HARD_WEEKDAY = weekdayIndex(fromIsoDate(isoDaysAgo(0)))

/**
 * Three weeks in which one weekday is clearly harder than the rest.
 *
 * Uniform fixtures are no longer enough to make the screen state a pattern, and
 * that is the point of MIN_DIFFICULTY_MARGIN — a month where every day scores
 * the same has no hardest day, only a tie-break.
 */
function patternedMonth(overrides: Partial<JournalListEntry> = {}): JournalListEntry[] {
  return Array.from({ length: 21 }, (_, offset) =>
    entry(offset, {
      mood: weekdayIndex(fromIsoDate(isoDaysAgo(offset))) === HARD_WEEKDAY ? 'very_bad' : 'good',
      ...overrides,
    }),
  )
}

function analysisOf(entries: JournalListEntry[]) {
  const analysis = buildAnalysis(entries, TODAY)
  if (analysis === null) throw new Error('expected an analysis')
  return analysis
}

describe('buildAnalysis — the rolling window', () => {
  it('is as long as the history until it reaches the ceiling', () => {
    // 23 days of history: the window is 23 days, not a mostly empty 30.
    expect(analysisOf([entry(22), entry(0)]).window.days).toBe(23)
  })

  it('stops growing at the ceiling', () => {
    expect(analysisOf([entry(120), entry(0)]).window.days).toBe(ANALYSIS_WINDOW_DAYS)
  })

  it('counts one day of history for an account that started today', () => {
    const analysis = analysisOf([entry(0)])
    expect(analysis.window.days).toBe(1)
    expect(analysis.window.entryCount).toBe(1)
  })

  it('counts only the entries that fall inside the window', () => {
    const analysis = analysisOf([entry(120), entry(2), entry(1)])
    expect(analysis.window.days).toBe(ANALYSIS_WINDOW_DAYS)
    expect(analysis.window.entryCount).toBe(2)
  })

  it('ignores an entry dated in the future', () => {
    const future = toIsoDate(addDays(TODAY, 3))
    expect(analysisOf([entry(0), entry(0, { date: future })]).window.entryCount).toBe(1)
  })

  it('is null only for a patient who has never written anything', () => {
    expect(buildAnalysis([], TODAY)).toBeNull()
  })

  it('is not null for a patient whose entries are all older than the window', () => {
    // "nothing in the last 30 days" and "nothing ever" are different things to
    // say, so the screen has to be able to tell them apart.
    const analysis = analysisOf([entry(90), entry(80)])
    expect(analysis.window.entryCount).toBe(0)
  })
})

describe('buildAnalysis — the trend', () => {
  it('covers the whole window, the same stretch as the rest of the screen', () => {
    /** It used to stop at fourteen days while the caption, the cards and the
     *  bar charts covered thirty — three periods on one screen, and a reader
     *  seeing "20 dni" under a chart of 14 points had nothing to reconcile them
     *  with. The fourteen-day cap was a rendering limit; it is answered in
     *  TrendChart now, by thinning the labels. */
    expect(analysisOf(consecutive(ANALYSIS_WINDOW_DAYS)).trend)
      .toHaveLength(ANALYSIS_WINDOW_DAYS)
  })

  it('shrinks to the history when the account is younger than the window', () => {
    expect(analysisOf([entry(4), entry(0)]).trend).toHaveLength(5)
  })

  it('still holds a day with no entry, so the x-axis stays a calendar', () => {
    /** Thirty points means more gaps, not fewer: an unwritten day is a point
     *  with nothing rated rather than one left out. */
    // The local `entry` rates nothing by default, so the mood is passed in —
    // otherwise this would assert that null points are null.
    const analysis = analysisOf([entry(29, { mood: 'bad' }), entry(0, { mood: 'good' })])

    expect(analysis.trend).toHaveLength(30)
    expect(analysis.trend.filter((point) => point.mood !== null)).toHaveLength(2)
    expect(analysis.trend[0].date).toBe(isoDaysAgo(29))
    expect(analysis.trend.at(-1)?.date).toBe(isoDaysAgo(0))
  })

  it('keeps a day with no entry as a gap rather than closing it', () => {
    const analysis = analysisOf([entry(2, { mood: 'bad' }), entry(0, { mood: 'good' })])
    const yesterday = analysis.trend.find((point) => point.date === isoDaysAgo(1))
    expect(yesterday).toBeDefined()
    expect(yesterday?.mood).toBeNull()
    expect(yesterday?.energy).toBeNull()
    expect(yesterday?.tension).toBeNull()
    expect(yesterday?.emotions).toEqual({})
  })

  it('carries every answer the chart can draw, not just the selected one', () => {
    // The picker switches series without refetching, so a point built for one
    // of them would turn a switch into a reload of the screen.
    const analysis = analysisOf([
      entry(0, {
        mood: 'neutral',
        energyLevel: 4,
        tensionLevel: 9,
        emotions: [
          { emotion: 'Stres', intensity: 8 },
          { emotion: 'Lęk', intensity: 6 },
        ],
      }),
    ])
    const today = analysis.trend[analysis.trend.length - 1]
    expect(today.mood).toBe(3)
    expect(today.energy).toBe(4)
    expect(today.tension).toBe(9)
    // Stress lives in here like the other nine — it is one of the ten emotions,
    // and a field of its own would be a second place to read one number from.
    expect(today.emotions).toEqual({ Stres: 8, Lęk: 6 })
  })

  it('leaves an emotion out entirely on a day that rated other ones', () => {
    const analysis = analysisOf([entry(0, { emotions: [{ emotion: 'Lęk', intensity: 6 }] })])
    expect(analysis.trend[analysis.trend.length - 1].emotions.Stres).toBeUndefined()
  })

  it('drops a chip picked without an intensity rather than storing it as null', () => {
    // "Picked, unrated" has no answer to the chart's question — how strong was
    // it — so it is the same gap as a day with no entry.
    const analysis = analysisOf([entry(0, { emotions: [{ emotion: 'Lęk', intensity: null }] })])
    expect(analysis.trend[analysis.trend.length - 1].emotions).toEqual({})
  })

  it('keeps a rated zero, which is an answer the patient can give', () => {
    const analysis = analysisOf([
      entry(0, { energyLevel: 0, tensionLevel: 0, emotions: [{ emotion: 'Lęk', intensity: 0 }] }),
    ])
    const today = analysis.trend[analysis.trend.length - 1]
    expect(today.energy).toBe(0)
    expect(today.tension).toBe(0)
    expect(today.emotions.Lęk).toBe(0)
  })

  it('runs oldest first, ending today', () => {
    const analysis = analysisOf(consecutive(5))
    expect(analysis.trend[0].date).toBe(isoDaysAgo(4))
    expect(analysis.trend[analysis.trend.length - 1].date).toBe(isoDaysAgo(0))
  })
})

describe('difficultyScore', () => {
  it('is 10 for the worst mood and 0 for the best', () => {
    expect(difficultyScore(entry(0, { mood: 'very_bad' }))).toBe(10)
    expect(difficultyScore(entry(0, { mood: 'very_good' }))).toBe(0)
  })

  it('inverts energy and takes tension as it is', () => {
    expect(difficultyScore(entry(0, { energyLevel: 2 }))).toBe(8)
    expect(difficultyScore(entry(0, { tensionLevel: 7 }))).toBe(7)
  })

  it('averages only the answers that were given', () => {
    // Skipping the energy slider is not a zero on it: two answers, two terms.
    expect(difficultyScore(entry(0, { tensionLevel: 8, mood: 'neutral' }))).toBe(6.5)
  })

  it('is null for an entry that rated nothing', () => {
    expect(difficultyScore(entry(0, { notes: 'Dużo się dzisiaj wydarzyło.' }))).toBeNull()
  })
})

describe('buildAnalysis — the heat map', () => {
  it('stays locked below the threshold', () => {
    const entries = consecutive(HEATMAP_MIN_DAYS - 1, { timeOfDay: 'evening', mood: 'bad' })
    expect(analysisOf(entries).heatmap.unlocked).toBe(false)
  })

  it('unlocks at exactly the threshold', () => {
    const entries = consecutive(HEATMAP_MIN_DAYS, { timeOfDay: 'evening', mood: 'bad' })
    expect(analysisOf(entries).heatmap.unlocked).toBe(true)
  })

  it('counts days that answered "pora dnia", not days with any entry', () => {
    // The trap the threshold exists for: plenty of entries, a handful of parts
    // of the day, and a 7x4 grid drawn from three points.
    const entries = [
      ...consecutive(3, { timeOfDay: 'evening', mood: 'bad' }),
      ...Array.from({ length: 20 }, (_, index) => entry(index + 3, { mood: 'bad' })),
    ]
    const analysis = analysisOf(entries)
    expect(analysis.window.entryCount).toBe(23)
    expect(analysis.heatmap.ratedDays).toBe(3)
    expect(analysis.heatmap.unlocked).toBe(false)
  })

  it('leaves an entry with no part of the day out of every cell', () => {
    const analysis = analysisOf(consecutive(20, { mood: 'very_bad' }))
    expect(analysis.heatmap.cells.every((cell) => cell.entries === 0)).toBe(true)
  })

  it('never guesses a part of the day from when the entry was saved', () => {
    // savedAt says 23:00 — that must not put the day in the "Noc" row.
    const analysis = analysisOf([
      entry(0, { mood: 'bad', savedAt: `${isoDaysAgo(0)}T23:00:00` }),
    ])
    expect(analysis.heatmap.cells.every((cell) => cell.entries === 0)).toBe(true)
  })

  it('always has one cell per weekday and part of the day', () => {
    expect(analysisOf([entry(0)]).heatmap.cells).toHaveLength(WEEKDAYS.length * 4)
  })

  it('averages the entries that share a cell', () => {
    const entries = [
      // Two of the same weekday, one at 10 and one at 0 — the cell reads 5,
      // not either of them. On days the block below does not cover, or the
      // deduplication would drop them as repeats.
      entry(0, { timeOfDay: 'evening', mood: 'very_bad' }),
      entry(7, { timeOfDay: 'evening', mood: 'very_good' }),
      ...Array.from({ length: HEATMAP_MIN_DAYS }, (_, index) =>
        entry(index + 14, { timeOfDay: 'morning', mood: 'neutral' }),
      ),
    ]
    const cell = analysisOf(entries).heatmap.cells.find(
      (candidate) => candidate.weekday === HARD_WEEKDAY && candidate.timeOfDay === 'evening',
    )
    expect(cell?.entries).toBe(2)
    expect(cell?.difficulty).toBe(5)
  })

  it('does not unlock on days that name a part of the day and rate nothing', () => {
    // 14 parts of the day, nothing to colour a cell with: unlocking here would
    // swap the "still collecting" message for a grid of 28 empty squares.
    const entries = consecutive(HEATMAP_MIN_DAYS, { timeOfDay: 'evening', notes: 'Bez ocen.' })
    const analysis = analysisOf(entries)
    expect(analysis.heatmap.ratedDays).toBe(0)
    expect(analysis.heatmap.unlocked).toBe(false)
  })
})

describe('buildAnalysis — the summary cards', () => {
  it('averages the mood on its own 1-5 scale', () => {
    const analysis = analysisOf([entry(1, { mood: 'very_bad' }), entry(0, { mood: 'good' })])
    expect(analysis.summary.averageMood).toBe(2.5)
  })

  it('leaves the mood average null when the tiles were never touched', () => {
    expect(analysisOf([entry(0, { tensionLevel: 5 })]).summary.averageMood).toBeNull()
  })

  it('names the weekday that stands out over several weeks', () => {
    expect(analysisOf(patternedMonth()).summary.hardestWeekday).toBe(HARD_WEEKDAY)
  })

  it('refuses to name a weekday that rests on a single day', () => {
    // One very bad Friday and two of every other weekday. Without the minimum
    // sample this reads as "trudniej bywa Ci w piątki" off one Friday.
    const entries = [
      entry(0, { mood: 'very_bad' }),
      ...[1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13].map((offset) =>
        entry(offset, { mood: 'good' }),
      ),
    ]
    expect(analysisOf(entries).summary.hardestWeekday).not.toBe(HARD_WEEKDAY)
  })

  it('refuses to name a weekday when no day stands out', () => {
    // A calm, even month still has a highest mean by a rounding error, and the
    // tie-break would hand the patient a pattern that is not there.
    expect(analysisOf(consecutive(21, { mood: 'good' })).summary.hardestWeekday).toBeNull()
  })

  it('leaves the weekday null when nothing carries a difficulty reading', () => {
    expect(analysisOf([entry(0, { notes: 'coś' })]).summary.hardestWeekday).toBeNull()
  })

  it('refuses to name a part of the day while the heat map is locked', () => {
    // The card and the grid answer the same question off the same data, so one
    // must not state what the other declines to draw.
    const analysis = analysisOf(consecutive(4, { timeOfDay: 'night', mood: 'very_bad' }))
    expect(analysis.heatmap.unlocked).toBe(false)
    expect(analysis.summary.hardestTimeOfDay).toBeNull()
  })

  it('names one once the heat map is unlocked and it stands out', () => {
    const entries = [
      ...consecutive(HEATMAP_MIN_DAYS, { timeOfDay: 'morning', mood: 'very_good' }),
      entry(HEATMAP_MIN_DAYS, { timeOfDay: 'night', mood: 'very_bad' }),
      entry(HEATMAP_MIN_DAYS + 1, { timeOfDay: 'night', mood: 'very_bad' }),
    ]
    expect(analysisOf(entries).summary.hardestTimeOfDay).toBe('night')
  })

  it('refuses to name a part of the day seen only once', () => {
    const entries = [
      ...consecutive(HEATMAP_MIN_DAYS, { timeOfDay: 'morning', mood: 'very_good' }),
      entry(HEATMAP_MIN_DAYS, { timeOfDay: 'night', mood: 'very_bad' }),
    ]
    expect(analysisOf(entries).heatmap.unlocked).toBe(true)
    expect(analysisOf(entries).summary.hardestTimeOfDay).toBeNull()
  })

  it('takes the most frequent emotion as the top card', () => {
    const analysis = analysisOf([
      entry(0, { emotions: [{ emotion: 'Lęk', intensity: 4 }] }),
      entry(1, { emotions: [{ emotion: 'Lęk', intensity: 2 }] }),
      entry(2, { emotions: [{ emotion: 'Złość', intensity: 9 }] }),
    ])
    // Days, not intensity: a single very bad day does not outrank a feeling that
    // ran through the week — the same rule the weekly report's ranking uses.
    expect(analysis.summary.topEmotion?.emotion).toBe('Lęk')
    expect(analysis.summary.topEmotion?.color).toBe('#9B85C4')
  })
})

describe('buildAnalysis — the emotion bars', () => {
  it('counts one day per emotion however many chips the entry carries', () => {
    const analysis = analysisOf([
      entry(0, {
        emotions: [
          { emotion: 'Lęk', intensity: 5 },
          { emotion: 'Stres', intensity: 6 },
        ],
      }),
    ])
    expect(analysis.emotions.map((share) => [share.emotion, share.days])).toEqual([
      ['Lęk', 1],
      ['Stres', 1],
    ])
  })

  it('lists only the emotions actually rated', () => {
    const analysis = analysisOf([entry(0, { emotions: [{ emotion: 'Spokój', intensity: 8 }] })])
    expect(analysis.emotions).toHaveLength(1)
  })

  it('does not count a chip that was picked but never rated', () => {
    // `days` means days the entry *rated* this emotion — the same thing the
    // section's own empty text says, and the same rule the trend points and
    // `stressLevel` already follow. Counting an unrated chip would make this bar
    // the one number on the screen with a different definition of "rated".
    const analysis = analysisOf([
      entry(0, {
        emotions: [
          { emotion: 'Lęk', intensity: null },
          { emotion: 'Smutek', intensity: 4 },
        ],
      }),
    ])
    expect(analysis.emotions.map((share) => share.emotion)).toEqual(['Smutek'])
  })

  it('sorts by days, most first', () => {
    const analysis = analysisOf([
      entry(0, { emotions: [{ emotion: 'Smutek', intensity: 3 }] }),
      entry(1, { emotions: [{ emotion: 'Radość', intensity: 3 }] }),
      entry(2, { emotions: [{ emotion: 'Smutek', intensity: 3 }] }),
    ])
    expect(analysis.emotions[0].emotion).toBe('Smutek')
  })
})

describe('buildFrequency — the entry-frequency bars', () => {
  const bars = (entries: JournalListEntry[], period: FrequencyPeriodId = '30d') =>
    buildFrequency(entries, TODAY, period)

  it('splits a full 30-day window into seven-day stretches', () => {
    const buckets = bars(consecutive(ANALYSIS_WINDOW_DAYS))
    expect(buckets.map((bucket) => bucket.length)).toEqual([7, 7, 7, 7, 2])
    expect(buckets[0].label).toBe('Tyg. 1')
  })

  it('carries how long the last, still-running stretch is', () => {
    // Without it a two-day stretch with two entries would read as a week the
    // patient nearly stopped writing in.
    expect(bars(consecutive(9)).map((bucket) => [bucket.days, bucket.length, bucket.partial])).toEqual([
      [7, 7, false],
      [2, 2, true],
    ])
  })

  it('counts days with an entry, not entries', () => {
    const buckets = bars([entry(6), entry(0)])
    expect(buckets).toHaveLength(1)
    expect(buckets[0].days).toBe(2)
  })

  it('reaches past the screen\'s own window — 90 days is thirteen week bars', () => {
    // The point of the period chips: buildAnalysis caps everything at
    // ANALYSIS_WINDOW_DAYS, and this chart has to see further than that.
    const buckets = bars(consecutive(90), '90d')
    expect(buckets).toHaveLength(13)
    expect(buckets.every((bucket) => bucket.days === bucket.length)).toBe(true)
  })

  it('never draws more than thirteen bars, however long the history', () => {
    // 200 weeks of daily entries — the case pagination was proposed for. The
    // named-year setting is not here: it is fetched and bucketed by month on the
    // server (backend/core/tests/test_frequency_api.py), because `/api/diary/`
    // would not have sent five-year-old rows in the first place.
    expect(bars(consecutive(1400), '30d')).toHaveLength(5)
    expect(bars(consecutive(1400), '90d')).toHaveLength(13)
  })

  it('is empty rather than a row of zeroes when nothing has been written', () => {
    expect(bars([])).toEqual([])
  })
})

describe('buildAnalysis — the closing paragraph', () => {
  it('stays tentative on a short history', () => {
    const analysis = analysisOf(consecutive(HEATMAP_MIN_DAYS - 1, { mood: 'very_bad' }))
    expect(analysis.insight.tentative).toBe(true)
    expect(analysis.insight.text).toContain('Za wcześnie')
  })

  it('states a pattern once there is enough history behind it', () => {
    const analysis = analysisOf(patternedMonth({ emotions: [{ emotion: 'Lęk', intensity: 7 }] }))
    expect(analysis.insight.tentative).toBe(false)
    expect(analysis.insight.text).toContain('Trudniej bywa Ci')
    expect(analysis.insight.text).toContain('lęk')
  })

  it('stays careful when there are plenty of entries but no day stands out', () => {
    // Enough history for a confident sentence, nothing to be confident about —
    // "no pattern" is itself an honest thing to say, and not bad news.
    const analysis = analysisOf(consecutive(21, { mood: 'good' }))
    expect(analysis.insight.tentative).toBe(true)
    expect(analysis.insight.text).toContain('nie widać wyraźnego wzorca')
  })

  it('stays tentative when there are entries but nothing rated in them', () => {
    const analysis = analysisOf(consecutive(HEATMAP_MIN_DAYS, { notes: 'Dzisiaj bez oceniania.' }))
    expect(analysis.insight.tentative).toBe(true)
    expect(analysis.insight.text).toContain('nie widać wyraźnego wzorca')
  })

  it('never claims a part of the day the heat map would not draw', () => {
    // A real weekday pattern, but only three days name a part of the day — so
    // the sentence keeps its first half and drops "zwłaszcza wieczorem".
    const month = patternedMonth()
    const analysis = analysisOf([
      ...month.slice(0, 3).map((day) => ({ ...day, timeOfDay: 'evening' as const })),
      ...month.slice(3),
    ])
    expect(analysis.heatmap.unlocked).toBe(false)
    expect(analysis.insight.tentative).toBe(false)
    expect(analysis.insight.text).toContain('Trudniej bywa Ci')
    expect(analysis.insight.text).not.toContain('zwłaszcza')
  })

  it('says nothing about techniques, which the app cannot measure yet', () => {
    expect(analysisOf(patternedMonth()).insight.text).not.toMatch(/technik/i)
  })
})

describe('buildAnalysis — a day with more than one entry', () => {
  /** As the API lists them: newest first (core/diary.py `load_history`). */
  const sameDay = [
    entry(0, { id: 'newest', mood: 'very_bad' }),
    entry(0, { id: 'oldest', mood: 'very_good' }),
  ]

  it('counts the day once', () => {
    // Nothing in the schema enforces one entry per calendar day, and counting a
    // duplicate twice would inflate an emotion's days against a window that
    // still counts the day once.
    const analysis = analysisOf([...sameDay, entry(1, { mood: 'neutral' })])
    expect(analysis.window.entryCount).toBe(2)
  })

  it('keeps the row the rest of the app treats as that day', () => {
    // The newest, i.e. the one /api/diary/today/ edits and the home dashboard
    // reads — otherwise two screens describe the same day differently.
    const analysis = analysisOf(sameDay)
    expect(analysis.trend[analysis.trend.length - 1].mood).toBe(1)
  })

  it('does not count a duplicated day twice towards an emotion', () => {
    const analysis = analysisOf([
      entry(0, { id: 'newest', emotions: [{ emotion: 'Lęk', intensity: 5 }] }),
      entry(0, { id: 'oldest', emotions: [{ emotion: 'Lęk', intensity: 5 }] }),
    ])
    expect(analysis.emotions[0].days).toBe(1)
  })

  it('does not count a duplicated day twice towards the heat map', () => {
    const doubled = Array.from({ length: HEATMAP_MIN_DAYS }, (_, index) =>
      entry(index, { timeOfDay: 'evening', mood: 'bad' }),
    ).flatMap((day) => [day, { ...day, id: `${day.id}-again` }])
    expect(analysisOf(doubled).heatmap.ratedDays).toBe(HEATMAP_MIN_DAYS)
  })
})

describe('entriesGenitive', () => {
  it('gives the form the caption\'s preposition governs', () => {
    // "wyliczone z 3 wpisów", never "z 3 wpisy" — the nominative 2-4 form would
    // be wrong after "z", which is the only place this is used.
    expect(entriesGenitive(1)).toBe('wpisu')
    expect(entriesGenitive(3)).toBe('wpisów')
    expect(entriesGenitive(5)).toBe('wpisów')
    expect(entriesGenitive(22)).toBe('wpisów')
    expect(entriesGenitive(0)).toBe('wpisów')
  })

  it('does the same for a day count a preposition governs', () => {
    // "1 z 1 dnia z wpisem", never pluralDays' nominative "z 1 dzień".
    expect(daysGenitive(1)).toBe('dnia')
    expect(daysGenitive(2)).toBe('dni')
    expect(daysGenitive(7)).toBe('dni')
  })
})
