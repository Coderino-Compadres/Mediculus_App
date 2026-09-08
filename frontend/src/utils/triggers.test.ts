import { describe, expect, it } from 'vitest'
import { OTHER_TRIGGER, TRIGGER_OPTIONS, placeLabel } from './triggers'
import type { SituationReaction } from '../types/diaryEntry'

/**
 * The chip and its "Inne" free text are two inputs on the form and one column
 * on the wire (`situation_place`), so every screen showing a place has to unpack
 * them the same way. This function is that one definition — it was copied into
 * Journals.tsx and JournalDetail.tsx before it existed, which is how a report
 * could count places differently from the way the diary displayed them.
 */

function reaction(overrides: Partial<SituationReaction> = {}): SituationReaction {
  return {
    trigger: null,
    triggerOther: '',
    situation: '',
    emotionNote: '',
    thought: '',
    behavior: '',
    ...overrides,
  }
}

describe('the chip list', () => {
  it('offers "Inne" last, so the free-text option is not read as a place', () => {
    expect(TRIGGER_OPTIONS.at(-1)).toBe(OTHER_TRIGGER)
  })

  it('has no duplicates — a repeated chip is two answers meaning one thing', () => {
    expect(new Set(TRIGGER_OPTIONS).size).toBe(TRIGGER_OPTIONS.length)
  })
})

describe('placeLabel', () => {
  it('shows the chip as chosen', () => {
    expect(placeLabel(reaction({ trigger: 'Dom' }))).toBe('Dom')
  })

  it('shows the free text instead of the word "Inne"', () => {
    /** 'Inne' is a bucket, not a place: printing it would tell a specialist
     *  reading the entry less than the patient actually wrote. */
    expect(placeLabel(reaction({ trigger: OTHER_TRIGGER, triggerOther: 'U babci' })))
      .toBe('U babci')
  })

  it('trims what was typed, so a stray space is not a place', () => {
    expect(placeLabel(reaction({ trigger: OTHER_TRIGGER, triggerOther: '  U babci  ' })))
      .toBe('U babci')
  })

  it('answers null for "Inne" with nothing behind it', () => {
    /** The chip alone is not an answer, and the screens leave the line out
     *  rather than printing an empty one. */
    for (const typed of ['', '   ', '\n']) {
      expect(placeLabel(reaction({ trigger: OTHER_TRIGGER, triggerOther: typed }))).toBeNull()
    }
  })

  it('answers null for an unanswered question', () => {
    expect(placeLabel(reaction())).toBeNull()
  })

  it('keeps the free text out of the way when a real chip is chosen', () => {
    /** The form keeps both fields in one state, so text typed under "Inne" and
     *  then abandoned for a chip is still there — and must not win. */
    expect(placeLabel(reaction({ trigger: 'Praca', triggerOther: 'U babci' }))).toBe('Praca')
  })
})
