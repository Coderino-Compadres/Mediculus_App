import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_SAFETY_PLAN_INPUT, fetchSafetyPlan, saveSafetyPlan, toInput } from './safetyPlan'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

const PAYLOAD = {
  warning_signs: ['Nie śpię'],
  coping_strategies: [],
  trusted_people: [{ name: 'Ania', relation: 'siostra', phone: '+48 600 700 800' }],
  professional_contact: { name: 'dr Nowak', role: null, phone: null },
  notes: null,
  updated_at: '2026-09-30T10:00:00Z',
}

beforeEach(() => {
  mockedRequest.mockReset()
})

describe('fetchSafetyPlan', () => {
  it('answers null when the patient has not written a plan', async () => {
    mockedRequest.mockResolvedValueOnce(null)

    expect(await fetchSafetyPlan()).toBeNull()
    expect(mockedRequest).toHaveBeenCalledWith('/api/safety-plan/')
  })

  it('makes a typed number dialable and shows it as typed', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    const plan = await fetchSafetyPlan()

    expect(plan!.trustedPeople[0].phone).toEqual({ dial: '+48600700800', display: '+48 600 700 800' })
    expect(plan!.alternativeContact).toEqual({ name: 'dr Nowak', role: null, phone: null })
  })
})

describe('saveSafetyPlan', () => {
  it('drops the form\'s spare blank rows instead of sending them', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    await saveSafetyPlan({
      warningSigns: ['  Nie śpię  ', ''],
      copingStrategies: [''],
      trustedPeople: [
        { name: 'Ania', relation: '', phone: '600 700 800' },
        { name: '', relation: '', phone: '' },
      ],
      contact: { name: '', role: '', phone: '' },
      notes: '  ',
    })

    expect(mockedRequest).toHaveBeenCalledWith('/api/safety-plan/', {
      method: 'PUT',
      body: {
        warning_signs: ['Nie śpię'],
        coping_strategies: [],
        trusted_people: [{ name: 'Ania', relation: '', phone: '600 700 800' }],
        professional_contact: null,
        notes: '',
      },
    })
  })

  it('sends a contact once it has a name or a number', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    await saveSafetyPlan({
      ...EMPTY_SAFETY_PLAN_INPUT,
      contact: { name: 'dr Nowak', role: 'psychiatra', phone: '' },
    })

    const body = mockedRequest.mock.calls[0][1]!.body as { professional_contact: unknown }
    expect(body.professional_contact).toEqual({ name: 'dr Nowak', role: 'psychiatra', phone: '' })
  })
})

describe('toInput', () => {
  it('leaves one blank row at the end of each list, ready for the next line', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)
    const input = toInput(await fetchSafetyPlan())

    expect(input.warningSigns).toEqual(['Nie śpię', ''])
    expect(input.copingStrategies).toEqual([''])
    expect(input.trustedPeople[0].phone).toBe('+48 600 700 800')
  })

  it('gives a fresh copy of the empty form every time', () => {
    const first = toInput(null)
    first.warningSigns.push('x')

    expect(toInput(null).warningSigns).toEqual([''])
  })
})
