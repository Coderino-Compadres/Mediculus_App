/**
 * The two consents this app collects, in one place.
 *
 * Until the profile screen existed, both sentences lived inline in
 * pages/Register.tsx — the only screen that showed them. That stops working the
 * moment a second screen has to show them back to the patient: a consent whose
 * wording differs between where it was given and where it is withdrawn is not
 * recognisably the same consent, and RODO art. 7(3) requires withdrawal to be as
 * easy as giving it. Easy starts with knowing what you are withdrawing.
 *
 * So the `label` strings here are the wording of record. Change them and both
 * screens change together; paraphrase one of them anywhere else and the two
 * screens start describing different promises.
 *
 * Mirrors `data_consent` / `services_consent` in core/serializers.py, and the
 * `data_consent_at` / `services_consent_at` columns migration 0004 added to
 * `"user"` — a timestamp rather than a boolean, because art. 7(1) puts the
 * burden of proof on us and "yes" without a date proves nothing.
 */

export const CONSENT_IDS = {
  data: 'dataConsent',
  services: 'servicesConsent',
} as const

export type ConsentId = (typeof CONSENT_IDS)[keyof typeof CONSENT_IDS]

/**
 * What withdrawing this one consent does to the account.
 *
 * 'ends-account' is not a policy choice we are free to make: this app processes
 * health data and nothing else, so without the art. 9 consent there is no lawful
 * basis left for it to hold anything at all.
 *
 * 'undecided' means exactly that — see the TODO on the withdrawal screen. It is
 * a marker for an open question with the client, not a third behaviour.
 */
export type ConsentWithdrawalEffect = 'ends-account' | 'undecided'

export interface ConsentDefinition {
  id: ConsentId
  /** Verbatim what the registration form asked. Do not reword per screen. */
  label: string
  /** A heading-length name, for places the full sentence will not fit. */
  shortLabel: string
  withdrawalEffect: ConsentWithdrawalEffect
}

/**
 * Declaration order is the order both screens render them in, so the second
 * consent is the second one in both places.
 */
export const CONSENTS: ConsentDefinition[] = [
  {
    id: CONSENT_IDS.data,
    label:
      'Wyrażam zgodę na przetwarzanie moich danych osobowych, w tym danych o zdrowiu, w aplikacji Mediculus zgodnie z RODO (art. 9).',
    shortLabel: 'Przetwarzanie danych o zdrowiu',
    withdrawalEffect: 'ends-account',
  },
  {
    id: CONSENT_IDS.services,
    label:
      'Wyrażam zgodę na korzystanie z usług Fundacji Mediculus oraz akceptuję regulamin świadczenia usług.',
    shortLabel: 'Korzystanie z usług fundacji',
    withdrawalEffect: 'undecided',
  },
]

export function consentById(id: ConsentId): ConsentDefinition {
  const found = CONSENTS.find((consent) => consent.id === id)
  // Unreachable while ConsentId is what it is; a throw rather than a fallback so
  // a new consent added to one of the two lists and not the other is loud.
  if (!found) throw new Error(`Nieznana zgoda: ${id}`)
  return found
}
