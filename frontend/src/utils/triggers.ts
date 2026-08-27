import type { SituationReaction } from '../types/diaryEntry'

/**
 * Suggested place/trigger chips for "Sytuacja i reakcja". The client asked for
 * roughly 10 typical options plus a free-text "Inne" — this list is a reasonable
 * starting set, not a final one.
 *
 * TODO: confirm the final, definitive list with the client before this ships.
 */
export const TRIGGER_OPTIONS = [
  'Dom',
  'Praca',
  'Uczelnia',
  'Szkoła',
  'Transport',
  'Wśród ludzi',
  'Internet/social media',
  'Sam/sama w domu',
  'Podczas snu/przed snem',
  'Inne',
] as const

export type TriggerOption = (typeof TRIGGER_OPTIONS)[number]

export const OTHER_TRIGGER: TriggerOption = 'Inne'

/**
 * The place/trigger one entry recorded, as it should be shown.
 *
 * The chip and the "Inne" free text are two fields on the form but one answer:
 * they collapse into a single `situation_place` column (see src/api/diary.ts),
 * so every screen that displays a place has to unpack them the same way. null
 * means the question went unanswered.
 */
export function placeLabel(reaction: SituationReaction): string | null {
  if (reaction.trigger === OTHER_TRIGGER) {
    return reaction.triggerOther.trim() || null
  }
  return reaction.trigger
}
