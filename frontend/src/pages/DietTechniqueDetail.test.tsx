import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import DietTechniqueDetail, { DISCLAIMER, LINKS_HEADING, NOT_FOUND } from './DietTechniqueDetail'
import { ROUTES } from '../routes'
import type { DietTechnique } from '../types/dietTechnique'

/**
 * One psychodietetic technique — §12, the detail.
 *
 * What is pinned here is the shape of the screen (two chips, an introduction,
 * an ordered list of steps whose marker may be a letter) and the two things it
 * refuses: the artboard's "Czy to pomogło?" buttons, and any suggestion that a
 * withheld technique exists somewhere. The content is the client's own and she
 * will send corrections to it, so **no assertion here is about her wording** —
 * where a sentence has to be checked, it is compared against the constant the
 * screen exports or against the fixture the test wrote itself, so a reword is a
 * passing test and not a broken one.
 */

const data = vi.hoisted(() => ({ techniques: [] as DietTechnique[] }))
const params = vi.hoisted(() => ({ current: { id: 'a' } as { id?: string } }))

vi.mock('../data/dietTechniques', () => ({
  get DIET_TECHNIQUES() {
    return data.techniques
  },
  PLACEHOLDER_NOTICE_LIST: 'Treść technik przygotowuje fundacja.',
  PLACEHOLDER_NOTICE_TECHNIQUE: 'Treść tej techniki przygotowuje fundacja.',
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => params.current }
})

/**
 * One technique's worth of fixture.
 *
 * **NEITHER CHIP FIELD, AND NO EXAMPLE, BY DEFAULT** — that is the shape the
 * catalogue actually ships (the client's file gives no duration and no moment
 * for any of her fifteen), and a fixture carrying both would have left the
 * screen's no-chips path untested while it was the only path that runs.
 */
function technique(overrides: Partial<DietTechnique> & Pick<DietTechnique, 'id'>): DietTechnique {
  return {
    nazwa: 'Technika 1 — nazwę uzupełni fundacja',
    wprowadzenie: 'Miejsce na wprowadzenie.',
    kroki: [{ opis: 'Pierwszy krok.' }, { opis: 'Drugi krok.' }],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
    ...overrides,
  }
}

/**
 * The data file the app ships, loaded past the mock above.
 *
 * Cached, because several tests want it and `importActual` re-reads the module
 * otherwise. Returning the entries rather than the module keeps every caller to
 * one line.
 */
let shippedTechniques: DietTechnique[] | undefined

async function shipped(): Promise<DietTechnique[]> {
  shippedTechniques ??= [
    ...(
      await vi.importActual<typeof import('../data/dietTechniques')>('../data/dietTechniques')
    ).DIET_TECHNIQUES,
  ]

  return shippedTechniques
}

function renderTechnique(id: string) {
  params.current = { id }
  return renderWithProviders(<DietTechniqueDetail />, { route: `/diet/techniques/${id}` })
}

beforeEach(() => {
  data.techniques = [technique({ id: 'a' })]
})

describe('one technique', () => {
  it('names it and shows both chips under the name', () => {
    data.techniques = [
      technique({
        id: 'a',
        nazwa: 'Technika A',
        czasTrwania: '3 – 5 minut',
        momentZastosowania: 'przed jedzeniem',
      }),
    ]

    renderTechnique('a')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Technika A')
    expect(screen.getByText('3 – 5 minut')).toBeInTheDocument()
    expect(screen.getByText('przed jedzeniem')).toBeInTheDocument()
  })

  it('draws no chip for a field that is not there', () => {
    /** EVERY TECHNIQUE IN THE CATALOGUE TAKES THIS PATH TODAY. An empty chip is
     *  an outlined pill with nothing in it under the title — visible,
     *  meaningless, and indistinguishable from a chip whose text failed to
     *  load. The whole row goes when neither field exists. */
    data.techniques = [technique({ id: 'a', nazwa: 'Technika A' })]

    const { container } = renderTechnique('a')

    expect(container.querySelector('.diet-technique-chips')).toBeNull()
    expect(container.querySelector('.diet-technique-chip')).toBeNull()
    expect(document.body.textContent).not.toMatch(/undefined/)
  })

  it('draws one chip when only one of the two is there', () => {
    data.techniques = [technique({ id: 'a', czasTrwania: '3 – 5 minut' })]

    const { container } = renderTechnique('a')

    expect(screen.getByText('3 – 5 minut')).toBeInTheDocument()
    expect(container.querySelectorAll('.diet-technique-chip')).toHaveLength(1)
  })

  it('shows the introduction and every step', () => {
    data.techniques = [
      technique({
        id: 'a',
        wprowadzenie: 'Po co jest ta technika.',
        kroki: [{ opis: 'Krok pierwszy.' }, { opis: 'Krok drugi.' }, { opis: 'Krok trzeci.' }],
      }),
    ]

    renderTechnique('a')

    expect(screen.getByText('Po co jest ta technika.')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('presents the steps as an ordered list, because the order is the technique', () => {
    renderTechnique('a')

    const steps = screen.getByRole('list')

    expect(steps.tagName).toBe('OL')
    expect(within(steps).getAllByRole('listitem')).toHaveLength(2)
  })

  it('tells a screen reader the steps are a list, in spite of the stylesheet', () => {
    /** THIS LIST IS THE ONE THAT CANNOT AFFORD TO LOSE ITS SEMANTICS. The drawn
     *  number is aria-hidden precisely because the <ol> is supposed to be
     *  counting — but `list-style: none` makes WebKit drop the implicit list
     *  role, and a VoiceOver listener would then get no step number from either
     *  source. The explicit role restates what the element already is. */
    renderTechnique('a')

    expect(screen.getByRole('list')).toHaveAttribute('role', 'list')
  })

  it('numbers the steps when they carry no label of their own', () => {
    renderTechnique('a')

    const [first, second] = screen.getAllByRole('listitem')

    expect(first).toHaveTextContent('1')
    expect(second).toHaveTextContent('2')
  })

  it('draws a step’s own letter instead of its number where the data gives one', () => {
    /** §12 draws one technique whose circles hold letters rather than numbers,
     *  because the technique is a mnemonic. `etykieta` is what covers that. */
    data.techniques = [
      technique({
        id: 'a',
        kroki: [
          { etykieta: 'H', opis: 'Pierwszy.' },
          { etykieta: 'A', opis: 'Drugi.' },
        ],
      }),
    ]

    renderTechnique('a')

    const [first, second] = screen.getAllByRole('listitem')

    expect(first).toHaveTextContent('H')
    expect(second).toHaveTextContent('A')
    expect(first).not.toHaveTextContent('1')
  })

  it('reads a step’s letter out, and a step’s number not twice', () => {
    /** The <ol> already numbers the steps for a screen reader, so a drawn
     *  number is hidden from it — but a letter is content: it is what the
     *  technique's name spells. */
    data.techniques = [
      technique({ id: 'a', kroki: [{ etykieta: 'H', opis: 'Pierwszy.' }] }),
    ]

    renderTechnique('a')

    const marker = screen.getByText('H')

    expect(marker).not.toHaveAttribute('aria-hidden')

    cleanup()
    data.techniques = [technique({ id: 'a', kroki: [{ opis: 'Pierwszy.' }] })]

    renderTechnique('a')

    expect(screen.getByText('1')).toHaveAttribute('aria-hidden', 'true')
  })

  it('gives a step its heading only when it has a name', () => {
    data.techniques = [
      technique({
        id: 'a',
        kroki: [{ nazwa: 'Zatrzymaj się', opis: 'Opis.' }, { opis: 'Bez nazwy.' }],
      }),
    ]

    renderTechnique('a')

    expect(screen.getByRole('heading', { level: 3, name: 'Zatrzymaj się' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
  })

  it('carries the note that the descriptions are no substitute for a visit', () => {
    /** Compared against the screen's own constant rather than against six words
     *  of it. This is the sentence in the module most likely to come back
     *  reworded — "ze specjalistą" into "z dietetyczką" is a correction, not a
     *  regression — and `data/techniques.test.ts` states the house rule that a
     *  correction from a specialist must not fail a test. What matters here is
     *  that the screen shows its disclaimer at all. */
    renderTechnique('a')

    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument()
  })

  it('leads back to the list from the header, and only from there', () => {
    /** The arrow is this module's way back. The psychotherapy catalogue adds a
     *  second link at the foot of the screen; nothing in /diet does that, so it
     *  is not introduced here. */
    renderTechnique('a')

    expect(screen.getByRole('link', { name: 'Wróć do technik psychodietetycznych' }))
      .toHaveAttribute('href', ROUTES.dietTechniques)
    expect(screen.getAllByRole('link').filter(
      (link) => link.getAttribute('href') === ROUTES.dietTechniques,
    )).toHaveLength(1)
  })
})

describe('the note under the steps', () => {
  /**
   * Two of the client's fifteen end their "Jak wykonać" on a sentence that
   * closes the thought rather than continuing it. Before `notka` both were
   * steps, and the two ways that read badly are what the field exists to undo:
   * HALT's markers spelled "H A L T 5", and the food diary numbered a caveat
   * among the seven things to write down.
   *
   * **Nothing here counts them or names them.** A third technique has the very
   * same shape in the source and is deliberately a step, because its sentence
   * is an instruction (see `notka` in types/dietTechnique.ts) — so which
   * entries carry a note is a judgement made sentence by sentence, and the
   * data-driven test below asks the data rather than telling it.
   */
  it('renders under the steps, inside the same card', () => {
    data.techniques = [
      technique({
        id: 'a',
        kroki: [{ opis: 'Jedyny krok.' }],
        notka: 'Nie służy on do oceniania ani karania się.',
      }),
    ]

    renderTechnique('a')

    const note = screen.getByText('Nie służy on do oceniania ani karania się.')
    const steps = screen.getByRole('list')

    // Same card as the steps, and after them.
    expect(note.closest('.diet-techniques-card')).toBe(steps.closest('.diet-techniques-card'))
    expect(steps.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is not a step — it takes no marker and the list does not count it', () => {
    /** THE WHOLE POINT OF THE FIELD. As a list item it got a circle: HALT's
     *  read "5" after H, A, L and T. */
    data.techniques = [
      technique({
        id: 'a',
        kroki: [{ etykieta: 'H', opis: 'Pierwszy.' }, { etykieta: 'A', opis: 'Drugi.' }],
        notka: 'Zdanie domykające.',
      }),
    ]

    renderTechnique('a')

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('3')).not.toBeInTheDocument()
    expect(screen.getByText('Zdanie domykające.').closest('li')).toBeNull()
  })

  it('draws nothing at all when the technique has no note', () => {
    data.techniques = [technique({ id: 'a' })]

    const { container } = renderTechnique('a')

    expect(container.querySelector('.diet-technique-note')).toBeNull()
  })

  it('is set apart from the steps without being dressed as a warning', () => {
    /** Not ochre and not an icon: in this module ochre says "this is where the
     *  work stands" and the ⓘ belongs to the disclaimer. None of the three
     *  notes is a caution — they close a thought. The class is what carries the
     *  rule and the quieter ink (see dietTechniques.css). */
    data.techniques = [technique({ id: 'a', notka: 'Zdanie domykające.' })]

    const { container } = renderTechnique('a')

    const note = container.querySelector('.diet-technique-note')

    expect(note).not.toBeNull()
    expect(note?.textContent).toBe('Zdanie domykające.')
    expect(note?.className).not.toMatch(/ochre|warning|pending|disclaimer/)
    expect(note?.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('carries the notes the shipped catalogue actually has, and no others', () => {
    /** Read off the real data: exactly the techniques whose "Jak wykonać" ends
     *  on a sentence after the list. Which ones those are is the data's to say —
     *  a fourth is a content decision, not a broken test. */
    return shipped().then((entries) => {
      for (const entry of entries) {
        cleanup()
        data.techniques = [entry]

        renderTechnique(entry.id)

        if (entry.notka === undefined) {
          expect(document.querySelector('.diet-technique-note'), entry.id).toBeNull()
          continue
        }

        expect(screen.getByText(entry.notka), entry.id).toBeInTheDocument()
      }
    })
  })
})

describe('the example', () => {
  /**
   * Every one of the client's fifteen techniques ends on a "Przykład: …"
   * paragraph and it is the most practical part of what she wrote, so it gets a
   * card of its own rather than being folded into the last step (the `<ol>`
   * would number it, telling a reader to perform it) or lifted into the
   * introduction (she wrote it to be read after the steps).
   */
  it('gets its own card, after the steps', () => {
    data.techniques = [
      technique({ id: 'a', przyklad: 'Masz ochotę na coś słodkiego po trudnym dniu.' }),
    ]

    renderTechnique('a')

    const heading = screen.getByRole('heading', { level: 2, name: 'Przykład' })

    expect(heading).toBeInTheDocument()
    expect(screen.getByText('Masz ochotę na coś słodkiego po trudnym dniu.')).toBeInTheDocument()
    // After "Kroki" in document order, which is the order it is read in.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(headings.indexOf('Przykład')).toBeGreaterThan(headings.indexOf('Kroki'))
  })

  it('is not a step — the ordered list keeps counting only the steps', () => {
    data.techniques = [
      technique({ id: 'a', kroki: [{ opis: 'Jedyny krok.' }], przyklad: 'Przykładowa sytuacja.' }),
    ]

    renderTechnique('a')

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1)
  })

  it('draws no card at all when the technique has no example', () => {
    data.techniques = [technique({ id: 'a' })]

    renderTechnique('a')

    expect(screen.queryByRole('heading', { level: 2, name: 'Przykład' })).not.toBeInTheDocument()
  })
})

describe('the links out to the rest of the app', () => {
  /**
   * Three of the fifteen describe something the app already has a screen for.
   * The section is a way out of a page you have finished reading, so it sits
   * after the example and before the disclaimer — and it appears only for a
   * technique that has links, because a heading over nothing is worse than no
   * heading.
   */
  it('names the screen and links to it', () => {
    data.techniques = [
      technique({
        id: 'a',
        odsylacze: [{ trasa: ROUTES.dietMeal, etykieta: 'Zapisz posiłek w dzienniczku' }],
      }),
    ]

    renderTechnique('a')

    expect(screen.getByRole('heading', { level: 2, name: LINKS_HEADING })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Zapisz posiłek w dzienniczku' })).toHaveAttribute(
      'href', ROUTES.dietMeal,
    )
  })

  it('carries more than one where the technique needs it', () => {
    data.techniques = [
      technique({
        id: 'a',
        odsylacze: [
          { trasa: ROUTES.dietJournals, etykieta: 'Przejrzyj historię dzienniczków' },
          { trasa: ROUTES.dietActivitySleep, etykieta: 'Zapisz aktywność i sen' },
        ],
      }),
    ]

    renderTechnique('a')

    expect(screen.getByRole('link', { name: 'Przejrzyj historię dzienniczków' })).toHaveAttribute(
      'href', ROUTES.dietJournals,
    )
    expect(screen.getByRole('link', { name: 'Zapisz aktywność i sen' })).toHaveAttribute(
      'href', ROUTES.dietActivitySleep,
    )
  })

  it('sits between the example and the disclaimer', () => {
    data.techniques = [
      technique({
        id: 'a',
        przyklad: 'Przykładowa sytuacja.',
        odsylacze: [{ trasa: ROUTES.dietMeal, etykieta: 'Zapisz posiłek w dzienniczku' }],
      }),
    ]

    renderTechnique('a')

    const example = screen.getByRole('heading', { level: 2, name: 'Przykład' })
    const links = screen.getByRole('heading', { level: 2, name: LINKS_HEADING })
    const disclaimer = screen.getByText(DISCLAIMER)

    expect(example.compareDocumentPosition(links) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(links.compareDocumentPosition(disclaimer) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy()
  })

  it('is absent entirely from a technique with no links', () => {
    data.techniques = [technique({ id: 'a' })]

    renderTechnique('a')

    expect(screen.queryByRole('heading', { name: LINKS_HEADING })).not.toBeInTheDocument()
  })

  it('appears on exactly the techniques the shipped catalogue gives links to', async () => {
    /** The real data: the section must not have leaked onto the techniques that
     *  are done away from the phone, and it must be there on the ones that name
     *  a screen. Which techniques those are is read off the data rather than
     *  listed here — a fourth one is a data decision, not a broken test. */
    for (const entry of await shipped()) {
      cleanup()
      data.techniques = [entry]

      renderTechnique(entry.id)

      if (entry.odsylacze === undefined) {
        expect(
          screen.queryByRole('heading', { name: LINKS_HEADING }),
          entry.id,
        ).not.toBeInTheDocument()
        continue
      }

      expect(screen.getByRole('heading', { name: LINKS_HEADING }), entry.id).toBeInTheDocument()
      for (const link of entry.odsylacze) {
        expect(screen.getByRole('link', { name: link.etykieta }), entry.id).toHaveAttribute(
          'href', link.trasa,
        )
      }
    }
  })

  it('takes a patient out of the diet module exactly once, and says so first', async () => {
    /** Following the emotion-diary link swaps the menu and the nadtytuł, which
     *  is exactly the surprise `HeaderMenu`'s own "Przejdź do części
     *  psychoterapeutycznej" exists to avoid. The label has to say so before it
     *  is pressed, and this reads the shipped data because it is a promise about
     *  what the catalogue ships rather than about the component. */
    const crossing = (await shipped())
      .flatMap((entry) => entry.odsylacze ?? [])
      .filter((link) => !link.trasa.startsWith(ROUTES.diet))

    expect(crossing.length).toBeGreaterThan(0)
    for (const link of crossing) {
      expect(link.etykieta, link.trasa).toMatch(/psychoterapeut/i)
    }
  })
})

describe('the techniques the app actually ships', () => {
  /**
   * The few places where the *shape* of a real entry is worth pinning, because
   * getting it wrong is silent: a mnemonic whose letters were transcribed as
   * ordinary steps still renders, and a scale broken into five steps still
   * renders — as five things to do in order, which is not what a scale is.
   *
   * **Addressed by slug, and the slug is the URL** — it is the one part of an
   * entry that cannot be reworded without breaking a link somebody has already
   * sent, so a test naming it is not a test of the client's prose.
   */
  const bySlug = async (slug: string) => {
    const entry = (await shipped()).find((technique) => technique.id === slug)

    expect(entry, slug).toBeDefined()
    return entry as DietTechnique
  }

  it.each(['halt', 'stop'])('draws %s as its letters, and reads them out', async (slug) => {
    const entry = await bySlug(slug)
    data.techniques = [entry]

    renderTechnique(slug)

    /** EVERY STEP IS A LETTER, AND THERE ARE EXACTLY AS MANY AS THE NAME HAS.
     *  HALT used to carry a fifth, unlettered step — the sentence the client
     *  wrote after her four questions — and it is a `notka` now, under the rule
     *  rather than inside the `<ol>`. Reading only the letters that happen to
     *  be there passes either way, which leaves the one regression this shape
     *  exists to catch — the closing sentence sliding back into `kroki` and the
     *  screen drawing "H A L T 5" — unguarded on the entry that actually ships.
     *  So the count and the letters are pinned together. */
    expect(entry.kroki).toHaveLength(slug.length)
    for (const step of entry.kroki) {
      expect(step.etykieta, step.opis).toBeDefined()
    }

    const letters = entry.kroki.map((step) => step.etykieta ?? '')

    expect(letters.join('')).toBe(slug.toUpperCase())
    for (const letter of letters) {
      // Not aria-hidden: the letters are what the technique's name spells, and
      // a listener left without them cannot reconstruct it.
      expect(screen.getByText(letter), letter).not.toHaveAttribute('aria-hidden')
    }
  })

  it('keeps the hunger scale as one step, not five', async () => {
    /** The five ranges are a measure, not a sequence. Numbered inside the
     *  `<ol>` they would read as five things to do in order — and every range
     *  has to stay in one step for the scale to be legible as a scale. */
    const entry = await bySlug('skala-glodu-i-sytosci')
    data.techniques = [entry]

    renderTechnique('skala-glodu-i-sytosci')

    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    const scale = steps.find((step) => step.textContent?.includes('bardzo silny głód'))

    expect(scale).toBeDefined()
    for (const range of ['2–3', '4–5', '6–7', '8–10']) {
      expect(scale?.textContent, range).toContain(range)
    }
  })
})

describe('a technique whose content is not written yet', () => {
  /**
   * THE DEEP LINK IS THE POINT. This address is what gets copied into a message
   * and opened by somebody who never saw the list, so the screen has to say for
   * itself that what is below is not an exercise. Before `zastepczy` it said
   * nothing at all: the only mark was the placeholder wording, which is exactly
   * what stops being reliable once somebody writes a plausible name over it.
   */
  it('says so on the technique’s own screen, not only on the list', () => {
    data.techniques = [technique({ id: 'a', zastepczy: true })]

    renderTechnique('a')

    expect(screen.getByText(/Treść tej techniki przygotowuje fundacja/)).toBeInTheDocument()
  })

  it('says nothing of the sort once the technique has been written', () => {
    data.techniques = [technique({ id: 'a', zastepczy: false })]

    renderTechnique('a')

    expect(screen.queryByText(/przygotowuje fundacja/)).not.toBeInTheDocument()
  })

  it('keeps the notice off a real technique standing next to a placeholder', () => {
    /** The entry answers for itself — a half-written catalogue does not put the
     *  notice on the techniques that are finished. */
    data.techniques = [
      technique({ id: 'a', zastepczy: true }),
      technique({ id: 'b', zastepczy: false }),
    ]

    renderTechnique('b')

    expect(screen.queryByText(/przygotowuje fundacja/)).not.toBeInTheDocument()
  })
})

describe('a technique that is not there', () => {
  it('says so without implying it exists somewhere', () => {
    renderTechnique('nie-ma-takiej')

    expect(screen.getByText(NOT_FOUND)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wróć do technik/ })).toHaveAttribute(
      'href', ROUTES.dietTechniques,
    )
    expect(screen.queryByText(/wkrótce|w przygotowaniu|specjalist/i)).not.toBeInTheDocument()
  })

  it('answers the same for a technique the catalogue withholds', () => {
    /** The gate is read in one place, so a URL cannot walk around it — and the
     *  screen must not hint at what it is hiding. */
    data.techniques = [technique({ id: 'dziennik', dostepnosc: 'wymagaSpecjalisty' })]

    renderTechnique('dziennik')

    expect(screen.getByText(NOT_FOUND)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('answers the same for a technique whose description has not arrived', () => {
    data.techniques = [technique({ id: 'a', opisGotowy: false })]

    renderTechnique('a')

    expect(screen.getByText(NOT_FOUND)).toBeInTheDocument()
  })

  it('waits for nothing — this catalogue ships with the app', () => {
    /** No request, so no "Wczytywanie…" state: the psychotherapy detail has one
     *  only because half of its catalogue comes from the database. */
    renderTechnique('nie-ma-takiej')

    expect(screen.queryByText(/Wczytywanie/i)).not.toBeInTheDocument()
  })
})

describe('what the screen refuses to show', () => {
  it('does not ask whether the technique helped', () => {
    /** The artboard puts "Czy to pomogło?" and three buttons here. See the
     *  TODO(klientka) in the screen: the psychotherapy module has the same
     *  element blocked, the answer has nowhere to go (the report's "Zastosowane"
     *  column does not exist), and the client's decision about a practice
     *  module is open for the whole app. */
    renderTechnique('a')

    for (const label of ['Pomogło', 'Trochę', 'Nie tym razem', 'Zapisz', 'Oceń']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
    expect(screen.queryByText(/pomogło\?/i)).not.toBeInTheDocument()
  })

  it('offers no favourite, no history and no counter', () => {
    renderTechnique('a')

    expect(screen.queryByText(/ulubion|zastosowałaś|zastosowałeś|ostatnio używan/i))
      .not.toBeInTheDocument()
  })

  it('suggests no other technique', () => {
    renderTechnique('a')

    expect(screen.queryByText(/polecane|dla Ciebie|spróbuj też|inna technika/i))
      .not.toBeInTheDocument()
  })

  it('counts no food', () => {
    /** The module's qualitative rule (CLAUDE.md §3), asked of what the screen
     *  renders.
     *
     *  ⚠️ **THIS RUNS ON FIXTURES, NOT ON THE CLIENT'S TEXT, AND THAT IS
     *  DELIBERATE — DO NOT "IMPROVE" IT INTO A SWEEP OF THE REAL CATALOGUE.**
     *  Widening it to `DIET_TECHNIQUES` would fail immediately, on technique 13
     *  ("Małe cele"), which reads: "Przez najbliższy tydzień do każdego obiadu
     *  dodam **porcję** warzyw." That is the client's own worked example and it
     *  is not a breach of the qualitative rule — "porcja" there means "some",
     *  not a measured amount, and nothing in this module asks a patient to weigh
     *  it. The rule this pattern enforces is about what *the app* says, and the
     *  app says none of these words; what the foundation's dietitian writes in
     *  her own material is hers. If the sweep is ever widened, the pattern has
     *  to be narrowed first — see §9 of the content report. */
    renderTechnique('a')

    expect(document.body.textContent).not.toMatch(/kcal|kalori|białk|tłuszcz|węglowodan|gram|porcj/i)
  })

  it('plays nothing — §12 rules out video and audio by name', () => {
    renderTechnique('a')

    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })
})
