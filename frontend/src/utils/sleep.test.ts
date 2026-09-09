import { describe, expect, it } from 'vitest'
import {
  MAX_SLEEP_MINUTES,
  MIN_SLEEP_MINUTES,
  SLEEP_QUALITY_VALUES,
  WAKE_FEELING_OPTIONS,
  formatSleepDuration,
  isSleepQuality,
  nightLabel,
  sleepDurationMinutes,
  sleepHoursCollide,
  wakeFeelingLabel,
} from './sleep'

/**
 * The night's arithmetic and its vocabulary.
 *
 * `sleepDurationMinutes` is the only derived value in the entire diet module, so
 * it is the one place where a wrong answer is a wrong answer rather than a
 * layout question — hence the disproportionate number of cases below. The
 * midnight crossing is the whole reason the function exists: nights start on one
 * day and end on the next, so the naive subtraction is negative for the ordinary
 * case rather than for the exotic one.
 */

describe('sleepDurationMinutes', () => {
  it('measures a night that crosses midnight, which is most of them', () => {
    // The mockup's own figures: 23:40 -> 06:50 is 7 h 10 min. A subtraction
    // would give -16 h 50 min.
    expect(sleepDurationMinutes('23:40', '06:50')).toBe(7 * 60 + 10)
  })

  it('measures a night that does not', () => {
    expect(sleepDurationMinutes('01:15', '09:00')).toBe(7 * 60 + 45)
  })

  it('is never negative, whichever way round the hours fall', () => {
    for (const [start, end] of [
      ['22:00', '05:30'],
      ['00:10', '00:20'],
      ['12:00', '11:00'],
      ['23:59', '00:00'],
    ] as const) {
      const minutes = sleepDurationMinutes(start, end)
      expect(minutes).not.toBeNull()
      expect(minutes as number).toBeGreaterThan(0)
    }
  })

  it('counts one minute across midnight, not a day less one', () => {
    expect(sleepDurationMinutes('23:59', '00:00')).toBe(1)
  })

  it('has no answer until both hours are there', () => {
    // Both fields are optional, so "not answered yet" is an ordinary state —
    // and it has to read as absent rather than as a zero, the same rule the
    // diary applies to an untouched slider.
    expect(sleepDurationMinutes(null, '06:50')).toBeNull()
    expect(sleepDurationMinutes('23:40', null)).toBeNull()
    expect(sleepDurationMinutes(null, null)).toBeNull()
    expect(sleepDurationMinutes('', '06:50')).toBeNull()
  })

  it('refuses an hour that is not one, rather than computing from a guess', () => {
    expect(sleepDurationMinutes('nocą', '06:50')).toBeNull()
    expect(sleepDurationMinutes('25:00', '06:50')).toBeNull()
    expect(sleepDurationMinutes('23:70', '06:50')).toBeNull()
    expect(sleepDurationMinutes('2340', '06:50')).toBeNull()
  })

  it('tolerates a single-digit hour', () => {
    expect(sleepDurationMinutes('1:00', '7:30')).toBe(6 * 60 + 30)
  })

  it('has no answer for two identical hours', () => {
    // 23:00 -> 23:00 measures a full turn of the clock, which is a mistyped
    // digit rather than a day-long sleep. It used to come back as 24 h; now the
    // screen asks for a correction instead of printing a figure nobody meant.
    expect(sleepDurationMinutes('23:00', '23:00')).toBeNull()
    expect(sleepDurationMinutes('00:00', '00:00')).toBeNull()
  })

  it('stays inside a minute and 23 h 59 min, which is all two hours can say', () => {
    for (const [start, end] of [
      ['23:59', '00:00'],
      ['00:00', '23:59'],
      ['06:00', '05:59'],
      ['12:34', '12:33'],
    ] as const) {
      const minutes = sleepDurationMinutes(start, end)
      expect(minutes).not.toBeNull()
      expect(minutes as number).toBeGreaterThanOrEqual(MIN_SLEEP_MINUTES)
      expect(minutes as number).toBeLessThanOrEqual(MAX_SLEEP_MINUTES)
    }
  })

  it('reaches both ends of that range rather than stopping short of them', () => {
    expect(sleepDurationMinutes('23:59', '00:00')).toBe(MIN_SLEEP_MINUTES)
    expect(sleepDurationMinutes('00:01', '00:00')).toBe(MAX_SLEEP_MINUTES)
  })
})

describe('sleepHoursCollide', () => {
  /**
   * Kept apart from `sleepDurationMinutes` returning null because the screen has
   * to word two silences differently: a night nobody has described yet is
   * waiting for an answer, while two identical hours have been answered in a way
   * that cannot be measured.
   */
  it('is true only when both hours read the same', () => {
    expect(sleepHoursCollide('23:00', '23:00')).toBe(true)
    expect(sleepHoursCollide('23:40', '06:50')).toBe(false)
  })

  it('is false while the night is simply unfinished', () => {
    expect(sleepHoursCollide('23:00', null)).toBe(false)
    expect(sleepHoursCollide(null, '06:50')).toBe(false)
    expect(sleepHoursCollide(null, null)).toBe(false)
    expect(sleepHoursCollide('', '')).toBe(false)
  })

  it('does not claim a collision it cannot verify', () => {
    // Unreadable hours cannot come from a <input type="time">, but a stored
    // value could be anything; "nie da się tego odczytać" is not the same
    // statement as "te dwie godziny są takie same".
    expect(sleepHoursCollide('nocą', 'nocą')).toBe(false)
  })

  it('sees through a single-digit hour, which is the same reading', () => {
    expect(sleepHoursCollide('7:00', '07:00')).toBe(true)
  })
})

describe('formatSleepDuration', () => {
  it('writes hours and minutes the way the mockup does', () => {
    expect(formatSleepDuration(7 * 60 + 10)).toBe('7 h 10 min')
  })

  it('drops a unit that would show nothing but a zero', () => {
    // "7 h 0 min" reads as a field that failed to fill in.
    expect(formatSleepDuration(7 * 60)).toBe('7 h')
    expect(formatSleepDuration(45)).toBe('45 min')
  })

  it('says something for a night of no length at all', () => {
    expect(formatSleepDuration(0)).toBe('0 min')
  })
})

describe('nightLabel', () => {
  it('names both days, declined the way Polish declines them', () => {
    // 2026-09-11 is a Friday, so the night that ended that morning ran from
    // Thursday. Genitive after "z", accusative after "na" — neither is the
    // nominative `toLocaleDateString` would hand back ("noc z środa").
    expect(nightLabel(new Date(2026, 8, 11))).toBe('noc z czwartku na piątek')
  })

  it('crosses a week boundary without inventing an eighth day', () => {
    // Monday: the night before it began on Sunday.
    expect(nightLabel(new Date(2026, 8, 7))).toBe('noc z niedzieli na poniedziałek')
  })

  it('says "ze środy", not "z środy" — the one day that alternates', () => {
    // 2026-10-01 is a Thursday, so the night before it began on Wednesday.
    // Polish takes "ze" before "środy"; six of the seven days take "z", which
    // is exactly why a single hardcoded preposition would have read correctly
    // almost everywhere.
    expect(nightLabel(new Date(2026, 9, 1))).toBe('noc ze środy na czwartek')
  })

  it('names every day of the week without leaving a nominative behind', () => {
    // The two tables are hand-written, so a typo in one row is exactly the kind
    // of thing nothing else would catch.
    const labels = [0, 1, 2, 3, 4, 5, 6].map((offset) =>
      nightLabel(new Date(2026, 8, 7 + offset)),
    )
    expect(labels).toEqual([
      'noc z niedzieli na poniedziałek',
      'noc z poniedziałku na wtorek',
      'noc z wtorku na środę',
      'noc ze środy na czwartek',
      'noc z czwartku na piątek',
      'noc z piątku na sobotę',
      'noc z soboty na niedzielę',
    ])
  })
})

describe('the vocabularies', () => {
  it('names the wake feelings as nouns, never as a feminine adjective', () => {
    // The mockup writes "Wyspana / Ociężale / Spokojnie / Z napięciem" — the
    // first agreeing with a female patient, and the row mixing adjectives with
    // adverbs. Nouns name the same four states for everybody.
    expect(WAKE_FEELING_OPTIONS.map((option) => option.label)).toEqual([
      'Wyspanie',
      'Ociężałość',
      'Spokój',
      'Napięcie',
    ])
    for (const option of WAKE_FEELING_OPTIONS) {
      expect(option.label).not.toMatch(/(ana|ona|łaś|aś)$/)
    }
  })

  it('leaves the label out when the question went unanswered', () => {
    expect(wakeFeelingLabel(null)).toBeNull()
    expect(wakeFeelingLabel(undefined)).toBeNull()
    expect(wakeFeelingLabel('rested')).toBe('Wyspanie')
  })

  it('grades sleep 1 to 5 and nothing else', () => {
    expect([...SLEEP_QUALITY_VALUES]).toEqual([1, 2, 3, 4, 5])
    expect(isSleepQuality(3)).toBe(true)
    expect(isSleepQuality(0)).toBe(false)
    expect(isSleepQuality(6)).toBe(false)
  })
})
