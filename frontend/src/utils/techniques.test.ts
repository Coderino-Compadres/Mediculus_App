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

/**
 * The two halves of the catalogue: the techniques the app ships with
 * (`data/techniques.ts`, mocked above) and the ones specialists wrote, which
 * arrive from /api/techniques/ and are passed in as an argument.
 *
 * The argument is optional everywhere on purpose — a screen that has not loaded
 * them, or a test that does not care, behaves exactly as it did before the
 * specialist panel existed. Every test above this block relies on that.
 */
describe('techniques a specialist added', () => {
  it('appear in their school’s tab alongside the built-in ones', () => {
    catalogue(technique({ id: 'tipp', nazwa: 'TIPP' }))
    const stored = [technique({ id: 'radykalna-akceptacja', nazwa: 'Radykalna akceptacja' })]

    expect(techniquesForSchool('dbt', stored).map((entry) => entry.id)).toEqual([
      // Built-in first: it is the reviewed material, and a technique added last
      // week should not push TIPP down the crisis section.
      'tipp',
      'radykalna-akceptacja',
    ])
  })

  it('land in their DBT group like any other technique', () => {
    catalogue()
    const stored = [technique({ id: 'nowa', grupa: 'akceptacja' })]

    const { sections, ungrouped } = groupedTechniques(techniquesForSchool('dbt', stored))

    expect(sections.map((section) => section.group)).toEqual(['akceptacja'])
    expect(ungrouped).toEqual([])
  })

  it('open from their own URL', () => {
    catalogue()
    const stored = [technique({ id: 'nowa' })]

    expect(findTechnique('nowa', stored)?.id).toBe('nowa')
  })

  it('are withheld while they are still drafts', () => {
    // `opisGotowy: false` is a technique whose name exists before its content.
    // The same gate as the built-in half, applied in one place, so a draft is
    // missing from the tab *and* from its own URL.
    catalogue()
    const stored = [technique({ id: 'szkic', opisGotowy: false })]

    expect(techniquesForSchool('dbt', stored)).toEqual([])
    expect(findTechnique('szkic', stored)).toBeUndefined()
  })

  it('are withheld when flagged as needing a specialist present', () => {
    catalogue()
    const stored = [technique({ id: 'tipp-temperatura', dostepnosc: 'wymagaSpecjalisty' })]

    expect(techniquesForSchool('dbt', stored)).toEqual([])
    expect(findTechnique('tipp-temperatura', stored)).toBeUndefined()
  })

  it('never shadow a built-in technique that claims the same slug', () => {
    // The backend refuses to write a BUILTIN_SLUGS collision, so this is a
    // backstop for the case the two lists drift — and it fails towards the
    // reviewed text rather than towards whichever half is read first.
    catalogue(technique({ id: 'tipp', nazwa: 'TIPP (katalog)' }))
    const stored = [technique({ id: 'tipp', nazwa: 'TIPP (specjalista)' })]

    expect(techniquesForSchool('dbt', stored)).toHaveLength(1)
    expect(findTechnique('tipp', stored)?.nazwa).toBe('TIPP (katalog)')
  })

  it('change nothing when the argument is left out', () => {
    catalogue(technique({ id: 'tipp' }))

    expect(techniquesForSchool('dbt')).toHaveLength(1)
    expect(findTechnique('tipp')?.id).toBe('tipp')
  })
})
