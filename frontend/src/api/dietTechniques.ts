/**
 * The psychodietetic catalogue's database half: /api/diet/techniques/ and
 * /api/specialist/diet-techniques/.
 *
 * The diet module's counterpart to `api/techniques.ts`, and the same split: the
 * techniques the app ships with are in `data/dietTechniques.ts`, this module
 * fetches the ones psychodietitians wrote, and `utils/dietTechniques.ts` merges
 * the two by slug. See core/diet_techniques.py.
 *
 * The backend speaks English snake_case, the catalogue's own type is Polish
 * (`types/dietTechnique.ts`) — the mapping is done here and nowhere else.
 */

import { apiRequest } from './client'
import type { DietTechnique, DietTechniqueStep } from '../types/dietTechnique'

/** As `core.diet_techniques.serialize_diet_technique` returns it. */
interface DietTechniqueStepPayload {
  name: string | null
  description: string
}

interface DietTechniquePayload {
  slug: string | null
  id_technique: number
  name: string | null
  moment: string | null
  intro: string | null
  steps: DietTechniqueStepPayload[]
  example: string | null
  note: string | null
  duration_min: number | null
  created_at: string | null
  updated_at: string | null
}

/** A technique from the database: `DietTechnique` plus the row's own id, for the panel. */
export interface StoredDietTechnique extends DietTechnique {
  idTechnique: number
  /** The minutes as stored, so the panel's form can be refilled with a number. */
  czasTrwaniaMin: number | null
  createdAt: string | null
  updatedAt: string | null
}

function toStep(payload: DietTechniqueStepPayload): DietTechniqueStep {
  return {
    // Absent rather than empty, for the reason `api/techniques.ts` gives: the
    // detail screen draws no heading for a step without a name.
    ...(payload.name ? { nazwa: payload.name } : {}),
    opis: payload.description,
  }
}

export function toDietTechnique(payload: DietTechniquePayload): StoredDietTechnique {
  return {
    // `published()` never sends a row without a slug; '' is unreachable.
    id: payload.slug ?? '',
    idTechnique: payload.id_technique,
    nazwa: payload.name ?? '',
    // The catalogue prints duration as text (see `czasTrwania`); a stored one is
    // always whole minutes.
    ...(payload.duration_min !== null ? { czasTrwania: `${payload.duration_min} min` } : {}),
    czasTrwaniaMin: payload.duration_min,
    ...(payload.moment ? { momentZastosowania: payload.moment } : {}),
    wprowadzenie: payload.intro ?? '',
    kroki: payload.steps.map(toStep),
    ...(payload.note ? { notka: payload.note } : {}),
    ...(payload.example ? { przyklad: payload.example } : {}),
    // The backend publishes nothing else — see `published()`.
    dostepnosc: 'ogolna',
    opisGotowy: true,
    zastepczy: false,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  }
}

/** Every psychodietetic technique a specialist has published, for the patient's catalogue. */
export async function fetchStoredDietTechniques(): Promise<StoredDietTechnique[]> {
  const payload = await apiRequest<DietTechniquePayload[]>('/api/diet/techniques/')
  return payload.map(toDietTechnique)
}

/** The signed-in psychodietitian's own techniques. */
export async function fetchMyDietTechniques(): Promise<StoredDietTechnique[]> {
  const payload = await apiRequest<DietTechniquePayload[]>('/api/specialist/diet-techniques/')
  return payload.map(toDietTechnique)
}

/**
 * What the psychodietitian's form submits. Field names match the form's state.
 *
 * No availability and no draft flag: saving is publishing, as in the DBT panel.
 */
export interface DietTechniqueInput {
  slug: string
  name: string
  moment: string
  intro: string
  durationMin: string
  steps: { name: string; description: string }[]
  example: string
  note: string
}

/**
 * The minutes as the backend reads them. Not `Number(value)`: that turns "abc"
 * into `NaN`, which JSON sends as `null` — "no duration" — so a typo was saved as
 * a blank field. Anything that is not a whole number is sent as typed, and the
 * backend's 400 lands under the field instead. The form checks first
 * (`utils/duration.ts`); this is the backstop.
 */
function toMinutes(value: string): number | string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed
}

function toPayload(input: DietTechniqueInput) {
  return {
    slug: input.slug.trim(),
    name: input.name.trim(),
    moment: input.moment.trim(),
    intro: input.intro.trim(),
    duration_min: toMinutes(input.durationMin),
    steps: input.steps.map((step) => ({
      name: step.name.trim(),
      description: step.description.trim(),
    })),
    example: input.example.trim(),
    note: input.note.trim(),
  }
}

export async function createDietTechnique(
  input: DietTechniqueInput,
): Promise<StoredDietTechnique> {
  return toDietTechnique(
    await apiRequest<DietTechniquePayload>('/api/specialist/diet-techniques/', {
      method: 'POST',
      body: toPayload(input),
    }),
  )
}

/** Replaces one of the specialist's own techniques — PUT, the whole form. */
export async function updateDietTechnique(
  idTechnique: number,
  input: DietTechniqueInput,
): Promise<StoredDietTechnique> {
  return toDietTechnique(
    await apiRequest<DietTechniquePayload>(
      `/api/specialist/diet-techniques/${idTechnique}/`,
      { method: 'PUT', body: toPayload(input) },
    ),
  )
}

export async function deleteDietTechnique(idTechnique: number): Promise<void> {
  await apiRequest<void>(`/api/specialist/diet-techniques/${idTechnique}/`, {
    method: 'DELETE',
  })
}
