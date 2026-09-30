import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, TEST_USER } from '../test/render'
import SpecialistDietTechniques from './SpecialistDietTechniques'
import SpecialistDietTechniqueForm from './SpecialistDietTechniqueForm'
import { ApiError } from '../api/client'
import { ROUTES } from '../routes'
import type { StoredDietTechnique } from '../api/dietTechniques'

vi.mock('../api/dietTechniques', () => ({
  fetchMyDietTechniques: vi.fn(),
  deleteDietTechnique: vi.fn(),
  createDietTechnique: vi.fn(),
  updateDietTechnique: vi.fn(),
}))
const api = await import('../api/dietTechniques')
const mockedFetch = vi.mocked(api.fetchMyDietTechniques)
const mockedDelete = vi.mocked(api.deleteDietTechnique)
const mockedCreate = vi.mocked(api.createDietTechnique)
const mockedUpdate = vi.mocked(api.updateDietTechnique)

/**
 * A psychodietitian's own techniques: the list and the form. The same
 * decisions the DBT panel's tests pin — saving is publishing, the slug comes
 * from the name and is sent back verbatim on an edit, deleting asks twice —
 * asked of the diet module's copy.
 */

const DIETITIAN = {
  ...TEST_USER,
  isPatient: false,
  isSpecialist: true,
  role: 'specjalista',
  specialistModule: 'diet' as const,
}

function technique(overrides: Partial<StoredDietTechnique> = {}): StoredDietTechnique {
  return {
    id: 'id-uwazne-zakupy',
    idTechnique: 7,
    nazwa: 'Uważne zakupy',
    czasTrwania: '5 min',
    czasTrwaniaMin: 5,
    momentZastosowania: 'przed wyjściem do sklepu',
    wprowadzenie: 'O czym jest ta technika.',
    kroki: [{ nazwa: 'Lista', opis: 'Zrób listę.' }],
    przyklad: 'Lista na lodówce.',
    notka: 'Nie chodzi o kontrolę.',
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  }
}

function renderPanel(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path={ROUTES.specialistDietTechniques} element={<SpecialistDietTechniques />} />
      <Route path={ROUTES.specialistDietTechniqueNew} element={<SpecialistDietTechniqueForm />} />
      <Route path={ROUTES.specialistDietTechniqueEdit} element={<SpecialistDietTechniqueForm />} />
    </Routes>,
    { user: DIETITIAN, route },
  )
}

beforeEach(() => {
  mockedFetch.mockReset()
  mockedDelete.mockReset()
  mockedCreate.mockReset()
  mockedUpdate.mockReset()
})

describe('the list', () => {
  it('lists own techniques with a preview into the diet catalogue', async () => {
    mockedFetch.mockResolvedValue([technique()])

    renderPanel(ROUTES.specialistDietTechniques)

    expect(await screen.findByText('Uważne zakupy')).toBeInTheDocument()
    expect(screen.getByText('5 min · przed wyjściem do sklepu · 1 krok')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Podgląd' }))
      .toHaveAttribute('href', '/diet/techniques/id-uwazne-zakupy')
    expect(screen.getByRole('link', { name: 'Edytuj' }))
      .toHaveAttribute('href', '/specialist/diet-techniques/7/edit')
    expect(screen.getByText(/widoczna dla wszystkich pacjentów/)).toBeInTheDocument()
  })

  it('deletes only after a second tap', async () => {
    mockedFetch.mockResolvedValue([technique()])
    mockedDelete.mockResolvedValue()
    renderPanel(ROUTES.specialistDietTechniques)

    await userEvent.click(await screen.findByRole('button', { name: 'Usuń' }))
    expect(mockedDelete).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Usuń na pewno' }))

    expect(mockedDelete).toHaveBeenCalledWith(7)
    await waitFor(() => expect(screen.queryByText('Uważne zakupy')).toBeNull())
  })

  it('tells a failed load apart from an empty list', async () => {
    mockedFetch.mockRejectedValue(new Error('offline'))

    renderPanel(ROUTES.specialistDietTechniques)

    expect(await screen.findByText(/Nie udało się wczytać/)).toBeInTheDocument()
    expect(screen.queryByText(/Nie dodałeś jeszcze/)).toBeNull()
  })
})

describe('the form', () => {
  it('derives the slug from the name and sends the diet shape', async () => {
    mockedCreate.mockResolvedValue(technique())
    mockedFetch.mockResolvedValue([])
    renderPanel(ROUTES.specialistDietTechniqueNew)

    await userEvent.type(screen.getByLabelText('Nazwa techniki'), 'Uważne zakupy')
    await userEvent.type(screen.getByLabelText('Wprowadzenie'), 'O czym jest.')
    await userEvent.type(screen.getByLabelText('Opis kroku'), 'Zrób listę.')
    await userEvent.type(screen.getByLabelText('Przykład'), 'Lista na lodówce.')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'id-uwazne-zakupy',
      name: 'Uważne zakupy',
      example: 'Lista na lodówce.',
      steps: [{ name: '', description: 'Zrób listę.' }],
    }))
    expect(await screen.findByText('Moje techniki psychodietetyczne')).toBeInTheDocument()
  })

  it('names the empty step instead of sending the form', async () => {
    renderPanel(ROUTES.specialistDietTechniqueNew)

    await userEvent.type(screen.getByLabelText('Nazwa techniki'), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(screen.getByText(/Krok 1 nie ma opisu/)).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('on an edit sends the stored slug back even after a rename', async () => {
    mockedFetch.mockResolvedValue([technique()])
    mockedUpdate.mockResolvedValue(technique())
    renderPanel('/specialist/diet-techniques/7/edit')

    const name = await screen.findByLabelText('Nazwa techniki')
    expect(screen.getByLabelText('Uwaga pod krokami')).toHaveValue('Nie chodzi o kontrolę.')
    await userEvent.clear(name)
    await userEvent.type(name, 'Nowa nazwa')
    await userEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))

    expect(mockedUpdate).toHaveBeenCalledWith(7, expect.objectContaining({
      slug: 'id-uwazne-zakupy', name: 'Nowa nazwa', durationMin: '5',
    }))
  })

  it('puts a taken slug under the name, the field that produced it', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(400, null, { slug: 'Technika o tym identyfikatorze już istnieje.' }),
    )
    renderPanel(ROUTES.specialistDietTechniqueNew)

    await userEvent.type(screen.getByLabelText('Nazwa techniki'), 'Uważne zakupy')
    await userEvent.type(screen.getByLabelText('Wprowadzenie'), 'O czym jest.')
    await userEvent.type(screen.getByLabelText('Opis kroku'), 'Zrób listę.')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj technikę' }))

    expect(await screen.findByText(/nazwy nie mogą się powtarzać/)).toBeInTheDocument()
  })
})
