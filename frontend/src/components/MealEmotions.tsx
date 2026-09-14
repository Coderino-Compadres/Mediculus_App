import { EMOTION_COLORS } from '../utils/emotions'
import type { EmotionEntry } from '../types/diaryEntry'
import './mealEmotions.css'

/**
 * A meal's emotions, read-only — the three screens that render a meal.
 *
 * WHY A COMPONENT rather than a third `MealRow` detail: `pages/DietHome.tsx`,
 * `pages/DietJournals.tsx` and `pages/DietJournalDay.tsx` each draw a meal
 * their own way (the home screen's row carries edit and delete, the other two
 * do not), and they already hold three near-identical `MealRow`s. Adding the
 * chips three times is how one of them ends up rendering a 0 for an unrated
 * emotion while the others do not.
 *
 * NOTHING IS AGGREGATED HERE. It draws the chips the patient picked at this
 * meal and nothing else — no count, no dominant emotion, no comparison with
 * another meal or another day. §05 names a report section that summarises them
 * across a week; a summary next to the meal itself would be this screen
 * scoring one, which is what §02 rules out.
 *
 * AN UNRATED CHIP SHOWS NO NUMBER. `intensity` is null for a chip picked with
 * the slider never moved (`diet_meal_emotion.intensity` is nullable precisely
 * so it can be), and printing "0/10" there would put a rating on the record
 * that nobody gave.
 */
function MealEmotions({ emotions }: { emotions: EmotionEntry[] }) {
  // Nothing at all rather than an empty row or a "brak emocji": a meal saved
  // without naming one is an ordinary meal (§05), not a gap in the record.
  if (emotions.length === 0) return null

  return (
    <ul className="meal-emotions" aria-label="Emocje przy tym posiłku">
      {emotions.map((entry) => {
        const color = EMOTION_COLORS[entry.emotion]
        return (
          <li
            key={entry.emotion}
            className="meal-emotion"
            style={{ borderColor: color, color }}
          >
            {entry.emotion}
            {entry.intensity !== null && (
              <span className="meal-emotion-intensity">{entry.intensity}/10</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default MealEmotions
