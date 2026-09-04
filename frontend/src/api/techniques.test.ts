import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTechnique,
  fetchStoredTechniques,
  toTechnique,
  updateTechnique,
  type TechniqueInput,
} from './techniques'

vi.mock('./client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client')>()
  return { ...actual, apiRequest: vi.fn() }
})
const { apiRequest } = await import('./client')
const mockedRequest = vi.mocked(apiRequest)

/**
 * The catalogue's two vocabularies meeting: snake_case English columns on the
 * wire, the document's Polish field names in the app. The values *inside* the
 * fields are shared literals — a school or a group is the same string in
 * types/technique.ts and core/technique_vocabulary.py — so this file is about
 * the field names and the optional ones.
 */
const PAYLOAD = {
  slug: 'radykalna-akceptacja',
  id_technique: 7,
  name: 'Radykalna akceptacja',
  subtitle: 'Kiedy nie mogę tego zmienić.',
  schools: ['dbt'],
  dbt_group: 'akceptacja',
  dbt_module: 'tolerancja',
  availability: 'ogolna',
  intro: 'O czym jest ta technika.',
  steps: [
    { name: 'Zauważ', description: 'Zauważ, że walczysz z faktem.', examples: ['przykład'] },
  ],
  duration_min: 5,
  description_ready: true,
  created_at: '2026-09-01T08:00:00Z',
  updated_at: '2026-09-02T08:00:00Z',
}

beforeEach(() => mockedRequest.mockReset())

describe('reading a stored technique', () => {
  it('maps it onto the catalogue’s own shape', () => {
    expect(toTechnique(PAYLOAD)).toEqual({
      // The slug is the catalogue's id: it is what the URL carries and what the
      // merge with the built-in techniques is keyed on.
      id: 'radykalna-akceptacja',
      idTechnique: 7,
      nazwa: 'Radykalna akceptacja',
      podtytul: 'Kiedy nie mogę tego zmienić.',
      czasTrwaniaMin: 5,
      szkola: ['dbt'],
      grupa: 'akceptacja',
      modulDBT: 'tolerancja',
      dostepnosc: 'ogolna',
      wprowadzenie: 'O czym jest ta technika.',
      kroki: [
        { nazwa: 'Zauważ', opis: 'Zauważ, że walczysz z faktem.', przyklady: ['przykład'] },
      ],
      opisGotowy: true,
      createdAt: '2026-09-01T08:00:00Z',
      updatedAt: '2026-09-02T08:00:00Z',
    })
  })

  it('leaves an unanswered optional field out rather than blank', () => {
    // `nazwa` absent is what makes the detail screen render a step by its number
    // alone; an empty string would draw a blank heading. Same for a duration
    // nobody gave — the built-in catalogue shows none, on purpose.
    const technique = toTechnique({
      ...PAYLOAD,
      dbt_group: null,
      dbt_module: null,
      duration_min: null,
      steps: [{ name: null, description: 'Sam opis.', examples: [] }],
    })

    expect(technique).not.toHaveProperty('grupa')
    expect(technique).not.toHaveProperty('modulDBT')
    expect(technique).not.toHaveProperty('czasTrwaniaMin')
    expect(technique.kroki[0]).toEqual({ opis: 'Sam opis.' })
  })

  it('reads the catalogue from its own endpoint', async () => {
    mockedRequest.mockResolvedValueOnce([PAYLOAD])

    const techniques = await fetchStoredTechniques()

    expect(mockedRequest).toHaveBeenCalledWith('/api/techniques/')
    expect(techniques).toHaveLength(1)
  })
})

describe('writing one', () => {
  const INPUT: TechniqueInput = {
    slug: '  radykalna-akceptacja  ',
    name: '  Radykalna akceptacja  ',
    subtitle: '',
    schools: ['dbt'],
    dbtGroup: '',
    dbtModule: '',
    intro: '  O czym jest.  ',
    durationMin: '',
    steps: [{ name: ' Zauważ ', description: ' Opis. ', examples: 'jeden\n\n  dwa  \n' }],
  }

  it('trims, splits the examples by line and drops the blank ones', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    await createTechnique(INPUT)

    expect(mockedRequest).toHaveBeenCalledWith('/api/specialist/techniques/', {
      method: 'POST',
      body: {
        slug: 'radykalna-akceptacja',
        name: 'Radykalna akceptacja',
        subtitle: '',
        schools: ['dbt'],
        // '' is "not answered" on an optional select; the column stores NULL,
        // and an empty string would be a value outside the vocabulary.
        dbt_group: null,
        dbt_module: null,
        intro: 'O czym jest.',
        duration_min: null,
        steps: [{ name: 'Zauważ', description: 'Opis.', examples: ['jeden', 'dwa'] }],
      },
    })
  })

  it('sends neither a draft flag nor an availability, because they are not asked', async () => {
    // The two checkboxes were removed on request: saving a technique publishes
    // it to every patient. The backend sets both columns itself, so sending
    // either from here would be a second opinion about a decided thing.
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    await createTechnique(INPUT)

    const body = mockedRequest.mock.calls[0][1]?.body as Record<string, unknown>
    expect(body).not.toHaveProperty('description_ready')
    expect(body).not.toHaveProperty('availability')
  })

  it('sends a duration as a number, not as the typed text', async () => {
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    await createTechnique({ ...INPUT, durationMin: ' 5 ' })

    const body = mockedRequest.mock.calls[0][1]?.body as { duration_min: unknown }
    expect(body.duration_min).toBe(5)
  })

  it('replaces rather than merges on an edit', async () => {
    // PUT, like /api/diary/today/: the form submits its whole state, so a field
    // left out is an answer taken back rather than one left unchanged.
    mockedRequest.mockResolvedValueOnce(PAYLOAD)

    await updateTechnique(7, INPUT)

    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/specialist/techniques/7/',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
