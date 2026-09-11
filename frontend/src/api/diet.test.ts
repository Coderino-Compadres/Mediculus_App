import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMeal,
  createSupplement,
  deleteSupplement,
  emptyActivityDay,
  emptyDietDay,
  emptySleepNight,
  fetchDietDay,
  fetchDietHistory,
  fetchHydration,
  fetchSupplements,
  localTime,
  newActivityEntry,
  recordDrink,
  removeDrink,
  setSupplementTaken,
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

    expect(day).toEqual({ date: '2026-09-11', streakDays: 0, mealCount: 0 })
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
    })

    await expect(fetchDietDay()).resolves.toEqual({
      date: '2026-09-09',
      streakDays: 4,
      mealCount: 3,
    })
    expect(apiRequest).toHaveBeenCalledWith('/api/diet/today/')
  })

  it('keeps a zero a zero rather than turning it into a placeholder', async () => {
    apiRequest.mockResolvedValue({
      date: '2026-09-09', streak_days: 0, meal_count: 0,
    })

    const day = await fetchDietDay()

    expect(day.streakDays).toBe(0)
    expect(day.mealCount).toBe(0)
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
    day: { date: '2026-09-11', streak_days: 4, meal_count: 3 },
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
    expect(saved.day).toEqual({ date: '2026-09-11', streakDays: 4, mealCount: 3 })
  })

  it('keeps a zero a zero rather than treating it as missing', async () => {
    apiRequest.mockResolvedValue({
      ...SAVED, day: { date: '2026-09-11', streak_days: 0, meal_count: 0 },
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
    hour: '08:00',
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
      hour: '08:00',
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
      hour: '',
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
        hour: null,
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
      name: 'Magnez', dose: null, frequency: null, hour: null,
      startDate: null, endDate: null, reminderEnabled: true,
    })

    expect(list.map((row) => row.name)).toEqual(['Witamina D3', 'Magnez'])
  })

  it('replaces on an edit rather than merging', async () => {
    apiRequest.mockResolvedValue([PAYLOAD])

    await updateSupplement('s1', {
      name: 'Witamina D3', dose: null, frequency: null, hour: '08:00',
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
 * §09's own half of this layer is pure: `newActivityEntry` and `localTime`
 * reach no endpoint, because there is no `/api/diet/activity/` yet.
 *
 * `newActivityEntry` is the one worth testing on its own, and the reason is the
 * defect it exists to prevent: the date used to be copied off the day object the
 * screen had loaded, whose own date was fixed when the route mounted, so an
 * activity saved at 00:10 was filed under the previous day. That is invisible
 * from a component test — a test can watch a button and a list, but not which
 * day a row went into — which is exactly why the stamp was extracted to a
 * function with an injectable clock.
 */

const ANSWERS: ActivityAnswers = {
  kind: 'Spacer',
  kindOther: '',
  durationMinutes: 35,
  feelingAfter: 'better',
}

describe('newActivityEntry', () => {
  it('stamps the day from the clock at the moment of saving', () => {
    // 00:10 on the 10th. Filed under the 10th, whatever day the screen was
    // opened on.
    const entry = newActivityEntry(ANSWERS, new Date(2026, 8, 10, 0, 10))

    expect(entry.date).toBe('2026-09-10')
    expect(entry.time).toBe('00:10')
  })

  it('does not inherit the day a screen was opened on', () => {
    /**
     * The regression, stated directly. A form opened at 23:55 on the 9th holds
     * a day whose `date` is '2026-09-09'; an entry saved from it fifteen minutes
     * later belongs to the 10th. Nothing about the entry may come from that
     * stale day object.
     */
    const openedOn = emptyActivityDay(new Date(2026, 8, 9, 23, 55))
    const entry = newActivityEntry(ANSWERS, new Date(2026, 8, 10, 0, 10))

    expect(openedOn.date).toBe('2026-09-09')
    expect(entry.date).not.toBe(openedOn.date)
  })

  it('reads the real clock when nobody passes one', () => {
    // Production never passes `now`; the argument is there for the tests above.
    expect(newActivityEntry(ANSWERS).date).toBe(toIsoDate(new Date()))
  })

  it('carries the answers through untouched', () => {
    const entry = newActivityEntry(ANSWERS, new Date(2026, 8, 10, 7, 5))

    expect(entry).toMatchObject(ANSWERS)
  })

  it('gives every entry its own id, marked as unpersisted', () => {
    const first = newActivityEntry(ANSWERS)
    const second = newActivityEntry(ANSWERS)

    expect(first.id).not.toBe(second.id)
    // The prefix says out loud that nothing here has reached a database.
    expect(first.id).toMatch(/^local-/)
  })
})

describe('localTime', () => {
  it('pads both halves, so a row never reads "7:5"', () => {
    expect(localTime(new Date(2026, 8, 10, 7, 5))).toBe('07:05')
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
