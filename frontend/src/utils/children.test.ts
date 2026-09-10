import { describe, expect, it } from 'vitest'
import {
  childLabel,
  entryDateLabel,
  lastEntryLabel,
  linkedSinceLabel,
  showsStreak,
  waitingLabel,
} from './children'

const TODAY = new Date(2026, 8, 2) // 2 września 2026, lokalna północ

describe('lastEntryLabel', () => {
  it('says "dzisiaj" for an entry written today', () => {
    expect(lastEntryLabel('2026-09-02', TODAY)).toBe('dzisiaj')
  })

  it('says "wczoraj" rather than "1 dzień temu"', () => {
    expect(lastEntryLabel('2026-09-01', TODAY)).toBe('wczoraj')
  })

  it('counts days with the right Polish genitive', () => {
    /** The card is read for reassurance; "3 dni temu" is the sentence a person
     *  would say, where a bare date makes them count. */
    expect(lastEntryLabel('2026-08-30', TODAY)).toBe('3 dni temu')
    expect(lastEntryLabel('2026-08-28', TODAY)).toBe('5 dni temu')
    expect(lastEntryLabel('2026-08-11', TODAY)).toBe('22 dni temu')
  })

  it('is null when nothing has been written', () => {
    expect(lastEntryLabel(null, TODAY)).toBeNull()
  })

  it('does not tell a guardian their child wrote an entry tomorrow', () => {
    /** A clock skewed between the server and the phone is enough to produce a
     *  future date, and "-1 dni temu" on this card would be alarming nonsense. */
    expect(lastEntryLabel('2026-09-05', TODAY)).toBe('dzisiaj')
  })

  it('counts calendar days, not 24-hour spans', () => {
    /** The backend answers in Europe/Warsaw calendar days (core/days.py) and
     *  this has to agree, or an evening entry reads as a day older than the
     *  streak beside it says. */
    expect(lastEntryLabel('2026-08-31', TODAY)).toBe('2 dni temu')
  })

  it('survives a malformed date rather than rendering "Invalid Date"', () => {
    expect(lastEntryLabel('nie-data', TODAY)).toBeNull()
  })
})

describe('linkedSinceLabel', () => {
  it('renders the day the guardian accepted, with its year', () => {
    expect(linkedSinceLabel('2026-08-12T09:31:02Z')).toBe('12 sierpnia 2026')
  })

  it('is null for a link with no recorded moment', () => {
    expect(linkedSinceLabel(null)).toBeNull()
    expect(linkedSinceLabel('nie-data')).toBeNull()
  })
})

describe('entryDateLabel', () => {
  it('spells the date out for the tooltip behind "3 dni temu"', () => {
    expect(entryDateLabel('2026-08-30')).toBe('30 sierpnia 2026')
  })

  it('is null when there is no entry', () => {
    expect(entryDateLabel(null)).toBeNull()
  })
})

describe('childLabel', () => {
  const child = { childName: 'Ola', childSurname: 'Testowa', childEmail: 'ola@wp.pl' }

  it('prefers the name', () => {
    expect(childLabel(child)).toBe('Ola Testowa')
  })

  it('falls back to the address, which the child typed themselves', () => {
    expect(childLabel({ ...child, childName: null, childSurname: null })).toBe('ola@wp.pl')
  })

  it('never returns an empty label', () => {
    /** A guardian with two children and one unnamed card cannot tell which is
     *  which, which is worse than a generic word. */
    expect(childLabel({ childName: null, childSurname: null, childEmail: null }))
      .toBe('Konto dziecka')
    expect(childLabel({ childName: '  ', childSurname: '', childEmail: '  ' }))
      .toBe('Konto dziecka')
  })

  it('copes with only one half of the name', () => {
    expect(childLabel({ ...child, childSurname: null })).toBe('Ola')
  })
})

describe('showsStreak', () => {
  it('hides a run of one — that is an entry, already reported next to it', () => {
    expect(showsStreak(0)).toBe(false)
    expect(showsStreak(1)).toBe(false)
  })

  it('shows a real run', () => {
    expect(showsStreak(2)).toBe(true)
    expect(showsStreak(11)).toBe(true)
  })
})


describe('waitingLabel', () => {
  /**
   * What the header says when a child is waiting — the only place in the app
   * that says it away from the card itself, because a minor's account is
   * blocked until the request is answered and nothing can notify anybody out of
   * band.
   */
  it('declines both the noun and the verb', () => {
    expect(waitingLabel(1)).toBe('1 prośba oczekuje na odpowiedź')
    expect(waitingLabel(2)).toBe('2 prośby oczekują na odpowiedź')
    expect(waitingLabel(4)).toBe('4 prośby oczekują na odpowiedź')
    expect(waitingLabel(5)).toBe('5 prośb oczekuje na odpowiedź')
  })

  it('gets the teens right, which is where the 2-4 rule stops applying', () => {
    // 12, 13 and 14 take the genitive despite ending in 2-4 — the trap
    // `pluralGlasses` documents on the other side of the app.
    expect(waitingLabel(12)).toBe('12 prośb oczekuje na odpowiedź')
    expect(waitingLabel(14)).toBe('14 prośb oczekuje na odpowiedź')
    expect(waitingLabel(22)).toBe('22 prośby oczekują na odpowiedź')
  })
})
