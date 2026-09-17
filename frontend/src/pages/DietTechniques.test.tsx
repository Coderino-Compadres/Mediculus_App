import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../test/render'
import HeaderMenu from '../components/HeaderMenu'
import DietTechniques, { EMPTY, INTRO } from './DietTechniques'
import { ROUTES } from '../routes'
import type { DietTechnique } from '../types/dietTechnique'

/**
 * "Techniki psychodietetyczne" — §12, the list.
 *
 * **NOTHING HERE ASSUMES THERE ARE TEN.** The catalogue is placeholders until
 * the foundation writes the content, and the number of entries is meant to
 * change by editing one array — so every assertion about the list is against
 * the fixture it was given, and the one test that reads the shipped data asks
 * it how many it holds.
 *
 * As everywhere in this module, half of what is pinned is absence: no tabs, no
 * search, no coloured dot, nothing that counts food, and no question about
 * whether a technique helped. Each of those is on the artboard or is something
 * a reasonable person would add thinking it an improvement.
 */

const data = vi.hoisted(() => ({ techniques: [] as DietTechnique[] }))

/** The notice is no longer a flag on the module — it follows the entries, so
 *  these tests turn it on and off by writing `zastepczy` on a fixture. */
vi.mock('../data/dietTechniques', () => ({
  get DIET_TECHNIQUES() {
    return data.techniques
  },
  PLACEHOLDER_NOTICE_LIST: 'Treść technik przygotowuje fundacja.',
  PLACEHOLDER_NOTICE_TECHNIQUE: 'Treść tej techniki przygotowuje fundacja.',
  PLACEHOLDER_TECHNIQUES: [],
}))

function technique(overrides: Partial<DietTechnique> & Pick<DietTechnique, 'id'>): DietTechnique {
  return {
    nazwa: `Technika ${overrides.id}`,
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie: 'Wprowadzenie.',
    kroki: [{ opis: 'Krok.' }],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
    ...overrides,
  }
}

const renderList = () => renderWithProviders(<DietTechniques />, { route: ROUTES.dietTechniques })

/** Every row of the list, without the header's own links. */
const rows = () => screen.queryAllByRole('listitem')

beforeEach(() => {
  data.techniques = [technique({ id: 'a' }), technique({ id: 'b' }), technique({ id: 'c' })]
})

describe('the list', () => {
  it('renders one row per technique in the data, whatever that number is', () => {
    renderList()

    expect(rows()).toHaveLength(3)
  })

  it('renders a longer catalogue just as happily', () => {
    data.techniques = Array.from({ length: 14 }, (_, index) => technique({ id: `t-${index}` }))

    renderList()

    expect(rows()).toHaveLength(14)
  })

  it('keeps the data file’s order — nothing sorts the list', () => {
    data.techniques = [
      technique({ id: 'c', nazwa: 'Trzecia' }),
      technique({ id: 'a', nazwa: 'Pierwsza' }),
      technique({ id: 'b', nazwa: 'Druga' }),
    ]

    renderList()

    expect(rows().map((row) => row.textContent)).toEqual([
      expect.stringContaining('Trzecia'),
      expect.stringContaining('Pierwsza'),
      expect.stringContaining('Druga'),
    ])
  })

  it('shows how long a technique takes and when to reach for it', () => {
    data.techniques = [
      technique({ id: 'a', nazwa: 'Technika A', czasTrwania: '5 minut', momentZastosowania: 'przed jedzeniem' }),
    ]

    renderList()

    const row = rows()[0]

    expect(within(row).getByText('Technika A')).toBeInTheDocument()
    expect(within(row).getByText(/5 minut · przed jedzeniem/)).toBeInTheDocument()
  })

  it('opens a technique at its own address', () => {
    data.techniques = [technique({ id: 'technika-1' })]

    renderList()

    expect(screen.getByRole('link', { name: /Technika technika-1/ })).toHaveAttribute(
      'href', '/diet/techniques/technika-1',
    )
  })

  it('is a list a screen reader is told is a list', () => {
    /** `list-style: none` in dietTechniques.css makes WebKit drop the implicit
     *  list role, so VoiceOver stops announcing this as a list of anything. The
     *  explicit role is the standard way back — it changes nothing for any other
     *  engine, because it restates what the element already is. */
    renderList()

    const list = screen.getByRole('list')

    expect(list.tagName).toBe('UL')
    expect(list).toHaveAttribute('role', 'list')
  })

  it('leads back to the module’s home, like every other screen here', () => {
    renderList()

    expect(
      screen.getByRole('link', { name: 'Wróć do strony głównej modułu dietetycznego' }),
    ).toHaveAttribute('href', ROUTES.diet)
  })

  it('renders the catalogue the app actually ships', async () => {
    /** The one test that reads the real data file: whatever it holds today, the
     *  screen draws a row for each published entry, in order, naming each one.
     *
     *  NO `toBeGreaterThan(0)` HERE. It used to be, as a guard against the
     *  length check going vacuous on an empty catalogue — but it also meant that
     *  the one-line switch this module documents (export `[]` from the data
     *  file, see its header) failed a test, which is a promise the repo does not
     *  keep. Matching the names rather than counting the rows is not vacuous at
     *  any length: an empty catalogue asserts an empty list, which is exactly
     *  what the empty state renders. */
    const actual = await vi.importActual<typeof import('../data/dietTechniques')>(
      '../data/dietTechniques',
    )
    data.techniques = [...actual.DIET_TECHNIQUES]

    renderList()

    const published = actual.DIET_TECHNIQUES.filter(
      (entry) => entry.opisGotowy && entry.dostepnosc === 'ogolna',
    )

    expect(rows().map((row) => row.textContent)).toEqual(
      published.map((entry) => expect.stringContaining(entry.nazwa)),
    )
  })

  it('draws nothing but the empty state when the data file ships no techniques', () => {
    /** The other half of the same promise: `export const DIET_TECHNIQUES = []`
     *  is documented as a one-line switch, so it has to be one. */
    data.techniques = []

    renderList()

    expect(rows()).toHaveLength(0)
    expect(screen.getByText(EMPTY)).toBeInTheDocument()
  })
})

describe('techniques the catalogue withholds', () => {
  it('lists neither a draft nor one a specialist has to introduce', () => {
    data.techniques = [
      technique({ id: 'a', nazwa: 'Widoczna' }),
      technique({ id: 'b', nazwa: 'Jeszcze nieopisana', opisGotowy: false }),
      technique({ id: 'c', nazwa: 'Tylko ze specjalistą', dostepnosc: 'wymagaSpecjalisty' }),
    ]

    renderList()

    expect(rows()).toHaveLength(1)
    expect(screen.getByText('Widoczna')).toBeInTheDocument()
    expect(screen.queryByText('Jeszcze nieopisana')).not.toBeInTheDocument()
    expect(screen.queryByText('Tylko ze specjalistą')).not.toBeInTheDocument()
  })
})

describe('the notice about content in preparation', () => {
  it('says who writes the techniques, so the empty slots are not a mystery', () => {
    renderList()

    expect(screen.getByText(/Treść technik przygotowuje fundacja/)).toBeInTheDocument()
  })

  it('still shows while any one technique is unwritten', () => {
    /** The property the old `CONTENT_PENDING` could not have: a catalogue that
     *  is half written still says so, instead of going quiet at the first real
     *  technique. */
    data.techniques = [
      technique({ id: 'a', zastepczy: false }),
      technique({ id: 'b', zastepczy: false }),
      technique({ id: 'c', zastepczy: true }),
    ]

    renderList()

    expect(screen.getByText(/przygotowuje fundacja/)).toBeInTheDocument()
  })

  it('leaves by itself when the last placeholder is written, taking nothing with it', () => {
    /** Nobody flips anything: the sentence goes when the entries stop being
     *  placeholders, in the same edit. */
    data.techniques = [
      technique({ id: 'a', zastepczy: false }),
      technique({ id: 'b', zastepczy: false }),
      technique({ id: 'c', zastepczy: false }),
    ]

    renderList()

    expect(screen.queryByText(/przygotowuje fundacja/)).not.toBeInTheDocument()
    expect(rows()).toHaveLength(3)
  })
})

describe('an empty catalogue', () => {
  it('says so in one sentence, with nothing to press', () => {
    data.techniques = []

    renderList()

    expect(screen.getByText(EMPTY)).toBeInTheDocument()
    expect(rows()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /Dodaj|Wygeneruj|Spróbuj/ })).not.toBeInTheDocument()
  })
})

describe('what the screen refuses to show', () => {
  it('asks nothing about whether a technique helped', () => {
    /** The three buttons are on the artboard and are deliberately not built —
     *  see the TODO(klientka) in DietTechniqueDetail.tsx. */
    renderList()

    for (const label of ['Pomogło', 'Trochę', 'Nie tym razem', 'Zapisz', 'Oceń']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it('recommends nothing and picks nothing for the patient', () => {
    /** The client's rule, repeated twice in §12: techniques are not chosen
     *  automatically and never appear as a suggestion after a hard entry. */
    renderList()

    expect(screen.queryByText(/polecane/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/dla Ciebie/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/proponujemy|sugerujemy/i)).not.toBeInTheDocument()
  })

  it('has no tabs, no categories and nothing to search with', () => {
    /** "Lista bez kategorii", in both mockup sets. The psychotherapy
     *  catalogue's school tabs are not reused and not parametrised. */
    renderList()

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    for (const label of ['DBT', 'CBT', 'Relaksacyjne']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('counts no food', () => {
    renderList()

    expect(document.body.textContent).not.toMatch(/kcal|kalori|białk|tłuszcz|węglowodan|gram|porcj/i)
  })

  it('writes no count into its own prose, because it does not know one', () => {
    /** The screen not slicing the list is checked above; this is the same rule
     *  for the sentence a patient reads. A number here is the hardcoded ten all
     *  over again, except visible and wrong from the first time the foundation
     *  sends nine or twelve — and no other test in this file would notice it. */
    renderList()

    /** Two things this pattern has to get right, and the first draft got neither:
     *
     *  - **a gap.** "dziesięć **krótkich** ćwiczeń" is the sentence to catch, so
     *    demanding the noun immediately after the numeral walks straight past it.
     *  - **Polish letters.** JavaScript's `\b` is ASCII-only, so the boundary
     *    after "dziesięć" never matches — `ć` and the space are both non-word
     *    characters to it, and there is no edge between them. Hence the explicit
     *    lookarounds over the Polish alphabet instead. */
    const LETTER = 'a-ząćęłńóśźż'
    const THING = '(technik|ćwicze|ćwiczeń|pozycj)'
    const GAP = `[^.!?]{0,24}?`
    const NUMERAL =
      '(jedna|jeden|dwie|dwa|trzy|cztery|pięć|sześć|siedem|osiem|dziewięć|dziesięć|jedenaście|dwanaście|kilkanaście)'
    const COUNT_IN_WORDS = new RegExp(
      `(?<![${LETTER}])${NUMERAL}(?![${LETTER}])${GAP}${THING}`, 'i',
    )
    const COUNT_IN_DIGITS = new RegExp(`\\d+${GAP}${THING}`, 'i')

    for (const pattern of [COUNT_IN_WORDS, COUNT_IN_DIGITS]) {
      expect(INTRO).not.toMatch(pattern)
      expect(document.body.textContent).not.toMatch(pattern)
    }
  })

  it('paginates nothing, however long the list gets', () => {
    /** A departure from the house rule of seven (CLAUDE.md §4), for the two
     *  reasons on the screen: §12 draws one scrolling list, and the
     *  psychotherapy catalogue's eleven rows have no pagination either. */
    data.techniques = Array.from({ length: 14 }, (_, index) => technique({ id: `t-${index}` }))

    renderList()

    expect(rows()).toHaveLength(14)
    expect(screen.queryByRole('button', { name: /Następna|Poprzednia/ })).not.toBeInTheDocument()
  })
})

describe('the module menu', () => {
  it('leads to the module’s own catalogue, not the DBT one', async () => {
    renderWithProviders(<HeaderMenu />, { route: ROUTES.diet })
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('link', { name: 'Techniki' })).toHaveAttribute(
      'href', ROUTES.dietTechniques,
    )
    expect(document.querySelector(`a[href="${ROUTES.techniques}"]`)).toBeNull()
  })

  it('stays the diet menu once you are on the diet catalogue', async () => {
    /** `isDietRoute` covers everything under /diet, and this screen is the
     *  first one whose path *starts* like the psychotherapy catalogue's name —
     *  worth pinning that the menu does not swap itself back. */
    renderWithProviders(<HeaderMenu />, { route: ROUTES.dietTechniques })
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }))

    expect(screen.getByRole('link', { name: 'Dzienniczki żywieniowe' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Przejdź do części psychoterapeutycznej' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Techniki' })).toHaveAttribute(
      'aria-current', 'page',
    )
  })
})
