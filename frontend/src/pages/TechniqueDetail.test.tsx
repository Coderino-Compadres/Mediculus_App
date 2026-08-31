import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/render'
import TechniqueDetail from './TechniqueDetail'

/**
 * One technique's screen.
 *
 * The content-safety decisions in `data/techniques.ts` are what this file mostly
 * guards: TIPP's "Temperatura" is named but never explained, ACCEPTS' "Doznania"
 * carries no cold-based examples, and the mockup's three rating buttons are not
 * built. Each of those would be an easy, well-meant "completion" of the screen.
 */

const params = vi.hoisted(() => ({ current: { id: 'tipp' } }))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => params.current }
})

/**
 * The real catalogue plus one technique tagged with two schools.
 *
 * Every real technique carries exactly one tag today, so with the data as it
 * ships the badge and the back link come out the same whether or not the
 * navigation state arrives — i.e. the state could be deleted and the suite would
 * stay green. This entry is what makes that plumbing testable without inventing
 * clinical content in data/techniques.ts.
 */
vi.mock('../data/techniques', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/techniques')>()
  return {
    TECHNIQUES: [
      ...actual.TECHNIQUES,
      {
        id: 'dwie-szkoly',
        nazwa: 'Technika w dwóch zakładkach',
        podtytul: 'Wpis testowy.',
        szkola: ['dbt', 'relaksacyjne'],
        grupa: 'kryzys',
        dostepnosc: 'ogolna',
        wprowadzenie: 'Wprowadzenie testowe.',
        kroki: [{ opis: 'Krok testowy.' }],
        opisGotowy: true,
      },
    ],
  }
})

function renderTechnique(id: string, state?: unknown) {
  params.current = { id }
  return renderWithProviders(<TechniqueDetail />, { route: `/techniques/${id}`, state })
}

describe('a technique from the client materials', () => {
  it('shows its introduction and every component skill', () => {
    renderTechnique('accepts')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ACCEPTS')
    expect(screen.getByText(/Zestaw sposobów na przeczekanie najtrudniejszego momentu/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('A — Aktywność')).toBeInTheDocument()
    expect(screen.getByText('S — Doznania')).toBeInTheDocument()
  })

  it('shows the document’s examples as their own row', () => {
    renderTechnique('dear-man')

    // Singular, because the document gives one example for this step.
    expect(screen.getAllByText('Przykład:').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/Trzeci raz w tym tygodniu wróciłeś po umówionej godzinie/),
    ).toBeInTheDocument()
  })

  it('names the DBT module the patient’s therapist uses', () => {
    renderTechnique('dear-man')

    expect(screen.getByText(/Moduł DBT: Skuteczność interpersonalna/)).toBeInTheDocument()
  })
})

describe('content deliberately withheld', () => {
  it('names TIPP’s "Temperatura" but gives no instructions for it', () => {
    renderTechnique('tipp')

    expect(screen.getByText('Temperatura')).toBeInTheDocument()
    expect(screen.getByText('Do omówienia ze specjalistą')).toBeInTheDocument()
    expect(screen.getByText(/Tę umiejętność wprowadza specjalista/)).toBeInTheDocument()
    // No how-to: nothing about cold water, ice, or holding your breath.
    // (Kept as specific phrases rather than a loose /twarz/ — "przetwarza" in
    // TIPP's own introduction matches that.)
    expect(
      screen.queryByText(/zimn\w* wod|lodu|zanurz|wstrzym\w* oddech|odruch nurkowania/i),
    ).not.toBeInTheDocument()
  })

  it('keeps cold-based examples out of ACCEPTS’ "Doznania"', () => {
    renderTechnique('accepts')

    expect(screen.getByText(/pogłaskaj zwierzę/)).toBeInTheDocument()
    expect(screen.queryByText(/lodu|zimny prysznic/i)).not.toBeInTheDocument()
  })

  it('keeps amounts, limits and food lists out of PLEASE', () => {
    renderTechnique('please')

    expect(
      screen.getByText('Jedz regularnie, w sposób, który daje ciału stabilną energię przez cały dzień.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/za dużo|za mało|unikaj pokarmów|kalori/i)).not.toBeInTheDocument()
  })
})

describe('what the screen does not build', () => {
  it('offers no effectiveness rating — the shape of it is still the client’s decision', () => {
    renderTechnique('tipp')

    for (const label of ['Pomogło', 'Trochę', 'Nie tym razem']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('shows no duration', () => {
    renderTechnique('tipp')

    expect(screen.queryByText(/\bmin\b/)).not.toBeInTheDocument()
  })
})

describe('navigation', () => {
  it('leads back to the tab the technique was opened from', () => {
    renderTechnique('dwie-szkoly', { szkola: 'relaksacyjne' })

    // Tagged 'dbt' first, so both of these are the navigation state's doing.
    expect(screen.getByText('Relaks')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do listy technik' })).toHaveAttribute(
      'href',
      '/techniques?szkola=relaksacyjne',
    )
  })

  it('uses the technique’s first tab when it was opened without that state', () => {
    renderTechnique('dwie-szkoly')

    expect(screen.getByText('DBT')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do listy technik' })).toHaveAttribute(
      'href',
      '/techniques',
    )
  })

  it('falls back to the technique’s own tab when there is no navigation state', () => {
    renderTechnique('miarowe-oddychanie')

    expect(screen.getByText('Relaks')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do listy technik' })).toHaveAttribute(
      'href',
      '/techniques?szkola=relaksacyjne',
    )
  })

  it('names its DBT module even though it is listed under relaxation', () => {
    // The skill is the first "P" of TIPP; only its catalogue row moved.
    renderTechnique('miarowe-oddychanie')

    expect(screen.getByText(/Moduł DBT: Tolerancja dyskomfortu psychicznego/)).toBeInTheDocument()
  })

  it('says a wrong id was not found, without implying the technique exists', () => {
    renderTechnique('nie-ma-takiej')

    expect(screen.getByText('Nie znaleziono takiej techniki.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Wróć do listy technik/ })).toBeInTheDocument()
  })
})
