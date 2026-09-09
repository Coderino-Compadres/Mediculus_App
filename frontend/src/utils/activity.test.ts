import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_DURATION_STEP,
  ACTIVITY_KINDS,
  ACTIVITY_KIND_OTHER,
  FEELING_AFTER_OPTIONS,
  activityKindLabel,
  feelingAfterLabel,
  formatDurationMinutes,
} from './activity'

/**
 * The activity vocabulary.
 *
 * Two things are worth pinning here rather than trusting to review. The first is
 * the chip/"Inne" collapse, because it is the one place on the screen where two
 * controls are one answer — the same shape `placeLabel` has in utils/triggers.ts,
 * and the same failure mode: a screen that reads the two fields separately shows
 * "Inne" where the patient wrote "wspinaczka". The second is the wording of the
 * "samopoczucie po" row, which is a comparison and not a grade.
 */

describe('activityKindLabel', () => {
  it('is the chip when a chip was chosen', () => {
    expect(activityKindLabel('Spacer', '')).toBe('Spacer')
  })

  it('is the free text when "Inne" was chosen — never the word "Inne"', () => {
    expect(activityKindLabel(ACTIVITY_KIND_OTHER, 'Wspinaczka')).toBe('Wspinaczka')
  })

  it('trims what was typed, so stray spaces are not an answer', () => {
    expect(activityKindLabel(ACTIVITY_KIND_OTHER, '  Wspinaczka  ')).toBe('Wspinaczka')
  })

  it('is null for "Inne" with nothing under it — the question went unanswered', () => {
    // Which is a legitimate save: no field on this form blocks one.
    expect(activityKindLabel(ACTIVITY_KIND_OTHER, '')).toBeNull()
    expect(activityKindLabel(ACTIVITY_KIND_OTHER, '   ')).toBeNull()
  })

  it('is null when no chip was pressed at all', () => {
    expect(activityKindLabel(null, '')).toBeNull()
    // Free text left over from a chip that was since deselected is not an answer
    // either — the chip is what decides whether the text counts.
    expect(activityKindLabel(null, 'Wspinaczka')).toBeNull()
  })
})

describe('the chips', () => {
  it('are the six the mockup draws, in its order', () => {
    expect([...ACTIVITY_KINDS]).toEqual(['Spacer', 'Rower', 'Joga', 'Basen', 'Siłownia', 'Taniec'])
  })

  it('do not themselves contain the free-text chip', () => {
    // The screen appends it; keeping it out of the list is what lets the list
    // grow without "Inne" drifting into the middle of the row.
    expect(ACTIVITY_KINDS).not.toContain(ACTIVITY_KIND_OTHER)
  })
})

describe('samopoczucie po', () => {
  it('is a comparison, not a grade — and the third option says "Lepsze"', () => {
    // The mockup labels it "Dobre", which judges the state instead of comparing
    // it with how the person felt before. "Gorsze / Neutralne" are comparative,
    // so the row is levelled to that.
    expect(FEELING_AFTER_OPTIONS.map((option) => option.label)).toEqual([
      'Gorsze',
      'Neutralne',
      'Lepsze',
    ])
  })

  it('starts at "Gorsze" rather than at neutral', () => {
    // The mockup's own design note: for part of this module's patients movement
    // can be a burden, and that answer has to be as easy to reach as the
    // positive one.
    expect(FEELING_AFTER_OPTIONS[0].value).toBe('worse')
  })

  it('says nothing about intensity or effort', () => {
    const labels = FEELING_AFTER_OPTIONS.map((option) => option.label).join(' ')
    expect(labels).not.toMatch(/intensyw|wysił|tempo|trud|łatw/i)
  })

  it('leaves the label out when the question went unanswered', () => {
    expect(feelingAfterLabel(null)).toBeNull()
    expect(feelingAfterLabel(undefined)).toBeNull()
    expect(feelingAfterLabel('better')).toBe('Lepsze')
  })
})

describe('the duration', () => {
  it('moves in five-minute steps, because the answer is an estimate', () => {
    expect(ACTIVITY_DURATION_STEP).toBe(5)
  })

  it('is written with its unit', () => {
    expect(formatDurationMinutes(35)).toBe('35 min')
  })
})
