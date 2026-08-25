import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchHomeDashboard } from './dashboard'

vi.mock('./client', () => ({ apiRequest: vi.fn() }))
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

function week(days: Partial<{ date: string; has_entry: boolean; dominant_emotion: string | null; intensity: number | null }>[] = []) {
  return days.map((day) => ({
    date: '2026-08-25',
    has_entry: true,
    dominant_emotion: 'Lęk',
    intensity: 7,
    ...day,
  }))
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    streak_days: 4,
    today_entry: { mood_label: 'Dobrze', emotions: [{ emotion: 'Radość', intensity: 9 }] },
    week: week([{}]),
    average_stress: 4.3,
    average_energy: 5.5,
    technique: { name: 'Technika 5-4-3-2-1', match_reason: 'Dopasowane.' },
    ...overrides,
  }
}

beforeEach(() => mockedRequest.mockReset())

describe('fetchHomeDashboard', () => {
  it('reads the signed-in patient\'s own screen — no id in the URL to tamper with', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    await fetchHomeDashboard()

    expect(mockedRequest).toHaveBeenCalledWith('/api/dashboard/home/')
  })

  it('maps the whole payload to the shapes the screen draws', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    const result = await fetchHomeDashboard()

    expect(result.streakDays).toBe(4)
    expect(result.averageStress).toBe(4.3)
    expect(result.averageEnergy).toBe(5.5)
    expect(result.technique).toEqual({ name: 'Technika 5-4-3-2-1', matchReason: 'Dopasowane.' })
    expect(result.todayEntry).toEqual({
      moodLabel: 'Dobrze',
      emotions: [{ emotion: 'Radość', intensity: 9 }],
    })
  })

  it('keeps null answers null instead of inventing zeroes', async () => {
    // An empty week has nothing to average; 0/10 stress would be a claim we
    // cannot make.
    mockedRequest.mockResolvedValueOnce(
      payload({ today_entry: null, technique: null, average_stress: null, average_energy: null }),
    )

    const result = await fetchHomeDashboard()

    expect(result.todayEntry).toBeNull()
    expect(result.technique).toBeNull()
    expect(result.averageStress).toBeNull()
    expect(result.averageEnergy).toBeNull()
  })
})

describe('the emotion vocabulary is the only thing keeping the two sides in step', () => {
  it('passes through a name it recognises', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ week: week([{ dominant_emotion: 'Spokój' }]) }))

    const result = await fetchHomeDashboard()

    expect(result.week[0].dominantEmotion).toBe('Spokój')
  })

  it('drops a name it has no colour for rather than drawing an invisible bar', async () => {
    // core/emotions.py could grow an emotion that utils/emotions.ts has not; the
    // chart must not render a transparent rectangle over it.
    mockedRequest.mockResolvedValueOnce(payload({ week: week([{ dominant_emotion: 'Ekscytacja' }]) }))

    const result = await fetchHomeDashboard()

    expect(result.week[0].dominantEmotion).toBeNull()
  })

  it('drops an unknown emotion from today\'s list too', async () => {
    mockedRequest.mockResolvedValueOnce(
      payload({
        today_entry: {
          mood_label: 'Źle',
          emotions: [{ emotion: 'Lęk', intensity: 7 }, { emotion: 'Ekscytacja', intensity: 5 }],
        },
      }),
    )

    const result = await fetchHomeDashboard()

    expect(result.todayEntry!.emotions).toEqual([{ emotion: 'Lęk', intensity: 7 }])
  })

  it('handles a day with an entry but no rated emotion', async () => {
    mockedRequest.mockResolvedValueOnce(
      payload({ week: week([{ dominant_emotion: null, intensity: null }]) }),
    )

    const result = await fetchHomeDashboard()

    expect(result.week[0].hasEntry).toBe(true)
    expect(result.week[0].dominantEmotion).toBeNull()
    expect(result.week[0].intensity).toBeNull()
  })
})

describe('weekday labels', () => {
  it('reads the ISO date as a local day, not as UTC midnight', async () => {
    // new Date('2026-08-25') is UTC midnight, which is the 24th for anyone west
    // of Greenwich -- the label would be one day off for half the world.
    mockedRequest.mockResolvedValueOnce(payload({ week: week([{ date: '2026-08-25' }]) }))

    const result = await fetchHomeDashboard()

    // 2026-08-25 is a Tuesday.
    expect(result.week[0].dayLabel).toBe('Wt')
  })

  it.each([
    ['2026-08-23', 'Ndz'],
    ['2026-08-24', 'Pon'],
    ['2026-08-29', 'Sob'],
  ])('labels %s as %s', async (date, label) => {
    mockedRequest.mockResolvedValueOnce(payload({ week: week([{ date }]) }))

    const result = await fetchHomeDashboard()

    expect(result.week[0].dayLabel).toBe(label)
  })

  it('falls back to the raw string for a date it cannot parse', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ week: week([{ date: 'nie-data' }]) }))

    const result = await fetchHomeDashboard()

    expect(result.week[0].dayLabel).toBe('nie-data')
  })
})
