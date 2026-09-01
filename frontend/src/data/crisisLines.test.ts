import { describe, expect, it } from 'vitest'
import {
  ADULT_SUPPORT_LINE,
  CRISIS_LINES,
  YOUTH_SUPPORT_LINE,
  crisisSupportLine,
} from './crisisLines'

/**
 * Invariants over the published numbers themselves.
 *
 * Data tests, not render tests, and they exist because the screens cannot see
 * this class of error: a row whose `dial` and `display` disagree renders
 * perfectly — the right number on screen, a different one dialled — and every
 * DOM assertion in the suite still passes. Changing one digit of a `dial` was
 * caught by nothing at all before this file existed.
 */
describe('CRISIS_LINES — the numbers themselves', () => {
  it('dials exactly the number it displays', () => {
    /** `display` is grouped for reading ('800 70 2222'), `dial` is what goes in
     *  the href — so the only legal difference between the two is spacing. */
    for (const line of CRISIS_LINES) {
      expect(line.number.dial, `${line.name}`).toBe(line.number.display.replace(/\s/g, ''))
    }
  })

  it('carries nothing in a dial string that a handset would choke on', () => {
    for (const line of CRISIS_LINES) {
      expect(line.number.dial, `${line.name}`).toMatch(/^\+?\d+$/)
    }
  })

  it('gives every line a distinct id, since the list is keyed on it', () => {
    const ids = CRISIS_LINES.map((line) => line.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('says of every line who it is for and what it costs', () => {
    /** A row with a blank audience is a number nobody can tell is theirs. */
    for (const line of CRISIS_LINES) {
      expect(line.name.trim(), `${line.id}`).not.toBe('')
      expect(line.audience.trim(), `${line.id}`).not.toBe('')
      expect(line.availability.trim(), `${line.id}`).not.toBe('')
    }
  })

  it('holds exactly one emergency number, and it is 112', () => {
    /** Emergency services are not a helpline. More than one row claiming to be
     *  one would blur a distinction the whole panel is built on. */
    const emergency = CRISIS_LINES.filter((line) => line.isEmergency)
    expect(emergency).toHaveLength(1)
    expect(emergency[0].number.dial).toBe('112')
  })

  it('publishes at least one line for under-18s, who have accounts here', () => {
    expect(CRISIS_LINES.filter((line) => line.forYouth).length).toBeGreaterThan(0)
  })
})

describe('crisisSupportLine — which line the home banner names', () => {
  it('sends a minor to a line published for under-18s', () => {
    const line = crisisSupportLine(true)
    expect(line).toBe(YOUTH_SUPPORT_LINE)
    expect(line.forYouth).toBe(true)
  })

  it('sends an adult to the adult line', () => {
    expect(crisisSupportLine(false)).toBe(ADULT_SUPPORT_LINE)
  })

  it('reads an unknown age as an adult, exactly like needsGuardianLink does', () => {
    /** `is_child` is nullable and the rest of the app reads NULL as "not a
     *  minor" (src/api/auth.ts). Reading it the other way here would make two
     *  definitions of the same question disagree. */
    expect(crisisSupportLine(null)).toBe(ADULT_SUPPORT_LINE)
  })

  it('never names the emergency number, and never one the plan does not list', () => {
    /** The banner fires on a week of raised stress, which is not an emergency.
     *  And a number reachable from the banner but absent from the screen it
     *  links to would be a second, unmaintained copy by another name. */
    for (const isChild of [true, false, null]) {
      const line = crisisSupportLine(isChild)
      expect(line.isEmergency).toBe(false)
      expect(CRISIS_LINES).toContain(line)
    }
  })
})
