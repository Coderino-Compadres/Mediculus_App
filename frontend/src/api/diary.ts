/**
 * The /api/diary/ endpoints, and the translation between the form's camelCase
 * state and the API's snake_case columns — the same split as auth.ts and
 * dashboard.ts.
 *
 * Only today's entry is addressable. That is the backend's enforcement of "one
 * entry per day, editable on the day it was written, everything older read-only"
 * (see core/diary.py), so there is deliberately no entry id to pass around here.
 */

import { apiRequest } from './client'
import type { EmotionName } from '../utils/emotions'
import { OTHER_TRIGGER, TRIGGER_OPTIONS } from '../utils/triggers'
import type { DiaryEntryDraft, EmotionEntry, MoodLevel } from '../types/diaryEntry'

const TODAY_PATH = '/api/diary/today/'

/** As `core.diary.serialize_entry` returns it. */
interface DiaryEntryPayload {
  date: string
  mood: MoodLevel | null
  emotions: { emotion: string; intensity: number }[]
  energy_level: number | null
  tension_level: number | null
  situation_place: string | null
  situation: string | null
  emotion_note: string | null
  thought: string | null
  how_situation_handled: string | null
  notes: string | null
  risky_behavior_note: string | null
}

/** '' is what every text input starts as; the API says NULL for "not answered". */
function text(value: string | null): string {
  return value ?? ''
}

/** Blank means the patient cleared the box, which the API stores as NULL. */
function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const SUGGESTED_TRIGGERS: readonly string[] = TRIGGER_OPTIONS

/**
 * Split one `situation_place` back into the chip + free-text pair the form
 * edits. Anything that is not one of the suggested places must have been typed
 * into the "Inne" box, so it goes back there — including a value that stopped
 * being on the list since it was written (utils/triggers.ts is explicitly not
 * final), which would otherwise vanish from the form on the next edit.
 */
function splitTrigger(place: string | null): { trigger: string | null; triggerOther: string } {
  if (place === null) return { trigger: null, triggerOther: '' }
  if (SUGGESTED_TRIGGERS.includes(place)) return { trigger: place, triggerOther: '' }
  return { trigger: OTHER_TRIGGER, triggerOther: place }
}

function toDraft(payload: DiaryEntryPayload): DiaryEntryDraft {
  const { trigger, triggerOther } = splitTrigger(payload.situation_place)
  return {
    date: payload.date,
    mood: payload.mood,
    // The API only sends emotions that were actually rated, which is what lets
    // the picker redraw exactly the chips the patient had selected.
    emotions: payload.emotions.map(
      (rating): EmotionEntry => ({
        emotion: rating.emotion as EmotionName,
        intensity: rating.intensity,
      }),
    ),
    energyLevel: payload.energy_level,
    tensionLevel: payload.tension_level,
    situationReaction: {
      trigger,
      triggerOther,
      situation: text(payload.situation),
      emotionNote: text(payload.emotion_note),
      thought: text(payload.thought),
      behavior: text(payload.how_situation_handled),
    },
    notes: text(payload.notes),
    // NULL is the database's way of saying no risky behaviour was reported;
    // there is no separate boolean column to read it from.
    hasRiskyBehavior: payload.risky_behavior_note !== null,
    riskyBehaviorNote: text(payload.risky_behavior_note),
  }
}

function toPayload(draft: DiaryEntryDraft) {
  return {
    mood: draft.mood,
    emotions: draft.emotions.map((entry) => ({
      emotion: entry.emotion,
      intensity: entry.intensity ?? 0,
    })),
    energy_level: draft.energyLevel,
    tension_level: draft.tensionLevel,
    // "Inne" is a prompt for the free-text box, not an answer worth storing.
    situation_place:
      draft.situationReaction.trigger === OTHER_TRIGGER
        ? orNull(draft.situationReaction.triggerOther)
        : draft.situationReaction.trigger,
    situation: orNull(draft.situationReaction.situation),
    emotion_note: orNull(draft.situationReaction.emotionNote),
    thought: orNull(draft.situationReaction.thought),
    how_situation_handled: orNull(draft.situationReaction.behavior),
    notes: orNull(draft.notes),
    risky_behavior_note: draft.hasRiskyBehavior ? orNull(draft.riskyBehaviorNote) : null,
  }
}

/** Today's entry, or null before the patient has written one. */
export async function fetchTodayEntry(): Promise<DiaryEntryDraft | null> {
  const payload = await apiRequest<DiaryEntryPayload | null>(TODAY_PATH)
  return payload === null ? null : toDraft(payload)
}

/**
 * Write today's entry, replacing whatever was there.
 *
 * PUT, not POST: the call sets what today's entry *is*, so pressing save twice
 * leaves one entry rather than two. The whole draft goes over the wire every
 * time — an answer the patient cleared has to arrive as a cleared field, not as
 * a missing one.
 */
export async function saveTodayEntry(draft: DiaryEntryDraft): Promise<DiaryEntryDraft> {
  const payload = await apiRequest<DiaryEntryPayload>(TODAY_PATH, {
    method: 'PUT',
    body: toPayload(draft),
  })
  return toDraft(payload)
}
