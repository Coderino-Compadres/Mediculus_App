import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchJournalEntries, fetchJournalEntry, fetchTodayEntry, saveTodayEntry } from './diary'
import type { DiaryEntryDraft } from '../types/diaryEntry'
import { OTHER_TRIGGER } from '../utils/triggers'
import { ApiError } from './client'

// Keep the real module and swap only the network call: ApiError is a real class
// the tests construct, and a wholesale replacement would strip it.
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./client')>()),
  apiRequest: vi.fn(),
}))
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

/** A payload shaped exactly like core.diary.serialize_entry returns it. */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e0000000-0000-0000-0000-000000000100',
    date: '2026-08-25',
    saved_at: '2026-08-25T21:42:00+02:00',
    mood: 'good',
    emotions: [{ emotion: 'Lęk', intensity: 7 }],
    energy_level: 5,
    tension_level: 3,
    situation_place: 'Praca',
    situation: 'Rozmowa.',
    emotion_note: 'Ucisk.',
    thought: 'Nie dam rady.',
    how_situation_handled: 'Spacer.',
    notes: 'Notatka.',
    risky_behavior_note: null,
    ...overrides,
  }
}

function draft(overrides: Partial<DiaryEntryDraft> = {}): DiaryEntryDraft {
  return {
    date: '2026-08-25',
    mood: 'good',
    emotions: [{ emotion: 'Lęk', intensity: 7 }],
    energyLevel: 5,
    tensionLevel: 3,
    situationReaction: {
      trigger: 'Praca',
      triggerOther: '',
      situation: 'Rozmowa.',
      emotionNote: 'Ucisk.',
      thought: 'Nie dam rady.',
      behavior: 'Spacer.',
    },
    notes: 'Notatka.',
    hasRiskyBehavior: false,
    riskyBehaviorNote: '',
    ...overrides,
  }
}

/** What toPayload produced for a given draft. */
async function sentBody(input: DiaryEntryDraft) {
  mockedRequest.mockResolvedValueOnce(payload())
  await saveTodayEntry(input)
  return mockedRequest.mock.calls.at(-1)![1]!.body as Record<string, unknown>
}

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('fetchTodayEntry', () => {
  it('asks only for today — there is no entry id on the wire', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    await fetchTodayEntry()

    expect(mockedRequest).toHaveBeenCalledWith('/api/diary/today/')
  })

  it('answers null before the first save of the day rather than throwing', async () => {
    mockedRequest.mockResolvedValueOnce(null)

    await expect(fetchTodayEntry()).resolves.toBeNull()
  })

  it('turns snake_case columns into the camelCase the form edits', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    const result = await fetchTodayEntry()

    expect(result).toEqual(draft())
  })

  it('turns every null text into the empty string an input needs', async () => {
    mockedRequest.mockResolvedValueOnce(
      payload({ situation: null, emotion_note: null, thought: null, how_situation_handled: null, notes: null }),
    )

    const result = await fetchTodayEntry()

    expect(result!.situationReaction.situation).toBe('')
    expect(result!.situationReaction.emotionNote).toBe('')
    expect(result!.notes).toBe('')
  })

  it('keeps an emotion the entry never rated out of the picker', async () => {
    // The API sends only rated emotions, which is what lets the chips redraw as
    // they were left rather than as ten zeroes.
    mockedRequest.mockResolvedValueOnce(payload({ emotions: [] }))

    const result = await fetchTodayEntry()

    expect(result!.emotions).toEqual([])
  })

  it('preserves an intensity of 0 — rated-as-nothing is an answer', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ emotions: [{ emotion: 'Smutek', intensity: 0 }] }))

    const result = await fetchTodayEntry()

    expect(result!.emotions).toEqual([{ emotion: 'Smutek', intensity: 0 }])
  })
})

describe('the trigger chip and its free-text twin share one column', () => {
  it('reads a suggested place back onto its chip', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ situation_place: 'Szkoła' }))

    const result = await fetchTodayEntry()

    expect(result!.situationReaction.trigger).toBe('Szkoła')
    expect(result!.situationReaction.triggerOther).toBe('')
  })

  it('reads anything else back into the "Inne" box', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ situation_place: 'U babci na działce' }))

    const result = await fetchTodayEntry()

    expect(result!.situationReaction.trigger).toBe(OTHER_TRIGGER)
    expect(result!.situationReaction.triggerOther).toBe('U babci na działce')
  })

  it('reads a missing place as no chip at all', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ situation_place: null }))

    const result = await fetchTodayEntry()

    expect(result!.situationReaction.trigger).toBeNull()
    expect(result!.situationReaction.triggerOther).toBe('')
  })

  it('sends the typed text, not the word "Inne", which is only a prompt', async () => {
    const body = await sentBody(
      draft({
        situationReaction: { ...draft().situationReaction, trigger: OTHER_TRIGGER, triggerOther: 'Dworzec' },
      }),
    )

    expect(body.situation_place).toBe('Dworzec')
  })

  it('sends null when "Inne" was picked and nothing typed', async () => {
    const body = await sentBody(
      draft({
        situationReaction: { ...draft().situationReaction, trigger: OTHER_TRIGGER, triggerOther: '  ' },
      }),
    )

    expect(body.situation_place).toBeNull()
  })

  it('round-trips a custom place through save and load unchanged', async () => {
    const custom = 'U babci na działce'
    const body = await sentBody(
      draft({
        situationReaction: { ...draft().situationReaction, trigger: OTHER_TRIGGER, triggerOther: custom },
      }),
    )
    mockedRequest.mockResolvedValueOnce(payload({ situation_place: body.situation_place }))

    const back = await fetchTodayEntry()

    expect(back!.situationReaction.trigger).toBe(OTHER_TRIGGER)
    expect(back!.situationReaction.triggerOther).toBe(custom)
  })
})

describe('pora dnia — when the situation happened, not when it was written', () => {
  it('reads one of the four values back onto its chip', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ time_of_day: 'evening' }))

    expect((await fetchTodayEntry())?.timeOfDay).toBe('evening')
  })

  it('ignores a value that is not one of the four, rather than drawing no chip for it', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ time_of_day: 'popoludnie' }))

    expect((await fetchTodayEntry())?.timeOfDay).toBeUndefined()
  })

  it('survives the field being absent, which is what the backend sends today', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    expect((await fetchTodayEntry())?.timeOfDay).toBeUndefined()
  })

  it('sends the chosen value', async () => {
    expect(await sentBody(draft({ timeOfDay: 'morning' }))).toMatchObject({ time_of_day: 'morning' })
  })

  it('sends null when the question went unanswered — the field is optional', async () => {
    expect((await sentBody(draft())).time_of_day).toBeNull()
  })

  it('is not saved_at — an archive row carries both, and they can disagree', async () => {
    // A morning episode written up at night: the whole reason this is a field
    // the patient fills in rather than a timestamp the server takes.
    mockedRequest.mockResolvedValueOnce([
      payload({ saved_at: '2026-08-25T22:10:00+02:00', time_of_day: 'morning' }),
    ])

    const [entry] = await fetchJournalEntries()

    expect(entry.timeOfDay).toBe('morning')
    expect(entry.savedAt).toBe('2026-08-25T22:10:00+02:00')
  })
})

describe('the risky-behaviour flag lives in the note, because the column is all there is', () => {
  it('reads a note as the flag being on', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ risky_behavior_note: 'Alkohol wieczorem.' }))

    const result = await fetchTodayEntry()

    expect(result!.hasRiskyBehavior).toBe(true)
    expect(result!.riskyBehaviorNote).toBe('Alkohol wieczorem.')
  })

  it('reads NULL as the flag being off', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ risky_behavior_note: null }))

    const result = await fetchTodayEntry()

    expect(result!.hasRiskyBehavior).toBe(false)
    expect(result!.riskyBehaviorNote).toBe('')
  })

  it('sends null when the flag is off, even if text is left over in state', async () => {
    const body = await sentBody(draft({ hasRiskyBehavior: false, riskyBehaviorNote: 'stary tekst' }))

    expect(body.risky_behavior_note).toBeNull()
  })

  it('sends the note when the flag is on', async () => {
    const body = await sentBody(draft({ hasRiskyBehavior: true, riskyBehaviorNote: 'Alkohol.' }))

    expect(body.risky_behavior_note).toBe('Alkohol.')
  })
})

describe('saveTodayEntry', () => {
  it('uses PUT — saving twice must leave one entry, not two', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    await saveTodayEntry(draft())

    expect(mockedRequest.mock.calls[0][0]).toBe('/api/diary/today/')
    expect(mockedRequest.mock.calls[0][1]!.method).toBe('PUT')
  })

  it('trims free text and sends a blank box as null', async () => {
    const body = await sentBody(
      draft({
        notes: '   ',
        situationReaction: { ...draft().situationReaction, situation: '  Coś  ', thought: '' },
      }),
    )

    expect(body.notes).toBeNull()
    expect(body.situation).toBe('Coś')
    expect(body.thought).toBeNull()
  })

  it('sends the whole draft every time — an omitted field would mean "unchanged"', async () => {
    // The endpoint replaces rather than merges, so a cleared answer has to
    // travel as a cleared field, not a missing one.
    const body = await sentBody(draft({ energyLevel: null, tensionLevel: null, mood: null }))

    expect(Object.keys(body).sort()).toEqual([
      'emotion_note', 'emotions', 'energy_level', 'how_situation_handled', 'mood',
      'notes', 'risky_behavior_note', 'situation', 'situation_place', 'tension_level', 'thought',
      'time_of_day',
    ])
    expect(body.energy_level).toBeNull()
    expect(body.mood).toBeNull()
  })

  it('sends an emotion with no intensity as 0 rather than dropping it', async () => {
    const body = await sentBody(draft({ emotions: [{ emotion: 'Wstyd', intensity: null }] }))

    expect(body.emotions).toEqual([{ emotion: 'Wstyd', intensity: 0 }])
  })

  it('returns the server\'s version of the entry, not the draft it was given', async () => {
    mockedRequest.mockResolvedValueOnce(payload({ notes: 'Znormalizowane przez serwer.' }))

    const result = await saveTodayEntry(draft({ notes: 'cokolwiek' }))

    expect(result.notes).toBe('Znormalizowane przez serwer.')
  })
})

describe('the history list', () => {
  it('reads the collection, which is the only diary URL without a day in it', async () => {
    mockedRequest.mockResolvedValueOnce([])

    await fetchJournalEntries()

    expect(mockedRequest).toHaveBeenCalledWith('/api/diary/')
  })

  it('is empty for a patient who has written nothing, rather than failing', async () => {
    mockedRequest.mockResolvedValueOnce([])

    await expect(fetchJournalEntries()).resolves.toEqual([])
  })

  it('carries the id and the save time the archive needs on top of the draft', async () => {
    mockedRequest.mockResolvedValueOnce([payload()])

    const [entry] = await fetchJournalEntries()

    expect(entry.id).toBe('e0000000-0000-0000-0000-000000000100')
    expect(entry.savedAt).toBe('2026-08-25T21:42:00+02:00')
    expect(entry.mood).toBe('good')
    expect(entry.situationReaction.situation).toBe('Rozmowa.')
  })

  it('keeps the order the server sent — newest first is the API\'s decision', async () => {
    mockedRequest.mockResolvedValueOnce([
      payload({ id: 'nowszy', date: '2026-08-25' }),
      payload({ id: 'starszy', date: '2026-08-20' }),
    ])

    const entries = await fetchJournalEntries()

    expect(entries.map((e) => e.id)).toEqual(['nowszy', 'starszy'])
  })

  it('applies the same mapping as a single entry, including the trigger split', async () => {
    mockedRequest.mockResolvedValueOnce([payload({ situation_place: 'U babci na działce' })])

    const [entry] = await fetchJournalEntries()

    expect(entry.situationReaction.trigger).toBe(OTHER_TRIGGER)
    expect(entry.situationReaction.triggerOther).toBe('U babci na działce')
  })

  it('derives the risky-behaviour flag per entry', async () => {
    mockedRequest.mockResolvedValueOnce([
      payload({ id: 'a', risky_behavior_note: 'Alkohol.' }),
      payload({ id: 'b', risky_behavior_note: null }),
    ])

    const [flagged, plain] = await fetchJournalEntries()

    expect(flagged.hasRiskyBehavior).toBe(true)
    expect(plain.hasRiskyBehavior).toBe(false)
  })
})

describe('one entry by id', () => {
  it('addresses it under the collection', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    await fetchJournalEntry('e0000000-0000-0000-0000-000000000100')

    expect(mockedRequest).toHaveBeenCalledWith('/api/diary/e0000000-0000-0000-0000-000000000100/')
  })

  it('escapes an id rather than pasting it into the path', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    await fetchJournalEntry('a/../b')

    expect(mockedRequest).toHaveBeenCalledWith('/api/diary/a%2F..%2Fb/')
  })

  it('maps it exactly like a list row', async () => {
    mockedRequest.mockResolvedValueOnce(payload())

    const entry = await fetchJournalEntry('e0000000-0000-0000-0000-000000000100')

    mockedRequest.mockResolvedValueOnce([payload()])
    const [fromList] = await fetchJournalEntries()
    expect(entry).toEqual(fromList)
  })

  it('lets a 404 through — the caller decides what "not found" looks like', async () => {
    mockedRequest.mockRejectedValueOnce(new ApiError(404, 'Nie znaleziono tego wpisu.'))

    await expect(fetchJournalEntry('brak')).rejects.toBeInstanceOf(ApiError)
  })
})
