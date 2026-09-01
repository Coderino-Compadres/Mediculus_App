import { describe, expect, it, vi } from 'vitest'
import type { Technique, TechniqueSchool } from '../types/technique'

/**
 * The catalogue's rules, on synthetic data.
 *
 * Every one of these covers a state the real catalogue does not contain today
 * but the type allows — a technique with two school tags, one with no group, one
 * flagged for a specialist. That is the point: they are what happens the first
 * time somebody adds a technique, and the screens' own tests cannot reach them
 * without inventing content in `data/techniques.ts`.
 */

const TECHNIQUES: Technique[] = vi.hoisted(() => [])

vi.mock('../data/techniques', () => ({ TECHNIQUES }))

const {
  DEFAULT_SCHOOL,
  badgeSchool,
  findTechnique,
  groupedTechniques,
  isTechniqueSchool,
  techniquesForSchool,
  techniquesListPath,
} = await import('./techniques')

function technique(overrides: Partial<Technique> = {}): Technique {
  return {
    id: 'technika',
    nazwa: 'Technika',
    podtytul: 'Jedno zdanie.',
    szkola: ['dbt'],
    grupa: 'kryzys',
    dostepnosc: 'ogolna',
    wprowadzenie: 'Wprowadzenie.',
    kroki: [{ opis: 'Krok.' }],
    opisGotowy: true,
    ...overrides,
  }
}

/** Replaces the mocked catalogue for one test. */
function catalogue(...techniques: Technique[]) {
  TECHNIQUES.length = 0
  TECHNIQUES.push(...techniques)
}

describe('which techniques the catalogue publishes', () => {
  it('lists a ready, generally available technique in every tab it is tagged with', () => {
    catalogue(technique({ id: 'oddech', szkola: ['dbt', 'relaksacyjne'] }))

    expect(techniquesForSchool('dbt').map((entry) => entry.id)).toEqual(['oddech'])
    expect(techniquesForSchool('relaksacyjne').map((entry) => entry.id)).toEqual(['oddech'])
    expect(techniquesForSchool('cbt')).toEqual([])
  })

  it('withholds a technique whose description has not arrived', () => {
    catalogue(technique({ id: 'bez-opisu', opisGotowy: false }))

    expect(techniquesForSchool('dbt')).toEqual([])
    expect(findTechnique('bez-opisu')).toBeUndefined()
  })

  /** The safety flag has to withhold, or setting it later would silently do nothing. */
  it('withholds a technique a specialist has to introduce, by URL as well as in the list', () => {
    catalogue(technique({ id: 'temperatura', dostepnosc: 'wymagaSpecjalisty' }))

    expect(techniquesForSchool('dbt')).toEqual([])
    expect(findTechnique('temperatura')).toBeUndefined()
  })

  it('finds a published technique by id', () => {
    catalogue(technique({ id: 'tipp' }))

    expect(findTechnique('tipp')?.id).toBe('tipp')
    expect(findTechnique('nie-ma-takiej')).toBeUndefined()
    expect(findTechnique(undefined)).toBeUndefined()
  })
})

describe('grouping the DBT tab', () => {
  it('orders the sections by time horizon and drops the empty ones', () => {
    const list = [
      technique({ id: 'dobrowolnosc', grupa: 'akceptacja' }),
      technique({ id: 'accepts', grupa: 'kryzys' }),
      technique({ id: 'please', grupa: 'odpornosc' }),
    ]

    const { sections, ungrouped } = groupedTechniques(list)

    expect(sections.map((section) => section.group)).toEqual(['kryzys', 'odpornosc', 'akceptacja'])
    expect(ungrouped).toEqual([])
  })

  /** The failure this exists to prevent: a technique rendered by nothing at all. */
  it('hands back a technique with no group instead of dropping it', () => {
    const withGroup = technique({ id: 'accepts', grupa: 'kryzys' })
    const withoutGroup = technique({ id: 'radykalna-akceptacja', grupa: undefined })

    const { sections, ungrouped } = groupedTechniques([withGroup, withoutGroup])

    expect(ungrouped).toEqual([withoutGroup])
    // Nothing is lost and nothing is counted twice: what the screen renders adds
    // up to what it was given, which is also what the tab chip counts.
    expect(sections.flatMap((section) => section.techniques).length + ungrouped.length).toBe(2)
  })

  it('keeps two techniques that share a group in declaration order', () => {
    const first = technique({ id: 'accepts' })
    const second = technique({ id: 'tipp' })

    expect(groupedTechniques([first, second]).sections[0].techniques).toEqual([first, second])
  })
})

describe('which badge a technique wears', () => {
  it('wears the badge of the tab it is read in when it is tagged with several', () => {
    const dual = technique({ szkola: ['dbt', 'relaksacyjne'] })

    expect(badgeSchool(dual, 'relaksacyjne')).toBe('relaksacyjne')
    expect(badgeSchool(dual, 'dbt')).toBe('dbt')
  })

  it('falls back to its first tag when the tab is unknown or does not apply', () => {
    const relaxation = technique({ szkola: ['relaksacyjne'] })

    expect(badgeSchool(relaxation)).toBe('relaksacyjne')
    // Asked for a tab this technique is not in — the row still has to say something.
    expect(badgeSchool(relaxation, 'dbt')).toBe('relaksacyjne')
  })

  it('falls back to the default tab rather than to undefined when nothing is tagged', () => {
    // `szkola: []` is a state the type permits; `[0]` there reached the screen
    // as an empty badge and a `?szkola=undefined` back link.
    expect(badgeSchool(technique({ szkola: [] }))).toBe(DEFAULT_SCHOOL)
  })
})

describe('the tab in the address', () => {
  it('leaves the default tab out of the URL, so one screen has one address', () => {
    expect(techniquesListPath(DEFAULT_SCHOOL)).toBe('/techniques')
    expect(techniquesListPath('relaksacyjne')).toBe('/techniques?szkola=relaksacyjne')
  })

  it('accepts only the three schools', () => {
    for (const school of ['dbt', 'cbt', 'relaksacyjne'] satisfies TechniqueSchool[]) {
      expect(isTechniqueSchool(school)).toBe(true)
    }
    expect(isTechniqueSchool('cokolwiek')).toBe(false)
    expect(isTechniqueSchool(null)).toBe(false)
  })
})
