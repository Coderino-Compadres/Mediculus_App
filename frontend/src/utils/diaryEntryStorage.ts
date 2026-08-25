import type { DiaryEntryDraft } from '../types/diaryEntry'

const STORAGE_KEY_PREFIX = 'mediculus.diaryEntry.'

// TODO: this is a mock persistence layer standing in for a real endpoint
// (something like POST/PUT /api/medical/diary/) — swap these two functions
// for real API calls once the backend exposes writes for diary entries.

export function loadDiaryEntry(date: string): DiaryEntryDraft | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + date)
    return raw ? (JSON.parse(raw) as DiaryEntryDraft) : null
  } catch {
    return null
  }
}

export function saveDiaryEntry(entry: DiaryEntryDraft): void {
  window.localStorage.setItem(STORAGE_KEY_PREFIX + entry.date, JSON.stringify(entry))
}
