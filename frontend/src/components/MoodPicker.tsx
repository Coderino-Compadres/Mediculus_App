import type { MoodLevel } from '../types/diaryEntry'
import { MOOD_OPTIONS } from '../utils/moods'

interface MoodPickerProps {
  value: MoodLevel | null
  onChange: (value: MoodLevel | null) => void
}

function MoodPicker({ value, onChange }: MoodPickerProps) {
  return (
    <div className="mood-picker" role="radiogroup" aria-label="Jak się teraz czujesz?">
      {MOOD_OPTIONS.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'mood-tile mood-tile-selected' : 'mood-tile'}
            style={
              selected
                ? { backgroundColor: option.color, borderColor: option.color }
                : { borderColor: option.color, color: option.color }
            }
            onClick={() => onChange(selected ? null : option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default MoodPicker
