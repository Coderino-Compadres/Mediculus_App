/**
 * The technique catalogue's database half: /api/techniques/ and
 * /api/specialist/techniques/.
 *
 * WHY THIS IS "HALF". The techniques the app ships with are hardcoded in
 * `data/techniques.ts`, transcribed from the client's DBT materials and still
 * awaiting clinical review; this module fetches the ones specialists wrote, and
 * `utils/techniques.ts` merges the two by slug. See core/techniques.py for why
 * the hardcoded half has not been moved into the database.
 *
 * The mapping is the interesting part: the backend speaks snake_case columns
 * (English, like the rest of the schema) and the catalogue's own type is Polish
 * (`nazwa`, `kroki`, `dostepnosc` — the vocabulary of the document it came
 * from). The strings *inside* those fields are shared verbatim, though — the
 * schools, groups, modules and availability values are the same literals in
 * `types/technique.ts` and `core/technique_vocabulary.py`, because they end up
 * as keys into the label maps in `utils/techniques.ts`.
 */

import { apiRequest } from './client'
import type {
  Technique,
  TechniqueAvailability,
  TechniqueDbtModule,
  TechniqueGroup,
  TechniqueSchool,
  TechniqueStep,
} from '../types/technique'

/** As `core.techniques.serialize_technique` returns it. */
interface TechniqueStepPayload {
  name: string | null
  description: string
  examples: string[]
}

interface TechniquePayload {
  slug: string | null
  id_technique: number
  name: string | null
  subtitle: string | null
  schools: string[]
  dbt_group: string | null
  dbt_module: string | null
  availability: string
  intro: string | null
  steps: TechniqueStepPayload[]
  duration_min: number | null
  description_ready: boolean
  created_at: string | null
  updated_at: string | null
}

/**
 * A technique from the database, as the catalogue renders it.
 *
 * `Technique` plus the row's own id, which the panel's edit and delete URLs
 * carry. The catalogue itself never uses it: there, a technique is addressed by
 * slug, because that is what the two halves of the catalogue have in common.
 */
export interface StoredTechnique extends Technique {
  idTechnique: number
  createdAt: string | null
  updatedAt: string | null
}

function toStep(payload: TechniqueStepPayload): TechniqueStep {
  return {
    // Absent rather than empty: `nazwa` is optional because a few techniques in
    // the source material are written as bare bullet points, and the detail
    // screen renders those by number alone. An empty heading would draw a blank
    // line where it decides not to draw a heading at all.
    ...(payload.name ? { nazwa: payload.name } : {}),
    opis: payload.description,
    ...(payload.examples.length > 0 ? { przyklady: payload.examples } : {}),
  }
}

export function toTechnique(payload: TechniquePayload): StoredTechnique {
  return {
    // The slug is the catalogue's id. A row without one never reaches here —
    // `published()` filters it out, precisely because it would be a list entry
    // with no URL to open — so '' is unreachable rather than a fallback worth
    // designing around.
    id: payload.slug ?? '',
    idTechnique: payload.id_technique,
    nazwa: payload.name ?? '',
    podtytul: payload.subtitle ?? '',
    ...(payload.duration_min !== null ? { czasTrwaniaMin: payload.duration_min } : {}),
    szkola: payload.schools as TechniqueSchool[],
    ...(payload.dbt_group ? { grupa: payload.dbt_group as TechniqueGroup } : {}),
    ...(payload.dbt_module ? { modulDBT: payload.dbt_module as TechniqueDbtModule } : {}),
    dostepnosc: payload.availability as TechniqueAvailability,
    wprowadzenie: payload.intro ?? '',
    kroki: payload.steps.map(toStep),
    opisGotowy: payload.description_ready,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
  }
}

/**
 * Every technique a specialist has published, for the patient's catalogue.
 *
 * Drafts and anything flagged 'wymagaSpecjalisty' never leave the panel — the
 * backend's `published()` decides that, so the browser cannot be talked into
 * showing one by a query parameter.
 */
export async function fetchStoredTechniques(): Promise<StoredTechnique[]> {
  const payload = await apiRequest<TechniquePayload[]>('/api/techniques/')
  return payload.map(toTechnique)
}

/** The signed-in specialist's own techniques, drafts included. */
export async function fetchMyTechniques(): Promise<StoredTechnique[]> {
  const payload = await apiRequest<TechniquePayload[]>('/api/specialist/techniques/')
  return payload.map(toTechnique)
}

/**
 * What the specialist's form submits. Field names match the form's state.
 *
 * No `availability` and no `descriptionReady`: **everything a specialist saves
 * is in every patient's catalogue immediately**. There is no draft to keep back
 * and no per-technique "only with a specialist present" flag on this form — the
 * backend sets both columns itself (see `_fields` in core/techniques.py, which
 * also says why the columns still exist).
 */
export interface TechniqueInput {
  slug: string
  name: string
  subtitle: string
  schools: TechniqueSchool[]
  dbtGroup: TechniqueGroup | ''
  dbtModule: TechniqueDbtModule | ''
  intro: string
  durationMin: string
  steps: { name: string; description: string; examples: string }[]
}

/** API field name -> form field name, so a 400 lands under the input that caused it. */
export const TECHNIQUE_FIELDS: Record<string, string> = {
  slug: 'slug',
  name: 'name',
  subtitle: 'subtitle',
  schools: 'schools',
  dbt_group: 'dbtGroup',
  dbt_module: 'dbtModule',
  intro: 'intro',
  steps: 'steps',
  duration_min: 'durationMin',
}

function toPayload(input: TechniqueInput) {
  return {
    slug: input.slug.trim(),
    name: input.name.trim(),
    subtitle: input.subtitle.trim(),
    schools: input.schools,
    // '' is "not answered" on an optional select, and the backend stores NULL
    // for it; sending the empty string would be a value outside the vocabulary.
    dbt_group: input.dbtGroup || null,
    dbt_module: input.dbtModule || null,
    intro: input.intro.trim(),
    duration_min: input.durationMin.trim() === '' ? null : Number(input.durationMin),
    steps: input.steps.map((step) => ({
      name: step.name.trim(),
      description: step.description.trim(),
      // One example per line, which is how the form asks for them. Blank lines
      // are dropped rather than stored as empty examples.
      examples: step.examples
        .split('\n')
        .map((example) => example.trim())
        .filter((example) => example !== ''),
    })),
  }
}

export async function createTechnique(input: TechniqueInput): Promise<StoredTechnique> {
  return toTechnique(
    await apiRequest<TechniquePayload>('/api/specialist/techniques/', {
      method: 'POST',
      body: toPayload(input),
    }),
  )
}

/**
 * Replaces one of the specialist's own techniques.
 *
 * PUT, not PATCH, and that is the backend's rule as much as this one's: the form
 * submits its whole state, so a field left out is an answer taken back rather
 * than one left unchanged — the same convention as /api/diary/today/.
 */
export async function updateTechnique(
  idTechnique: number,
  input: TechniqueInput,
): Promise<StoredTechnique> {
  return toTechnique(
    await apiRequest<TechniquePayload>(
      `/api/specialist/techniques/${idTechnique}/`,
      { method: 'PUT', body: toPayload(input) },
    ),
  )
}

export async function deleteTechnique(idTechnique: number): Promise<void> {
  await apiRequest<void>(`/api/specialist/techniques/${idTechnique}/`, {
    method: 'DELETE',
  })
}
