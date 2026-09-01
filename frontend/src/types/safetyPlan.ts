import type { PhoneNumber } from '../utils/phone'

/**
 * "Plan bezpieczeństwa" — what the screen shows, split by who wrote it.
 *
 * Two halves, and the split is the whole design. `CrisisLine` is public
 * information the app ships with: it is true for every patient, it is true
 * before anybody has met a therapist, and it is the only part of the screen that
 * works today. `SafetyPlan` is the opposite — one patient's document, written
 * *by their specialist*, and absent for most accounts.
 *
 * Nothing here describes an input. The patient never writes this screen: the
 * plan is "przygotowany wspólnie z terapeutą" and the specialist panel is where
 * it is composed (a separate task). In the patient app it is read-only, which is
 * why every field below is a value to render and none of them is a draft.
 */

/** One published helpline, as shown in the always-visible support section. */
export interface CrisisLine {
  /** Stable key for lists; not shown. */
  id: string
  number: PhoneNumber
  /** What the line is called, e.g. 'Kryzysowy Telefon Zaufania'. */
  name: string
  /** Who it is for, in one short phrase. */
  audience: string
  /** Cost and hours, e.g. 'bezpłatny, całodobowy'. */
  availability: string
  /**
   * Explicitly a line for children and teenagers.
   *
   * Flagged rather than inferred from the name, and rendered as a visible badge:
   * minors use this app (a `minor_patient` account exists at registration), and
   * an adult helpline offered to a 14-year-old as if it were theirs is a wasted
   * call at the worst moment.
   */
  forYouth: boolean
  /**
   * The emergency services number, which is not a helpline and must not be
   * presented as one — it is for danger to life or health, and it is the one
   * entry that is neither "free" nor "24/7" in the sense the others are.
   */
  isEmergency: boolean
}

/** Somebody the patient named as a person they can turn to. */
export interface TrustedPerson {
  id: string
  /** As the patient refers to them — a first name is normal and enough. */
  name: string
  /** 'siostra', 'przyjaciółka' — null when the plan just names a person. */
  relation: string | null
  /** null when the plan names somebody without a number to reach them on. */
  phone: PhoneNumber | null
}

/**
 * A contact the specialist wrote in *instead of* themselves — a GP, a psychiatrist,
 * a clinic outside the foundation.
 *
 * An override, not a second therapist: the treating specialist already reaches
 * this screen through `PROFILE_CARE` (see `src/types/profile.ts`), and giving the
 * plan its own copy of them is exactly how the same person ends up on "Profil"
 * and here with two different numbers. This field exists only for the case the
 * care relationship genuinely cannot express.
 */
export interface AlternativeContact {
  name: string
  /** 'psychiatra', 'lekarz rodzinny' — what they are to the patient. */
  role: string | null
  phone: PhoneNumber | null
}

/** The document a specialist prepared with this patient. */
export interface SafetyPlan {
  /**
   * What tends to come before things get worse.
   *
   * FIRST, and first on the screen too. Asked directly about this feature the
   * client answered that it is not about phone numbers: "chodzi mi nawet o
   * sygnały ostrzegawcze, bo jeśli pacjent będzie miał dużo sytuacji ryzykownych,
   * to żeby jednak mu się coś wyświetlało, że już się zaczyna robić ryzyko".
   * That makes this the section the feature exists for.
   */
  warningSigns: string[]
  /** What helps in a hard moment — the patient's own list, written down with the specialist. */
  copingStrategies: string[]
  trustedPeople: TrustedPerson[]
  /** null in the ordinary case: the treating specialist from `PROFILE_CARE` is the contact. */
  alternativeContact: AlternativeContact | null
  /** Free text the specialist wrote for this patient; null when they wrote none. */
  recommendations: string | null
  /** 'YYYY-MM-DD' — when the specialist last revised it. null when unknown. */
  updatedAt: string | null
}
