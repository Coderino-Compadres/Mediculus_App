import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDietDay, emptyDietHistory, fetchHydration, recordDrink, removeDrink } from './diet'

/**
 * The diet module's mapping layer.
 *
 * Two halves and the file's job is to keep them apart: the food diary has no
 * backend and returns empty shapes on purpose, while hydration is a real
 * endpoint and this is snake_case in, camelCase out and nothing else.
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

describe('the half that has no backend', () => {
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

  it('the history is empty rather than failing', () => {
    expect(emptyDietHistory()).toEqual([])
  })
})

describe('fetchHydration', () => {
  it('maps every field and computes none of them', async () => {
    apiRequest.mockResolvedValue(DAY_PAYLOAD)

    const day = await fetchHydration()

    expect(apiRequest).toHaveBeenCalledWith('/diet/hydration/')
    expect(day.glassMl).toBe(250)
    expect(day.bottleMl).toBe(500)
    expect(day.targetGlasses).toBe(6)
    expect(day.minAmountMl).toBe(10)
    expect(day.maxAmountMl).toBe(2000)
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

    expect(apiRequest).toHaveBeenCalledWith('/diet/hydration/', {
      method: 'POST',
      body: { drink: 'Woda', amount_ml: 250 },
    })
  })

  it('sends another drink without one', async () => {
    /** The server refuses an amount on anything but water, so sending one here
     *  would be a 400 rather than something quietly dropped. */
    apiRequest.mockResolvedValue({ entry: DAY_PAYLOAD.entries[1], day: DAY_PAYLOAD })

    await recordDrink(null, 'Herbata')

    expect(apiRequest).toHaveBeenCalledWith('/diet/hydration/', {
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
    expect(apiRequest).toHaveBeenCalledWith('/diet/hydration/a/', { method: 'DELETE' })
  })
})
