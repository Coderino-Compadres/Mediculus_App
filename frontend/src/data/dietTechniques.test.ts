import { describe, expect, it } from 'vitest'
import {
  DIET_TECHNIQUES,
  PLACEHOLDER_NOTICE_LIST,
  PLACEHOLDER_NOTICE_TECHNIQUE,
} from './dietTechniques'

/**
 * The catalogue's content, checked for the properties a reader depends on.
 *
 * Nothing here asserts *wording* of a real technique — when the foundation's
 * text lands, a correction from a specialist must not fail a test. What it
 * asserts is the structure the screens read (a row whose slug does not match
 * the shape both catalogues use cannot be opened; a step with an empty
 * description is a numbered marker over nothing) and one property that applies
 * only to the entries that say of themselves that they are unfinished: an entry
 * marked `zastepczy` has to read as a placeholder in every field.
 *
 * **THE PLACEHOLDER BLOCK IS SCOPED BY THE ENTRY, NOT BY A FLAG ON THE MODULE.**
 * It used to hang off `CONTENT_PENDING`, so the first real technique turned the
 * whole block off and left the nine still-unwritten entries unguarded. Now it
 * iterates `zastepczy` entries, which means it covers exactly the entries that
 * need covering, and an entry leaves it by being finished. **Nothing here asks
 * any entry to stay a placeholder**: with no `zastepczy` entries the loops
 * simply have nothing to visit, and that is a pass.
 *
 * **NOTHING HERE COUNTS THE TECHNIQUES.** Ten is not a number this app knows —
 * see `data/dietTechniques.ts` on how the list is meant to grow and shrink.
 */

describe('every technique', () => {
  it('has a slug of the shape the app uses for a technique elsewhere', () => {
    /** The psychotherapy catalogue's slugs match this, and its backend enforces
     *  it (`^[a-z0-9]+(-[a-z0-9]+)*$`). Keeping one shape means a reader of a
     *  URL cannot tell the two apart by accident, and that if this catalogue
     *  ever gets a backend the ids already fit it. */
    for (const technique of DIET_TECHNIQUES) {
      expect(technique.id, technique.nazwa).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(technique.id.length).toBeLessThanOrEqual(64)
    }
  })

  it('has a slug nobody else has', () => {
    /** Two techniques sharing a slug would hide one of them from its own URL:
     *  `findDietTechnique` answers with the first match. */
    const ids = DIET_TECHNIQUES.map((technique) => technique.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has every text field a screen prints', () => {
    /** A blank here is not a missing translation, it is a blank line on the
     *  screen: an unnamed row, a chip with nothing in it, an empty card. */
    for (const technique of DIET_TECHNIQUES) {
      expect(technique.nazwa.trim(), technique.id).not.toBe('')
      expect(technique.czasTrwania.trim(), technique.id).not.toBe('')
      expect(technique.momentZastosowania.trim(), technique.id).not.toBe('')
      expect(technique.wprowadzenie.trim(), technique.id).not.toBe('')
    }
  })

  it('carries at least one step', () => {
    /** A technique with no steps opens a card saying "Kroki" over nothing,
     *  which is what `opisGotowy` exists to prevent — so a row that is
     *  published has to have the content. */
    for (const technique of DIET_TECHNIQUES) {
      expect(technique.kroki.length, technique.id).toBeGreaterThan(0)
    }
  })

  it('is published — the catalogue ships nothing half-written', () => {
    /** Both gates are read by `isPublished` in utils/dietTechniques.ts. An
     *  entry failing either would be in the data and on no screen at all, which
     *  is a state for a technique waiting on a decision, not for the ones that
     *  ship. */
    for (const technique of DIET_TECHNIQUES) {
      expect(technique.opisGotowy, technique.id).toBe(true)
      expect(technique.dostepnosc, technique.id).toBe('ogolna')
    }
  })
})

describe('every step', () => {
  it('has a description — a step is content, not a marker', () => {
    for (const technique of DIET_TECHNIQUES) {
      technique.kroki.forEach((step, index) => {
        expect(step.opis.trim(), `${technique.id}[${index}]`).not.toBe('')
      })
    }
  })

  it('has a non-blank name whenever it has one at all', () => {
    /** `nazwa` is optional because a technique may be written as plain
     *  instructions. An empty string is a third state that renders as an empty
     *  heading above the text. */
    for (const technique of DIET_TECHNIQUES) {
      for (const step of technique.kroki) {
        if (step.nazwa === undefined) continue
        expect(step.nazwa.trim(), technique.id).not.toBe('')
      }
    }
  })

  it('keeps a marker label short enough for the circle it goes in', () => {
    /** `etykieta` replaces the step's number inside a 26px circle. Two
     *  characters is what fits; a word there breaks the row rather than
     *  labelling it. */
    for (const technique of DIET_TECHNIQUES) {
      for (const step of technique.kroki) {
        if (step.etykieta === undefined) continue
        expect(step.etykieta.trim(), technique.id).not.toBe('')
        expect(step.etykieta.length, `${technique.id}: ${step.etykieta}`).toBeLessThanOrEqual(2)
      }
    }
  })

  it('names no step twice inside one technique', () => {
    /** Two steps with the same name read as a transcription slip — and the
     *  name is the list's React key where it exists. */
    for (const technique of DIET_TECHNIQUES) {
      const named = technique.kroki
        .map((step) => step.nazwa)
        .filter((name): name is string => name !== undefined)

      expect(new Set(named).size, technique.id).toBe(named.length)
    }
  })
})

describe('an entry that says it is still a placeholder', () => {
  /**
   * THE SAFETY PROPERTY OF THIS FILE, and the reason it is a test rather than a
   * comment: a placeholder that reads as a real technique is one a patient may
   * try before the foundation has written a word of it. This is a health app
   * used by people with eating disorders, and "Świadome jedzenie — pięć kroków"
   * over invented steps is exactly the failure to prevent.
   *
   * Each `it` visits only the `zastepczy` entries, so an entry retires itself
   * from the block by being written — real content must not have to say
   * "do uzupełnienia" to pass, and the entries beside it keep their guard.
   */
  const PLACEHOLDER_MARK = /uzupełni|uzupełnienia|przygotuje fundacja|miejsce na/i
  const placeholders = () => DIET_TECHNIQUES.filter((technique) => technique.zastepczy)

  it('marks every field a patient can read as a placeholder', () => {
    for (const technique of placeholders()) {
      expect(technique.nazwa, technique.id).toMatch(PLACEHOLDER_MARK)
      expect(technique.czasTrwania, technique.id).toMatch(PLACEHOLDER_MARK)
      expect(technique.momentZastosowania, technique.id).toMatch(PLACEHOLDER_MARK)
      expect(technique.wprowadzenie, technique.id).toMatch(PLACEHOLDER_MARK)
      for (const step of technique.kroki) {
        expect(step.opis, technique.id).toMatch(PLACEHOLDER_MARK)
        if (step.nazwa !== undefined) expect(step.nazwa, technique.id).toMatch(PLACEHOLDER_MARK)
      }
    }
  })

  it('borrows no name from the mockup\'s list', () => {
    /** A real name over a placeholder description looks like content missing
     *  only its details, which is worse than an obviously empty slot. These
     *  nine are what §12 draws. */
    const FROM_THE_MOCKUP = [
      'skala głodu', 'HALT', 'świadome jedzenie', 'odroczenia impulsu',
      'analiza wyzwalaczy', 'alternatywnych zachowań', 'samowspółczucia',
      'akceptacji emocji', 'napadów objadania',
    ]

    for (const technique of placeholders()) {
      const text = `${technique.nazwa} ${technique.wprowadzenie}`

      for (const name of FROM_THE_MOCKUP) {
        expect(text.toLowerCase(), technique.id).not.toContain(name.toLowerCase())
      }
    }
  })

  it('says on both screens that the content is coming, and who writes it', () => {
    /** The only wording this file pins, and it pins one stem: *who* is writing
     *  the content is the whole point of the sentence. Everything else about it
     *  is copy and may be reworded freely. */
    for (const notice of [PLACEHOLDER_NOTICE_LIST, PLACEHOLDER_NOTICE_TECHNIQUE]) {
      expect(notice.trim()).not.toBe('')
      expect(notice).toMatch(/fundacj/i)
    }
  })

  it('counts nothing that is eaten', () => {
    /** The rule the whole module is built on (CLAUDE.md §3): qualitative only.
     *  A placeholder is the easiest place for a gram or a calorie to slip in. */
    for (const technique of placeholders()) {
      const text = [
        technique.nazwa, technique.wprowadzenie,
        ...technique.kroki.map((step) => step.opis),
      ].join(' ')

      expect(text, technique.id).not.toMatch(/kcal|kalori|białk|tłuszcz|węglowodan|gram|porcj/i)
    }
  })
})
