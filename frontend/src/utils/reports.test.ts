import { describe, expect, it } from 'vitest'
import {
  DAYS_IN_WEEK,
  buildWeeklyReports,
  formatDelta,
  formatDeltaSentence,
  formatWeekRange,
  pluralDays,
  pluralEntries,
  weekReportId,
} from './reports'
import type { JournalListEntry } from '../types/diaryEntry'
import type { EmotionName } from '../utils/emotions'

/** Mondays, so the week a date belongs to is obvious while reading a test. */
const WEEK_A = '2026-08-03' // Mon 3 – Sun 9 August 2026
const WEEK_B = '2026-08-10' // Mon 10 – Sun 16 August 2026
/** A Thursday in the week after WEEK_B, i.e. both A and B have ended. */
const TODAY = new Date(2026, 7, 20)

function entry(date: string, overrides: Partial<JournalListEntry> = {}): JournalListEntry {
  return {
    id: `id-${date}`,
    date,
    savedAt: `${date}T21:00:00`,
    mood: 'neutral',
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

function rated(...ratings: [EmotionName, number][]) {
  return ratings.map(([emotion, intensity]) => ({ emotion, intensity }))
}

describe('formatDelta', () => {
  it('always carries a direction and a value', () => {
    expect(formatDelta({ value: 0.6, gap: null, decimals: 1, unit: '', tone: 'good' })).toBe('+0,6')
    expect(formatDelta({ value: -4, gap: null, decimals: 0, unit: 'dni', tone: 'neutral' })).toBe('−4 dni')
  })

  it('says "bez zmian" rather than "+0,0"', () => {
    expect(formatDelta({ value: 0, gap: null, decimals: 1, unit: '', tone: 'neutral' })).toBe('bez zmian')
  })

  it('distinguishes "no previous week" from "that week never rated this"', () => {
    const first = {
      value: null,
      gap: 'no-previous-week' as const,
      decimals: 1 as const,
      unit: '',
      tone: 'neutral' as const,
    }
    expect(formatDelta(first)).toBeNull()
    expect(formatDeltaSentence(first)).toBe('brak poprzedniego tygodnia do porównania')

    // A week that exists and simply skipped this question must not be reported
    // as a week that does not exist.
    expect(formatDeltaSentence({ ...first, gap: 'unrated' })).toBe(
      'za mało ocen, żeby porównać z poprzednim tygodniem',
    )
  })

  it('uses a comma, not a dot — the whole UI is Polish', () => {
    expect(formatDelta({ value: 1.25, gap: null, decimals: 1, unit: '', tone: 'good' })).toBe('+1,3')
  })
})

describe('formatWeekRange', () => {
  it('drops the month from the first date when both ends share it', () => {
    expect(formatWeekRange('2026-08-03', '2026-08-09')).toBe('3 – 9 sierpnia 2026')
  })

  it('keeps both months when the week straddles them', () => {
    expect(formatWeekRange('2026-08-31', '2026-09-06')).toBe('31 sierpnia – 6 września 2026')
  })

  it('keeps both years when the week straddles new year', () => {
    expect(formatWeekRange('2025-12-29', '2026-01-04')).toBe('29 grudnia 2025 – 4 stycznia 2026')
  })
})

describe('Polish plurals', () => {
  it('declines days and entries instead of printing "1 dni"', () => {
    expect(pluralDays(1)).toBe('dzień')
    expect(pluralDays(3)).toBe('dni')
    expect(pluralEntries(1)).toBe('wpis')
    expect(pluralEntries(3)).toBe('wpisy')
    expect(pluralEntries(7)).toBe('wpisów')
  })
})

describe('buildWeeklyReports', () => {
  it('groups entries into Monday-Sunday weeks, newest first', () => {
    const reports = buildWeeklyReports(
      [entry('2026-08-16'), entry('2026-08-10'), entry('2026-08-09'), entry('2026-08-03')],
      TODAY,
    )

    expect(reports.map((report) => report.weekStart)).toEqual([WEEK_B, WEEK_A])
    expect(reports[0].weekEnd).toBe('2026-08-16')
    expect(reports[0].id).toBe(weekReportId(WEEK_B))
    expect(reports.every((report) => report.entryCount === 2)).toBe(true)
  })

  it('leaves out the week in progress — a report exists once its week has ended', () => {
    // 20 August 2026 is a Thursday; its Monday is the 17th.
    const reports = buildWeeklyReports([entry('2026-08-19'), entry('2026-08-12')], TODAY)

    expect(reports.map((report) => report.weekStart)).toEqual([WEEK_B])
  })

  it('produces no report for a week with no entries', () => {
    const reports = buildWeeklyReports([entry('2026-08-12')], TODAY)

    expect(reports).toHaveLength(1)
    expect(reports[0].weekStart).toBe(WEEK_B)
  })

  it('averages mood on its own 1-5 scale and counts harder days out of seven', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-10', { mood: 'very_bad' }), // rank 1, a harder day
        entry('2026-08-11', { mood: 'bad' }), // rank 2, a harder day
        entry('2026-08-12', { mood: 'good' }), // rank 4
      ],
      TODAY,
    )

    const [mood, , , hardDays] = reports[0].metrics
    expect(mood.value).toBe('2,3 / 5')
    expect(hardDays.value).toBe(`2 z ${DAYS_IN_WEEK}`)
  })

  it('reads stress off the emotion ratings, energy off the slider', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-10', { emotions: rated(['Stres', 8]), energyLevel: 2 }),
        entry('2026-08-11', { emotions: rated(['Stres', 4]), energyLevel: 6 }),
        // A day that never rated stress must not count as a zero.
        entry('2026-08-12', { emotions: rated(['Spokój', 7]), energyLevel: null }),
      ],
      TODAY,
    )

    const [, stress, energy] = reports[0].metrics
    expect(stress.value).toBe('6,0 / 10')
    expect(energy.value).toBe('4,0 / 10')
  })

  it('averages nothing into "—" rather than into zero', () => {
    const reports = buildWeeklyReports([entry('2026-08-10', { mood: null })], TODAY)

    expect(reports[0].metrics[0].value).toBe('— / 5')
  })

  it('compares against the previous calendar week and tones the direction', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-03', { mood: 'bad', emotions: rated(['Stres', 8]) }),
        entry('2026-08-10', { mood: 'good', emotions: rated(['Stres', 5]) }),
      ],
      TODAY,
    )

    const [mood, stress] = reports[0].metrics
    expect(mood.delta.value).toBe(2)
    expect(mood.delta.tone).toBe('good')
    // Less stress is the reassuring direction, so a fall reads as 'good' too.
    expect(stress.delta.value).toBe(-3)
    expect(stress.delta.tone).toBe('good')
  })

  it('marks an unfavourable move to watch, never as a failure', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-03', { mood: 'good', emotions: rated(['Stres', 3]) }),
        entry('2026-08-10', { mood: 'bad', emotions: rated(['Stres', 7]) }),
      ],
      TODAY,
    )

    const [mood, stress] = reports[0].metrics
    expect(mood.delta.tone).toBe('watch')
    expect(stress.delta.tone).toBe('watch')
    expect(formatDelta(stress.delta)).toBe('+4,0')
  })

  it('has no deltas at all for the first week with entries', () => {
    const reports = buildWeeklyReports([entry('2026-08-10', { mood: 'good' })], TODAY)

    expect(reports[0].metrics.every((metric) => metric.delta.value === null)).toBe(true)
    expect(reports[0].changes).toEqual([])
    expect(reports[0].summary).toContain('nie ma z czym porównać')
  })

  it('does not call an unrated previous week a missing week', () => {
    const reports = buildWeeklyReports(
      [
        // The week before exists and holds entries — it just never rated stress.
        entry('2026-08-03', { mood: 'bad' }),
        entry('2026-08-10', { mood: 'good', emotions: rated(['Stres', 5]) }),
      ],
      TODAY,
    )

    const [mood, stress] = reports[0].metrics
    expect(mood.delta.value).toBe(2)
    expect(mood.delta.gap).toBeNull()
    expect(stress.delta.value).toBeNull()
    expect(stress.delta.gap).toBe('unrated')
    expect(formatDeltaSentence(stress.delta)).toBe('za mało ocen, żeby porównać z poprzednim tygodniem')
  })

  it('the summary says a mood is unrated instead of denying the previous week', () => {
    const reports = buildWeeklyReports(
      [entry('2026-08-03', { mood: null }), entry('2026-08-10', { mood: 'good' })],
      TODAY,
    )

    expect(reports[0].summary).toContain('nastrój nie został oceniony')
    expect(reports[0].summary).not.toContain('Nie ma jeszcze poprzedniego tygodnia')
  })

  it('ranks emotions by the days they were rated on', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-10', { emotions: rated(['Lęk', 7], ['Stres', 5]) }),
        entry('2026-08-11', { emotions: rated(['Lęk', 4]) }),
        entry('2026-08-12', { emotions: rated(['Spokój', 6]) }),
      ],
      TODAY,
    )

    expect(reports[0].emotions).toEqual([
      { emotion: 'Lęk', days: 2 },
      { emotion: 'Stres', days: 1 },
      { emotion: 'Spokój', days: 1 },
    ])
  })

  it('ranks triggers, collapsing the "Inne" chip into what was typed under it', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-10', { situationReaction: { ...entry('x').situationReaction, trigger: 'Praca' } }),
        entry('2026-08-11', { situationReaction: { ...entry('x').situationReaction, trigger: 'Praca' } }),
        entry('2026-08-12', {
          situationReaction: { ...entry('x').situationReaction, trigger: 'Inne', triggerOther: 'Wizyta u lekarza' },
        }),
        // No place named — nothing to rank, not an empty-string row.
        entry('2026-08-13'),
      ],
      TODAY,
    )

    expect(reports[0].triggers).toEqual([
      { trigger: 'Praca', days: 2 },
      { trigger: 'Wizyta u lekarza', days: 1 },
    ])
  })

  it('lists flagged days oldest first, with a trimmed preview and a route to the entry', () => {
    const longNote = 'x'.repeat(200)
    const reports = buildWeeklyReports(
      [
        entry('2026-08-14', { hasRiskyBehavior: true, riskyBehaviorNote: longNote }),
        entry('2026-08-11', { hasRiskyBehavior: true, riskyBehaviorNote: 'Dwa piwa wieczorem.' }),
        entry('2026-08-12'),
      ],
      TODAY,
    )

    const risky = reports[0].riskyDays
    expect(risky.map((day) => day.date)).toEqual(['2026-08-11', '2026-08-14'])
    expect(risky[0].entryId).toBe('id-2026-08-11')
    expect(risky[1].notePreview.endsWith('…')).toBe(true)
    expect(risky[1].notePreview.length).toBeLessThan(longNote.length)
  })

  it('keeps a flagged day with no description, rather than dropping it', () => {
    const reports = buildWeeklyReports(
      [entry('2026-08-11', { hasRiskyBehavior: true, riskyBehaviorNote: '' })],
      TODAY,
    )

    expect(reports[0].riskyDays).toHaveLength(1)
    expect(reports[0].riskyDays[0].notePreview).toBe('')
  })

  it('leaves emotion chips untoned — how many days of a feeling is not ours to judge', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-03', { mood: 'bad', emotions: rated(['Lęk', 6]) }),
        entry('2026-08-04', { mood: 'bad', emotions: rated(['Lęk', 6]) }),
        entry('2026-08-10', { mood: 'good', tensionLevel: 8 }),
      ],
      TODAY,
    )

    const chips = reports[0].changes
    expect(chips.map((chip) => chip.label)).toContain('Lęk')
    const anxiety = chips.find((chip) => chip.label === 'Lęk')
    expect(anxiety?.delta.tone).toBe('neutral')
    expect(formatDelta(anxiety!.delta)).toBe('−2 dni')
    // The mood chip does get a tone: that scale is ordered by the app itself.
    expect(chips.find((chip) => chip.label === 'Nastrój')?.delta.tone).toBe('good')
  })

  it('declines the chip unit — "−1 dzień", not "−1 dni"', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-03', { mood: 'neutral', emotions: rated(['Smutek', 5]) }),
        entry('2026-08-10', { mood: 'neutral' }),
      ],
      TODAY,
    )

    const sadness = reports[0].changes.find((chip) => chip.label === 'Smutek')
    expect(formatDelta(sadness!.delta)).toBe('−1 dzień')
  })

  it('drops chips that did not move', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-03', { mood: 'good', tensionLevel: 4 }),
        entry('2026-08-10', { mood: 'good', tensionLevel: 4 }),
      ],
      TODAY,
    )

    expect(reports[0].changes).toEqual([])
  })

  it('summarises the same numbers the cards show', () => {
    const reports = buildWeeklyReports(
      [
        entry('2026-08-03', { mood: 'bad' }),
        entry('2026-08-10', { mood: 'good', emotions: rated(['Spokój', 6]) }),
        entry('2026-08-11', {
          mood: 'good',
          emotions: rated(['Spokój', 5]),
          hasRiskyBehavior: true,
          riskyBehaviorNote: 'Wieczorem alkohol.',
        }),
      ],
      TODAY,
    )

    const { summary } = reports[0]
    expect(summary).toContain(`2 wpisy z ${DAYS_IN_WEEK} dni`)
    expect(summary).toContain('Spokój (2 dni)')
    expect(summary).toContain('Średni nastrój zmienił się z 2,0 na 4,0')
    expect(summary).toContain('Dni z oznaczonym zachowaniem ryzykownym: 1')
  })
})
