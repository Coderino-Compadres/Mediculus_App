import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders, TEST_USER } from '../test/render'
import SpecialistHome from './SpecialistHome'
import { ROUTES } from '../routes'

vi.mock('../api/specialist', () => ({
  fetchCaseload: vi.fn(),
  invitePatient: vi.fn(),
  dropPatient: vi.fn(),
}))
const { fetchCaseload } = await import('../api/specialist')
const mockedCaseload = vi.mocked(fetchCaseload)

/** A specialist: a `specjalist` row, and no `patient` row of any kind. */
const SPECIALIST = {
  ...TEST_USER,
  role: 'specjalista',
  isPatient: false,
  isSpecialist: true,
  isChild: null,
}

beforeEach(() => {
  mockedCaseload.mockReset()
  mockedCaseload.mockResolvedValue({ patients: [], pending: [] })
})

function renderScreen(user = SPECIALIST) {
  return renderWithProviders(<SpecialistHome />, { user, route: ROUTES.specialistHome })
}

describe('SpecialistHome', () => {
  it('greets the signed-in specialist by name', async () => {
    renderScreen({ ...SPECIALIST, firstName: 'Anna' })

    expect(await screen.findByText('Cześć, Anna')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Panel specjalisty' }),
    ).toBeInTheDocument()
  })

  it('offers the three things the panel is for', async () => {
    renderScreen()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Moi pacjenci' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Konta opiekunów/ })).toHaveAttribute(
      'href', ROUTES.specialistParentAccounts,
    )
    expect(screen.getByRole('link', { name: /Moje techniki/ })).toHaveAttribute(
      'href', ROUTES.specialistTechniques,
    )
  })

  it('says what the panel does not show', async () => {
    // In words, and about the present tense. Naming a diary preview as coming
    // soon would answer a question that is still open with the client, and a
    // client reading this screen would take it as settled — the same reasoning
    // as ParentHome's placeholder.
    renderScreen()

    expect(await screen.findByText(/Nie widzisz treści ich dzienniczków/i)).toBeInTheDocument()
  })

  it('promises nothing about reading a patient’s diary', async () => {
    renderScreen()

    await screen.findByRole('heading', { level: 1, name: 'Panel specjalisty' })
    expect(screen.queryByText(/podgląd dzienniczka/i)).toBeNull()
    expect(screen.queryByText(/wkrótce/i)).toBeNull()
  })

  it('does not link into the patient app, which would only refuse them', async () => {
    renderScreen()

    await screen.findByRole('heading', { level: 1, name: 'Panel specjalisty' })
    for (const route of [ROUTES.home, ROUTES.journals, ROUTES.reports, ROUTES.analysis]) {
      expect(document.querySelector(`a[href="${route}"]`)).toBeNull()
    }
  })
})
