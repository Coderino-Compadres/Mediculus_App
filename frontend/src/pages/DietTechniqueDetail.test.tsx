import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import DietTechniqueDetail, { DISCLAIMER, NOT_FOUND } from './DietTechniqueDetail'
import { ROUTES } from '../routes'
import type { DietTechnique } from '../types/dietTechnique'

/**
 * One psychodietetic technique — §12, the detail.
 *
 * What is pinned here is the shape of the screen (two chips, an introduction,
 * an ordered list of steps whose marker may be a letter) and the two things it
 * refuses: the artboard's "Czy to pomogło?" buttons, and any suggestion that a
 * withheld technique exists somewhere. The content itself is placeholders until
 * the foundation writes it, so no assertion here is about wording — where a
 * sentence has to be checked, it is compared against the constant the screen
 * exports, so a reword is a passing test and not a broken one.
 */

const data = vi.hoisted(() => ({ techniques: [] as DietTechnique[] }))
const params = vi.hoisted(() => ({ current: { id: 'a' } as { id?: string } }))

vi.mock('../data/dietTechniques', () => ({
  get DIET_TECHNIQUES() {
    return data.techniques
  },
  PLACEHOLDER_NOTICE_LIST: 'Treść technik przygotowuje fundacja.',
  PLACEHOLDER_NOTICE_TECHNIQUE: 'Treść tej techniki przygotowuje fundacja.',
  PLACEHOLDER_TECHNIQUES: [],
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => params.current }
})

function technique(overrides: Partial<DietTechnique> & Pick<DietTechnique, 'id'>): DietTechnique {
  return {
    nazwa: 'Technika 1 — nazwę uzupełni fundacja',
    czasTrwania: 'czas do uzupełnienia',
    momentZastosowania: 'moment do uzupełnienia',
    wprowadzenie: 'Miejsce na wprowadzenie.',
    kroki: [{ opis: 'Pierwszy krok.' }, { opis: 'Drugi krok.' }],
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: true,
    ...overrides,
  }
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
    renderTechnique('a')

    expect(document.body.textContent).not.toMatch(/kcal|kalori|białk|tłuszcz|węglowodan|gram|porcj/i)
  })

  it('plays nothing — §12 rules out video and audio by name', () => {
    renderTechnique('a')

    expect(document.querySelector('video')).toBeNull()
    expect(document.querySelector('audio')).toBeNull()
  })
})
