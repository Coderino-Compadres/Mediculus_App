import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createActivity,
  createMeal,
  createSupplement,
  deleteActivity,
  deleteMeal,
  deleteSupplement,
  emptyActivityDay,
  emptyDietDay,
  emptySleepNight,
  fetchActivityDay,
  fetchDietDay,
  fetchDietHistory,
  fetchDietReport,
  fetchDietReports,
  fetchHydration,
  fetchSleepNight,
  fetchSupplements,
  recordDrink,
  removeDrink,
  saveSleepNight,
  setSteps,
  setSupplementTaken,
  updateMeal,
  updateSupplement,
} from './diet'
import { toIsoDate } from '../utils/days'
import type { ActivityAnswers } from './diet'

/**
 * The diet module's mapping layer.
 *
 * All of it is snake_case in, camelCase out and nothing else. The two "empty"
 * producers stay because a screen needs a shape while its first request is in
 * flight — they are no longer standing in for a missing backend.
 *
 * The rule worth pinning hardest is that **nothing here computes anything**. The
 * glass count, the progress and the seven-day totals all arrive already
 * computed, so the figure the screen draws and the figure the database holds
 * cannot disagree — the same reason the profile's counters are not computed a
 * second time.
 */

const apiRequest = vi.fn()
vi.mock('./client', () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }))

const DAY_PAYLOAD = {
  date: '2026-09-11',
  glass_ml: 250,
  bottle_ml: 500,
  target_glasses: 6,
  min_amount_ml: 10,
  max_amount_ml: 2000,
  max_drink_name: 40,
  water_ml: 1000,
  glasses: 4,
  progress: 0.667,
  entries: [
    { id: 'a', drink: 'Woda', amount_ml: 250, at: '2026-09-11T14:20:00+02:00' },
    { id: 'b', drink: 'Herbata', amount_ml: null, at: null },
  ],
  week: [{ date: '2026-09-11', water_ml: 1000, glasses: 4 }],
}

beforeEach(() => {
  apiRequest.mockReset()
})

describe('the empty shapes a screen starts from', () => {
  it('an untouched day is zeros rather than the mockup\'s sample data', () => {
    /** "6 dni z rzędu" over a diary nobody has written would be the technique
     *  card's mistake with a nicer number. */
    const day = emptyDietDay(new Date('2026-09-11T10:00:00'))

    expect(day).toEqual({ date: '2026-09-11', streakDays: 0, mealCount: 0, meals: [] })
  })

  it('and carries no hydration of its own', () => {
    /** It used to. Hydration is a real endpoint now, and a second summary of
     *  one day is a second answer free to disagree with the first. */
    expect(emptyDietDay()).not.toHaveProperty('hydration')
  })
})

describe('fetchHydration', () => {
  it('maps every field and computes none of them', async () => {
    apiRequest.mockResolvedValue(DAY_PAYLOAD)

    const day = await fetchHydration()

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/hydration/')
    expect(day.glassMl).toBe(250)
    expect(day.bottleMl).toBe(500)
    expect(day.targetGlasses).toBe(6)
    expect(day.minAmountMl).toBe(10)
    expect(day.maxAmountMl).toBe(2000)
    expect(day.maxDrinkName).toBe(40)
    expect(day.waterMl).toBe(1000)
    expect(day.glasses).toBe(4)
    expect(day.progress).toBe(0.667)
  })

  it('keeps an amountless drink amountless', async () => {
    /** Inventing 250 ml for a cup of tea would put a number nobody entered
     *  into a clinical record. */
    apiRequest.mockResolvedValue(DAY_PAYLOAD)

    const { entries } = await fetchHydration()

    expect(entries[1]).toEqual({ id: 'b', drink: 'Herbata', amountMl: null, at: null })
  })

  it('a zero stays a zero', async () => {
    apiRequest.mockResolvedValue({
      ...DAY_PAYLOAD, water_ml: 0, glasses: 0, progress: 0, entries: [],
      week: [{ date: '2026-09-11', water_ml: 0, glasses: 0 }],
    })

    const day = await fetchHydration()

    expect(day.glasses).toBe(0)
    expect(day.progress).toBe(0)
    expect(day.week[0].waterMl).toBe(0)
  })

  it('maps the week without reordering it', async () => {
    apiRequest.mockResolvedValue({
      ...DAY_PAYLOAD,
      week: [
        { date: '2026-09-10', water_ml: 500, glasses: 2 },
        { date: '2026-09-11', water_ml: 1000, glasses: 4 },
      ],
    })

    const { week } = await fetchHydration()

    expect(week.map((day) => day.date)).toEqual(['2026-09-10', '2026-09-11'])
    expect(week[0]).toEqual({ date: '2026-09-10', waterMl: 500, glasses: 2 })
  })
})

describe('recordDrink', () => {
  it('sends water with its amount', async () => {
    apiRequest.mockResolvedValue({ entry: DAY_PAYLOAD.entries[0], day: DAY_PAYLOAD })

    await recordDrink(250)

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/hydration/', {
      method: 'POST',
      body: { drink: 'Woda', amount_ml: 250 },
    })
  })

  it('sends another drink without one', async () => {
    /** The server refuses an amount on anything but water, so sending one here
     *  would be a 400 rather than something quietly dropped. */
    apiRequest.mockResolvedValue({ entry: DAY_PAYLOAD.entries[1], day: DAY_PAYLOAD })

    await recordDrink(null, 'Herbata')

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/hydration/', {
      method: 'POST',
      body: { drink: 'Herbata' },
    })
  })

  it('returns the rebuilt day rather than the row it wrote', async () => {
    /** Three figures move when one glass is recorded; rebuilding them from a
     *  single row is how one day ends up with two versions of itself. */
    apiRequest.mockResolvedValue({ entry: DAY_PAYLOAD.entries[0], day: DAY_PAYLOAD })

    const day = await recordDrink(250)

    expect(day.glasses).toBe(4)
    expect(day.week).toHaveLength(1)
  })
})

describe('removeDrink', () => {
  it('deletes by id and resolves to nothing', async () => {
    apiRequest.mockResolvedValue(undefined)

    await expect(removeDrink('a')).resolves.toBeUndefined()
    expect(apiRequest).toHaveBeenCalledWith('/api/diet/hydration/a/', { method: 'DELETE' })
  })
})

describe('the food diary', () => {
  it('maps the day the home screen draws', async () => {
    apiRequest.mockResolvedValue({
      date: '2026-09-09', streak_days: 4, meal_count: 3,
      meals: [{ id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.' }],
    })

    await expect(fetchDietDay()).resolves.toEqual({
      date: '2026-09-09',
      streakDays: 4,
      mealCount: 3,
      meals: [{ id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.' }],
    })
    expect(apiRequest).toHaveBeenCalledWith('/api/diet/today/')
  })

  it('keeps a zero a zero rather than turning it into a placeholder', async () => {
    apiRequest.mockResolvedValue({
      date: '2026-09-09', streak_days: 0, meal_count: 0, meals: [],
    })

    const day = await fetchDietDay()

    expect(day.streakDays).toBe(0)
    expect(day.mealCount).toBe(0)
    expect(day.meals).toEqual([])
  })

  it('survives a day with no meals key at all', async () => {
    /** A backend a release behind this file. Throwing would take the screen
     *  down to show a count of zero — strictly worse than the count the
     *  server did send. Same judgement as `needsConsents` failing open. */
    apiRequest.mockResolvedValue({
      date: '2026-09-09', streak_days: 4, meal_count: 3,
    })

    const day = await fetchDietDay()

    expect(day.meals).toEqual([])
    expect(day.mealCount).toBe(3)
  })

  it('maps the history as days holding meals, not as a flat list', async () => {
    apiRequest.mockResolvedValue([
      {
        date: '2026-09-09',
        meals: [
          { id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.' },
          { id: 'm2', kind: null, time: null, description: '' },
        ],
      },
    ])

    await expect(fetchDietHistory()).resolves.toEqual([
      {
        date: '2026-09-09',
        meals: [
          { id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.' },
          { id: 'm2', kind: null, time: null, description: '' },
        ],
      },
    ])
    expect(apiRequest).toHaveBeenCalledWith('/api/diet/meals/')
  })

  it('carries no quantity of any kind onto a meal', async () => {
    /** §04's scope: a photo and a description, nothing numeric. A payload that
     *  grew a portion field would not reach the screen through this layer. */
    apiRequest.mockResolvedValue([
      {
        date: '2026-09-09',
        meals: [{
          id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.',
          calories: 420, portion: '300 g',
        }],
      },
    ])

    const [day] = await fetchDietHistory()

    expect(Object.keys(day.meals[0]).sort())
      .toEqual(['description', 'id', 'kind', 'time'])
  })
})

describe('createMeal', () => {
  const SAVED = {
    meal: { id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.' },
    day: {
      date: '2026-09-11', streak_days: 4, meal_count: 3,
      meals: [{ id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.' }],
    },
  }

  it('posts the three fields a meal holds and nothing else', async () => {
    apiRequest.mockResolvedValue(SAVED)

    await createMeal({ kind: 'Obiad', time: '13:30', description: 'Zupa.' })

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/meals/', {
      method: 'POST',
      body: { kind: 'Obiad', time: '13:30', description: 'Zupa.' },
    })
  })

  it('sends no date, because the server stamps the day', async () => {
    /** A form that only shows today must not be able to write into the archive. */
    apiRequest.mockResolvedValue(SAVED)

    await createMeal({ kind: null, time: null, description: '' })

    const body = apiRequest.mock.calls[0][1].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['description', 'kind', 'time'])
  })

  it('turns a blank answer into null, so "unanswered" has one representation', async () => {
    apiRequest.mockResolvedValue(SAVED)

    await createMeal({ kind: '', time: '', description: '   ' })

    expect(apiRequest.mock.calls[0][1].body).toEqual({
      kind: null, time: null, description: '',
    })
  })

  it('maps back both the row and the rebuilt day', async () => {
    /** Both move when one meal is written; recomputing either here is how one
     *  day ends up with two versions of itself. */
    apiRequest.mockResolvedValue(SAVED)

    const saved = await createMeal({ kind: 'Obiad', time: '13:30', description: 'Zupa.' })

    expect(saved.meal).toEqual({
      id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.',
    })
    expect(saved.day).toEqual({
      date: '2026-09-11', streakDays: 4, mealCount: 3,
      meals: [{ id: 'm1', kind: 'Obiad', time: '13:30', description: 'Zupa.' }],
    })
  })

  it('keeps a zero a zero rather than treating it as missing', async () => {
    apiRequest.mockResolvedValue({
      ...SAVED,
      day: { date: '2026-09-11', streak_days: 0, meal_count: 0, meals: [] },
    })

    const saved = await createMeal({ kind: null, time: null, description: '' })

    expect(saved.day.streakDays).toBe(0)
    expect(saved.day.mealCount).toBe(0)
  })
})

describe('suplementy i leki', () => {
  const PAYLOAD = {
    id: 's1',
    name: 'Witamina D3',
    dose: '2000 IU',
    frequency: 'raz dziennie',
    hours: ['08:00'],
    start_date: '2026-03-12',
    end_date: null,
    reminder_enabled: true,
    taken_today: false,
  }

  it('maps a row into the screen\'s own names', async () => {
    apiRequest.mockResolvedValue([PAYLOAD])

    await expect(fetchSupplements()).resolves.toEqual([{
      id: 's1',
      name: 'Witamina D3',
      dose: '2000 IU',
      frequency: 'raz dziennie',
      hours: ['08:00'],
      startDate: '2026-03-12',
      endDate: null,
      reminderEnabled: true,
      takenToday: false,
    }])
    expect(apiRequest).toHaveBeenCalledWith('/api/diet/supplements/')
  })

  it('sends a blank answer as null rather than as an empty string', async () => {
    /** The column has one representation of "not answered"; sending '' would
     *  put a second one on the wire. */
    apiRequest.mockResolvedValue([PAYLOAD])

    await createSupplement({
      name: '  Magnez  ',
      dose: '',
      frequency: '   ',
      hours: [''],
      startDate: '',
      endDate: '',
      reminderEnabled: false,
    })

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/supplements/', {
      method: 'POST',
      body: {
        name: 'Magnez',
        dose: null,
        frequency: null,
        hours: [],
        start_date: null,
        end_date: null,
        reminder_enabled: false,
      },
    })
  })

  it('answers a write with the whole rebuilt list', async () => {
    /** The list is ordered by hour on the server, so a new row rarely belongs
     *  at the end — appending it here would put it in the wrong place. */
    apiRequest.mockResolvedValue([PAYLOAD, { ...PAYLOAD, id: 's2', name: 'Magnez' }])

    const list = await createSupplement({
      name: 'Magnez', dose: null, frequency: null, hours: [],
      startDate: null, endDate: null, reminderEnabled: true,
    })

    expect(list.map((row) => row.name)).toEqual(['Witamina D3', 'Magnez'])
  })

  it('replaces on an edit rather than merging', async () => {
    apiRequest.mockResolvedValue([PAYLOAD])

    await updateSupplement('s1', {
      name: 'Witamina D3', dose: null, frequency: null, hours: ['08:00'],
      startDate: '2026-03-12', endDate: null, reminderEnabled: true,
    })

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/supplements/s1/', {
      method: 'PUT',
      body: expect.objectContaining({ dose: null }),
    })
  })

  it('deletes by id and resolves to nothing', async () => {
    apiRequest.mockResolvedValue(undefined)

    await expect(deleteSupplement('s1')).resolves.toBeUndefined()
    expect(apiRequest).toHaveBeenCalledWith('/api/diet/supplements/s1/', { method: 'DELETE' })
  })

  it('ticks with a POST and unticks with a DELETE on the same URL', async () => {
    apiRequest.mockResolvedValue([{ ...PAYLOAD, taken_today: true }])
    await setSupplementTaken('s1', true)
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/diet/supplements/s1/intake/', { method: 'POST' })

    apiRequest.mockResolvedValue([PAYLOAD])
    await setSupplementTaken('s1', false)
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/diet/supplements/s1/intake/', { method: 'DELETE' })
  })

  it('sends no date with a tick, because only today is tickable', async () => {
    apiRequest.mockResolvedValue([{ ...PAYLOAD, taken_today: true }])

    await setSupplementTaken('s1', true)

    const [, options] = apiRequest.mock.calls[0] as [string, Record<string, unknown>]
    expect(options).not.toHaveProperty('body')
  })
})

/**
 * §09 — "Aktywność i sen", which reaches a real endpoint now.
 *
 * **THE SUITES THAT USED TO SIT HERE ARE GONE, AND THEIR SUBJECT IS THE POINT.**
 * `newActivityEntry` and `localTime` stamped an entry's date and hour in the
 * browser, and they were worth a test of their own because of the defect they
 * were extracted to prevent: the date had been copied off the day object the
 * screen loaded, whose own date was fixed when the route mounted, so an activity
 * saved at 00:10 was filed under the previous day.
 *
 * The server stamps both now and no write sends either, which is a stronger
 * form of the same guarantee — one clock decides, and it is the clock that
 * already decides which day every other row in this module belongs to. So what
 * is pinned below is the *absence*: `createActivity` and `saveSleepNight` must
 * put no date and no hour on the wire at all.
 */

const ANSWERS: ActivityAnswers = {
  kind: 'Spacer',
  kindOther: '',
  durationMinutes: 35,
  feelingAfter: 'better',
}

const ACTIVITY_ENTRY_PAYLOAD = {
  id: 'a1',
  date: '2026-09-11',
  time: '18:10',
  kind: 'Spacer',
  kind_other: '',
  duration_minutes: 35,
  feeling_after: 'better',
}

const ACTIVITY_DAY_PAYLOAD = {
  date: '2026-09-11',
  entries: [ACTIVITY_ENTRY_PAYLOAD],
  steps: 6400,
}

const SLEEP_PAYLOAD = {
  date: '2026-09-11',
  fell_asleep_at: '23:40',
  woke_up_at: '06:50',
  quality: 3,
  awakenings: 1,
  wake_feeling: 'heavy',
}

describe('fetchActivityDay', () => {
  it('reads today from the module own URL', async () => {
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await fetchActivityDay()

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/activity/')
  })

  it('maps a row into the panel own names', async () => {
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await expect(fetchActivityDay()).resolves.toEqual({
      date: '2026-09-11',
      steps: 6400,
      entries: [{
        id: 'a1',
        date: '2026-09-11',
        time: '18:10',
        kind: 'Spacer',
        kindOther: '',
        durationMinutes: 35,
        feelingAfter: 'better',
      }],
    })
  })

  it('keeps a null answer null rather than inventing one', async () => {
    /** An activity saved with nothing but an hour is an ordinary row (§05), so
     *  none of the three answers may be filled in on the way through. */
    apiRequest.mockResolvedValue({
      ...ACTIVITY_DAY_PAYLOAD,
      steps: null,
      entries: [{
        ...ACTIVITY_ENTRY_PAYLOAD,
        kind: null, duration_minutes: null, feeling_after: null,
      }],
    })

    const day = await fetchActivityDay()

    expect(day.steps).toBeNull()
    expect(day.entries[0].kind).toBeNull()
    expect(day.entries[0].durationMinutes).toBeNull()
    expect(day.entries[0].feelingAfter).toBeNull()
  })

  it('keeps a zero step count, because that is a real answer', async () => {
    /** A row holding 0 is "no steps taken"; an absent row is "nobody typed
     *  one". The server tells them apart by deleting the row, and this layer
     *  must not fold the first into the second. */
    apiRequest.mockResolvedValue({ ...ACTIVITY_DAY_PAYLOAD, steps: 0 })

    expect((await fetchActivityDay()).steps).toBe(0)
  })

  it('turns a missing kind_other into an empty string, not into null', async () => {
    /** The type declares a string because the chip and its free text are one
     *  answer and the form needs something to put in the input. */
    const { kind_other: _dropped, ...withoutFreeText } = ACTIVITY_ENTRY_PAYLOAD
    apiRequest.mockResolvedValue({
      ...ACTIVITY_DAY_PAYLOAD, entries: [withoutFreeText],
    })

    expect((await fetchActivityDay()).entries[0].kindOther).toBe('')
  })

  it('survives a day with no entries key at all', async () => {
    /** A backend a release behind this file. Throwing would take the panel down
     *  — the same judgement `fetchDietDay` makes about a missing `meals`. */
    apiRequest.mockResolvedValue({ date: '2026-09-11', steps: null })

    expect((await fetchActivityDay()).entries).toEqual([])
  })
})

describe('createActivity', () => {
  it('posts the three answers, snake_cased', async () => {
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await createActivity(ANSWERS)

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/activity/', {
      method: 'POST',
      body: {
        kind: 'Spacer',
        kind_other: null,
        duration_minutes: 35,
        feeling_after: 'better',
      },
    })
  })

  it('sends no date and no hour, because the server stamps both', async () => {
    /** THE REGRESSION THIS REPLACES. The browser used to stamp them, and before
     *  that copied them off a day object fixed at mount — which filed an
     *  activity saved at 00:10 under the previous day, in a document a
     *  specialist reads. Nothing on the wire may name a day or a time. */
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await createActivity(ANSWERS)

    const body = apiRequest.mock.calls[0][1].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual([
      'duration_minutes', 'feeling_after', 'kind', 'kind_other',
    ])
  })

  it('sends a blank free text as null, so "unanswered" has one representation', async () => {
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await createActivity({ ...ANSWERS, kind: 'Inne', kindOther: '   ' })

    expect(apiRequest.mock.calls[0][1].body).toMatchObject({ kind_other: null })
  })

  it('trims what was typed under "Inne"', async () => {
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await createActivity({ ...ANSWERS, kind: 'Inne', kindOther: '  Nordic walking  ' })

    expect(apiRequest.mock.calls[0][1].body).toMatchObject({
      kind_other: 'Nordic walking',
    })
  })

  it('sends an empty form as an empty form, which is a valid activity', async () => {
    /** §05 taken literally on both sides: it records that somebody moved. */
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await createActivity({
      kind: null, kindOther: '', durationMinutes: null, feelingAfter: null,
    })

    expect(apiRequest.mock.calls[0][1].body).toEqual({
      kind: null, kind_other: null, duration_minutes: null, feeling_after: null,
    })
  })

  it('answers with the whole rebuilt day rather than the row it wrote', async () => {
    /** The list and the step count sit together; rebuilding either here is how
     *  one day ends up with two versions of itself. */
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    const day = await createActivity(ANSWERS)

    expect(day.entries).toHaveLength(1)
    expect(day.steps).toBe(6400)
  })
})

describe('deleteActivity', () => {
  it('deletes by id and answers with the day that is left', async () => {
    apiRequest.mockResolvedValue({ date: '2026-09-11', entries: [], steps: null })

    const day = await deleteActivity('a1')

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/activity/a1/', {
      method: 'DELETE',
    })
    expect(day.entries).toEqual([])
  })
})

describe('setSteps', () => {
  it('puts the count to its own URL, which is not an activity id', async () => {
    /** Declared before `activity/<uuid>/` on the server, so "steps" is never
     *  read as an id. */
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    await setSteps(6400)

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/activity/steps/', {
      method: 'PUT',
      body: { steps: 6400 },
    })
  })

  it('sends null to clear it, which deletes the row rather than storing a zero', async () => {
    /** "Nobody typed a count" and "this person took no steps" are different
     *  claims: the first is an absent row, the second a row holding 0. */
    apiRequest.mockResolvedValue({ ...ACTIVITY_DAY_PAYLOAD, steps: null })

    await setSteps(null)

    expect(apiRequest.mock.calls[0][1].body).toEqual({ steps: null })
  })

  it('sends a zero as a zero', async () => {
    apiRequest.mockResolvedValue({ ...ACTIVITY_DAY_PAYLOAD, steps: 0 })

    await setSteps(0)

    expect(apiRequest.mock.calls[0][1].body).toEqual({ steps: 0 })
  })

  it('answers with the rebuilt day, so the panel redraws from the server', async () => {
    apiRequest.mockResolvedValue(ACTIVITY_DAY_PAYLOAD)

    expect((await setSteps(6400)).steps).toBe(6400)
  })
})

describe('fetchSleepNight', () => {
  it('reads this morning night from the module own URL', async () => {
    apiRequest.mockResolvedValue(SLEEP_PAYLOAD)

    await fetchSleepNight()

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/sleep/')
  })

  it('maps every field into the panel own names', async () => {
    apiRequest.mockResolvedValue(SLEEP_PAYLOAD)

    await expect(fetchSleepNight()).resolves.toEqual({
      date: '2026-09-11',
      fellAsleepAt: '23:40',
      wokeUpAt: '06:50',
      quality: 3,
      awakenings: 1,
      wakeFeeling: 'heavy',
    })
  })

  it('reads a morning nobody answered for as an empty night, not as an error', async () => {
    /** The server sends this shape for an untouched morning, and it is exactly
     *  what `emptySleepNight` produces — so the loading shape and the loaded one
     *  are the same object. */
    apiRequest.mockResolvedValue({
      date: '2026-09-11', fell_asleep_at: null, woke_up_at: null,
      quality: null, awakenings: 0, wake_feeling: null,
    })

    await expect(fetchSleepNight()).resolves.toEqual(emptySleepNight(new Date(2026, 8, 11)))
  })
})

describe('saveSleepNight', () => {
  const NIGHT = {
    date: '2026-09-11',
    fellAsleepAt: '23:40',
    wokeUpAt: '06:50',
    quality: 3 as const,
    awakenings: 1,
    wakeFeeling: 'heavy' as const,
  }

  it('puts the whole form, snake_cased', async () => {
    /** PUT replaces rather than merges — the server rule — so the whole draft
     *  travels and a cleared hour is an answer taken back. */
    apiRequest.mockResolvedValue(SLEEP_PAYLOAD)

    await saveSleepNight(NIGHT)

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/sleep/', {
      method: 'PUT',
      body: {
        fell_asleep_at: '23:40',
        woke_up_at: '06:50',
        quality: 3,
        awakenings: 1,
        wake_feeling: 'heavy',
      },
    })
  })

  it('sends no date, because only this morning night is writable', async () => {
    apiRequest.mockResolvedValue(SLEEP_PAYLOAD)

    await saveSleepNight(NIGHT)

    const body = apiRequest.mock.calls[0][1].body as Record<string, unknown>
    expect(body).not.toHaveProperty('date')
    expect(Object.keys(body).sort()).toEqual([
      'awakenings', 'fell_asleep_at', 'quality', 'wake_feeling', 'woke_up_at',
    ])
  })

  it('carries a cleared hour through as null rather than dropping the key', async () => {
    /** Dropping it would make PUT behave as a merge on that one field, which is
     *  precisely the thing the server rule rules out. */
    apiRequest.mockResolvedValue({ ...SLEEP_PAYLOAD, fell_asleep_at: null })

    await saveSleepNight({ ...NIGHT, fellAsleepAt: null })

    expect(apiRequest.mock.calls[0][1].body).toMatchObject({ fell_asleep_at: null })
  })

  it('settles on what the server answers with', async () => {
    apiRequest.mockResolvedValue(SLEEP_PAYLOAD)

    expect((await saveSleepNight(NIGHT)).wakeFeeling).toBe('heavy')
  })
})

/**
 * §10 — the weekly report, derived on the server.
 *
 * The mapping is the whole of this layer job here: nothing is computed, no week
 * is counted, and the range label arrives ready to render. `utils/dietWeeks.ts`
 * used to count the weeks and `utils/dietReport.ts` used to build the document;
 * both are `core/diet_reports.py` now, for the two reasons the psychotherapy
 * module moved first — one clock, and one document rather than one per browser.
 */

const REPORT_MEAL = { id: 'm1', kind: 'Śniadanie', time: '07:30', description: 'Owsianka.' }

const REPORT_PAYLOAD = {
  id: 'week-2026-08-26',
  week_start: '2026-08-26',
  week_end: '2026-09-01',
  range_label: '26 sierpnia – 1 września 2026',
  days_with_entry: 1,
  days: [
    {
      date: '2026-08-26',
      meals: [REPORT_MEAL],
      hydration: { date: '2026-08-26', water_ml: 500, glasses: 2 },
      sleep: SLEEP_PAYLOAD,
      activity: ACTIVITY_DAY_PAYLOAD,
      empty: false,
    },
    {
      date: '2026-08-27',
      meals: [],
      hydration: null,
      sleep: null,
      activity: null,
      empty: true,
    },
  ],
  meal_grid: {
    slots: ['morning', 'noon', 'evening', 'night'],
    rows: [
      {
        date: '2026-08-26',
        cells: [
          { slot: 'morning', meals: [REPORT_MEAL] },
          { slot: 'noon', meals: [] },
          { slot: 'evening', meals: [] },
          { slot: 'night', meals: [] },
        ],
      },
    ],
  },
}

describe('fetchDietReports', () => {
  it('reads the list from the module own URL', async () => {
    apiRequest.mockResolvedValue([REPORT_PAYLOAD])

    await fetchDietReports()

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/reports/')
  })

  it('maps the week into the screen own names', async () => {
    apiRequest.mockResolvedValue([REPORT_PAYLOAD])

    const [report] = await fetchDietReports()

    expect(report.id).toBe('week-2026-08-26')
    expect(report.weekStart).toBe('2026-08-26')
    expect(report.weekEnd).toBe('2026-09-01')
    expect(report.daysWithEntry).toBe(1)
  })

  it('takes the range label as it arrives rather than composing one', async () => {
    /** Built by the same `format_week_range` the psychotherapy reports use, so
     *  the two modules print a week identically. */
    apiRequest.mockResolvedValue([REPORT_PAYLOAD])

    const [report] = await fetchDietReports()

    expect(report.rangeLabel).toBe('26 sierpnia – 1 września 2026')
  })

  it('maps every diary inside a day, and keeps an unanswered one null', async () => {
    apiRequest.mockResolvedValue([REPORT_PAYLOAD])

    const [report] = await fetchDietReports()
    const [wednesday, thursday] = report.days

    expect(wednesday.meals[0].description).toBe('Owsianka.')
    expect(wednesday.hydration).toEqual({ date: '2026-08-26', waterMl: 500, glasses: 2 })
    expect(wednesday.sleep?.fellAsleepAt).toBe('23:40')
    expect(wednesday.activity?.steps).toBe(6400)
    expect(wednesday.empty).toBe(false)

    // "Nobody wrote it down" is null, and never a zero.
    expect(thursday.hydration).toBeNull()
    expect(thursday.sleep).toBeNull()
    expect(thursday.activity).toBeNull()
    expect(thursday.empty).toBe(true)
  })

  it('maps the meal grid without reordering its columns', async () => {
    apiRequest.mockResolvedValue([REPORT_PAYLOAD])

    const [report] = await fetchDietReports()

    expect(report.mealGrid.slots).toEqual(['morning', 'noon', 'evening', 'night'])
    expect(report.mealGrid.rows[0].date).toBe('2026-08-26')
    expect(report.mealGrid.rows[0].cells[0].meals[0].kind).toBe('Śniadanie')
    expect(report.mealGrid.rows[0].cells[1].meals).toEqual([])
  })

  it('carries no quantity onto a meal in a cell either', async () => {
    /** The same sweep the history gets: §04 scope holds wherever a meal is
     *  rendered, and a cell is one more place a portion could arrive. */
    apiRequest.mockResolvedValue([{
      ...REPORT_PAYLOAD,
      meal_grid: {
        slots: ['morning'],
        rows: [{
          date: '2026-08-26',
          cells: [{
            slot: 'morning',
            meals: [{ ...REPORT_MEAL, calories: 420, portion: '300 g' }],
          }],
        }],
      },
    }])

    const [report] = await fetchDietReports()

    expect(Object.keys(report.mealGrid.rows[0].cells[0].meals[0]).sort())
      .toEqual(['description', 'id', 'kind', 'time'])
  })

  it('answers with nothing for a diary younger than a week', async () => {
    apiRequest.mockResolvedValue([])

    await expect(fetchDietReports()).resolves.toEqual([])
  })
})

describe('fetchDietReport', () => {
  it('asks for one week by its id', async () => {
    apiRequest.mockResolvedValue(REPORT_PAYLOAD)

    await fetchDietReport('week-2026-08-26')

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/reports/week-2026-08-26/')
  })

  it('maps it exactly as the list maps a row', async () => {
    /** One shape, so the list and the detail cannot disagree about a week. */
    apiRequest.mockResolvedValue(REPORT_PAYLOAD)

    const one = await fetchDietReport('week-2026-08-26')
    apiRequest.mockResolvedValue([REPORT_PAYLOAD])
    const [fromList] = await fetchDietReports()

    expect(one).toEqual(fromList)
  })
})

describe('the empty producers', () => {
  it('build today, in the reader\'s own calendar day', () => {
    expect(emptyActivityDay().date).toBe(toIsoDate(new Date()))
    expect(emptySleepNight().date).toBe(toIsoDate(new Date()))
  })

  it('answer with nothing rather than with the mockup\'s sample figures', () => {
    const day = emptyActivityDay()

    // A streak of 6 for somebody who has never written a meal is a lie with a
    // nicer number — the rule this whole file opens with.
    expect(day.entries).toEqual([])
    expect(day.steps).toBeNull()
  })

  it('start awakenings at zero, which is a real answer, and the rest at null', () => {
    const night = emptySleepNight()

    expect(night.awakenings).toBe(0)
    expect(night.fellAsleepAt).toBeNull()
    expect(night.wokeUpAt).toBeNull()
    expect(night.quality).toBeNull()
    expect(night.wakeFeeling).toBeNull()
  })
})

describe('updateMeal and deleteMeal — correcting today', () => {
  const DAY = {
    date: '2026-09-11', streak_days: 4, meal_count: 1,
    meals: [{ id: 'm1', kind: 'Kolacja', time: '19:30', description: 'Zupa.' }],
  }

  it('puts to the meal\'s own URL and replaces every field', async () => {
    /** PUT, not PATCH: the form submits its whole state, so a field cleared on
     *  screen is an answer taken back rather than one left alone. */
    apiRequest.mockResolvedValue({ meal: DAY.meals[0], day: DAY })

    await updateMeal('m1', { kind: 'Kolacja', time: '19:30', description: 'Zupa.' })

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/meals/m1/', {
      method: 'PUT',
      body: { kind: 'Kolacja', time: '19:30', description: 'Zupa.' },
    })
  })

  it('sends no date on an edit either', async () => {
    /** A meal cannot be moved between days; the server refuses, and a browser
     *  that tried would be silently ignored rather than told. */
    apiRequest.mockResolvedValue({ meal: DAY.meals[0], day: DAY })

    await updateMeal('m1', { kind: null, time: null, description: '' })

    const body = apiRequest.mock.calls[0][1].body as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(['description', 'kind', 'time'])
  })

  it('maps back the row and the rebuilt day', async () => {
    apiRequest.mockResolvedValue({ meal: DAY.meals[0], day: DAY })

    const saved = await updateMeal('m1', {
      kind: 'Kolacja', time: '19:30', description: 'Zupa.',
    })

    expect(saved.meal.id).toBe('m1')
    expect(saved.day.meals).toHaveLength(1)
    expect(saved.day.mealCount).toBe(1)
  })

  it('deletes by id and answers with the day that is left', async () => {
    /** Three things move when a meal goes — the list, the count and the
     *  streak — so the server rebuilds them rather than the browser. */
    apiRequest.mockResolvedValue({
      day: { date: '2026-09-11', streak_days: 0, meal_count: 0, meals: [] },
    })

    const day = await deleteMeal('m1')

    expect(apiRequest).toHaveBeenCalledWith('/api/diet/meals/m1/', {
      method: 'DELETE',
    })
    expect(day.meals).toEqual([])
    expect(day.mealCount).toBe(0)
    expect(day.streakDays).toBe(0)
  })
})
