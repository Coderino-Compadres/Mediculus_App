import { Link } from 'react-router-dom'
import type { Technique, TechniqueSchool } from '../types/technique'
import { SCHOOL_BADGES, badgeSchool } from '../utils/techniques'
import { techniqueDetailPath } from '../routes'
import './techniqueCatalogue.css'

interface TechniqueRowProps {
  technique: Technique
  /** The tab the row is being read in — decides which badge it wears. */
  school: TechniqueSchool
}

/**
 * One technique in the catalogue list.
 *
 * The row is the journal/report row with a school badge where the mood dot goes,
 * so the three list screens read as one family. A `Link` rather than a button:
 * this is navigation, and a catalogue entry should be openable in a new tab.
 *
 * NO DURATION HERE. The mockup shows "3 min" on every technique, but the
 * client's materials give no times at all — see Technique.czasTrwaniaMin.
 *
 * The tab the reader is in travels in the navigation state, so the detail screen
 * can wear the same badge and lead back to the tab it was opened from. A
 * technique tagged with two schools would otherwise land in whichever tab its
 * first tag names.
 */
function TechniqueRow({ technique, school }: TechniqueRowProps) {
  const badge = badgeSchool(technique, school)

  return (
    <Link
      to={techniqueDetailPath(technique.id)}
      state={{ szkola: school }}
      className="technique-row"
    >
      <span className="technique-badge" aria-label={`Szkoła: ${SCHOOL_BADGES[badge]}`}>
        {SCHOOL_BADGES[badge]}
      </span>
      <div className="journal-row-body">
        <span className="technique-row-name">{technique.nazwa}</span>
        <p className="technique-row-subtitle">{technique.podtytul}</p>
      </div>
      <span className="journal-row-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  )
}

export default TechniqueRow
