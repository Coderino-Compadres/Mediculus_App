import { describe, expect, it, vi } from 'vitest'
import type { DietTechnique } from '../types/dietTechnique'

/**
 * The gate both §12 screens read.
 *
 * The data module is mocked rather than asserted against, so these tests state
 * the *rule* instead of the catalogue's current contents — which is also what
 * keeps them alive when the foundation's text replaces the placeholders.
 */

const catalogue = vi.hoisted(() => ({ current: [] as DietTechnique[] }))

vi.mock('../data/dietTechniques', () => ({
  get DIET_TECHNIQUES() {
    return catalogue.current
  },
  PLACEHOLDER_NOTICE_LIST: '',
  PLACEHOLDER_NOTICE_TECHNIQUE: '',
}))

const { catalogueHasPlaceholders, findDietTechnique, publishedDietTechniques } =
  await import('./dietTechniques')

function technique(overrides: Partial<DietTechnique> & Pick<DietTechnique, 'id'>): DietTechnique {
  return {
    nazwa: `Technika ${overrides.id}`,
    czasTrwania: 'kilka minut',
    momentZastosowania: 'kiedy trzeba',
    wprowadzenie: 'Wprowadzenie.',
    kroki: [{ opis: 'Krok.' }],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
    ...overrides,
  }
}

describe('which techniques the catalogue publishes', () => {
  it('lists a ready, generally available technique', () => {
    catalogue.current = [technique({ id: 'a' })]

    expect(publishedDietTechniques().map((entry) => entry.id)).toEqual(['a'])
  })

  it('keeps the data file’s order, because nothing sorts it', () => {
    /** THE NAMES ARE DISTINCT AND DELIBERATELY OUT OF ALPHABETICAL ORDER, both
     *  ways round. With the fixture's default name on all three — which is what
     *  this test used to have — every `localeCompare` returns 0 and a stable
     *  `sort` leaves them alone, so a `.sort((a, b) => a.nazwa.localeCompare(...))`
     *  slipped into `publishedDietTechniques` passed this test untouched. Ids
     *  ascending and names descending means either sort key moves something. */
    catalogue.current = [
      technique({ id: 'c', nazwa: 'Ćwiczenie trzecie' }),
      technique({ id: 'a', nazwa: 'Bardzo spokojny oddech' }),
      technique({ id: 'b', nazwa: 'Alfabetycznie pierwsza' }),
    ]

    expect(publishedDietTechniques().map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
    expect(publishedDietTechniques().map((entry) => entry.nazwa)).toEqual([
      'Ćwiczenie trzecie',
      'Bardzo spokojny oddech',
      'Alfabetycznie pierwsza',
    ])
  })

  it('answers for any number of techniques, including none', () => {
    /** The screens are built for whatever the data holds — see the note in
     *  data/dietTechniques.ts. Nothing in this module knows a count. */
    catalogue.current = []
    expect(publishedDietTechniques()).toHaveLength(0)

    catalogue.current = Array.from({ length: 23 }, (_, index) => technique({ id: `t-${index}` }))
    expect(publishedDietTechniques()).toHaveLength(23)
  })

  it('withholds a technique whose description has not arrived', () => {
    catalogue.current = [technique({ id: 'a' }), technique({ id: 'b', opisGotowy: false })]

    expect(publishedDietTechniques().map((entry) => entry.id)).toEqual(['a'])
  })

  it('withholds a technique a specialist has to introduce, by URL as well as in the list', () => {
    /** The gate is read in one place precisely so these two cannot disagree: a
     *  technique withheld from the list must not open from its own address.
     *  This is the flag waiting for the client's decision about "Dziennik
     *  napadów objadania" — see the TODO in data/dietTechniques.ts. */
    catalogue.current = [technique({ id: 'dziennik', dostepnosc: 'wymagaSpecjalisty' })]

    expect(publishedDietTechniques()).toHaveLength(0)
    expect(findDietTechnique('dziennik')).toBeUndefined()
  })
})

describe('finding one technique', () => {
  it('finds a published technique by id', () => {
    catalogue.current = [technique({ id: 'a' }), technique({ id: 'b' })]

    expect(findDietTechnique('b')?.id).toBe('b')
  })

  it('answers with nothing for an id that is not there', () => {
    catalogue.current = [technique({ id: 'a' })]

    expect(findDietTechnique('nie-ma-takiej')).toBeUndefined()
  })

  it('answers with nothing when the address carries no id at all', () => {
    catalogue.current = [technique({ id: 'a' })]

    expect(findDietTechnique(undefined)).toBeUndefined()
  })
})

describe('whether the catalogue still holds a placeholder', () => {
  /**
   * What puts the notice on the list and what takes it off. It replaced a
   * `CONTENT_PENDING` constant on the data module, and these tests state the
   * property that constant could not have: the answer follows the entries, so
   * filling the last placeholder in is what removes the notice — in the same
   * edit, with nothing to remember.
   */
  it('says yes while any published technique is still a placeholder', () => {
    catalogue.current = [
      technique({ id: 'a', zastepczy: false }),
      technique({ id: 'b', zastepczy: true }),
    ]

    expect(catalogueHasPlaceholders()).toBe(true)
  })

  it('says no once the last one has been written', () => {
    catalogue.current = [
      technique({ id: 'a', zastepczy: false }),
      technique({ id: 'b', zastepczy: false }),
    ]

    expect(catalogueHasPlaceholders()).toBe(false)
  })

  it('says no for an empty catalogue, which has nothing to apologise for', () => {
    catalogue.current = []

    expect(catalogueHasPlaceholders()).toBe(false)
  })

  it('ignores a placeholder the catalogue withholds, because nobody can open it', () => {
    /** A withheld entry is on no screen, so the list has no reason to carry a
     *  notice about it — and a patient would have nothing to match it to. */
    catalogue.current = [
      technique({ id: 'a', zastepczy: false }),
      technique({ id: 'draft', zastepczy: true, opisGotowy: false }),
      technique({ id: 'dziennik', zastepczy: true, dostepnosc: 'wymagaSpecjalisty' }),
    ]

    expect(catalogueHasPlaceholders()).toBe(false)
  })
})
