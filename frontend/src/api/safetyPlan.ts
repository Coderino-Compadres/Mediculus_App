/**
 * The patient's own safety plan — GET/PUT /api/safety-plan/ (core/safety_plan.py).
 *
 * The backend speaks snake_case and stores phone numbers as typed; the screen's
 * type (`types/safetyPlan.ts`) wants camelCase and a dialable `PhoneNumber`.
 * The mapping both ways is done here and nowhere else.
 */

import { apiRequest } from './client'
import { phoneFromText } from '../utils/phone'
import type { AlternativeContact, SafetyPlan, TrustedPerson } from '../types/safetyPlan'

interface PersonPayload {
  name: string
  relation: string | null
  phone: string | null
}

interface ContactPayload {
  name: string
  role: string | null
  phone: string | null
}

interface SafetyPlanPayload {
  warning_signs: string[]
  coping_strategies: string[]
  trusted_people: PersonPayload[]
  professional_contact: ContactPayload | null
  notes: string | null
  updated_at: string | null
}

function toPlan(payload: SafetyPlanPayload): SafetyPlan {
  return {
    warningSigns: payload.warning_signs,
    copingStrategies: payload.coping_strategies,
    trustedPeople: payload.trusted_people.map(
      (person, index): TrustedPerson => ({
        // Position is the identity: the stored list has no ids, and it is
        // always read and written whole.
        id: `trusted-${index}`,
        name: person.name,
        relation: person.relation,
        phone: person.phone ? phoneFromText(person.phone) : null,
      }),
    ),
    alternativeContact: payload.professional_contact
      ? ({
          name: payload.professional_contact.name,
          role: payload.professional_contact.role,
          phone: payload.professional_contact.phone
            ? phoneFromText(payload.professional_contact.phone)
            : null,
        } satisfies AlternativeContact)
      : null,
    notes: payload.notes,
    updatedAt: payload.updated_at,
  }
}

/** The plan, or null when the patient has not written one yet. */
export async function fetchSafetyPlan(): Promise<SafetyPlan | null> {
  const payload = await apiRequest<SafetyPlanPayload | null>('/api/safety-plan/')
  return payload ? toPlan(payload) : null
}

/**
 * What the plan form edits — plain strings throughout, one per input, so an
 * untouched field is '' and the form state never holds a parsed value.
 */
export interface SafetyPlanInput {
  warningSigns: string[]
  copingStrategies: string[]
  trustedPeople: { name: string; relation: string; phone: string }[]
  contact: { name: string; role: string; phone: string }
  notes: string
}

export const EMPTY_SAFETY_PLAN_INPUT: SafetyPlanInput = {
  warningSigns: [''],
  copingStrategies: [''],
  trustedPeople: [],
  contact: { name: '', role: '', phone: '' },
  notes: '',
}

/** A stored plan back into the form's state; an absent plan is the empty form. */
export function toInput(plan: SafetyPlan | null): SafetyPlanInput {
  if (!plan) return structuredClone(EMPTY_SAFETY_PLAN_INPUT)
  return {
    // One empty line at the end of each list, so there is always somewhere to
    // write the next thing without pressing "Dodaj" first.
    warningSigns: [...plan.warningSigns, ''],
    copingStrategies: [...plan.copingStrategies, ''],
    trustedPeople: plan.trustedPeople.map((person) => ({
      name: person.name,
      relation: person.relation ?? '',
      phone: person.phone?.display ?? '',
    })),
    contact: {
      name: plan.alternativeContact?.name ?? '',
      role: plan.alternativeContact?.role ?? '',
      phone: plan.alternativeContact?.phone?.display ?? '',
    },
    notes: plan.notes ?? '',
  }
}

function toPayload(input: SafetyPlanInput) {
  const contactName = input.contact.name.trim()
  return {
    // Blank lines are the form's spare rows, not content; the backend drops
    // them too, but sending them would still count against the list limit.
    warning_signs: input.warningSigns.map((line) => line.trim()).filter(Boolean),
    coping_strategies: input.copingStrategies.map((line) => line.trim()).filter(Boolean),
    trusted_people: input.trustedPeople
      // A row with nothing typed in it is a row somebody added and left.
      .filter((person) => person.name.trim() || person.phone.trim() || person.relation.trim())
      .map((person) => ({
        name: person.name.trim(),
        relation: person.relation.trim(),
        phone: person.phone.trim(),
      })),
    // No name means no contact: the screen then shows the treating specialist.
    professional_contact: contactName || input.contact.phone.trim()
      ? {
          name: contactName,
          role: input.contact.role.trim(),
          phone: input.contact.phone.trim(),
        }
      : null,
    notes: input.notes.trim(),
  }
}

/** Replaces the whole plan (PUT) and answers it as stored. */
export async function saveSafetyPlan(input: SafetyPlanInput): Promise<SafetyPlan> {
  const payload = await apiRequest<SafetyPlanPayload>('/api/safety-plan/', {
    method: 'PUT',
    body: toPayload(input),
  })
  return toPlan(payload)
}
