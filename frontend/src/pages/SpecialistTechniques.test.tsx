import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, TEST_USER } from '../test/render'
import SpecialistTechniques from './SpecialistTechniques'
import { ApiError } from '../api/client'
import type { StoredTechnique } from '../api/techniques'

vi.mock('../api/techniques', () => ({
  fetchMyTechniques: vi.fn(),
  deleteTechnique: vi.fn(),
}))
const { deleteTechnique, fetchMyTechniques } = await import('../api/techniques')
const mockedFetch = vi.mocked(fetchMyTechniques)
const mockedDelete = vi.mocked(deleteTechnique)

/**
 * "Moje techniki" — what this specialist has written into the catalogue.
 *
 * SAVED MEANS PUBLISHED, and the screen has to carry that in two ways: it says
 * so in words (every patient of the app, not only this specialist's — the
 * decision behind the feature), and it shows **no status badge at all**, because
 * a badge that always said the same thing would be noise and one that said
 * anything else would describe a state the panel cannot produce.
 *
 * Deleting asks twice: this is content patients may be using between sessions
 * and there is no undo — withdrawing a technique *is* deleting it.
 */

const SPECIALIST = { ...TEST_USER, isPatient: false, isSpecialist: true, role: 'specjalista' }

function technique(overrides: Partial<StoredTechnique> = {}): StoredTechnique {
  return {
    id: 'id-oddech-478',
    idTechnique: 12,
    nazwa: 'Oddech 4-7-8',
    podtytul: 'Spowolnienie oddechu.',
    szkola: ['relaksacyjne'],
    dostepnosc: 'ogolna',
    wprowadzenie: 'Kiedy trudno się uspokoić.',
    kroki: [{ opis: 'Wdech na cztery.' }],
    opisGotowy: true,
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T10:00:00Z',
    ...overrides,
  }
}

async function render(techniques: StoredTechnique[] = [technique()]) {
  mockedFetch.mockResolvedValue(techniques)
  const result = renderWithProviders(<SpecialistTechniques />, { user: SPECIALIST })
  await waitFor(() => expect(screen.queryByText('Wczytywanie technik…')).toBeNull())
  return result
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedDelete.mockReset()
})

describe('the list', () => {
  it('says a saved technique is already in every patient\'s catalogue', async () => {
    await render()

    expect(screen.getByText(/widoczna dla wszystkich pacjentów aplikacji/)).toBeInTheDocument()
  })

  it('says withdrawing one means deleting it, since there is no draft state', async () => {
    await render()

    expect(screen.getByText(/Jeśli chcesz ją\s+wycofać, usuń ją/)).toBeInTheDocument()
  })

  it('shows no publication status on a row', async () => {
    await render()

    for (const status of [/szkic/i, /oczekuj/i, /opublikowan/i, /wersja robocza/i]) {
      expect(screen.queryByText(status)).toBeNull()
    }
  })

  it('names each technique with its tabs, its step count and its address', async () => {
    await render([technique({ szkola: ['dbt', 'relaksacyjne'], kroki: [{ opis: 'a' }, { opis: 'b' }] })])

    expect(screen.getByText('Oddech 4-7-8')).toBeInTheDocument()
    expect(screen.getByText(/DBT · Relaks · 2 kroki/)).toBeInTheDocument()
    expect(screen.getByText('/id-oddech-478')).toBeInTheDocument()
  })

  it('counts a single step in the singular', async () => {
    await render()

    expect(screen.getByText(/1 krok$/)).toBeInTheDocument()
  })

  it('opens the patient\'s own view of the technique, by slug', async () => {
    /** The catalogue addresses a technique by slug, because that is what the
     *  two halves of it have in common — the row id is the database key. */
    await render()

    expect(screen.getByRole('link', { name: 'Podgląd' }))
      .toHaveAttribute('href', '/techniques/id-oddech-478')
  })

  it('edits by the row id, which is what the panel URLs carry', async () => {
    await render()

    expect(screen.getByRole('link', { name: 'Edytuj' }))
      .toHaveAttribute('href', '/specialist/techniques/12/edit')
  })

  it('offers the form for a new technique even when the list is empty', async () => {
    await render([])

    expect(screen.getByText(/Nie dodałeś jeszcze żadnej techniki/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dodaj technikę' }))
      .toHaveAttribute('href', '/specialist/techniques/new')
  })

  it('never lets a failed load look like an empty list', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))

    renderWithProviders(<SpecialistTechniques />, { user: SPECIALIST })

    expect(await screen.findByText('Nie udało się wczytać Twoich technik. Spróbuj ponownie.'))
      .toBeInTheDocument()
    expect(screen.queryByText(/Nie dodałeś jeszcze/)).toBeNull()
  })

  it('draws what comes back after a retry', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('503'))
    mockedFetch.mockResolvedValueOnce([technique()])

    renderWithProviders(<SpecialistTechniques />, { user: SPECIALIST })

    await userEvent.click(await screen.findByRole('button', { name: /ponownie|Spróbuj/ }))

    expect(await screen.findByText('Oddech 4-7-8')).toBeInTheDocument()
  })
})

describe('deleting a technique', () => {
  it('asks first, and sends nothing on the first tap', async () => {
    /** Patients may be using it between sessions and there is no undo. */
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń' }))

    expect(screen.getByRole('button', { name: 'Usuń na pewno' })).toBeInTheDocument()
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('can be called off', async () => {
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nie usuwaj' }))

    expect(screen.getByRole('button', { name: 'Usuń' })).toBeInTheDocument()
    expect(mockedDelete).not.toHaveBeenCalled()
  })

  it('removes the row on the second tap', async () => {
    mockedDelete.mockResolvedValueOnce(undefined)
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń' }))
    await userEvent.click(screen.getByRole('button', { name: 'Usuń na pewno' }))

    expect(mockedDelete).toHaveBeenCalledWith(12)
    await waitFor(() => expect(screen.queryByText('Oddech 4-7-8')).toBeNull())
  })

  it('asks about one technique at a time', async () => {
    /** Two rows in the confirming state at once is how the wrong one gets
     *  deleted on a phone. */
    await render([technique(), technique({ idTechnique: 13, nazwa: 'Uważny oddech', id: 'id-uwazny' })])

    await userEvent.click(screen.getAllByRole('button', { name: 'Usuń' })[0])

    expect(screen.getAllByRole('button', { name: 'Usuń na pewno' })).toHaveLength(1)
  })

  it('keeps the technique on screen when the deletion fails, and says so', async () => {
    mockedDelete.mockRejectedValueOnce(new ApiError(500, null))
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń' }))
    await userEvent.click(screen.getByRole('button', { name: 'Usuń na pewno' }))

    expect(await screen.findByText('Nie udało się usunąć techniki. Spróbuj ponownie.'))
      .toBeInTheDocument()
    expect(screen.getByText('Oddech 4-7-8')).toBeInTheDocument()
  })

  it('does not report a failed deletion as a failed load', async () => {
    mockedDelete.mockRejectedValueOnce(new Error('500'))
    await render()

    await userEvent.click(screen.getByRole('button', { name: 'Usuń' }))
    await userEvent.click(screen.getByRole('button', { name: 'Usuń na pewno' }))

    await screen.findByText('Nie udało się usunąć techniki. Spróbuj ponownie.')
    expect(screen.queryByText(/Nie udało się wczytać/)).toBeNull()
  })
})
