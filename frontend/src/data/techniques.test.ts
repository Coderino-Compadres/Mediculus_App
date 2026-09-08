import { describe, expect, it } from 'vitest'
import { TECHNIQUES } from './techniques'
import { DBT_GROUPS, DBT_MODULE_LABELS, SCHOOL_TABS } from '../utils/techniques'
import type { Technique, TechniqueStep } from '../types/technique'

/**
 * The catalogue's content, checked for the properties a reader depends on.
 *
 * This is transcribed clinical text awaiting review, so nothing here asserts
 * *wording* — a correction from a specialist must not fail a test. What it
 * asserts is the structure the screens read: a row whose slug does not match
 * the shape both halves of the app agree on cannot be opened, a technique
 * tagged with no school appears in no tab, a step with an empty description is
 * a numbered heading over nothing, and a `grupa` outside DBT_GROUPS drops the
 * technique into `ungrouped` — visible, but not where its author put it.
 *
 * `test_techniques.py` compares these ids with `BUILTIN_SLUGS` on the backend;
 * `utils/techniques.test.ts` covers the merge and the tabs. This is the data.
 */

const steps = (technique: Technique): TechniqueStep[] => technique.kroki

describe('every technique', () => {
  it('has a slug of the shape the API also enforces', () => {
    /** The backend refuses anything else on `POST /api/specialist/techniques/`
     *  (`^[a-z0-9]+(-[a-z0-9]+)*$`), and the two halves are merged by slug — so
     *  a built-in id that could not be written through the API would be a shape
     *  only one side of the app can produce. */
    for (const technique of TECHNIQUES) {
      expect(technique.id, technique.nazwa).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(technique.id.length).toBeLessThanOrEqual(64)
    }
  })

  it('has a slug nobody else has', () => {
    /** The merge keeps the built-in half on a collision, so two built-ins
     *  sharing a slug would silently hide one of them from its own URL. */
    const ids = TECHNIQUES.map((technique) => technique.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a name and a one-sentence subtitle', () => {
    for (const technique of TECHNIQUES) {
      expect(technique.nazwa.trim(), technique.id).not.toBe('')
      expect(technique.podtytul.trim(), technique.id).not.toBe('')
    }
  })

  it('is tagged with at least one tab, so it is reachable from the list', () => {
    /** `szkola: []` is a state the type allows and `badgeSchool` has a fallback
     *  for it, but a technique with no tag is in no tab at all — reachable only
     *  by typing its URL. */
    for (const technique of TECHNIQUES) {
      expect(technique.szkola.length, technique.id).toBeGreaterThan(0)
    }
  })

  it('is tagged only with tabs that exist', () => {
    const tabs = SCHOOL_TABS.map((tab) => tab.school)

    for (const technique of TECHNIQUES) {
      for (const school of technique.szkola) {
        expect(tabs, `${technique.id}: ${school}`).toContain(school)
      }
    }
  })

  it('is tagged with each tab once', () => {
    for (const technique of TECHNIQUES) {
      expect(new Set(technique.szkola).size, technique.id).toBe(technique.szkola.length)
    }
  })

  it('carries an introduction and at least one step', () => {
    /** A technique with no steps opens a screen saying "Jak to zrobić" over
     *  nothing, which is what `opisGotowy` exists to prevent — so a row here
     *  that is published has to have the content. */
    for (const technique of TECHNIQUES) {
      expect(technique.wprowadzenie.trim(), technique.id).not.toBe('')
      expect(steps(technique).length, technique.id).toBeGreaterThan(0)
    }
  })

  it('is published — the catalogue ships nothing half-written', () => {
    /** Both gates are read by `isPublished`. A built-in row that failed either
     *  would be in the data and in no tab, which is a state the specialists'
     *  half is for, not this one. */
    for (const technique of TECHNIQUES) {
      expect(technique.opisGotowy, technique.id).toBe(true)
      expect(technique.dostepnosc, technique.id).toBe('ogolna')
    }
  })
})

describe('the DBT tab', () => {
  const dbt = TECHNIQUES.filter((technique) => technique.szkola.includes('dbt'))

  it('has techniques in it', () => {
    expect(dbt.length).toBeGreaterThan(0)
  })

  it('gives every DBT technique one of the four groups', () => {
    /** `grupa` is optional on the type because the other two tabs are flat, but
     *  a DBT technique without one falls into `ungrouped` and is rendered after
     *  the sections — visible, yet not where its author put it. */
    const groups = DBT_GROUPS.map((group) => group.group)

    for (const technique of dbt) {
      expect(groups, technique.id).toContain(technique.grupa)
    }
  })

  it('fills all four groups, so the tab is not one long list', () => {
    for (const { group } of DBT_GROUPS) {
      expect(
        dbt.some((technique) => technique.grupa === group),
        group,
      ).toBe(true)
    }
  })

  it('names a real DBT module wherever it names one', () => {
    /** The module is what the patient's own therapist calls the skill, so a
     *  value with no label renders as a blank line under the heading. */
    for (const technique of TECHNIQUES) {
      if (technique.modulDBT === undefined) continue
      expect(Object.keys(DBT_MODULE_LABELS), technique.id).toContain(technique.modulDBT)
    }
  })
})

describe('every step', () => {
  it('has a description — a step is content, not a heading', () => {
    for (const technique of TECHNIQUES) {
      steps(technique).forEach((step, index) => {
        expect(step.opis.trim(), `${technique.id}[${index}]`).not.toBe('')
      })
    }
  })

  it('has a non-blank name whenever it has one at all', () => {
    /** `nazwa` is optional because a few techniques are bare bullet points in
     *  the source document, and those steps render by their number. An empty
     *  string is a third state that renders as neither. */
    for (const technique of TECHNIQUES) {
      for (const step of steps(technique)) {
        if (step.nazwa === undefined) continue
        expect(step.nazwa.trim(), technique.id).not.toBe('')
      }
    }
  })

  it('has no blank examples in its examples row', () => {
    for (const technique of TECHNIQUES) {
      for (const step of steps(technique)) {
        for (const example of step.przyklady ?? []) {
          expect(example.trim(), technique.id).not.toBe('')
        }
      }
    }
  })

  it('names no step twice inside one technique', () => {
    /** Two steps with the same name read as a transcription slip — one skill
     *  entered twice, or one whose text was pasted over another's. */
    for (const technique of TECHNIQUES) {
      const named = steps(technique)
        .map((step) => step.nazwa)
        .filter((name): name is string => name !== undefined)

      expect(new Set(named).size, technique.id).toBe(named.length)
    }
  })
})

describe('the skills a specialist introduces', () => {
  const flagged = TECHNIQUES.flatMap((technique) =>
    steps(technique)
      .filter((step) => step.wprowadzaSpecjalista)
      .map((step) => ({ technique, step })),
  )

  it('still exist — the flag is not dead data', () => {
    /** TIPP's "Temperatura" is the one: the source material lists medical
     *  contraindications for it and recommends consulting a doctor. If this
     *  count reaches zero, either the step was dropped or the flag was. */
    expect(flagged.length).toBeGreaterThan(0)
  })

  it('carry no instructions at all', () => {
    /** THE SAFETY PROPERTY OF THIS FILE. A step marked this way must never
     *  explain how to do the thing — the app does not know whether the person
     *  reading has a heart condition, and a specialist does. So: no examples
     *  row, and text that says who to ask rather than what to do. See
     *  markdown/techniki-dbt.md, "Do decyzji klienta", point 1. */
    for (const { technique, step } of flagged) {
      expect(step.przyklady, `${technique.id}: ${step.nazwa}`).toBeUndefined()
      expect(step.opis, `${technique.id}: ${step.nazwa}`).toMatch(/specjalist/i)
    }
  })
})
